import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { createRealtimePeerSession } from '@/lib/realtime-peer';
import type { RealtimePeerSession } from '@/lib/realtime-peer.types';
import { buildRealtimeSessionConfig } from '@/lib/realtime-session';
import { stopSpeaking } from '@/lib/speech';
import { createRealtimeClientSecret, OPENAI_REALTIME_MODEL } from '@/services/bolo-api';
import type { MiraResponseLanguage } from '@/state/app-state-types';

export type RealtimeVoiceStatus = 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding';
export type RealtimeTranscriptUpdate = { speaker: 'you' | 'mira'; text: string };
export type RealtimeInputTranscript = { itemId: string; transcript: string };

type Options = {
  clientId: string;
  responseLanguage?: MiraResponseLanguage;
  onError: (message: string) => void;
  onInputTranscriptComplete?: (result: RealtimeInputTranscript) => void;
  onTranscriptChange?: (update: RealtimeTranscriptUpdate) => void;
  onTurnComplete: (turn: { transcript: string; reply: string; language: 'en' | 'hi' }) => void;
};

type RealtimeEvent = {
  type?: string;
  item_id?: string;
  delta?: string;
  text?: string;
  transcript?: string;
  error?: { message?: string };
  response?: {
    status?: string;
    status_details?: {
      error?: { message?: string };
      reason?: string;
      type?: string;
    };
  };
};

const MINIMUM_TURN_MS = 250;
const RESPONSE_WATCHDOG_MS = 45_000;
const TURN_SETTLEMENT_WATCHDOG_MS = 45_000;
const MAX_INCOMPLETE_CONTINUATIONS = 1;
const REALTIME_SPEAKER_AUDIO_MODE = {
  allowsRecording: true,
  interruptionMode: 'doNotMix',
  playsInSilentMode: true,
  shouldRouteThroughEarpiece: false,
} as const;

function languageFor(text: string): 'en' | 'hi' {
  return /[\u0900-\u097F]/u.test(text) ? 'hi' : 'en';
}

function rememberCompletedInputItem(items: Set<string>, itemId: string | null) {
  if (!itemId) return;
  items.add(itemId);
  while (items.size > 24) {
    const oldest = items.values().next().value as string | undefined;
    if (oldest === undefined) break;
    items.delete(oldest);
  }
}

