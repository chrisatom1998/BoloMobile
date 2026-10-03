import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as Device from 'expo-device';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { AshaMode, AshaSessionContext, AshaSpokenLanguage } from '@/lib/asha-live-session';
import { AshaTaskGate, buildAshaGreetingInstruction, buildAshaSpokenLanguageInstructions } from '@/lib/asha-live-session';
import type { AshaNativeToolExecutor } from '@/lib/asha-native-tools';
import { rememberBoundedId } from '@/lib/bounded-set';
import { createRealtimePeerSession } from '@/lib/realtime-peer';
import type { RealtimePeerSession } from '@/lib/realtime-peer.types';
import { resetVoiceAudioMode, setVoiceAudioMode } from '@/lib/voice';
import { createAshaLiveSession } from '@/services/bolo-api';

export type AshaLiveStatus = 'disconnected' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'reconnecting';

export type AshaTranscriptFragment = {
  endMs?: number;
  eventId: string;
  speaker: 'you' | 'asha';
  startMs?: number;
  text: string;
};

type LiveEvent = {
  client_event_id?: string;
  delegation?: { id?: string; response_id?: string; target?: string };
  delegation_id?: string;
  delta?: string;
  end_ms?: number;
  error?: { message?: string };
  event?: {
    type?: string;
    item?: { arguments?: string; call_id?: string; name?: string; type?: string };
    response?: { id?: string };
  };
  event_id?: string;
  reason?: string;
  session?: { id?: string };
  start_ms?: number;
  type?: string;
};

type Options = {
  clientId: string;
  context: AshaSessionContext;
  executeTool?: AshaNativeToolExecutor;
  mode: AshaMode;
  responseLanguage: AshaSpokenLanguage;
  onError: (message: string) => void;
  onTranscript?: (fragment: AshaTranscriptFragment) => void;
  onBackendLoadingChange?: (loading: boolean) => void;
};

