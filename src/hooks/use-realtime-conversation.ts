import {
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import * as Device from 'expo-device';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { rememberBoundedId } from '@/lib/bounded-set';
import { createRealtimePeerSession } from '@/lib/realtime-peer';
import type { RealtimePeerSession } from '@/lib/realtime-peer.types';
import { appendContinuationText, continuationTail } from '@/lib/continuation-text';
import { HINDI_LESSON_PRONUNCIATION_INSTRUCTIONS } from '@/lib/hindi-pronunciation';
import { buildRealtimeSessionConfig } from '@/lib/realtime-session';
import { speakText, stopSpeaking } from '@/lib/speech';
import { resetVoiceAudioMode, setVoiceAudioMode } from '@/lib/voice';
import { createRealtimeClientSecret, OPENAI_REALTIME_MODEL } from '@/services/bolo-api';
import type { AshaResponseLanguage } from '@/state/app-state-types';

export type RealtimeVoiceStatus = 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding';
export type RealtimeTranscriptUpdate = { speaker: 'you' | 'asha'; text: string };
export type RealtimeInputTranscript = { itemId: string; transcript: string };

type Options = {
  clientId: string;
  responseLanguage?: AshaResponseLanguage;
  onError: (message: string) => void;
  onInputTranscriptComplete?: (result: RealtimeInputTranscript) => void;
  onTranscriptChange?: (update: RealtimeTranscriptUpdate) => void;
  onTurnComplete: (turn: { transcript: string; reply: string; language: 'en' | 'hi' }) => void;
};

type RealtimeEvent = {
  type?: string;
  event_id?: string;
  item_id?: string;
  response_id?: string;
  delta?: string;
  text?: string;
  transcript?: string;
  error?: { event_id?: string; message?: string };
  response?: {
    id?: string;
    metadata?: Record<string, string>;
    status?: string;
    status_details?: {
      error?: { message?: string };
      reason?: string;
      type?: string;
    };
  };
};

// WebRTC needs a brief warm-up after enabling an iOS microphone track. One
// second comfortably exceeds Realtime's minimum audio-buffer requirement while
// still feeling like a natural press-to-talk turn.
const MINIMUM_TURN_MS = 1_000;
const RESPONSE_WATCHDOG_MS = 45_000;
const RESPONSE_CANCELLATION_WATCHDOG_MS = 10_000;
const TURN_SETTLEMENT_WATCHDOG_MS = 45_000;
const MAX_STALLED_RESPONSE_RETRIES = 1;
// A live reply can be cut at a service output boundary more than once. Keep
// retries bounded, but leave enough room to finish the learner-facing sentence
// instead of speaking a known partial reply.
const MAX_INCOMPLETE_CONTINUATIONS = 4;
const RESPONSE_TURN_METADATA_KEY = 'bolo_turn';
const RESPONSE_ATTEMPT_METADATA_KEY = 'bolo_attempt';

function isEmptyInputAudioBufferError(message: string) {
  return /(?:input audio buffer.*(?:buffer too small|expected at least)|buffer too small.*audio)/i.test(message);
}

function isNoActiveResponseCancellationError(message: string) {
  return /(?:no active response|no response.*(?:in progress|found)|response.*not found)/i.test(message);
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
  const stalledResponseRetryCountRef = useRef(0);
  const turnWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canonicalPlaybackRef = useRef<AbortController | null>(null);
  const inputCommitPendingRef = useRef(false);
  const turnStartedAtRef = useRef(0);
  const turnGenerationRef = useRef(0);
  const responseAttemptRef = useRef(0);
  const activeResponseIdRef = useRef<string | null>(null);
  const expectedCancelledResponseIdsRef = useRef<Set<string>>(new Set());
  const ignoredCancellationErrorEventIdsRef = useRef<Set<string>>(new Set());
  const pendingResponseCancellationRef = useRef<{
    attempt: number;
    eventId: string;
    responseId: string | null;
    turn: number;
  } | null>(null);
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

  // Output-audio bookkeeping is rebuilt from scratch by every site that starts,
  // abandons, or finishes a response, so it always resets together.
  const resetResponseOutputRefs = useCallback(() => {
    outputAudioStartedRef.current = false;
    outputAudioStoppedRef.current = false;
    outputClearRequestedRef.current = false;
  }, []);

  // Releases the response-lifecycle bookkeeping for a turn that is completely
  // finished, so the next `response.created` can claim it again. Cancellation,
  // watchdog, and transcript state stay explicit at each call site.
  const resetResponseLifecycleRefs = useCallback(() => {
    responseCompletedRef.current = false;
    responseCreatedRef.current = false;
    activeResponseIdRef.current = null;
    continuationPendingRef.current = false;
    incompleteContinuationCountRef.current = 0;
    stalledResponseRetryCountRef.current = 0;
    resetResponseOutputRefs();
    turnFinalizedRef.current = false;
    inputCommitPendingRef.current = false;
  }, [resetResponseOutputRefs]);

  // Clears everything a turn accumulates, including the learner transcript and
  // Asha's reply. Sites that also tear down cancellation, id caches, timing, or
  // the watchdog keep those extras next to this call.
  const resetTurnRefs = useCallback(() => {
    responseTextRef.current = '';
    transcriptRef.current = '';
    completedReplyRef.current = '';
    inputItemIdRef.current = null;
    resetResponseLifecycleRefs();
  }, [resetResponseLifecycleRefs]);

  const publishTranscript = useCallback((speaker: RealtimeTranscriptUpdate['speaker'], text: string) => {
    callbacksRef.current.onTranscriptChange?.({ speaker, text: text.trim() });
  }, []);

  const publishCompletedInputTranscript = useCallback((itemId: string, transcript: string) => {
    if (publishedInputTranscriptIdsRef.current.has(itemId)) return;
    rememberBoundedId(publishedInputTranscriptIdsRef.current, itemId);
    callbacksRef.current.onInputTranscriptComplete?.({ itemId, transcript });
  }, []);

  const settlePendingResponseCancellation = useCallback(() => {
    const pendingCancellation = pendingResponseCancellationRef.current;
    rememberBoundedId(
      ignoredCancellationErrorEventIdsRef.current,
      pendingCancellation?.eventId ?? null,
    );
    pendingResponseCancellationRef.current = null;
  }, []);

  const sendResponseCreate = useCallback((instructions?: string) => {
    const attempt = responseAttemptRef.current + 1;
    responseAttemptRef.current = attempt;
    activeResponseIdRef.current = null;
    responseCreatedRef.current = false;
    sendEvent({
      type: 'response.create',
      response: {
        output_modalities: ['text'],
        metadata: {
          [RESPONSE_TURN_METADATA_KEY]: String(turnGenerationRef.current),
          [RESPONSE_ATTEMPT_METADATA_KEY]: String(attempt),
        },
        ...(instructions ? { instructions } : {}),
      },
    });
  }, [sendEvent]);

  const responseMetadataMatchesCurrentAttempt = useCallback((event: RealtimeEvent) => {
    const metadata = event.response?.metadata;
    return metadata?.[RESPONSE_TURN_METADATA_KEY] === String(turnGenerationRef.current)
      && metadata?.[RESPONSE_ATTEMPT_METADATA_KEY] === String(responseAttemptRef.current);
  }, []);

  const responseMatchesCurrentAttempt = useCallback((event: RealtimeEvent) => {
    if (responseMetadataMatchesCurrentAttempt(event)) return true;
    const responseId = event.response?.id ?? event.response_id;
    return Boolean(responseId && responseId === activeResponseIdRef.current);
  }, [responseMetadataMatchesCurrentAttempt]);

  const outputBelongsToActiveResponse = useCallback((event: RealtimeEvent) => {
    if (!event.response_id) return true;
    return event.response_id === activeResponseIdRef.current;
  }, []);

  const failStalledTurn = useCallback((message: string) => {
    if (statusRef.current !== 'responding') return;
    clearTurnWatchdog();
    lifecycleRef.current += 1;
    const peer = peerRef.current;
    peerRef.current = null;
    canonicalPlaybackRef.current?.abort();
    canonicalPlaybackRef.current = null;
    peer?.setMicrophoneEnabled(false);
    peer?.close();
    resetTurnRefs();
    pendingResponseCancellationRef.current = null;
    ignoredCancellationErrorEventIdsRef.current.clear();
    turnStartedAtRef.current = 0;
    updateStatus('disconnected');
    callbacksRef.current.onError(message);
    void resetVoiceAudioMode().catch(() => undefined);
  }, [clearTurnWatchdog, resetTurnRefs, updateStatus]);

  const armTurnWatchdog = useCallback((timeoutMs: number, message: string, retryStalledResponse = false) => {
    clearTurnWatchdog();
    const lifecycle = lifecycleRef.current;
    turnWatchdogRef.current = setTimeout(() => {
      if (lifecycleRef.current !== lifecycle) return;
      const peer = peerRef.current;
      if (
        retryStalledResponse
        && statusRef.current === 'responding'
        && peer
        && stalledResponseRetryCountRef.current < MAX_STALLED_RESPONSE_RETRIES
      ) {
        stalledResponseRetryCountRef.current += 1;
        try {
          const cancelledResponseId = activeResponseIdRef.current;
          const cancellationEventId = [
            'bolo_cancel',
            turnGenerationRef.current,
            responseAttemptRef.current,
            Date.now(),
          ].join('_');
          pendingResponseCancellationRef.current = {
            attempt: responseAttemptRef.current,
            eventId: cancellationEventId,
            responseId: cancelledResponseId,
            turn: turnGenerationRef.current,
          };
          rememberBoundedId(expectedCancelledResponseIdsRef.current, cancelledResponseId);
          peer.send({
            type: 'response.cancel',
            event_id: cancellationEventId,
            ...(cancelledResponseId ? { response_id: cancelledResponseId } : {}),
          });
          turnWatchdogRef.current = setTimeout(() => {
            if (lifecycleRef.current === lifecycle) failStalledTurn(message);
          }, RESPONSE_CANCELLATION_WATCHDOG_MS);
          return;
        } catch {
          pendingResponseCancellationRef.current = null;
          // The peer is no longer usable; fall through to the normal cleanup.
        }
      }
      failStalledTurn(message);
    }, timeoutMs);
  }, [clearTurnWatchdog, failStalledTurn]);

  const startStalledResponseRetry = useCallback(() => {
    settlePendingResponseCancellation();
    clearTurnWatchdog();
    responseTextRef.current = '';
    completedReplyRef.current = '';
    responseCompletedRef.current = false;
    responseCreatedRef.current = false;
    activeResponseIdRef.current = null;
    continuationPendingRef.current = false;
    incompleteContinuationCountRef.current = 0;
    resetResponseOutputRefs();
    turnFinalizedRef.current = false;
    publishTranscript('asha', '');
    try {
      sendResponseCreate(`Respond now to the latest learner turn in one short sentence, then stop. ${HINDI_LESSON_PRONUNCIATION_INSTRUCTIONS}`);
      armTurnWatchdog(
        RESPONSE_WATCHDOG_MS,
        'Asha did not finish the voice response. Start a new live voice session and try again.',
        true,
      );
    } catch {
      failStalledTurn('Asha could not retry the voice response. Start a new live voice session and try again.');
    }
  }, [armTurnWatchdog, clearTurnWatchdog, failStalledTurn, publishTranscript, resetResponseOutputRefs, sendResponseCreate, settlePendingResponseCancellation]);

  const unlockCompletedTurn = useCallback(() => {
    if (!responseCompletedRef.current || !outputAudioStoppedRef.current || !turnFinalizedRef.current) return;
    clearTurnWatchdog();
    settlePendingResponseCancellation();
    resetResponseLifecycleRefs();
    updateStatus('ready');
  }, [clearTurnWatchdog, resetResponseLifecycleRefs, settlePendingResponseCancellation, updateStatus]);

  const finalizeTurn = useCallback(() => {
    const spokenReply = completedReplyRef.current.trim();
    const transcript = transcriptRef.current.trim();
    if (!spokenReply || !transcript || !inputItemIdRef.current) return;
    const reply = spokenReply;
    rememberBoundedId(completedInputItemIdsRef.current, inputItemIdRef.current);
    inputItemIdRef.current = null;
    completedReplyRef.current = '';
    transcriptRef.current = '';
    turnFinalizedRef.current = true;
    unlockCompletedTurn();
    callbacksRef.current.onTurnComplete({ transcript, reply, language: responseLanguage });
  }, [responseLanguage, unlockCompletedTurn]);

  const finishTurnWithoutResult = useCallback(() => {
    settlePendingResponseCancellation();
    const canonicalPlayback = canonicalPlaybackRef.current;
    canonicalPlayback?.abort();
    canonicalPlaybackRef.current = null;
    responseCompletedRef.current = true;
    turnFinalizedRef.current = true;
    if (canonicalPlayback || !outputAudioStartedRef.current) {
      outputAudioStartedRef.current = false;
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
          resetResponseOutputRefs();
          turnFinalizedRef.current = false;
          updateStatus('disconnected');
          void resetVoiceAudioMode().catch(() => undefined);
          return;
        }
      }
    }
    unlockCompletedTurn();
  }, [clearTurnWatchdog, resetResponseOutputRefs, settlePendingResponseCancellation, unlockCompletedTurn, updateStatus]);

  const playCanonicalReply = useCallback((reply: string) => {
    canonicalPlaybackRef.current?.abort();
    const controller = new AbortController();
    const lifecycle = lifecycleRef.current;
    canonicalPlaybackRef.current = controller;
    outputAudioStartedRef.current = true;
    outputAudioStoppedRef.current = false;

    void (async () => {
      try {
        await speakText(reply, controller.signal, 1, responseLanguage, 'realtimePlayback');
      } catch (error) {
        if (!controller.signal.aborted && lifecycleRef.current === lifecycle && statusRef.current === 'responding') {
          callbacksRef.current.onError(error instanceof Error ? error.message : 'Asha could not play that response.');
        }
      } finally {
        if (canonicalPlaybackRef.current !== controller) return;
        canonicalPlaybackRef.current = null;
        if (controller.signal.aborted || lifecycleRef.current !== lifecycle || statusRef.current !== 'responding') return;
        outputAudioStartedRef.current = false;
        outputAudioStoppedRef.current = true;
        if (completedReplyRef.current && transcriptRef.current) finalizeTurn();
        // A transcription may have finalized the turn while TTS was still
        // playing. Calling unlock again is intentional and releases that
        // already-finalized turn once canonical playback is complete.
        unlockCompletedTurn();
      }
    })();
  }, [finalizeTurn, responseLanguage, unlockCompletedTurn]);

  const requestIncompleteContinuation = useCallback(() => {
    if (!continuationPendingRef.current || statusRef.current !== 'responding') return;
    const peer = peerRef.current;
    if (!peer) {
      failStalledTurn('Asha could not continue the incomplete voice response. Please try again.');
      return;
    }
    continuationPendingRef.current = false;
    responseTextRef.current = '';
    responseCompletedRef.current = false;
    responseCreatedRef.current = false;
    resetResponseOutputRefs();
    const spokenTail = continuationTail(completedReplyRef.current);
    try {
      sendResponseCreate(`Continue the previous reply exactly where it stopped. The already-spoken ending is ${JSON.stringify(spokenTail)}. Begin after that ending and do not repeat it. Complete the unfinished sentence first, using no more than 12 words. ${HINDI_LESSON_PRONUNCIATION_INSTRUCTIONS}`);
      armTurnWatchdog(
        RESPONSE_WATCHDOG_MS,
        'Asha did not finish the continued voice response. Start a new live voice session and try again.',
        true,
      );
    } catch {
      failStalledTurn('Asha could not continue the incomplete voice response. Please try again.');
    }
  }, [armTurnWatchdog, failStalledTurn, resetResponseOutputRefs, sendResponseCreate]);

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
        if (statusRef.current !== 'responding') break;
        if (
          event.item_id
          && !completedInputItemIdsRef.current.has(event.item_id)
          && !inputItemIdRef.current
        ) {
          inputItemIdRef.current = event.item_id;
        }
        if (inputCommitPendingRef.current) {
          inputCommitPendingRef.current = false;
          try {
            sendResponseCreate();
            armTurnWatchdog(
              RESPONSE_WATCHDOG_MS,
              'Asha did not finish the voice response. Start a new live voice session and try again.',
              true,
            );
          } catch (cause) {
            clearTurnWatchdog();
            callbacksRef.current.onError(cause instanceof Error ? cause.message : 'Asha could not start that voice response. Please try again.');
            finishTurnWithoutResult();
          }
        }
        break;
      case 'session.updated':
        connectResolveRef.current?.();
        updateStatus('ready');
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        if (!event.item_id || completedInputItemIdsRef.current.has(event.item_id)) break;
        const belongsToFailedResponse = failedResponseInputItemIdsRef.current.delete(event.item_id);
        if (!belongsToFailedResponse && inputItemIdRef.current && event.item_id !== inputItemIdRef.current) break;
        if (publishedInputTranscriptIdsRef.current.has(event.item_id)) break;
        if (belongsToFailedResponse) {
          if (event.transcript?.trim()) {
            publishTranscript('you', event.transcript);
            publishCompletedInputTranscript(event.item_id, event.transcript.trim());
          }
          rememberBoundedId(completedInputItemIdsRef.current, event.item_id);
          break;
        }
        if (!inputItemIdRef.current) inputItemIdRef.current = event.item_id;
        if (event.transcript?.trim()) {
          transcriptRef.current = event.transcript.trim();
          publishTranscript('you', transcriptRef.current);
          publishCompletedInputTranscript(event.item_id, transcriptRef.current);
          if (completedReplyRef.current) finalizeTurn();
        } else if (statusRef.current === 'responding') {
          rememberBoundedId(completedInputItemIdsRef.current, inputItemIdRef.current);
          inputItemIdRef.current = null;
          responseTextRef.current = '';
          completedReplyRef.current = '';
          transcriptRef.current = '';
          callbacksRef.current.onError('Asha could not hear a readable voice turn. Please try again.');
          finishTurnWithoutResult();
        }
        break;
      }
      case 'conversation.item.input_audio_transcription.delta':
        if (!event.item_id || completedInputItemIdsRef.current.has(event.item_id)) break;
        if (inputItemIdRef.current && event.item_id !== inputItemIdRef.current) break;
        if (!inputItemIdRef.current) inputItemIdRef.current = event.item_id;
        if (event.delta) {
          transcriptRef.current += event.delta;
          publishTranscript('you', transcriptRef.current);
        }
        break;
      case 'conversation.item.input_audio_transcription.failed': {
        if (event.item_id && completedInputItemIdsRef.current.has(event.item_id)) break;
        const failedAfterResponseFailure = event.item_id
          ? failedResponseInputItemIdsRef.current.delete(event.item_id)
          : false;
        if (!failedAfterResponseFailure && event.item_id && inputItemIdRef.current && event.item_id !== inputItemIdRef.current) break;
        if (failedAfterResponseFailure) {
          rememberBoundedId(completedInputItemIdsRef.current, event.item_id ?? null);
          break;
        }
        if (event.item_id && !inputItemIdRef.current) inputItemIdRef.current = event.item_id;
        if (statusRef.current === 'responding') {
          rememberBoundedId(completedInputItemIdsRef.current, inputItemIdRef.current);
          inputItemIdRef.current = null;
          responseTextRef.current = '';
          completedReplyRef.current = '';
          transcriptRef.current = '';
          callbacksRef.current.onError(event.error?.message || 'Asha could not transcribe that voice turn. Please try again.');
          finishTurnWithoutResult();
        }
        break;
      }
      case 'response.created': {
        // Every response this client creates carries turn/attempt metadata.
        // Requiring that metadata here prevents a late response from a prior
        // turn from claiming the active response ID for the new turn.
        const createdResponseId = event.response?.id ?? event.response_id ?? null;
        if (
          statusRef.current !== 'responding'
          || !createdResponseId
          || !responseMetadataMatchesCurrentAttempt(event)
          || responseCreatedRef.current
          || responseCompletedRef.current
        ) break;
        activeResponseIdRef.current = createdResponseId;
        const cancellationPending = Boolean(pendingResponseCancellationRef.current);
        if (
          pendingResponseCancellationRef.current
          && !pendingResponseCancellationRef.current.responseId
        ) {
          pendingResponseCancellationRef.current.responseId = createdResponseId;
          rememberBoundedId(expectedCancelledResponseIdsRef.current, createdResponseId);
        }
        responseTextRef.current = '';
        responseCompletedRef.current = false;
        responseCreatedRef.current = true;
        resetResponseOutputRefs();
        turnFinalizedRef.current = false;
        updateStatus('responding');
        if (!cancellationPending) {
          armTurnWatchdog(
            RESPONSE_WATCHDOG_MS,
            'Asha did not finish the voice response. Start a new live voice session and try again.',
            true,
          );
        }
        break;
      }
      case 'output_audio_buffer.started':
        if (statusRef.current !== 'responding' || !outputBelongsToActiveResponse(event)) break;
        outputAudioStartedRef.current = true;
        outputAudioStoppedRef.current = false;
        outputClearRequestedRef.current = false;
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        if (statusRef.current !== 'responding' || !outputBelongsToActiveResponse(event)) break;
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
        if (statusRef.current !== 'responding' || !outputBelongsToActiveResponse(event)) break;
        if (event.delta) {
          responseTextRef.current += event.delta;
          publishTranscript(
            'asha',
            appendContinuationText(completedReplyRef.current, responseTextRef.current),
          );
        }
        break;
      case 'response.output_audio_transcript.done': {
        if (statusRef.current !== 'responding' || !outputBelongsToActiveResponse(event)) break;
        const text = (event.transcript || event.text || responseTextRef.current).trim();
        responseTextRef.current = text;
        if (text) {
          publishTranscript(
            'asha',
            appendContinuationText(completedReplyRef.current, text),
          );
        }
        break;
      }
      case 'response.output_text.delta':
        if (statusRef.current !== 'responding' || !outputBelongsToActiveResponse(event)) break;
        if (event.delta) {
          responseTextRef.current += event.delta;
          publishTranscript(
            'asha',
            appendContinuationText(completedReplyRef.current, responseTextRef.current),
          );
        }
        break;
      case 'response.output_text.done': {
        if (statusRef.current !== 'responding' || !outputBelongsToActiveResponse(event)) break;
        const text = (event.text || responseTextRef.current).trim();
        responseTextRef.current = text;
        if (text) {
          publishTranscript(
            'asha',
            appendContinuationText(completedReplyRef.current, text),
          );
        }
        break;
      }
      case 'response.done': {
        if (statusRef.current !== 'responding' || responseCompletedRef.current) break;
        const responseId = event.response?.id ?? event.response_id ?? null;
        const responseStatus = event.response?.status;
        const pendingCancellation = pendingResponseCancellationRef.current;
        const matchesPendingCancellation = Boolean(
          pendingCancellation
          && (pendingCancellation.responseId
            ? responseId === pendingCancellation.responseId
            : responseMetadataMatchesCurrentAttempt(event)),
        );
        if (matchesPendingCancellation && responseStatus === 'cancelled') {
          startStalledResponseRetry();
          break;
        }
        if (matchesPendingCancellation) {
          settlePendingResponseCancellation();
          if (responseId) expectedCancelledResponseIdsRef.current.delete(responseId);
          clearTurnWatchdog();
        } else if (responseId && expectedCancelledResponseIdsRef.current.has(responseId)) {
          break;
        }
        if (!responseMatchesCurrentAttempt(event)) break;
        if (responseId && activeResponseIdRef.current && responseId !== activeResponseIdRef.current) break;
        activeResponseIdRef.current = null;
        armTurnWatchdog(
          TURN_SETTLEMENT_WATCHDOG_MS,
          'Asha\'s voice response did not finish playing or transcribing. Start a new live voice session and try again.',
        );
        const failure = event.response?.status_details?.error?.message;
        const incompleteReason = event.response?.status_details?.reason;
        if (
          responseStatus === 'incomplete'
          && incompleteReason === 'max_output_tokens'
          && incompleteContinuationCountRef.current < MAX_INCOMPLETE_CONTINUATIONS
        ) {
          const partialReply = responseTextRef.current.trim();
          if (partialReply) {
            completedReplyRef.current = appendContinuationText(completedReplyRef.current, partialReply);
          }
          responseTextRef.current = '';
          responseCompletedRef.current = false;
          responseCreatedRef.current = false;
          activeResponseIdRef.current = null;
          incompleteContinuationCountRef.current += 1;
          continuationPendingRef.current = true;
          if (!outputAudioStartedRef.current || outputAudioStoppedRef.current) {
            requestIncompleteContinuation();
          }
          break;
        }
        if (responseStatus === 'incomplete' && incompleteReason === 'max_output_tokens') {
          const finalPartialReply = responseTextRef.current.trim();
          if (finalPartialReply) {
            completedReplyRef.current = appendContinuationText(completedReplyRef.current, finalPartialReply);
          }
          responseTextRef.current = '';
          responseCompletedRef.current = true;
          if (completedReplyRef.current) {
            if (outputAudioStartedRef.current) {
              if (transcriptRef.current) finalizeTurn();
            } else {
              playCanonicalReply(completedReplyRef.current);
            }
          }
          break;
        }
        if (responseStatus !== 'completed' || failure) {
          if (inputItemIdRef.current && !publishedInputTranscriptIdsRef.current.has(inputItemIdRef.current)) {
            rememberBoundedId(failedResponseInputItemIdsRef.current, inputItemIdRef.current);
          } else {
            rememberBoundedId(completedInputItemIdsRef.current, inputItemIdRef.current);
          }
          inputItemIdRef.current = null;
          responseTextRef.current = '';
          completedReplyRef.current = '';
          transcriptRef.current = '';
          const message = responseStatus === 'incomplete'
            ? 'Asha’s voice response was incomplete. Please try again.'
            : responseStatus === 'cancelled'
              ? 'Asha’s voice response was canceled. Please try again.'
              : 'Asha could not complete that voice response.';
          callbacksRef.current.onError(failure || message);
          finishTurnWithoutResult();
          break;
        }
        const text = responseTextRef.current.trim();
        responseTextRef.current = '';
        responseCompletedRef.current = true;
        if (text) {
          completedReplyRef.current = appendContinuationText(completedReplyRef.current, text);
          if (outputAudioStartedRef.current) {
            if (transcriptRef.current) finalizeTurn();
          } else {
            playCanonicalReply(completedReplyRef.current);
          }
        } else {
          callbacksRef.current.onError('Asha completed a voice response without readable speech. Please try again.');
          finishTurnWithoutResult();
        }
        break;
      }
      case 'error': {
        const message = event.error?.message || 'The live voice service reported an error.';
        const cancellationErrorEventId = event.error?.event_id;
        if (
          cancellationErrorEventId
          && ignoredCancellationErrorEventIdsRef.current.has(cancellationErrorEventId)
        ) break;
        const pendingCancellation = pendingResponseCancellationRef.current;
        if (pendingCancellation && cancellationErrorEventId === pendingCancellation.eventId) {
          if (isNoActiveResponseCancellationError(message)) {
            if (!pendingCancellation.responseId) startStalledResponseRetry();
          } else {
            failStalledTurn(message);
          }
          break;
        }
        peerRef.current?.setMicrophoneEnabled(false);
        const rejectPendingConnect = connectRejectRef.current;
        if (rejectPendingConnect) {
          rejectPendingConnect(new Error(message));
          break;
        }
        if (isEmptyInputAudioBufferError(message)) {
          clearTurnWatchdog();
          inputCommitPendingRef.current = false;
          responseTextRef.current = '';
          transcriptRef.current = '';
          completedReplyRef.current = '';
          inputItemIdRef.current = null;
          responseCompletedRef.current = false;
          responseCreatedRef.current = false;
          activeResponseIdRef.current = null;
          resetResponseOutputRefs();
          turnFinalizedRef.current = false;
          turnStartedAtRef.current = 0;
          try {
            peerRef.current?.send({ type: 'input_audio_buffer.clear' });
          } catch {
            // The session can still be reused when clearing an already-empty buffer fails.
          }
          callbacksRef.current.onError('I didn’t receive enough audio. Speak for at least a second, then tap the orb again to send.');
          updateStatus('ready');
          break;
        }
        callbacksRef.current.onError(message);
        if (statusRef.current === 'responding') {
          responseTextRef.current = '';
          completedReplyRef.current = '';
          transcriptRef.current = '';
          armTurnWatchdog(
            TURN_SETTLEMENT_WATCHDOG_MS,
            'Asha\'s voice response did not finish playing. Start a new live voice session and try again.',
          );
          finishTurnWithoutResult();
        } else if (statusRef.current !== 'disconnected') {
          responseCompletedRef.current = false;
          resetResponseOutputRefs();
          turnFinalizedRef.current = false;
          updateStatus('ready');
        }
        break;
      }
    }
  }, [armTurnWatchdog, clearTurnWatchdog, failStalledTurn, finalizeTurn, finishTurnWithoutResult, outputBelongsToActiveResponse, playCanonicalReply, publishCompletedInputTranscript, publishTranscript, requestIncompleteContinuation, resetResponseOutputRefs, responseMatchesCurrentAttempt, responseMetadataMatchesCurrentAttempt, sendResponseCreate, settlePendingResponseCancellation, startStalledResponseRetry, unlockCompletedTurn, updateStatus]);

  const disconnect = useCallback(() => {
    lifecycleRef.current += 1;
    const controller = connectAbortRef.current;
    connectAbortRef.current = null;
    controller?.abort();
    const peer = peerRef.current;
    peerRef.current = null;
    peer?.close();
    canonicalPlaybackRef.current?.abort();
    canonicalPlaybackRef.current = null;
    void stopSpeaking();
    const rejectConnection = connectRejectRef.current;
    connectResolveRef.current = null;
    connectRejectRef.current = null;
    connectPromiseRef.current = null;
    rejectConnection?.(new Error('The live voice session ended before it was ready.'));
    resetTurnRefs();
    completedInputItemIdsRef.current.clear();
    publishedInputTranscriptIdsRef.current.clear();
    failedResponseInputItemIdsRef.current.clear();
    expectedCancelledResponseIdsRef.current.clear();
    ignoredCancellationErrorEventIdsRef.current.clear();
    pendingResponseCancellationRef.current = null;
    clearTurnWatchdog();
    turnStartedAtRef.current = 0;
    updateStatus('disconnected');
    void resetVoiceAudioMode().catch(() => undefined);
  }, [clearTurnWatchdog, resetTurnRefs, updateStatus]);

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
      if (Platform.OS === 'ios' && !Device.isDevice) {
        throw new Error('Live voice requires a physical iPhone because iOS Simulator cannot safely initialize microphone audio.');
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!isCurrentAttempt()) return;
      if (!permission.granted) throw new Error('Microphone access is required for live voice practice.');
      const secret = await createRealtimeClientSecret(clientId, controller.signal);
      if (!isCurrentAttempt()) return;
      if (secret.expires_at * 1000 <= Date.now() + 5_000) throw new Error('The live voice access token expired before it could be used.');

      await stopSpeaking();
      if (!isCurrentAttempt()) return;
      // Text-only Realtime never emits an output-audio event, so this must be
      // set before getUserMedia rather than waiting for the old audio-output
      // callback. Without a recording-capable session, iOS can negotiate the
      // peer while sending zero microphone frames.
      await setVoiceAudioMode('realtime');
      if (!isCurrentAttempt()) return;
      const peer = await createRealtimePeerSession({
        ephemeralKey: secret.value,
        signal: controller.signal,
        onMessage: (message) => {
          if (attemptPeer && peerRef.current === attemptPeer) handleServerEvent(message);
        },
        onClose: () => {
          if (!attemptPeer || peerRef.current !== attemptPeer) return;
          lifecycleRef.current += 1;
          peerRef.current = null;
          clearTurnWatchdog();
          canonicalPlaybackRef.current?.abort();
          canonicalPlaybackRef.current = null;
          void stopSpeaking();
          activeResponseIdRef.current = null;
          pendingResponseCancellationRef.current = null;
          ignoredCancellationErrorEventIdsRef.current.clear();
          rejectConfiguration?.(new Error('The live voice connection closed before it was ready.'));
          if (statusRef.current === 'disconnected') return;
          updateStatus('disconnected');
          callbacksRef.current.onError('The live voice connection closed. Start a new session to continue.');
          void resetVoiceAudioMode().catch(() => undefined);
        },
      });
      attemptPeer = peer;
      if (!isCurrentAttempt()) {
        closeStaleAttemptPeer();
        attemptPeer = null;
        return;
      }
      // Creating the native WebRTC peer can replace iOS's PlayAndRecord
      // category options. Reapply Bolo's live mode after that handoff so the
      // reply player uses the loudspeaker, not the quieter call receiver.
      // This is deliberately before a microphone turn or Asha playback, so it
      // does not race either active media path.
      await setVoiceAudioMode('realtime');
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
    // The connected WebRTC call owns the iOS PlayAndRecord session. Rewriting
    // it here races its native activation state after Asha's prior reply.
    // Playback players keep that session active until the call disconnects.
    resetTurnRefs();
    settlePendingResponseCancellation();
    responseAttemptRef.current = 0;
    turnGenerationRef.current += 1;
    clearTurnWatchdog();
    publishTranscript('you', '');
    publishTranscript('asha', '');
    sendEvent({ type: 'output_audio_buffer.clear' });
    sendEvent({ type: 'input_audio_buffer.clear' });
    peer.setMicrophoneEnabled(true);
    turnStartedAtRef.current = Date.now();
    updateStatus('recording');
  }, [clearTurnWatchdog, connect, disconnect, publishTranscript, resetTurnRefs, sendEvent, settlePendingResponseCancellation, updateStatus]);

  const finishTurn = useCallback(() => {
    if (statusRef.current !== 'recording') return;
    peerRef.current?.setMicrophoneEnabled(false);
    const duration = Date.now() - turnStartedAtRef.current;
    turnStartedAtRef.current = 0;
    if (duration < MINIMUM_TURN_MS) {
      sendEvent({ type: 'input_audio_buffer.clear' });
      updateStatus('ready');
      throw new Error('That voice turn was too short. Speak for at least a second before sending.');
    }
    try {
      inputCommitPendingRef.current = true;
      sendEvent({ type: 'input_audio_buffer.commit' });
      updateStatus('responding');
      armTurnWatchdog(
        RESPONSE_WATCHDOG_MS,
        'Asha did not finish the voice response. Start a new live voice session and try again.',
        true,
      );
    } catch (cause) {
      inputCommitPendingRef.current = false;
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
