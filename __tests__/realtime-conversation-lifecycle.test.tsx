import { act, renderHook } from '@testing-library/react-native';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { AppState } from 'react-native';
import { useRealtimeConversation } from '../src/hooks/use-realtime-conversation';
import { createRealtimePeerSession } from '../src/lib/realtime-peer';
import type { RealtimePeerOptions, RealtimePeerSession } from '../src/lib/realtime-peer.types';
import { speakText, stopSpeaking } from '../src/lib/speech';
import { activateVoiceChatSession, releaseAudioSessionBeforeCall, restoreDefaultAudioSessionMode } from '../src/lib/voice-session';
import { createLiveCall } from '../src/services/bolo-api';

let mockIsDevice = true;
jest.mock('expo-audio', () => ({ requestRecordingPermissionsAsync: jest.fn(), setAudioModeAsync: jest.fn() }));
jest.mock('@/lib/voice-session', () => ({ activateVoiceChatSession: jest.fn(), releaseAudioSessionBeforeCall: jest.fn(), restoreDefaultAudioSessionMode: jest.fn() }));
jest.mock('expo-device',() => ({ get isDevice() { return mockIsDevice; } }));
jest.mock('@/lib/realtime-peer', () => ({ createRealtimePeerSession: jest.fn() }));
jest.mock('@/lib/speech', () => ({ speakText: jest.fn(), stopSpeaking: jest.fn(async () => undefined) }));
jest.mock('@/services/bolo-api', () => ({ createLiveCall: jest.fn() }));
const createPeerMock = jest.mocked(createRealtimePeerSession);
let peer: RealtimePeerSession;
let peerOptions: RealtimePeerOptions;
let autoStart = true;
const emit = (event: Record<string, unknown>) => peerOptions.onMessage(JSON.stringify(event));
async function flush() { for (let i = 0; i < 60; i++) await Promise.resolve(); }
function mount(options: Partial<Parameters<typeof useRealtimeConversation>[0]> = {}) {
  return renderHook(() => useRealtimeConversation({ clientId: 'client-12345678', onError: jest.fn(), onTurnComplete: jest.fn(), ...options }));
}
function acknowledge(enabled: boolean) {
  const events = jest.mocked(peer.send).mock.calls.map(([event]) => event);
  const command = events.filter((event) => event.type === (enabled ? 'session.input_audio.unmute' : 'session.input_audio.mute')).at(-1)!;
  emit({ type: enabled ? 'session.input_audio.unmuted' : 'session.input_audio.muted', client_event_id: command.event_id });
}
beforeEach(() => {
  jest.clearAllMocks();
  autoStart = true;
  mockIsDevice = true;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.mocked(requestRecordingPermissionsAsync).mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
  jest.mocked(setAudioModeAsync).mockResolvedValue(undefined);
  jest.mocked(stopSpeaking).mockResolvedValue(undefined);
  jest.mocked(activateVoiceChatSession).mockResolvedValue('PlayAndRecord/VoiceChat active in:iPhone Microphone');
  jest.mocked(restoreDefaultAudioSessionMode).mockResolvedValue(undefined);
  jest.mocked(releaseAudioSessionBeforeCall).mockResolvedValue('ok');
  jest.mocked(createLiveCall).mockResolvedValue({ answerSdp: 'live-answer', sessionId: 'live-session' });
  peer = { close: jest.fn(), send: jest.fn(), setMicrophoneEnabled: jest.fn() };
  createPeerMock.mockImplementation(async (options) => {
    peerOptions = options;
    if (autoStart) emit({ type: 'session.started', session: { id: 'session-one' } });
    return peer;
  });
});
afterEach(() => jest.useRealTimers());