function parseArguments(value: string | undefined): Record<string, unknown> | null {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function useAshaLiveConversation({
  clientId,
  context,
  executeTool,
  mode,
  responseLanguage,
  onBackendLoadingChange,
  onError,
  onTranscript,
}: Options) {
  const [status, setStatus] = useState<AshaLiveStatus>('disconnected');
  const [muted, setMuted] = useState(false);
  const [backendLoading, setBackendLoading] = useState(false);
  const [activeResponseLanguage, setActiveResponseLanguage] = useState(responseLanguage);
  const peerRef = useRef<RealtimePeerSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedRef = useRef(false);
  const greetingSentRef = useRef(false);
  const lifecycleRef = useRef(0);
  const connectAbortRef = useRef<AbortController | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<((recovery?: boolean) => Promise<void>) | null>(null);
  const toolAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const taskGateRef = useRef(new AshaTaskGate());
  const delegationGenerationsRef = useRef<Map<string, number>>(new Map());
  const delegationToolCallsRef = useRef<Map<string, Set<string>>>(new Map());
  const completedDelegationResponsesRef = useRef(new Set<string>());
  const completedCallIdsRef = useRef(new Set<string>());
  const transcriptEventIdsRef = useRef(new Set<string>());
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseLanguageRef = useRef(responseLanguage);
  const previousResponseLanguageRef = useRef(responseLanguage);
  const pendingLanguageUpdateRef = useRef<{ eventId: string; language: AshaSpokenLanguage } | null>(null);
  const [languageUpdatePending, setLanguageUpdatePending] = useState(false);
  const suppressStaleOutputRef = useRef(false);
  const callbacksRef = useRef({ onBackendLoadingChange, onError, onTranscript });
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    callbacksRef.current = { onBackendLoadingChange, onError, onTranscript };
  }, [onBackendLoadingChange, onError, onTranscript]);

  const updateBackendLoading = useCallback((loading: boolean) => {
    setBackendLoading(loading);
    callbacksRef.current.onBackendLoadingChange?.(loading);
  }, []);

  const cancelObsoleteBackendWork = useCallback(() => {
    taskGateRef.current.invalidate();
    toolAbortControllersRef.current.forEach((controller) => controller.abort());
    toolAbortControllersRef.current.clear();
    delegationGenerationsRef.current.clear();
    delegationToolCallsRef.current.clear();
    completedDelegationResponsesRef.current.clear();
    updateBackendLoading(false);
  }, [updateBackendLoading]);

  const releaseResources = useCallback(() => {
    connectAbortRef.current?.abort();
    connectAbortRef.current = null;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
    cancelObsoleteBackendWork();
    if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
    speakingTimerRef.current = null;
    const peer = peerRef.current;
    peerRef.current = null;
    sessionIdRef.current = null;
    sessionStartedRef.current = false;
    greetingSentRef.current = false;
    pendingLanguageUpdateRef.current = null;
    setLanguageUpdatePending(false);
    suppressStaleOutputRef.current = false;
    completedCallIdsRef.current.clear();
    transcriptEventIdsRef.current.clear();
    peer?.close();
    setMuted(false);
    setStatus('disconnected');
    void resetVoiceAudioMode().catch(() => undefined);
  }, [cancelObsoleteBackendWork]);

  const finishSessionStartup = useCallback((peer: RealtimePeerSession) => {
    if (!sessionStartedRef.current || greetingSentRef.current || peerRef.current !== peer) return;
    greetingSentRef.current = true;
    peer.setMicrophoneEnabled(true);
    setStatus('listening');
    peer.send({
      type: 'session.instructions.append',
      event_id: 'bolo_greeting',
      delegation_id: null,
      content: buildAshaGreetingInstruction(responseLanguageRef.current),
    });
  }, []);

  const runDelegatedTool = useCallback(async (
    delegationId: string,
    call: { arguments?: string; call_id?: string; name?: string },
  ) => {
    const callId = call.call_id;
    const name = call.name;
    const sessionId = sessionIdRef.current;
    const peer = peerRef.current;
    if (!callId || !name || !sessionId || !peer || completedCallIdsRef.current.has(callId)) return;
    const generation = delegationGenerationsRef.current.get(delegationId);
    const args = parseArguments(call.arguments);
    if (!args || generation === undefined) return;
    rememberBoundedId(completedCallIdsRef.current, callId, 500);

    const controller = new AbortController();
    toolAbortControllersRef.current.set(callId, controller);
    const delegationCalls = delegationToolCallsRef.current.get(delegationId) ?? new Set<string>();
    delegationCalls.add(callId);
    delegationToolCallsRef.current.set(delegationId, delegationCalls);
    let output: unknown;
    try {
      if (!executeTool) throw new Error('This Bolo tool is unavailable on this device.');
      const result = await executeTool({ arguments: args, callId, name, sessionId, signal: controller.signal });
      output = taskGateRef.current.isCurrent(generation)
        ? result
        : { cancelled: true, reason: 'The learner changed the request before this result completed.' };
    } catch (cause) {
      output = {
        cancelled: controller.signal.aborted,
        error: controller.signal.aborted
          ? 'The learner changed the request before this result completed.'
          : cause instanceof Error ? cause.message : 'The Bolo tool failed.',
      };
    } finally {
      toolAbortControllersRef.current.delete(callId);
      const activeCalls = delegationToolCallsRef.current.get(delegationId);
      activeCalls?.delete(callId);
      if (activeCalls?.size === 0) delegationToolCallsRef.current.delete(delegationId);
    }

    if (!taskGateRef.current.isCurrent(generation) || controller.signal.aborted
      || peerRef.current !== peer || !sessionIdRef.current) return;
    peer.send({
      type: 'response.item.create',
      event_id: `bolo_tool_${callId}`,
      item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
    });
    peer.send({ type: 'response.create', event_id: `bolo_continue_${callId}` });
    if (completedDelegationResponsesRef.current.delete(delegationId)) {
      delegationGenerationsRef.current.delete(delegationId);
      if (delegationGenerationsRef.current.size === 0) updateBackendLoading(false);
      setStatus('listening');
    }
  }, [executeTool, updateBackendLoading]);

  const handleMessage = useCallback((raw: string) => {
    let event: LiveEvent;
    try {
      event = JSON.parse(raw) as LiveEvent;
    } catch {
      callbacksRef.current.onError('Asha received an unreadable live-session event.');
      return;
    }

    if (event.type === 'session.started') {
      sessionIdRef.current = event.session?.id ?? sessionIdRef.current;
      sessionStartedRef.current = true;
      const peer = peerRef.current;
      if (peer) finishSessionStartup(peer);
      return;
    }

    if (event.type === 'session.instructions.appended') {
      const pending = pendingLanguageUpdateRef.current;
      if (pending && event.client_event_id === pending.eventId) {
        setActiveResponseLanguage(pending.language);
        pendingLanguageUpdateRef.current = null;
        setLanguageUpdatePending(false);
        setStatus('listening');
      }
      return;
    }

    if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
      if (!event.delta) return;
      const speaker = event.type === 'session.input_transcript.delta' ? 'you' : 'asha';
      const eventId = event.event_id ?? `${speaker}-${event.start_ms ?? 0}-${event.end_ms ?? 0}-${event.delta}`;
      if (transcriptEventIdsRef.current.has(eventId)) return;
      rememberBoundedId(transcriptEventIdsRef.current, eventId, 1_000);
      if (speaker === 'asha' && suppressStaleOutputRef.current) return;
      callbacksRef.current.onTranscript?.({
        endMs: event.end_ms,
        eventId,
        speaker,
        startMs: event.start_ms,
        text: event.delta,
      });
      if (speaker === 'you') {
        if (suppressStaleOutputRef.current) {
          suppressStaleOutputRef.current = false;
          peerRef.current?.setPlaybackEnabled?.(true);
        }
        if (delegationGenerationsRef.current.size > 0 || toolAbortControllersRef.current.size > 0) {
          cancelObsoleteBackendWork();
        }
        setStatus('listening');
      } else {
        peerRef.current?.setPlaybackEnabled?.(true);
        setStatus('speaking');
        if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
        speakingTimerRef.current = setTimeout(() => setStatus('listening'), 1_400);
      }
      return;
    }

    if (event.type === 'session.delegation.created' && event.delegation?.id) {
      const generation = taskGateRef.current.begin();
      delegationGenerationsRef.current.set(event.delegation.id, generation);
      updateBackendLoading(true);
      setStatus('thinking');
      return;
    }

    if (event.type === 'response.event' && event.delegation_id) {
      const nested = event.event;
      if (nested?.type === 'response.output_item.done' && nested.item?.type === 'function_call') {
        void runDelegatedTool(event.delegation_id, nested.item);
      }
      if (nested?.type === 'response.completed' || nested?.type === 'response.failed') {
        if (delegationToolCallsRef.current.get(event.delegation_id)?.size) {
          completedDelegationResponsesRef.current.add(event.delegation_id);
        } else {
          delegationGenerationsRef.current.delete(event.delegation_id);
          if (delegationGenerationsRef.current.size === 0) updateBackendLoading(false);
          setStatus('listening');
        }
      }
      return;
    }

    if (event.type === 'session.input_audio.muted') {
      setMuted(true);
      peerRef.current?.setMicrophoneEnabled(false);
      return;
    }
    if (event.type === 'session.input_audio.unmuted') {
      setMuted(false);
      peerRef.current?.setMicrophoneEnabled(true);
      return;
    }
    if (event.type === 'session.closed') {
      releaseResources();
      return;
    }
    if (event.type === 'error') {
      const pending = pendingLanguageUpdateRef.current;
      if (pending && event.client_event_id === pending.eventId) {
        pendingLanguageUpdateRef.current = null;
        setLanguageUpdatePending(false);
        setStatus('listening');
        callbacksRef.current.onError('Asha could not switch languages. End this chat and start a new conversation to use the selected language.');
        return;
      }
      callbacksRef.current.onError(event.error?.message || 'Asha’s live session encountered an error.');
    }
  }, [cancelObsoleteBackendWork, finishSessionStartup, releaseResources, runDelegatedTool, updateBackendLoading]);

  const connect = useCallback(async (recovery = false) => {
    if (peerRef.current || (!recovery && status !== 'disconnected')) return;
    const lifecycle = ++lifecycleRef.current;
    const controller = new AbortController();
    connectAbortRef.current = controller;
    sessionStartedRef.current = false;
    greetingSentRef.current = false;
    pendingLanguageUpdateRef.current = null;
    setLanguageUpdatePending(false);
    setActiveResponseLanguage(responseLanguageRef.current);
    completedCallIdsRef.current.clear();
    transcriptEventIdsRef.current.clear();
    setStatus(recovery ? 'reconnecting' : 'connecting');
    try {
      if (Platform.OS === 'ios' && !Device.isDevice) {
        throw new Error('Live voice needs a physical iPhone for microphone, speaker, Bluetooth, and interruption testing.');
      }
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Microphone access is off. Enable Bolo in iOS Settings > Privacy & Security > Microphone, or continue with text chat.');
      }
      await setVoiceAudioMode('realtime');
      const peer = await createRealtimePeerSession({
        signal: controller.signal,
        exchangeSdp: async (sdp, signal) => {
          const result = await createAshaLiveSession({ clientId, context, mode, responseLanguage: responseLanguageRef.current, sdp }, signal);
          sessionIdRef.current = result.session.id;
          return result.transport.sdp;
        },
        onPlaybackChange: (playing) => {
          if (lifecycleRef.current !== lifecycle) return;
          setStatus(playing ? 'speaking' : 'listening');
        },
        onMessage: handleMessage,
        onClose: () => {
          if (lifecycleRef.current !== lifecycle) return;
          peerRef.current = null;
          cancelObsoleteBackendWork();
          if (appStateRef.current === 'active' && reconnectAttemptRef.current < 1) {
            reconnectAttemptRef.current += 1;
            setStatus('reconnecting');
            reconnectTimerRef.current = setTimeout(() => {
              reconnectTimerRef.current = null;
              void connectRef.current?.(true).catch(() => {
                releaseResources();
                callbacksRef.current.onError('Asha could not reconnect. Completed learner work was kept; start a new conversation to continue.');
              });
            }, 750);
            return;
          }
          releaseResources();
          callbacksRef.current.onError('Asha disconnected. Completed learner work was kept; start a new conversation to reconnect.');
        },
      });
      if (lifecycleRef.current !== lifecycle || controller.signal.aborted) {
        peer.close();
        return;
      }
      peerRef.current = peer;
      finishSessionStartup(peer);
      await setVoiceAudioMode('realtime');
      reconnectAttemptRef.current = 0;
    } catch (cause) {
      const wasCancelled = controller.signal.aborted;
      if (lifecycleRef.current === lifecycle) releaseResources();
      if (!wasCancelled) throw cause;
    } finally {
      if (connectAbortRef.current === controller) connectAbortRef.current = null;
    }
  }, [cancelObsoleteBackendWork, clientId, context, finishSessionStartup, handleMessage, mode, releaseResources, status]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    responseLanguageRef.current = responseLanguage;
    if (previousResponseLanguageRef.current === responseLanguage) return;
    previousResponseLanguageRef.current = responseLanguage;
    const peer = peerRef.current;
    if (!peer || !sessionStartedRef.current) {
      setActiveResponseLanguage(responseLanguage);
      pendingLanguageUpdateRef.current = null;
      setLanguageUpdatePending(false);
      return;
    }
    const discardingInFlightReply = status === 'speaking' || status === 'thinking'
      || delegationGenerationsRef.current.size > 0 || toolAbortControllersRef.current.size > 0;
    cancelObsoleteBackendWork();
    if (discardingInFlightReply) {
      suppressStaleOutputRef.current = true;
      peer.setPlaybackEnabled?.(false);
    }
    const eventId = `bolo_language_${responseLanguage}_${Date.now()}`;
    pendingLanguageUpdateRef.current = { eventId, language: responseLanguage };
    setLanguageUpdatePending(true);
    peer.send({
      type: 'session.instructions.append',
      event_id: eventId,
      delegation_id: null,
      content: `The learner explicitly switched spoken modes. Discard any unfinished reply from the previous mode. This policy applies to the next reply and every later reply until explicitly changed. ${buildAshaSpokenLanguageInstructions(responseLanguage)}`,
    });
    setStatus('thinking');
  }, [cancelObsoleteBackendWork, responseLanguage, status]);

  const toggleMute = useCallback(() => {
    const peer = peerRef.current;
    if (!peer) return;
    const nextMuted = !muted;
    peer.setMicrophoneEnabled(!nextMuted);
    peer.send({
      type: nextMuted ? 'session.input_audio.mute' : 'session.input_audio.unmute',
      event_id: `bolo_${nextMuted ? 'mute' : 'unmute'}_${Date.now()}`,
    });
    setMuted(nextMuted);
  }, [muted]);

  const interrupt = useCallback(() => {
    const peer = peerRef.current;
    if (!peer) return;
    cancelObsoleteBackendWork();
    suppressStaleOutputRef.current = true;
    peer.setPlaybackEnabled?.(false);
    peer.send({
      type: 'session.instructions.append',
      event_id: `bolo_interrupt_${Date.now()}`,
      delegation_id: null,
      content: 'Stop speaking immediately. Listen to the learner now and treat their newest request as authoritative.',
    });
    if (muted) {
      peer.setMicrophoneEnabled(true);
      peer.send({ type: 'session.input_audio.unmute', event_id: `bolo_interrupt_unmute_${Date.now()}` });
      setMuted(false);
    }
    setStatus('listening');
  }, [cancelObsoleteBackendWork, muted]);

  const sendGuidance = useCallback((content: string) => {
    peerRef.current?.send({
      type: 'session.instructions.append',
      event_id: `bolo_guidance_${Date.now()}`,
      delegation_id: null,
      content,
    });
  }, []);

  const createRecap = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !executeTool) return null;
    const callId = `recap_${Date.now()}`;
    const controller = new AbortController();
    toolAbortControllersRef.current.set(callId, controller);
    try {
      return await executeTool({
        arguments: { sessionId },
        callId,
        name: 'create_session_recap',
        sessionId,
        signal: controller.signal,
      });
    } catch {
      return null;
    } finally {
      toolAbortControllersRef.current.delete(callId);
    }
  }, [executeTool]);

  const disconnect = useCallback(async () => {
    lifecycleRef.current += 1;
    connectAbortRef.current?.abort();
    cancelObsoleteBackendWork();
    const peer = peerRef.current;
    if (!peer) {
      releaseResources();
      return;
    }
    peer.setMicrophoneEnabled(false);
    try {
      if (peer.closeGracefully) await peer.closeGracefully();
      else peer.close();
    } finally {
      releaseResources();
    }
  }, [cancelObsoleteBackendWork, releaseResources]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active' || !peerRef.current) return;
      void disconnect();
    });
    return () => subscription.remove();
  }, [disconnect]);

  useEffect(() => () => {
    lifecycleRef.current += 1;
    try {
      peerRef.current?.setMicrophoneEnabled(false);
      peerRef.current?.send({ type: 'session.close' });
    } catch {
      // The transport may already be gone during native teardown.
    }
    releaseResources();
  }, [releaseResources]);

  return {
    activeResponseLanguage,
    backendLoading,
    connect,
    createRecap,
    disconnect,
    interrupt,
    languageUpdatePending,
    muted,
    sendGuidance,
    status,
    toggleMute,
  };
}
