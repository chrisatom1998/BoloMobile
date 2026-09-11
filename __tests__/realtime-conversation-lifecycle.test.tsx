import { act, renderHook } from '@testing-library/react-native';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { AppState } from 'react-native';
import { useRealtimeConversation } from '../src/hooks/use-realtime-conversation';
import { createRealtimePeerSession } from '../src/lib/realtime-peer';
import type { RealtimePeerOptions, RealtimePeerSession } from '../src/lib/realtime-peer.types';
import { speakText, stopSpeaking } from '../src/lib/speech';
import { createLiveCall } from '../src/services/bolo-api';

let mockIsDevice = true;
jest.mock('expo-audio', () => ({ requestRecordingPermissionsAsync: jest.fn(), setAudioModeAsync: jest.fn() }));
jest.mock('expo-device', () => ({ get isDevice() { return mockIsDevice; } }));
jest.mock('@/lib/realtime-peer', () => ({ createRealtimePeerSession: jest.fn() }));
jest.mock('@/lib/speech', () => ({ speakText: jest.fn(), stopSpeaking: jest.fn(async () => undefined) }));
jest.mock('@/services/bolo-api', () => ({ createLiveCall: jest.fn() }));
const createPeerMock = jest.mocked(createRealtimePeerSession);
let peer: RealtimePeerSession;
let peerOptions: RealtimePeerOptions;
let autoStart = true;
const emit = (event: Record<string, unknown>) => peerOptions.onMessage(JSON.stringify(event));
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
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
    expect(setAudioModeAsync).toHaveBeenCalledTimes(2);
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
      emit({ type: 'session.input_transcript.delta', event_id: 'u2', delta: ' world', start_ms: 300, end_ms: 500 });
      emit({ type: 'session.output_transcript.delta', event_id: 'a1', delta: 'Hello!', start_ms: 250, end_ms: 600 });
      emit({ type: 'session.input_transcript.delta', event_id: 'u1', delta: 'Hello', start_ms: 100, end_ms: 300 });
      emit({ type: 'session.input_transcript.delta', event_id: 'u1', delta: 'Hello', start_ms: 100, end_ms: 300 });
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
});