export function useRealtimeConversation({ clientId, responseLanguage = 'en', onError, onInputTranscriptComplete, onTranscriptChange, onTurnComplete }: Options) {
  const [status, setStatus] = useState<RealtimeVoiceStatus>('disconnected');
  const peerRef = useRef<RealtimePeerSession | null>(null);
  const statusRef = useRef<RealtimeVoiceStatus>('disconnected');
  const appStateRef = useRef(AppState.currentState);
  const responseTextRef = useRef('');
  const transcriptRef = useRef('');
  const completedReplyRef = useRef('');
  const inputItemIdRef = useRef<string | null>(null);
  const completedInputItemIdsRef = useRef<Set<string>>(new Set());
  const publishedInputTranscriptIdsRef = useRef<Set<string>>(new Set());
  const failedResponseInputItemIdsRef = useRef<Set<string>>(new Set());
  const responseCompletedRef = useRef(false);
  const outputAudioStartedRef = useRef(false);
  const outputAudioStoppedRef = useRef(false);
  const outputClearRequestedRef = useRef(false);
  const turnFinalizedRef = useRef(false);
  const responseCreatedRef = useRef(false);
  const continuationPendingRef = useRef(false);
  const incompleteContinuationCountRef = useRef(0);
  const turnWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnStartedAtRef = useRef(0);
  const lifecycleRef = useRef(0);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const connectAbortRef = useRef<AbortController | null>(null);
  const connectResolveRef = useRef<(() => void) | null>(null);
  const connectRejectRef = useRef<((error: Error) => void) | null>(null);
  const callbacksRef = useRef({ onError, onInputTranscriptComplete, onTranscriptChange, onTurnComplete });

  useEffect(() => {
    callbacksRef.current = { onError, onInputTranscriptComplete, onTranscriptChange, onTurnComplete };
  }, [onError, onInputTranscriptComplete, onTranscriptChange, onTurnComplete]);

  const updateStatus = useCallback((next: RealtimeVoiceStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const peer = peerRef.current;
    if (!peer) throw new Error('The live voice session is not connected.');
    peer.send(event);
  }, []);

  const clearTurnWatchdog = useCallback(() => {
    if (turnWatchdogRef.current) clearTimeout(turnWatchdogRef.current);
    turnWatchdogRef.current = null;
  }, []);

  const publishTranscript = useCallback((speaker: RealtimeTranscriptUpdate['speaker'], text: string) => {
    callbacksRef.current.onTranscriptChange?.({ speaker, text: text.trim() });
  }, []);

  const publishCompletedInputTranscript = useCallback((itemId: string, transcript: string) => {
    if (publishedInputTranscriptIdsRef.current.has(itemId)) return;
    rememberCompletedInputItem(publishedInputTranscriptIdsRef.current, itemId);
    callbacksRef.current.onInputTranscriptComplete?.({ itemId, transcript });
  }, []);

  const failStalledTurn = useCallback((message: string) => {
    if (statusRef.current !== 'responding') return;
    clearTurnWatchdog();
    lifecycleRef.current += 1;
    const peer = peerRef.current;
    peerRef.current = null;
    peer?.setMicrophoneEnabled(false);
    peer?.close();
    responseTextRef.current = '';
    transcriptRef.current = '';
    completedReplyRef.current = '';
    inputItemIdRef.current = null;
    responseCompletedRef.current = false;
    responseCreatedRef.current = false;
    continuationPendingRef.current = false;
    incompleteContinuationCountRef.current = 0;
    outputAudioStartedRef.current = false;
    outputAudioStoppedRef.current = false;
    outputClearRequestedRef.current = false;
    turnFinalizedRef.current = false;
    turnStartedAtRef.current = 0;
    updateStatus('disconnected');
    callbacksRef.current.onError(message);
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
  }, [clearTurnWatchdog, updateStatus]);

  const armTurnWatchdog = useCallback((timeoutMs: number, message: string) => {
    clearTurnWatchdog();
    const lifecycle = lifecycleRef.current;
    turnWatchdogRef.current = setTimeout(() => {
      if (lifecycleRef.current !== lifecycle) return;
      failStalledTurn(message);
    }, timeoutMs);
  }, [clearTurnWatchdog, failStalledTurn]);

  const unlockCompletedTurn = useCallback(() => {
    if (!responseCompletedRef.current || !outputAudioStoppedRef.current || !turnFinalizedRef.current) return;
    clearTurnWatchdog();
    responseCompletedRef.current = false;
    responseCreatedRef.current = false;
    continuationPendingRef.current = false;
    incompleteContinuationCountRef.current = 0;
    outputAudioStartedRef.current = false;
    outputAudioStoppedRef.current = false;
    outputClearRequestedRef.current = false;
    turnFinalizedRef.current = false;
    updateStatus('ready');
  }, [clearTurnWatchdog, updateStatus]);

  const finalizeTurn = useCallback(() => {
    const reply = completedReplyRef.current.trim();
    const transcript = transcriptRef.current.trim();
    if (!reply || !transcript || !inputItemIdRef.current) return;
    rememberCompletedInputItem(completedInputItemIdsRef.current, inputItemIdRef.current);
    inputItemIdRef.current = null;
    completedReplyRef.current = '';
    transcriptRef.current = '';
    turnFinalizedRef.current = true;
    unlockCompletedTurn();
    callbacksRef.current.onTurnComplete({ transcript, reply, language: languageFor(reply) });
  }, [unlockCompletedTurn]);

  const finishTurnWithoutResult = useCallback(() => {
    responseCompletedRef.current = true;
    turnFinalizedRef.current = true;
    if (!outputAudioStartedRef.current) {
      outputAudioStoppedRef.current = true;
    } else if (!outputClearRequestedRef.current) {
      const peer = peerRef.current;
      if (!peer) {
        outputAudioStartedRef.current = false;
        outputAudioStoppedRef.current = true;
      } else {
        outputClearRequestedRef.current = true;
        try {
          peer.send({ type: 'output_audio_buffer.clear' });
        } catch {
          clearTurnWatchdog();
          peerRef.current = null;
          peer.close();
          responseCompletedRef.current = false;
          outputAudioStartedRef.current = false;
          outputAudioStoppedRef.current = false;
          outputClearRequestedRef.current = false;
          turnFinalizedRef.current = false;
          updateStatus('disconnected');
          void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
          return;
        }
      }
    }
    unlockCompletedTurn();
  }, [clearTurnWatchdog, unlockCompletedTurn, updateStatus]);

  const requestIncompleteContinuation = useCallback(() => {
    if (!continuationPendingRef.current || statusRef.current !== 'responding') return;
    const peer = peerRef.current;
    if (!peer) {
      failStalledTurn('Mira could not continue the incomplete voice response. Please try again.');
      return;
    }
    continuationPendingRef.current = false;
    responseTextRef.current = '';
    responseCompletedRef.current = false;
    responseCreatedRef.current = false;
    continuationPendingRef.current = false;
    outputAudioStartedRef.current = false;
    outputAudioStoppedRef.current = false;
    outputClearRequestedRef.current = false;
    try {
      peer.send({
        type: 'response.create',
        response: {
          output_modalities: ['audio'],
          instructions: 'Continue the previous reply exactly where it stopped. Do not repeat the part already spoken. Finish concisely.',
        },
      });
      armTurnWatchdog(
        RESPONSE_WATCHDOG_MS,
        'Mira did not finish the continued voice response. Start a new live voice session and try again.',
      );
    } catch {
      failStalledTurn('Mira could not continue the incomplete voice response. Please try again.');
    }
  }, [armTurnWatchdog, failStalledTurn]);

  const handleServerEvent = useCallback((raw: string) => {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(raw) as RealtimeEvent;
    } catch {
      callbacksRef.current.onError('The live voice service returned an unreadable event.');
      return;
    }

    switch (event.type) {
      case 'input_audio_buffer.committed':
        if (
          event.item_id
          && !completedInputItemIdsRef.current.has(event.item_id)
          && !inputItemIdRef.current
        ) {
          inputItemIdRef.current = event.item_id;
        }
        break;
      case 'session.updated':
        connectResolveRef.current?.();
        updateStatus('ready');
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (!event.item_id || completedInputItemIdsRef.current.has(event.item_id)) break;
        const belongsToFailedResponse = failedResponseInputItemIdsRef.current.delete(event.item_id);
        if (!belongsToFailedResponse && inputItemIdRef.current && event.item_id !== inputItemIdRef.current) break;
        if (publishedInputTranscriptIdsRef.current.has(event.item_id)) break;
        if (belongsToFailedResponse) {
          if (event.transcript?.trim()) {
            publishTranscript('you', event.transcript);
            publishCompletedInputTranscript(event.item_id, event.transcript.trim());
          }
          rememberCompletedInputItem(completedInputItemIdsRef.current, event.item_id);
          break;
        }
        if (!inputItemIdRef.current) inputItemIdRef.current = event.item_id;
        if (event.transcript?.trim()) {
          transcriptRef.current = event.transcript.trim();
          publishTranscript('you', transcriptRef.current);
          publishCompletedInputTranscript(event.item_id, transcriptRef.current);
          if (completedReplyRef.current) finalizeTurn();
        } else if (statusRef.current === 'responding') {
          rememberCompletedInputItem(completedInputItemIdsRef.current, inputItemIdRef.current);
          inputItemIdRef.current = null;
          responseTextRef.current = '';
          completedReplyRef.current = '';
          transcriptRef.current = '';
          callbacksRef.current.onError('Mira could not hear a readable voice turn. Please try again.');
          finishTurnWithoutResult();
        }
        break;
      case 'conversation.item.input_audio_transcription.delta':
        if (!event.item_id || completedInputItemIdsRef.current.has(event.item_id)) break;
        if (inputItemIdRef.current && event.item_id !== inputItemIdRef.current) break;
        if (!inputItemIdRef.current) inputItemIdRef.current = event.item_id;
        if (event.delta) {
          transcriptRef.current += event.delta;
          publishTranscript('you', transcriptRef.current);
        }
        break;
      case 'conversation.item.input_audio_transcription.failed':
        if (event.item_id && completedInputItemIdsRef.current.has(event.item_id)) break;
        const failedAfterResponseFailure = event.item_id
          ? failedResponseInputItemIdsRef.current.delete(event.item_id)
          : false;
        if (!failedAfterResponseFailure && event.item_id && inputItemIdRef.current && event.item_id !== inputItemIdRef.current) break;
        if (failedAfterResponseFailure) {
          rememberCompletedInputItem(completedInputItemIdsRef.current, event.item_id ?? null);
          break;
        }
        if (event.item_id && !inputItemIdRef.current) inputItemIdRef.current = event.item_id;
        if (statusRef.current === 'responding') {
          rememberCompletedInputItem(completedInputItemIdsRef.current, inputItemIdRef.current);
          inputItemIdRef.current = null;
          responseTextRef.current = '';
          completedReplyRef.current = '';
          transcriptRef.current = '';
          callbacksRef.current.onError(event.error?.message || 'Mira could not transcribe that voice turn. Please try again.');
          finishTurnWithoutResult();
        }
        break;
      case 'response.created':
        if (
          (statusRef.current !== 'recording' && statusRef.current !== 'responding')
          || responseCreatedRef.current
          || responseCompletedRef.current
        ) break;
        responseTextRef.current = '';
        responseCompletedRef.current = false;
        responseCreatedRef.current = true;
        outputAudioStartedRef.current = false;
        outputAudioStoppedRef.current = false;
        outputClearRequestedRef.current = false;
        turnFinalizedRef.current = false;
        updateStatus('responding');
        armTurnWatchdog(
          RESPONSE_WATCHDOG_MS,
          'Mira did not finish the voice response. Start a new live voice session and try again.',
        );
        break;
      case 'output_audio_buffer.started':
        if (statusRef.current !== 'responding') break;
        void setAudioModeAsync(REALTIME_SPEAKER_AUDIO_MODE).catch(() => undefined);
        outputAudioStartedRef.current = true;
        outputAudioStoppedRef.current = false;
        outputClearRequestedRef.current = false;
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        if (statusRef.current !== 'responding') break;
        outputAudioStartedRef.current = false;
        outputAudioStoppedRef.current = true;
        outputClearRequestedRef.current = false;
        if (continuationPendingRef.current) {
          requestIncompleteContinuation();
          break;
        }
        unlockCompletedTurn();
        break;
      case 'response.output_audio_transcript.delta':
        if (event.delta) {
          responseTextRef.current += event.delta;
          publishTranscript(
            'mira',
            [completedReplyRef.current.trim(), responseTextRef.current.trim()].filter(Boolean).join(' '),
          );
        }
        break;
      case 'response.output_audio_transcript.done': {
        const text = (event.transcript || event.text || responseTextRef.current).trim();
        responseTextRef.current = text;
        if (text) {
          publishTranscript(
            'mira',
            [completedReplyRef.current.trim(), text].filter(Boolean).join(' '),
          );
        }
        break;
      }
      case 'response.done': {
        if (statusRef.current !== 'responding' || responseCompletedRef.current) break;
        armTurnWatchdog(
          TURN_SETTLEMENT_WATCHDOG_MS,
          'Mira\'s voice response did not finish playing or transcribing. Start a new live voice session and try again.',
        );
        const responseStatus = event.response?.status;
        const failure = event.response?.status_details?.error?.message;
        const incompleteReason = event.response?.status_details?.reason;
        if (
          responseStatus === 'incomplete'
          && incompleteReason === 'max_output_tokens'
          && incompleteContinuationCountRef.current < MAX_INCOMPLETE_CONTINUATIONS
        ) {
          const partialReply = responseTextRef.current.trim();
          if (partialReply) {
            completedReplyRef.current = [completedReplyRef.current.trim(), partialReply]
              .filter(Boolean)
              .join(' ');
          }
          responseTextRef.current = '';
          responseCompletedRef.current = false;
          responseCreatedRef.current = false;
          incompleteContinuationCountRef.current += 1;
          continuationPendingRef.current = true;
          if (!outputAudioStartedRef.current || outputAudioStoppedRef.current) {
            requestIncompleteContinuation();
          }
          break;
        }
        if (responseStatus !== 'completed' || failure) {
          if (inputItemIdRef.current && !publishedInputTranscriptIdsRef.current.has(inputItemIdRef.current)) {
            rememberCompletedInputItem(failedResponseInputItemIdsRef.current, inputItemIdRef.current);
          } else {
            rememberCompletedInputItem(completedInputItemIdsRef.current, inputItemIdRef.current);
          }
          inputItemIdRef.current = null;
          responseTextRef.current = '';
          completedReplyRef.current = '';
          transcriptRef.current = '';
          const message = responseStatus === 'incomplete'
            ? 'Mira’s voice response was incomplete. Please try again.'
            : responseStatus === 'cancelled'
              ? 'Mira’s voice response was canceled. Please try again.'
              : 'Mira could not complete that voice response.';
          callbacksRef.current.onError(failure || message);
          finishTurnWithoutResult();
          break;
        }
        const text = responseTextRef.current.trim();
        responseTextRef.current = '';
        responseCompletedRef.current = true;
        if (text) {
          completedReplyRef.current = [completedReplyRef.current.trim(), text]
            .filter(Boolean)
            .join(' ');
          if (transcriptRef.current) finalizeTurn();
        } else {
          callbacksRef.current.onError('Mira completed a voice response without readable speech. Please try again.');
          finishTurnWithoutResult();
        }
        break;
      }
      case 'error': {
        peerRef.current?.setMicrophoneEnabled(false);
        const message = event.error?.message || 'The live voice service reported an error.';
        const rejectPendingConnect = connectRejectRef.current;
        if (rejectPendingConnect) {
          rejectPendingConnect(new Error(message));
          break;
        }
        callbacksRef.current.onError(message);
        if (statusRef.current === 'responding') {
          responseTextRef.current = '';
          completedReplyRef.current = '';
          transcriptRef.current = '';
          armTurnWatchdog(
            TURN_SETTLEMENT_WATCHDOG_MS,
            'Mira\'s voice response did not finish playing. Start a new live voice session and try again.',
          );
          finishTurnWithoutResult();
        } else if (statusRef.current !== 'disconnected') {
          responseCompletedRef.current = false;
          outputAudioStartedRef.current = false;
          outputAudioStoppedRef.current = false;
          outputClearRequestedRef.current = false;
          turnFinalizedRef.current = false;
          updateStatus('ready');
        }
        break;
      }
    }
  }, [armTurnWatchdog, finalizeTurn, finishTurnWithoutResult, publishCompletedInputTranscript, publishTranscript, requestIncompleteContinuation, unlockCompletedTurn, updateStatus]);

  const disconnect = useCallback(() => {
    lifecycleRef.current += 1;
    const controller = connectAbortRef.current;
    connectAbortRef.current = null;
    controller?.abort();
    const peer = peerRef.current;
    peerRef.current = null;
    peer?.close();
    void stopSpeaking();
    const rejectConnection = connectRejectRef.current;
    connectResolveRef.current = null;
    connectRejectRef.current = null;
    connectPromiseRef.current = null;
    rejectConnection?.(new Error('The live voice session ended before it was ready.'));
    responseTextRef.current = '';
    transcriptRef.current = '';
    completedReplyRef.current = '';
    inputItemIdRef.current = null;
    completedInputItemIdsRef.current.clear();
    publishedInputTranscriptIdsRef.current.clear();
    failedResponseInputItemIdsRef.current.clear();
    responseCompletedRef.current = false;
    responseCreatedRef.current = false;
    continuationPendingRef.current = false;
    incompleteContinuationCountRef.current = 0;
    outputAudioStartedRef.current = false;
    outputAudioStoppedRef.current = false;
    outputClearRequestedRef.current = false;
    turnFinalizedRef.current = false;
    clearTurnWatchdog();
    turnStartedAtRef.current = 0;
    updateStatus('disconnected');
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
  }, [clearTurnWatchdog, updateStatus]);

  const connect = useCallback(async () => {
    if (peerRef.current && statusRef.current !== 'disconnected') return;
    if (connectPromiseRef.current) return connectPromiseRef.current;

    const controller = new AbortController();
    const lifecycle = lifecycleRef.current;
    connectAbortRef.current = controller;
    const isCurrentAttempt = () => (
      lifecycleRef.current === lifecycle
      && connectAbortRef.current === controller
      && !controller.signal.aborted
    );
    let attemptPeer: RealtimePeerSession | null = null;
    let rejectConfiguration: ((error: Error) => void) | null = null;
    const closeStaleAttemptPeer = () => {
      const peer = attemptPeer;
      if (peer && peerRef.current !== peer) peer.close();
    };

    const promise = (async () => {
      updateStatus('connecting');
      const permission = await requestRecordingPermissionsAsync();
      if (!isCurrentAttempt()) return;
      if (!permission.granted) throw new Error('Microphone access is required for live voice practice.');
      const secret = await createRealtimeClientSecret(clientId, controller.signal);
      if (!isCurrentAttempt()) return;
      if (secret.expires_at * 1000 <= Date.now() + 5_000) throw new Error('The live voice access token expired before it could be used.');

      await stopSpeaking();
      if (!isCurrentAttempt()) return;
      await setAudioModeAsync(REALTIME_SPEAKER_AUDIO_MODE);
      if (!isCurrentAttempt()) return;
      const peer = await createRealtimePeerSession({
        ephemeralKey: secret.value,
        signal: controller.signal,
        onMessage: (message) => {
          if (attemptPeer && peerRef.current === attemptPeer) handleServerEvent(message);
        },
        onClose: () => {
          if (!attemptPeer || peerRef.current !== attemptPeer) return;
          peerRef.current = null;
          clearTurnWatchdog();
          rejectConfiguration?.(new Error('The live voice connection closed before it was ready.'));
          if (statusRef.current === 'disconnected') return;
          updateStatus('disconnected');
          callbacksRef.current.onError('The live voice connection closed. Start a new session to continue.');
          void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
        },
      });
      attemptPeer = peer;
      if (!isCurrentAttempt()) {
        closeStaleAttemptPeer();
        attemptPeer = null;
        return;
      }
      peerRef.current = peer;

      await new Promise<void>((resolve, reject) => {
        let resolveAttempt!: () => void;
        let rejectAttempt!: (error: Error) => void;
        const clearAttemptRefs = () => {
          if (connectResolveRef.current === resolveAttempt) connectResolveRef.current = null;
          if (connectRejectRef.current === rejectAttempt) connectRejectRef.current = null;
          rejectConfiguration = null;
        };
        const timeout = setTimeout(() => rejectAttempt(new Error('The live voice session took too long to configure.')), 15_000);
        resolveAttempt = () => {
          clearTimeout(timeout);
          clearAttemptRefs();
          resolve();
        };
        rejectAttempt = (error) => {
          clearTimeout(timeout);
          clearAttemptRefs();
          reject(error);
        };
        connectResolveRef.current = resolveAttempt;
        connectRejectRef.current = rejectAttempt;
        rejectConfiguration = rejectAttempt;
        if (!isCurrentAttempt()) {
          rejectAttempt(new Error('The live voice connection was canceled.'));
          return;
        }
        try {
          peer.send({
            type: 'session.update',
            session: buildRealtimeSessionConfig(OPENAI_REALTIME_MODEL, responseLanguage),
          });
        } catch (cause) {
          rejectAttempt(cause instanceof Error ? cause : new Error('The live voice session could not be configured.'));
        }
      });
      if (!isCurrentAttempt()) return;
    })();

    connectPromiseRef.current = promise;
    try {
      await promise;
    } catch (cause) {
      if (!isCurrentAttempt()) {
        closeStaleAttemptPeer();
        return;
      }
      disconnect();
      throw cause;
    } finally {
      if (connectAbortRef.current === controller) connectAbortRef.current = null;
      if (connectPromiseRef.current === promise) connectPromiseRef.current = null;
    }
  }, [clearTurnWatchdog, clientId, disconnect, handleServerEvent, responseLanguage, updateStatus]);

  const startTurn = useCallback(async () => {
    const lifecycle = lifecycleRef.current;
    if (statusRef.current === 'responding') return;
    if (statusRef.current === 'disconnected') await connect();
    if (lifecycleRef.current !== lifecycle || statusRef.current !== 'ready') return;
    if (appStateRef.current !== 'active') {
      disconnect();
      return;
    }
    const peer = peerRef.current;
    if (!peer) return;
    await stopSpeaking();
    if (lifecycleRef.current !== lifecycle || statusRef.current !== 'ready' || peerRef.current !== peer) return;
    if (appStateRef.current !== 'active') {
      disconnect();
      return;
    }
    transcriptRef.current = '';
    completedReplyRef.current = '';
    inputItemIdRef.current = null;
    responseTextRef.current = '';
    responseCompletedRef.current = false;
    responseCreatedRef.current = false;
    continuationPendingRef.current = false;
    incompleteContinuationCountRef.current = 0;
    outputAudioStartedRef.current = false;
    outputAudioStoppedRef.current = false;
    outputClearRequestedRef.current = false;
    turnFinalizedRef.current = false;
    clearTurnWatchdog();
    publishTranscript('you', '');
    publishTranscript('mira', '');
    sendEvent({ type: 'output_audio_buffer.clear' });
    sendEvent({ type: 'input_audio_buffer.clear' });
    peer.setMicrophoneEnabled(true);
    turnStartedAtRef.current = Date.now();
    updateStatus('recording');
  }, [clearTurnWatchdog, connect, disconnect, publishTranscript, sendEvent, updateStatus]);

  const finishTurn = useCallback(() => {
    if (statusRef.current !== 'recording') return;
    peerRef.current?.setMicrophoneEnabled(false);
    const duration = Date.now() - turnStartedAtRef.current;
    turnStartedAtRef.current = 0;
    if (duration < MINIMUM_TURN_MS) {
      sendEvent({ type: 'input_audio_buffer.clear' });
      updateStatus('ready');
      throw new Error('That voice turn was too short. Speak for at least a moment before sending.');
    }
    try {
      sendEvent({ type: 'input_audio_buffer.commit' });
      sendEvent({ type: 'response.create', response: { output_modalities: ['audio'] } });
      updateStatus('responding');
      armTurnWatchdog(
        RESPONSE_WATCHDOG_MS,
        'Mira did not finish the voice response. Start a new live voice session and try again.',
      );
    } catch (cause) {
      clearTurnWatchdog();
      updateStatus('ready');
      throw cause;
    }
  }, [armTurnWatchdog, clearTurnWatchdog, sendEvent, updateStatus]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active' || statusRef.current === 'disconnected') return;
      if (nextState === 'inactive' && statusRef.current === 'connecting') return;
      disconnect();
    });
    return () => subscription.remove();
  }, [disconnect]);

  useEffect(() => disconnect, [disconnect]);

  return { connect, disconnect, finishTurn, startTurn, status };
}