describe('GPT-Live conversation lifecycle', () => {
  it('rejects Simulator before requesting microphone access', async () => {
    mockIsDevice = false;
    const { result, unmount } = await mount();
    await act(async () => { await expect(result.current.startTurn()).rejects.toThrow('physical iPhone'); });
    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    expect(createPeerMock).not.toHaveBeenCalled();
    await unmount();
  });

  it('accepts session.started arriving before peer creation resolves and keeps the microphone disabled', async () => {
    const { result, unmount } = await mount({ responseLanguage: 'hi', history: [{ role: 'you', text: 'Hello' }] });
    await act(async () => { await result.current.connect(); });
    expect(result.current.status).toBe('ready');
    expect(result.current.microphoneEnabled).toBe(false);
    expect(peer.send).not.toHaveBeenCalled();
    expect(await peerOptions.exchangeSdp('offer', new AbortController().signal)).toBe('live-answer');
    expect(createLiveCall).toHaveBeenCalledWith({ clientId: 'client-12345678', offerSdp: 'offer', responseLanguage: 'hi', history: [{ role: 'you', text: 'Hello' }] }, expect.anything());
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('awaits the fresh-chat boundary before permissions, peer creation, and any queued captions', async () => {
    let finishReset!: () => void;
    const onConnectionStart = jest.fn(() => new Promise<void>((resolve) => { finishReset = resolve; }));
    const onTranscriptSnapshot = jest.fn();
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      emit({ type: 'session.output_transcript.delta', delta: 'New greeting', start_ms: 0, end_ms: 100 });
      emit({ type: 'session.started' });
      return peer;
    });
    const { result, unmount } = await mount({ onConnectionStart, onTranscriptSnapshot });
    let connection!: Promise<void>;
    await act(async () => { connection = result.current.connect(); await flush(); });
    expect(onConnectionStart).toHaveBeenCalledTimes(1);
    expect(onConnectionStart).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    expect(createPeerMock).not.toHaveBeenCalled();
    expect(onTranscriptSnapshot).not.toHaveBeenCalled();
    await act(async () => { finishReset(); await connection; });
    expect(result.current.status).toBe('ready');
    expect(onTranscriptSnapshot.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ text: 'New greeting', speaker: 'asha' }),
    ]);
    await unmount();
  });

  it('stops startup when the previous chat cannot be cleared', async () => {
    const onConnectionStart = jest.fn(async () => { throw new Error('Could not clear chat'); });
    const { result, unmount } = await mount({ onConnectionStart });
    await act(async () => { await expect(result.current.connect()).rejects.toThrow('Could not clear chat'); });
    expect(result.current.status).toBe('disconnected');
    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    expect(createPeerMock).not.toHaveBeenCalled();
    await unmount();
  });

  it('cancels a pending chat reset without letting a late completion start audio', async () => {
    let finishReset!: () => void;
    const onConnectionStart = jest.fn((_signal: AbortSignal) => new Promise<void>((resolve) => { finishReset = resolve; }));
    const { result, unmount } = await mount({ onConnectionStart });
    let connection!: Promise<void>;
    await act(async () => { connection = result.current.connect(); await flush(); });
    await act(async () => { result.current.disconnect(); finishReset(); await connection; });
    expect(onConnectionStart.mock.calls[0]?.[0].aborted).toBe(true);
    expect(result.current.status).toBe('disconnected');
    expect(requestRecordingPermissionsAsync).not.toHaveBeenCalled();
    expect(createPeerMock).not.toHaveBeenCalled();
    await unmount();
  });

  it('resets once per new conversation, not mute/unmute, and ignores prior-session callbacks', async () => {
    const onConnectionStart = jest.fn(async () => undefined);
    const onTranscriptSnapshot = jest.fn();
    const { result, unmount } = await mount({ onConnectionStart, onTranscriptSnapshot });
    await act(async () => { await result.current.connect(); });
    const oldPeerOptions = peerOptions;
    let start!: Promise<void>;
    await act(async () => { start = result.current.startTurn(); await flush(); acknowledge(true); await start; });
    let finish!: Promise<void>;
    await act(async () => { finish = result.current.finishTurn(); acknowledge(false); await finish; });
    await act(async () => { start = result.current.startTurn(); await flush(); acknowledge(true); await start; });
    expect(onConnectionStart).toHaveBeenCalledTimes(1);
    await act(async () => {
      result.current.disconnect();
      await result.current.connect();
    });
    expect(onConnectionStart).toHaveBeenCalledTimes(2);
    await act(async () => {
      oldPeerOptions.onMessage(JSON.stringify({ type: 'session.output_transcript.delta', delta: 'Old late reply', start_ms: 0, end_ms: 100 }));
      oldPeerOptions.onPlaybackChange?.(true);
      emit({ type: 'session.output_transcript.delta', delta: 'Fresh reply', start_ms: 0, end_ms: 100 });
    });
    expect(result.current.isPlaying).toBe(false);
    expect(onTranscriptSnapshot).toHaveBeenCalledTimes(1);
    expect(onTranscriptSnapshot.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ text: 'Fresh reply' })]);
    await unmount();
  });

  it('waits for Live startup rather than accepting Realtime session events', async () => {
    autoStart = false;
    const { result, unmount } = await mount();
    let connection!: Promise<void>;
    await act(async () => { connection = result.current.connect(); await flush(); });
    await act(async () => { emit({ type: 'session.created' }); emit({ type: 'session.updated' }); });
    expect(result.current.status).toBe('connecting');
    await act(async () => { emit({ type: 'session.started' }); await connection; });
    expect(result.current.status).toBe('ready');
    await unmount();
  });

  it('coalesces concurrent start calls and enables capture only for the matching unmute acknowledgment', async () => {
    const { result, unmount } = await mount();
    let starts!: Promise<void>[];
    await act(async () => { starts = [result.current.startTurn(), result.current.startTurn()]; await flush(); });
    expect(createPeerMock).toHaveBeenCalledTimes(1);
    expect(peer.send).toHaveBeenCalledTimes(1);
    expect(peer.setMicrophoneEnabled).not.toHaveBeenCalledWith(true);
    await act(async () => { emit({ type: 'session.input_audio.unmuted', client_event_id: 'wrong-id' }); });
    expect(result.current.microphoneEnabled).toBe(false);
    await act(async () => { acknowledge(true); await Promise.all(starts); });
    expect(peer.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(result.current.status).toBe('recording');
    await unmount();
  });

  it('streams continuously while speaking and mutes without commit or response.create', async () => {
    const { result, unmount } = await mount();
    let start!: Promise<void>;
    await act(async () => { start = result.current.startTurn(); await flush(); acknowledge(true); await start; });
    await act(async () => { peerOptions.onPlaybackChange?.(true); });
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.microphoneEnabled).toBe(true);
    expect(result.current.status).toBe('recording');
    let finish!: Promise<void>;
    await act(async () => { finish = result.current.finishTurn(); });
    expect(peer.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    expect(result.current.status).toBe('responding');
    await act(async () => { acknowledge(false); await finish; peerOptions.onPlaybackChange?.(false); });
    expect(result.current.status).toBe('ready');
    const sent = jest.mocked(peer.send).mock.calls.map(([event]) => event.type);
    expect(sent).toEqual(['session.input_audio.unmute', 'session.input_audio.mute']);
    expect(speakText).not.toHaveBeenCalled();
    await unmount();
  });

  it('keeps exact overlapping transcript fragments revisable and independent of audio or turn completion', async () => {
    const onTranscriptSnapshot = jest.fn();
    const onTurnComplete = jest.fn();
    const onInputTranscriptComplete = jest.fn();
    const { result, unmount } = await mount({ onTranscriptSnapshot, onTurnComplete, onInputTranscriptComplete });
    await act(async () => { await result.current.connect(); });
    await act(async () => {
      emit({ type: 'session.input_transcript.delta', event_id: 'u2', delta: 'Hello', start_ms: 300, end_ms: 500 });
      emit({ type: 'session.output_transcript.delta', event_id: 'a1', delta: 'Hello!', start_ms: 250, end_ms: 600 });
      emit({ type: 'session.input_transcript.delta', event_id: 'u1', delta: ' world', start_ms: 100, end_ms: 300 });
      emit({ type: 'session.input_transcript.delta', event_id: 'u1', delta: ' world', start_ms: 100, end_ms: 300 });
      emit({ type: 'response.done', response: { status: 'completed' } });
    });
    const snapshot = onTranscriptSnapshot.mock.calls.at(-1)![0];
    expect(snapshot.map((row: { text: string }) => row.text)).toEqual(['Hello world', 'Hello!']);
    expect(snapshot[0].fragments).toHaveLength(2);
    expect(onTranscriptSnapshot).toHaveBeenCalledTimes(3);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.status).toBe('ready');
    expect(speakText).not.toHaveBeenCalled();
    expect(onTurnComplete).not.toHaveBeenCalled();
    expect(onInputTranscriptComplete).not.toHaveBeenCalled();
    await unmount();
  });

  it('rejects a correlated microphone error without enabling capture', async () => {
    const { result, unmount } = await mount();
    let failure!: Promise<unknown>;
    await act(async () => { failure = result.current.startTurn().catch((error) => error); await flush(); });
    const event = jest.mocked(peer.send).mock.calls[0]![0];
    await act(async () => { emit({ type: 'error', error: { client_event_id: event.event_id, message: 'Mic unavailable' } }); });
    expect(await failure).toEqual(expect.objectContaining({ message: 'Mic unavailable' }));
    expect(result.current.microphoneEnabled).toBe(false);
    await unmount();
  });

  it('cancels pending startup and closes a late peer without resurrecting the session', async () => {
    let resolvePeer!: (peer: RealtimePeerSession) => void;
    createPeerMock.mockImplementation((options) => {
      peerOptions = options;
      return new Promise((resolve) => { resolvePeer = resolve; });
    });
    const { result, unmount } = await mount();
    let connection!: Promise<void>;
    await act(async () => { connection = result.current.connect(); await flush(); });
    await act(async () => { result.current.disconnect(); resolvePeer(peer); await connection; emit({ type: 'session.started' }); });
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('disconnected');
    expect(peer.setMicrophoneEnabled).not.toHaveBeenCalledWith(true);
    await unmount();
  });

  it('does not reset the audio route when the app backgrounds with no live session', async () => {
    let change!: (state: 'background') => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, handler) => { change = handler; return { remove: jest.fn() }; });
    const { unmount } = await mount();
    await act(async () => { change('background'); });
    expect(setAudioModeAsync).not.toHaveBeenCalled();
    await unmount();
  });

  it('activates the voiceChat session during connect and again just before the unmute command', async () => {
    const { result, unmount } = await mount();
    let start!: Promise<void>;
    await act(async () => { start = result.current.startTurn(); await flush(); });
    expect(activateVoiceChatSession).toHaveBeenCalledTimes(3);
    const lastActivation = Math.max(...jest.mocked(activateVoiceChatSession).mock.invocationCallOrder);
    expect(lastActivation).toBeLessThan(jest.mocked(peer.send).mock.invocationCallOrder[0]!);
    await act(async () => { acknowledge(true); await start; });
    expect(setAudioModeAsync).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('starts listening on call start without a typed message first by releasing the session before setup', async () => {
    const { result, unmount } = await mount();
    let start!: Promise<void>;
    await act(async () => { start = result.current.startTurn(); await flush(); });
    // Same state a typed reply leaves behind: session off, then configured and activated for the call.
    expect(speakText).not.toHaveBeenCalled();
    expect(releaseAudioSessionBeforeCall).toHaveBeenCalledTimes(1);
    const release = jest.mocked(releaseAudioSessionBeforeCall).mock.invocationCallOrder[0]!;
    expect(release).toBeLessThan(jest.mocked(setAudioModeAsync).mock.invocationCallOrder[0]!);
    expect(release).toBeLessThan(Math.min(...jest.mocked(activateVoiceChatSession).mock.invocationCallOrder));
    expect(release).toBeLessThan(createPeerMock.mock.invocationCallOrder[0]!);
    await act(async () => { acknowledge(true); await start; });
    expect(result.current.microphoneEnabled).toBe(true);
    expect(peer.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    // Never under the running peer: later activations must not turn the session off again.
    expect(releaseAudioSessionBeforeCall).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('activates the session again when the scene becomes active during a call', async () => {
    let change!: (state: 'active') => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, handler) => { change = handler; return { remove: jest.fn() }; });
    const { result, unmount } = await mount();
    await act(async () => { await result.current.connect(); });
    const before = jest.mocked(activateVoiceChatSession).mock.calls.length;
    await act(async () => { change('active'); await flush(); });
    expect(activateVoiceChatSession).toHaveBeenCalledTimes(before + 1);
    expect(result.current.status).toBe('ready');
    await unmount();
  });

  it('does not touch the session when the scene becomes active with no call', async () => {
    let change!: (state: 'active') => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, handler) => { change = handler; return { remove: jest.fn() }; });
    const { unmount } = await mount();
    await act(async () => { change('active'); await flush(); });
    expect(activateVoiceChatSession).not.toHaveBeenCalled();
    await unmount();
  });

  it('disconnects on background and ignores stale messages', async () => {
    let change!: (state: 'background') => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, handler) => { change = handler; return { remove: jest.fn() }; });
    const onTranscriptSnapshot = jest.fn();
    const { result, unmount } = await mount({ onTranscriptSnapshot });
    await act(async () => { await result.current.connect(); });
    await act(async () => { change('background'); emit({ type: 'session.output_transcript.delta', delta: 'Stale', start_ms: 1, end_ms: 2 }); });
    expect(result.current.status).toBe('disconnected');
    expect(peer.send).toHaveBeenCalledWith({ type: 'session.close' });
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(onTranscriptSnapshot).not.toHaveBeenCalled();
    await unmount();
  });

  it('reconnects after response language changes instead of sending immutable session.update', async () => {
    const { result, rerender, unmount } = await renderHook(({ language }: { language: 'en' | 'hi' }) => useRealtimeConversation({ clientId: 'client-12345678', responseLanguage: language, onError: jest.fn(), onTurnComplete: jest.fn() }), { initialProps: { language: 'en' } });
    await act(async () => { await result.current.connect(); });
    await rerender({ language: 'hi' });
    expect(result.current.status).toBe('disconnected');
    expect(peer.close).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.connect(); });
    expect(createPeerMock).toHaveBeenCalledTimes(2);
    expect(jest.mocked(peer.send).mock.calls.every(([event]) => event.type !== 'session.update')).toBe(true);
    await unmount();
  });

  it('ends the session when consent is withdrawn while mounted', async () => {
    const { result, rerender, unmount } = await renderHook(({ enabled }: { enabled: boolean }) => useRealtimeConversation({ clientId: 'client-12345678', enabled, onError: jest.fn(), onTurnComplete: jest.fn() }), { initialProps: { enabled: true } });
    await act(async () => { await result.current.connect(); });
    expect(result.current.status).toBe('ready');
    await rerender({ enabled: false });
    expect(result.current.status).toBe('disconnected');
    expect(peer.send).toHaveBeenCalledWith({ type: 'session.close' });
    expect(peer.close).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('bounds the startup wait and releases microphone resources on timeout', async () => {
    jest.useFakeTimers();
    autoStart = false;
    const { result, unmount } = await mount();
    let failure!: Promise<unknown>;
    await act(async () => { failure = result.current.connect().catch((error) => error); await flush(); });
    await act(async () => { jest.advanceTimersByTime(15_000); await flush(); });
    expect(await failure).toEqual(expect.objectContaining({ message: 'The live voice session took too long to start.' }));
    expect(result.current.status).toBe('disconnected');
    expect(peer.close).toHaveBeenCalled();
    await unmount();
  });

  describe('session events for the on-device session log', () => {
    const sessionEvents = (onSessionEvent: jest.Mock) => onSessionEvent.mock.calls.map(([event]) => event);

    it('reports starting with the session setup, ready with the server session id, and ended when the learner stops', async () => {
      const onSessionEvent = jest.fn();
      const { result, unmount } = await mount({ onSessionEvent, liveSession: () => ({ mode: 'lesson', context: { lessonId: 'chai', lessonTitle: 'Chai' } }) });
      await act(async () => { await result.current.connect(); });
      await peerOptions.exchangeSdp('offer', new AbortController().signal);
      expect(sessionEvents(onSessionEvent)).toEqual([
        { type: 'starting', mode: 'lesson', lessonId: 'chai' },
        { type: 'ready', serverSessionId: undefined },
      ]);
      await act(async () => { result.current.disconnect(); });
      expect(sessionEvents(onSessionEvent).at(-1)).toEqual({ type: 'ended', reason: 'user_ended' });
      await unmount();
      expect(onSessionEvent).toHaveBeenCalledTimes(3);
    });

    it('passes the Live server session id once the SDP exchange completes before ready', async () => {
      const onSessionEvent = jest.fn();
      createPeerMock.mockImplementation(async (options) => {
        peerOptions = options;
        await options.exchangeSdp('offer', new AbortController().signal);
        emit({ type: 'session.started' });
        return peer;
      });
      const { result, unmount } = await mount({ onSessionEvent });
      await act(async () => { await result.current.connect(); });
      expect(sessionEvents(onSessionEvent)[1]).toEqual({ type: 'ready', serverSessionId: 'live-session' });
      await unmount();
    });

    it('does not report an end for a hook that never started a session', async () => {
      const onSessionEvent = jest.fn();
      const { result, unmount } = await mount({ onSessionEvent });
      await act(async () => { result.current.disconnect(); });
      await unmount();
      expect(onSessionEvent).not.toHaveBeenCalled();
    });

    it('ends as backgrounded when the app leaves the foreground', async () => {
      let change!: (state: 'background') => void;
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, handler) => { change = handler; return { remove: jest.fn() }; });
      const onSessionEvent = jest.fn();
      const { result, unmount } = await mount({ onSessionEvent });
      await act(async () => { await result.current.connect(); });
      await act(async () => { change('background'); });
      expect(sessionEvents(onSessionEvent).at(-1)).toEqual({ type: 'ended', reason: 'backgrounded' });
      await unmount();
    });

    it('ends as connection_lost when the server closes the session', async () => {
      const onSessionEvent = jest.fn();
      const { result, unmount } = await mount({ onSessionEvent });
      await act(async () => { await result.current.connect(); });
      await act(async () => { emit({ type: 'session.closed' }); });
      expect(sessionEvents(onSessionEvent).at(-1)).toEqual({ type: 'ended', reason: 'connection_lost' });
      await unmount();
    });

    it('ends as connection_lost when the transport closes', async () => {
      const onSessionEvent = jest.fn();
      const { result, unmount } = await mount({ onSessionEvent });
      await act(async () => { await result.current.connect(); });
      await act(async () => { peerOptions.onClose?.(); });
      expect(result.current.status).toBe('disconnected');
      expect(sessionEvents(onSessionEvent).at(-1)).toEqual({ type: 'ended', reason: 'connection_lost' });
      await unmount();
    });

    it('ends as connection_lost when the microphone command is never confirmed', async () => {
      jest.useFakeTimers();
      const onSessionEvent = jest.fn();
      const { result, unmount } = await mount({ onSessionEvent });
      let failure!: Promise<unknown>;
      await act(async () => { failure = result.current.startTurn().catch((error) => error); await flush(); });
      await act(async () => { jest.advanceTimersByTime(10_000); await flush(); });
      expect(await failure).toEqual(expect.objectContaining({ message: expect.stringContaining('did not confirm') }));
      expect(sessionEvents(onSessionEvent).at(-1)).toEqual({ type: 'ended', reason: 'connection_lost' });
      await unmount();
    });

    it('ends as data_deleted when Delete Bolo data ends the call, and ignores reasons that are not session end reasons', async () => {
      const onSessionEvent = jest.fn();
      const { result, unmount } = await mount({ onSessionEvent });
      await act(async () => { await result.current.connect(); });
      await act(async () => { result.current.disconnect('data_deleted'); });
      expect(sessionEvents(onSessionEvent).at(-1)).toEqual({ type: 'ended', reason: 'data_deleted' });
      expect(result.current.status).toBe('disconnected');
      await act(async () => { await result.current.connect(); });
      await act(async () => { (result.current.disconnect as (reason?: unknown) => void)({ nativeEvent: {} }); });
      expect(sessionEvents(onSessionEvent).at(-1)).toEqual({ type: 'ended', reason: 'user_ended' });
      await unmount();
    });

    it('ends as config_changed when the reply language or consent changes', async () => {
      const onSessionEvent = jest.fn();
      const { result, rerender, unmount } = await renderHook(({ enabled, language }: { enabled: boolean; language: 'en' | 'hi' }) => useRealtimeConversation({ clientId: 'client-12345678', enabled, responseLanguage: language, onError: jest.fn(), onSessionEvent }), { initialProps: { enabled: true, language: 'en' } });
      await act(async () => { await result.current.connect(); });
      await rerender({ enabled: true, language: 'hi' });
      expect(sessionEvents(onSessionEvent).at(-1)).toEqual({ type: 'ended', reason: 'config_changed' });
      await act(async () => { await result.current.connect(); });
      await rerender({ enabled: false, language: 'hi' });
      expect(sessionEvents(onSessionEvent).at(-1)).toEqual({ type: 'ended', reason: 'config_changed' });
      await unmount();
    });

    it('ends as start_failed when the call cannot be set up or times out', async () => {
      const onSessionEvent = jest.fn();
      const onConnectionStart = jest.fn(async () => { throw new Error('Could not clear chat'); });
      const { result, unmount } = await mount({ onSessionEvent, onConnectionStart });
      await act(async () => { await expect(result.current.connect()).rejects.toThrow('Could not clear chat'); });
      expect(sessionEvents(onSessionEvent)).toEqual([{ type: 'starting', mode: undefined, lessonId: undefined }, { type: 'ended', reason: 'start_failed' }]);
      await unmount();

      jest.useFakeTimers();
      autoStart = false;
      const late = jest.fn();
      const mounted = await mount({ onSessionEvent: late });
      let failure!: Promise<unknown>;
      await act(async () => { failure = mounted.result.current.connect().catch((error) => error); await flush(); });
      await act(async () => { jest.advanceTimersByTime(15_000); await flush(); });
      await failure;
      expect(sessionEvents(late).at(-1)).toEqual({ type: 'ended', reason: 'start_failed' });
      await mounted.unmount();
    });
  });

  describe('client-executed Live tools', () => {
    const toolCall = (callId: string, name = 'get_learner_progress', args = '{}') => ({
      type: 'response.event',
      event_id: `event-${callId}`,
      delegation_id: 'delegation-1',
      event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: callId, name, arguments: args } },
    });
    const environment = () => ({
      getSnapshot: () => ({
        profile: { completed: true, level: 'beginner' as const, scriptPreference: 'both' as const, primaryGoal: 'travel' as const, responseLanguage: 'en' as const, microphoneTested: true },
        phrases: [],
        sceneProgress: {},
        streak: 1,
        practiceSecondsToday: 0,
        liveDoneToday: false,
        duePhraseCount: 0,
      }),
      preparePhrase: jest.fn(),
      confirmSave: jest.fn(async () => true),
      savePhrase: jest.fn(async () => true),
      recordLessonPractice: jest.fn(),
    });

    it('requests tools with mode and context, answers completed calls once, then continues the response', async () => {
      const context = { learnerLevel: 'beginner', lessonId: 'chai' };
      const { result, unmount } = await mount({ liveSession: () => ({ mode: 'beginner', context, toolEnvironment: environment() }) });
      await act(async () => { await result.current.connect(); });
      await peerOptions.exchangeSdp('offer', new AbortController().signal);
      expect(createLiveCall).toHaveBeenCalledWith({ clientId: 'client-12345678', offerSdp: 'offer', responseLanguage: 'en', history: undefined, mode: 'beginner', context, clientTools: true }, expect.anything());
      await act(async () => { emit(toolCall('call_1')); emit(toolCall('call_1')); await flush(); });
      const sent = jest.mocked(peer.send).mock.calls.map(([event]) => event);
      expect(sent).toHaveLength(2);
      expect(sent[0]).toMatchObject({ type: 'response.item.create', item: { type: 'function_call_output', call_id: 'call_1' } });
      expect(JSON.parse((sent[0] as { item: { output: string } }).item.output)).toMatchObject({ learnerLevel: 'beginner', primaryGoal: 'travel' });
      expect(sent[1]).toMatchObject({ type: 'response.create' });
      await unmount();
    });

    it('does not declare tools without a tool environment and ignores function calls', async () => {
      const { result, unmount } = await mount({ liveSession: () => ({ mode: 'conversation' }) });
      await act(async () => { await result.current.connect(); });
      await peerOptions.exchangeSdp('offer', new AbortController().signal);
      expect(createLiveCall).toHaveBeenCalledWith({ clientId: 'client-12345678', offerSdp: 'offer', responseLanguage: 'en', history: undefined, mode: 'conversation' }, expect.anything());
      await act(async () => { emit(toolCall('call_1')); await flush(); });
      expect(peer.send).not.toHaveBeenCalled();
      await unmount();
    });

    it('starts without session setup when building it fails', async () => {
      const { result, unmount } = await mount({ liveSession: () => { throw new Error('state unavailable'); } });
      await act(async () => { await result.current.connect(); });
      await peerOptions.exchangeSdp('offer', new AbortController().signal);
      expect(createLiveCall).toHaveBeenCalledWith({ clientId: 'client-12345678', offerSdp: 'offer', responseLanguage: 'en', history: undefined }, expect.anything());
      expect(result.current.status).toBe('ready');
      await unmount();
    });

    it('drops tool results that finish after the session ends', async () => {
      let resolvePrepare!: (phrase: { hi: string; latin: string; en: string }) => void;
      const tools = environment();
      tools.preparePhrase.mockImplementation(() => new Promise((resolve) => { resolvePrepare = resolve; }));
      const onError = jest.fn();
      const { result, unmount } = await mount({ onError, liveSession: () => ({ toolEnvironment: tools }) });
      await act(async () => { await result.current.connect(); });
      await act(async () => { emit(toolCall('call_save', 'save_confirmed_phrase', JSON.stringify({ originalText: 'Bilkul naya shabd', confirmed: true }))); await flush(); });
      await act(async () => { result.current.disconnect(); });
      await act(async () => { resolvePrepare({ hi: 'बिल्कुल नया शब्द', latin: 'Bilkul naya shabd', en: 'A brand new word' }); await flush(); });
      expect(jest.mocked(peer.send).mock.calls.map(([event]) => event.type)).toEqual(['session.close']);
      expect(tools.savePhrase).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      await unmount();
    });

    it('reports an error when a tool result cannot be sent', async () => {
      const onError = jest.fn();
      const { result, unmount } = await mount({ onError, liveSession: () => ({ toolEnvironment: environment() }) });
      await act(async () => { await result.current.connect(); });
      jest.mocked(peer.send).mockImplementation(() => { throw new Error('closed'); });
      await act(async () => { emit(toolCall('call_1')); await flush(); });
      expect(onError).toHaveBeenCalledWith('Asha could not finish an app action. Start a new session to continue.');
      await unmount();
    });
  });
});
