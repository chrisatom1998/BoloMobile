import { act, renderHook } from '@testing-library/react-native';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { AppState } from 'react-native';
import { useRealtimeConversation } from '../src/hooks/use-realtime-conversation';
import { friendlyLiveError, LIVE_GENERIC_MESSAGE, LIVE_LOST_CONNECTION_MESSAGE, LIVE_SLOW_NETWORK_MESSAGE } from '../src/lib/live-error-copy';
import { createLiveTranscriptStore, liveRowText, type LiveTranscriptRow } from '../src/lib/live-transcripts';
import { createRealtimePeerSession } from '../src/lib/realtime-peer';
import type { RealtimePeerOptions, RealtimePeerSession } from '../src/lib/realtime-peer.types';
import { stopSpeaking } from '../src/lib/speech';
import { activateVoiceChatSession, releaseAudioSessionBeforeCall, restoreDefaultAudioSessionMode } from '../src/lib/voice-session';
import { createLiveCall } from '../src/services/bolo-api';

jest.mock('expo-audio', () => ({ requestRecordingPermissionsAsync: jest.fn(), setAudioModeAsync: jest.fn() }));
jest.mock('@/lib/voice-session', () => ({ activateVoiceChatSession: jest.fn(), releaseAudioSessionBeforeCall: jest.fn(), restoreDefaultAudioSessionMode: jest.fn() }));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('@/lib/realtime-peer', () => ({ createRealtimePeerSession: jest.fn() }));
jest.mock('@/lib/speech', () => ({ speakText: jest.fn(), stopSpeaking: jest.fn(async () => undefined) }));
jest.mock('@/services/bolo-api', () => ({ createLiveCall: jest.fn() }));

const createPeerMock = jest.mocked(createRealtimePeerSession);
let peer: RealtimePeerSession;
let peerOptions: RealtimePeerOptions;
const emit = (event: Record<string, unknown>) => peerOptions.onMessage(JSON.stringify(event));
async function flush() { for (let i = 0; i < 60; i++) await Promise.resolve(); }
function mount(options: Partial<Parameters<typeof useRealtimeConversation>[0]> = {}) {
  return renderHook(() => useRealtimeConversation({ clientId: 'client-12345678', onError: jest.fn(), ...options }));
}
function acknowledge(enabled: boolean) {
  const events = jest.mocked(peer.send).mock.calls.map(([event]) => event);
  const command = events.filter((event) => event.type === (enabled ? 'session.input_audio.unmute' : 'session.input_audio.mute')).at(-1)!;
  emit({ type: enabled ? 'session.input_audio.unmuted' : 'session.input_audio.muted', client_event_id: command.event_id });
}
async function startOpenMic(result: { current: ReturnType<typeof useRealtimeConversation> }) {
  let start!: Promise<void>;
  await act(async () => { start = result.current.startTurn(); await flush(); acknowledge(true); await start; });
}

beforeEach(() => {
  jest.clearAllMocks();
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
    emit({ type: 'session.started', session: { id: 'session-one' } });
    return peer;
  });
});
afterEach(() => jest.useRealTimers());

describe('listening, thinking, speaking', () => {
  it('shows Listening while the learner talks, Thinking until Asha answers, then Speaking', async () => {
    const { result, unmount } = await mount();
    await startOpenMic(result);
    expect(result.current.status).toBe('recording');
    jest.useFakeTimers();
    await act(async () => { emit({ type: 'session.input_transcript.delta', delta: 'Namaste', start_ms: 0, end_ms: 400 }); });
    expect(result.current.status).toBe('recording');
    await act(async () => { jest.advanceTimersByTime(1_000); });
    expect(result.current.status).toBe('thinking');
    await act(async () => { peerOptions.onPlaybackChange?.(true); });
    expect(result.current.status).toBe('responding');
    await act(async () => { peerOptions.onPlaybackChange?.(false); });
    expect(result.current.status).toBe('recording');
    await unmount();
  });

  it('gives up on Thinking when no reply comes', async () => {
    const { result, unmount } = await mount();
    await startOpenMic(result);
    jest.useFakeTimers();
    await act(async () => { emit({ type: 'session.input_transcript.delta', delta: 'Hmm', start_ms: 0, end_ms: 200 }); });
    await act(async () => { jest.advanceTimersByTime(1_000); });
    expect(result.current.status).toBe('thinking');
    await act(async () => { jest.advanceTimersByTime(9_000); });
    expect(result.current.status).toBe('recording');
    await unmount();
  });

  it('switches to Listening the moment the learner talks over Asha and marks her line as cut off', async () => {
    const snapshots: LiveTranscriptRow[][] = [];
    const { result, unmount } = await mount({ onTranscriptSnapshot: (rows) => snapshots.push(rows) });
    await startOpenMic(result);
    await act(async () => {
      emit({ type: 'session.output_transcript.delta', delta: 'Let me tell you about', start_ms: 0, end_ms: 900 });
      peerOptions.onPlaybackChange?.(true);
    });
    expect(result.current.status).toBe('responding');
    await act(async () => { emit({ type: 'session.input_transcript.delta', delta: 'Wait', start_ms: 950, end_ms: 1_100 }); });
    expect(result.current.status).toBe('recording');
    const asha = snapshots.at(-1)!.find((row) => row.speaker === 'asha')!;
    expect(asha.interrupted).toBe(true);
    expect(liveRowText(asha)).toBe('Let me tell you about…');
    await unmount();
  });

  it('does not add an ellipsis to a cut-off line that already ended a sentence', () => {
    expect(liveRowText({ text: 'नमस्ते।', interrupted: true })).toBe('नमस्ते।');
    expect(liveRowText({ text: 'Hello', interrupted: false })).toBe('Hello');
    const store = createLiveTranscriptStore('t');
    expect(store.markInterrupted('asha')).toBe(false);
    store.append('asha', { delta: 'Half a', start_ms: 0, end_ms: 100 });
    expect(store.markInterrupted('asha')).toBe(true);
    expect(store.markInterrupted('asha')).toBe(false);
    const later = store.append('asha', { delta: ' thought', start_ms: 100, end_ms: 200 });
    expect(later?.row.interrupted).toBe(true);
  });
});

