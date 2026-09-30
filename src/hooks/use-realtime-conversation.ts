import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as Device from 'expo-device';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { createLiveTranscriptStore, type LiveTranscriptRow } from '@/lib/live-transcripts';
import { createRealtimePeerSession } from '@/lib/realtime-peer';
import type { RealtimePeerSession } from '@/lib/realtime-peer.types';
import { stopSpeaking } from '@/lib/speech';
import { resetVoiceAudioMode, setVoiceAudioMode } from '@/lib/voice';
import { createLiveCall } from '@/services/bolo-api';
import type { AshaResponseLanguage } from '@/state/app-state-types';

export type { LiveTranscriptRow } from '@/lib/live-transcripts';
export type RealtimeVoiceStatus = 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding';
export type RealtimeTranscriptUpdate = { speaker: 'you' | 'asha'; text: string };
export type RealtimeInputTranscript = { itemId: string; transcript: string };
type Options = {
  clientId: string;
  enabled?: boolean;
  responseLanguage?: AshaResponseLanguage;
  history?: { role: 'you' | 'asha'; text: string }[];
  onError: (message: string) => void;
  onTranscriptChange?: (update: RealtimeTranscriptUpdate) => void;
  onTranscriptSnapshot?: (rows: LiveTranscriptRow[]) => void;
  // Kept for existing callers; Live has no authoritative completed-turn event.
  onInputTranscriptComplete?: (result: RealtimeInputTranscript) => void;
  onTurnComplete?: (turn: { transcript: string; reply: string; language: 'en' | 'hi' }) => void;
};
type LiveEvent = {
  type?: string;
  event_id?: string;
  client_event_id?: string;
  delta?: string;
  start_ms?: number;
  end_ms?: number;
  error?: { message?: string; client_event_id?: string };
};
type PendingCommand = {
  id: string;
  enabled: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
const START_TIMEOUT_MS = 15_000;
const COMMAND_TIMEOUT_MS = 10_000;

export function useRealtimeConversation({ clientId, enabled = true, responseLanguage = 'en', ...options }: Options) {
  const [status, setStatus] = useState<RealtimeVoiceStatus>('disconnected');
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const callbacksRef = useRef(options);
  useEffect(() => { callbacksRef.current = options; });
  const peerRef = useRef<RealtimePeerSession | null>(null);
  const statusRef = useRef<RealtimeVoiceStatus>('disconnected');
  const microphoneRef = useRef(false);
  const playingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const lifecycleRef = useRef(0);
  const commandIdRef = useRef(0);
  const connectRef = useRef<Promise<void> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const pendingCommandRef = useRef<PendingCommand | null>(null);
  const startRef = useRef<Promise<void> | null>(null);
  const transcriptsRef = useRef(createLiveTranscriptStore('live'));

  const updateStatus = useCallback((next?: RealtimeVoiceStatus) => {
    const value = next ?? (microphoneRef.current ? 'recording' : playingRef.current ? 'responding' : 'ready');
    statusRef.current = value;
    setStatus(value);
  }, []);

  const disconnect = useCallback(() => {
    lifecycleRef.current += 1;
    const pending = pendingCommandRef.current;
    pendingCommandRef.current = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('The live voice session ended.'));
    }
    // Request server finalization before AbortSignal releases the transport.
    // Background/unmount still release microphone and playback immediately.
    try { peerRef.current?.send({ type: 'session.close' }); } catch { /* Already closed. */ }
    controllerRef.current?.abort();
    controllerRef.current = null;
    connectRef.current = null;
    startRef.current = null;
    const peer = peerRef.current;
    peerRef.current = null;
    peer?.setMicrophoneEnabled(false);
    // The app releases audio immediately on background/unmount. No backend tool
    // work is launched by this client, and transport closure is not a turn end.
    peer?.close();
    microphoneRef.current = false;
    playingRef.current = false;
    setMicrophoneEnabled(false);
    setIsPlaying(false);
    updateStatus('disconnected');
    void resetVoiceAudioMode().catch(() => undefined);
  }, [updateStatus]);

  const handleEvent = useCallback((raw: string) => {
    let event: LiveEvent;
    try { event = JSON.parse(raw) as LiveEvent; }
    catch { callbacksRef.current.onError('The live voice service returned an unreadable event.'); return; }
    if (!event || typeof event !== 'object') return;
    if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
      if (typeof event.delta !== 'string' || typeof event.start_ms !== 'number' || typeof event.end_ms !== 'number') return;
      const update = transcriptsRef.current.append(event.type === 'session.input_transcript.delta' ? 'you' : 'asha', {
        delta: event.delta, start_ms: event.start_ms, end_ms: event.end_ms, event_id: event.event_id,
      });
      if (!update) return;
      callbacksRef.current.onTranscriptChange?.({ speaker: update.row.speaker, text: update.row.text });
      callbacksRef.current.onTranscriptSnapshot?.(update.rows);
      return;
    }
    const pending = pendingCommandRef.current;
    if (pending && event.client_event_id === pending.id
      && event.type === (pending.enabled ? 'session.input_audio.unmuted' : 'session.input_audio.muted')) {
      clearTimeout(pending.timer);
      pendingCommandRef.current = null;
      peerRef.current?.setMicrophoneEnabled(pending.enabled);
      microphoneRef.current = pending.enabled;
      setMicrophoneEnabled(pending.enabled);
      updateStatus();
      pending.resolve();
    } else if (event.type === 'error') {
      const message = event.error?.message || 'The live voice service reported an error.';
      if (pending && (event.error?.client_event_id ?? event.client_event_id) === pending.id) {
        clearTimeout(pending.timer);
        pendingCommandRef.current = null;
        pending.reject(new Error(message));
      } else callbacksRef.current.onError(message);
    } else if (event.type === 'session.closed') {
      disconnect();
    }
  }, [disconnect, updateStatus]);

  const connect = useCallback((): Promise<void> => {
    if (connectRef.current) return connectRef.current;
    if (peerRef.current) return Promise.resolve();
    const lifecycle = lifecycleRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    const current = () => lifecycleRef.current === lifecycle && !controller.signal.aborted;
    let attemptPeer: RealtimePeerSession | null = null;
    let started = false;
    let startupError: Error | null = null;
    let wakeStartup: (() => void) | undefined;
    let failStartup: ((error: Error) => void) | undefined;
    const queued: string[] = [];
    let live = false;
    updateStatus('connecting');
    transcriptsRef.current = createLiveTranscriptStore(`live-${Date.now()}-${lifecycle}`);
    const promise = (async () => {
      if (Platform.OS === 'ios' && !Device.isDevice) {
        throw new Error('Live voice requires a physical iPhone because iOS Simulator cannot safely initialize microphone audio.');
      }
      if (Platform.OS !== 'web') {
        const permission = await requestRecordingPermissionsAsync();
        if (!current()) return;
        if (!permission.granted) throw new Error('Microphone access is required for live voice practice.');
      }
      await stopSpeaking();
      if (!current()) return;
      await setVoiceAudioMode('realtime');
      if (!current()) return;
      attemptPeer = await createRealtimePeerSession({
        exchangeSdp: async (offerSdp, signal) => {
          const call = await createLiveCall({ clientId, offerSdp, responseLanguage, history: callbacksRef.current.history }, signal);
          return call.answerSdp;
        },
        signal: controller.signal,
        onMessage: (raw) => {
          if (!current()) return;
          if (live) { handleEvent(raw); return; }
          try {
            const event = JSON.parse(raw) as LiveEvent;
            if (event?.type === 'session.started') { started = true; wakeStartup?.(); }
            else if (event?.type === 'error' || event?.type === 'session.closed') {
              startupError = new Error(event.error?.message || 'The live voice session closed before it was ready.');
              failStartup?.(startupError);
            } else queued.push(raw);
          } catch { queued.push(raw); }
        },
        onPlaybackChange: (playing) => {
          if (!current()) return;
          playingRef.current = playing;
          setIsPlaying(playing);
          if (live) updateStatus();
        },
        onError: (message) => { if (current()) callbacksRef.current.onError(message); },
        onClose: () => {
          if (!current()) return;
          startupError = new Error('The live voice connection closed. Start a new session to continue.');
          failStartup?.(startupError);
          if (live) { disconnect(); callbacksRef.current.onError(startupError.message); }
        },
      });
      if (!current()) { attemptPeer.close(); return; }
      peerRef.current = attemptPeer;
      // Reapply routing after native WebRTC initializes its audio session.
      await setVoiceAudioMode('realtime');
      if (!current()) return;
      if (startupError) throw startupError;
      if (!started) await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timer);
          controller.signal.removeEventListener('abort', abort);
          wakeStartup = undefined;
          failStartup = undefined;
          if (error) reject(error); else resolve();
        };
        const abort = () => finish(new Error('The live voice connection was canceled.'));
        const timer = setTimeout(() => finish(new Error('The live voice session took too long to start.')), START_TIMEOUT_MS);
        wakeStartup = () => finish();
        failStartup = finish;
        controller.signal.addEventListener('abort', abort, { once: true });
        if (!current()) abort();
      });
      if (!current()) return;
      live = true;
      updateStatus();
      queued.splice(0).forEach(handleEvent);
    })();
    const tracked = promise.catch((cause: unknown) => {
      attemptPeer?.close();
      if (!current()) return;
      disconnect();
      throw cause;
    }).finally(() => {
      if (connectRef.current === tracked) connectRef.current = null;
    });
    connectRef.current = tracked;
    return tracked;
  }, [clientId, disconnect, handleEvent, responseLanguage, updateStatus]);

  const setInputEnabled = useCallback((enabled: boolean): Promise<void> => {
    const peer = peerRef.current;
    if (!peer) return Promise.resolve();
    const previous = pendingCommandRef.current;
    if (previous) {
      clearTimeout(previous.timer);
      pendingCommandRef.current = null;
      previous.reject(new Error('The microphone command was superseded.'));
    }
    // Disable capture immediately, including while the server confirms a mute.
    // Enable only after Live accepts the matching unmute command.
    if (!enabled) {
      peer.setMicrophoneEnabled(false);
      microphoneRef.current = false;
      setMicrophoneEnabled(false);
      updateStatus();
    }
    return new Promise<void>((resolve, reject) => {
      const id = `bolo-mic-${lifecycleRef.current}-${++commandIdRef.current}`;
      const timer = setTimeout(() => {
        if (pendingCommandRef.current?.id !== id) return;
        pendingCommandRef.current = null;
        disconnect();
        reject(new Error('The live voice service did not confirm the microphone change. Reconnect to continue.'));
      }, COMMAND_TIMEOUT_MS);
      pendingCommandRef.current = { id, enabled, resolve, reject, timer };
      try { peer.send({ type: enabled ? 'session.input_audio.unmute' : 'session.input_audio.mute', event_id: id }); }
      catch (error) {
        clearTimeout(timer);
        pendingCommandRef.current = null;
        disconnect();
        reject(error);
      }
    });
  }, [disconnect, updateStatus]);

  const startTurn = useCallback((): Promise<void> => {
    if (startRef.current) return startRef.current;
    if (microphoneRef.current) return Promise.resolve();
    const lifecycle = lifecycleRef.current;
    const promise = (async () => {
      await connect();
      if (lifecycleRef.current !== lifecycle || !peerRef.current) return;
      if (appStateRef.current !== 'active') { disconnect(); return; }
      await setInputEnabled(true);
    })();
    const tracked = promise.finally(() => { if (startRef.current === tracked) startRef.current = null; });
    startRef.current = tracked;
    return tracked;
  }, [connect, disconnect, setInputEnabled]);

  const finishTurn = useCallback(() => setInputEnabled(false), [setInputEnabled]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      // Permission dialogs can transiently make iOS inactive during connection.
      if (next === 'active' || (next === 'inactive' && statusRef.current === 'connecting')) return;
      disconnect();
    });
    return () => subscription.remove();
  }, [disconnect]);
  // Startup-only language and identity fields require a fresh Live session.
  useEffect(() => () => disconnect(), [clientId, responseLanguage, disconnect]);
  // Withdrawn consent must end a session that is still mounted.
  useEffect(() => enabled ? () => disconnect() : undefined, [enabled, disconnect]);

  return { connect, disconnect, finishTurn, startTurn, status, microphoneEnabled, isPlaying };
}