describe('interruptions from the phone', () => {
  it('mutes for a brief interruption and reopens the mic when the app is active again', async () => {
    let change!: (state: 'active' | 'inactive' | 'background') => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, handler) => { change = handler as typeof change; return { remove: jest.fn() }; });
    const onSessionEvent = jest.fn();
    const { result, unmount } = await mount({ onSessionEvent });
    await startOpenMic(result);
    await act(async () => { change('inactive'); await flush(); });
    // The call stays open; only the microphone closes.
    expect(result.current.status).not.toBe('disconnected');
    expect(peer.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    expect(onSessionEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ended' }));
    await act(async () => { acknowledge(false); await flush(); });
    expect(result.current.microphoneEnabled).toBe(false);
    await act(async () => { change('active'); await flush(); acknowledge(true); await flush(); });
    expect(result.current.microphoneEnabled).toBe(true);
    await act(async () => { change('background'); });
    expect(result.current.status).toBe('disconnected');
    expect(onSessionEvent).toHaveBeenLastCalledWith({ type: 'ended', reason: 'backgrounded' });
    await unmount();
  });
});

describe('picking up where we left off', () => {
  it('reconnects with the recent conversation and tells the screen it is a resume', async () => {
    const onConnectionStart = jest.fn();
    const resumeHistory = jest.fn(() => [
      { role: 'you' as const, text: 'Namaste' },
      { role: 'asha' as const, text: 'Namaste! Kaise ho?' },
    ]);
    const { result, unmount } = await mount({ onConnectionStart, resumeHistory });
    let start!: Promise<void>;
    await act(async () => { start = result.current.startTurn({ resume: true }); await flush(); acknowledge(true); await start; });
    expect(onConnectionStart).toHaveBeenCalledWith(expect.any(AbortSignal), { resume: true });
    // The mocked peer never negotiates on its own; drive the offer exchange that sends the history.
    await act(async () => { await peerOptions.exchangeSdp('offer', new AbortController().signal); });
    expect(createLiveCall).toHaveBeenCalledWith(expect.objectContaining({
      history: [{ role: 'you', text: 'Namaste' }, { role: 'asha', text: 'Namaste! Kaise ho?' }],
    }), expect.any(AbortSignal));
    await unmount();
  });

  it('starts fresh, with no history, when not resuming', async () => {
    const onConnectionStart = jest.fn();
    const { result, unmount } = await mount({ onConnectionStart, resumeHistory: () => [{ role: 'you', text: 'old' }] });
    await startOpenMic(result);
    expect(onConnectionStart).toHaveBeenCalledWith(expect.any(AbortSignal), { resume: false });
    await act(async () => { await peerOptions.exchangeSdp('offer', new AbortController().signal); });
    expect(jest.mocked(createLiveCall).mock.calls[0]![0].history).toBeUndefined();
    await unmount();
  });
});

describe('friendly error copy', () => {
  it('turns transport failures into plain words with one next step', () => {
    expect(friendlyLiveError('The live voice data channel took too long to open.')).toEqual({ text: LIVE_SLOW_NETWORK_MESSAGE, action: 'retry' });
    expect(friendlyLiveError('The live voice service did not confirm the microphone change. Reconnect to continue.')).toEqual({ text: LIVE_LOST_CONNECTION_MESSAGE, action: 'resume' });
    expect(friendlyLiveError('The live voice connection closed. Start a new session to continue.')).toEqual({ text: LIVE_LOST_CONNECTION_MESSAGE, action: 'resume' });
    expect(friendlyLiveError('The live voice service returned an unreadable event.').action).toBe('none');
    expect(friendlyLiveError('Please wait before starting another voice session.').action).toBe('wait');
    expect(friendlyLiveError('The live voice connection was canceled.').text).toBe('');
  });

  it('keeps sentences written for people and hides error codes', () => {
    expect(friendlyLiveError('I didn’t receive enough audio.')).toEqual({ text: 'I didn’t receive enough audio.', action: 'none' });
    expect(friendlyLiveError('Bolo is unavailable right now. Check your connection and try again.', 'network').action).toBe('retry');
    expect(friendlyLiveError('invalid_value: session.audio.output.voice')).toEqual({ text: LIVE_GENERIC_MESSAGE, action: 'retry' });
    expect(friendlyLiveError('HTTP 502')).toEqual({ text: LIVE_GENERIC_MESSAGE, action: 'retry' });
    expect(friendlyLiveError('Microphone access is required for live voice practice.', undefined, ['Microphone access is required for live voice practice.']).action).toBe('none');
  });
});
