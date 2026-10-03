import { act, renderHook } from '@testing-library/react-native';

import { useAshaLiveConversation } from '../src/hooks/use-asha-live-conversation';
import { createRealtimePeerSession } from '../src/lib/realtime-peer';
import { createAshaLiveSession } from '../src/services/bolo-api';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { AppState } from 'react-native';

jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-audio', () => ({ requestRecordingPermissionsAsync: jest.fn() }));
jest.mock('../src/lib/voice', () => ({
  resetVoiceAudioMode: jest.fn(() => Promise.resolve()),
  setVoiceAudioMode: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/lib/realtime-peer', () => ({ createRealtimePeerSession: jest.fn() }));
jest.mock('../src/services/bolo-api', () => ({
  createAshaLiveSession: jest.fn(),
}));

const permissionMock = requestRecordingPermissionsAsync as jest.MockedFunction<typeof requestRecordingPermissionsAsync>;
const peerMock = createRealtimePeerSession as jest.MockedFunction<typeof createRealtimePeerSession>;
const createSessionMock = createAshaLiveSession as jest.MockedFunction<typeof createAshaLiveSession>;
const executeToolMock = jest.fn();

function makePeer() {
  return {
    close: jest.fn(),
    closeGracefully: jest.fn(() => Promise.resolve()),
    send: jest.fn(),
    setMicrophoneEnabled: jest.fn(),
    setPlaybackEnabled: jest.fn(),
  };
}

function options(overrides: Partial<Parameters<typeof useAshaLiveConversation>[0]> = {}) {
  return {
    clientId: 'client-12345678',
    context: { learnerLevel: 'beginner' },
    executeTool: executeToolMock,
    mode: 'beginner' as const,
    responseLanguage: 'hi' as const,
    onError: jest.fn(),
    ...overrides,
  };
}

describe('useAshaLiveConversation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    permissionMock.mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
    createSessionMock.mockResolvedValue({ session: { id: 'live_test' }, transport: { type: 'webrtc', sdp: 'answer' } });
    executeToolMock.mockResolvedValue({ status: 'ok' });
  });

  it('handles session.started arriving before the peer promise resolves', async () => {
    const peer = makePeer();
    peerMock.mockImplementation(async (peerOptions) => {
      await peerOptions.exchangeSdp('offer', new AbortController().signal);
      peerOptions.onMessage(JSON.stringify({ type: 'session.started', session: { id: 'live_test' } }));
      return peer;
    });
    const { result, unmount } = await renderHook(() => useAshaLiveConversation(options()));

    await act(async () => { await result.current.connect(); });

    expect(result.current.status).toBe('listening');
    expect(peer.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(createSessionMock).toHaveBeenCalledWith(expect.objectContaining({ responseLanguage: 'hi' }), expect.any(AbortSignal));
    expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session.instructions.append',
      event_id: 'bolo_greeting',
      content: expect.stringContaining('question in Hindi'),
    }));
    await unmount();
  });

  it('applies a spoken-language switch to the next reply and suppresses stale previous-mode output', async () => {
    const peer = makePeer();
    let onMessage: (message: string) => void = () => undefined;
    peerMock.mockImplementation(async (peerOptions) => {
      onMessage = peerOptions.onMessage;
      await peerOptions.exchangeSdp('offer', new AbortController().signal);
      peerOptions.onMessage(JSON.stringify({ type: 'session.started', session: { id: 'live_test' } }));
      return peer;
    });
    const onTranscript = jest.fn();
    const { result, rerender, unmount } = await renderHook(
      ({ language }: { language: 'en' | 'hi' }) => useAshaLiveConversation(options({ onTranscript, responseLanguage: language })),
      { initialProps: { language: 'en' as const } },
    );
    await act(async () => { await result.current.connect(); });
    expect(createSessionMock).toHaveBeenCalledWith(expect.objectContaining({ responseLanguage: 'en' }), expect.any(AbortSignal));
    expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ event_id: 'bolo_greeting', content: expect.stringContaining('briefly in English') }));

    await act(() => onMessage(JSON.stringify({ type: 'session.output_transcript.delta', event_id: 'old-start', delta: 'Old English answer' })));
    onTranscript.mockClear();
    await rerender({ language: 'hi' });

    expect(peer.setPlaybackEnabled).toHaveBeenCalledWith(false);
    expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session.instructions.append',
      delegation_id: null,
      content: expect.stringMatching(/Discard any unfinished reply[\s\S]*Speak only Hindi/u),
    }));
    const languageEvent = peer.send.mock.calls
      .map(([event]) => event as { content?: string; event_id?: string })
      .find((event) => event.event_id?.startsWith('bolo_language_hi_'));
    expect(languageEvent?.content?.length).toBeLessThan(2_000);
    expect(result.current.activeResponseLanguage).toBe('en');
    expect(result.current.languageUpdatePending).toBe(true);
    expect(result.current.status).toBe('thinking');

    await act(() => onMessage(JSON.stringify({ type: 'session.instructions.appended', client_event_id: 'obsolete-language-event' })));
    expect(result.current.activeResponseLanguage).toBe('en');
    expect(result.current.languageUpdatePending).toBe(true);

    await act(() => onMessage(JSON.stringify({ type: 'session.instructions.appended', client_event_id: languageEvent?.event_id })));
    expect(result.current.activeResponseLanguage).toBe('hi');
    expect(result.current.languageUpdatePending).toBe(false);
    expect(result.current.status).toBe('listening');
    await act(() => onMessage(JSON.stringify({ type: 'session.output_transcript.delta', event_id: 'old-tail', delta: ' stale tail' })));
    expect(onTranscript).not.toHaveBeenCalled();

    await act(() => onMessage(JSON.stringify({ type: 'session.input_transcript.delta', event_id: 'new-request', delta: 'अब हिंदी में।' })));
    expect(peer.setPlaybackEnabled).toHaveBeenLastCalledWith(true);
    onTranscript.mockClear();
    await act(() => onMessage(JSON.stringify({ type: 'session.output_transcript.delta', event_id: 'new-answer', delta: 'ज़रूर।' })));
    expect(onTranscript).toHaveBeenCalledWith(expect.objectContaining({ speaker: 'asha', text: 'ज़रूर।' }));
    expect(peer.close).not.toHaveBeenCalled();
    await unmount();
  });

  it('reports a rejected spoken-language update without claiming that it was applied', async () => {
    const peer = makePeer();
    let onMessage: (message: string) => void = () => undefined;
    peerMock.mockImplementation(async (peerOptions) => {
      onMessage = peerOptions.onMessage;
      peerOptions.onMessage(JSON.stringify({ type: 'session.started', session: { id: 'live_test' } }));
      return peer;
    });
    const onError = jest.fn();
    const { result, rerender, unmount } = await renderHook(
      ({ language }: { language: 'en' | 'hi' }) => useAshaLiveConversation(options({ onError, responseLanguage: language })),
      { initialProps: { language: 'en' as const } },
    );
    await act(async () => { await result.current.connect(); });
    await rerender({ language: 'hi' });
    const languageEvent = peer.send.mock.calls
      .map(([event]) => event as { event_id?: string })
      .find((event) => event.event_id?.startsWith('bolo_language_hi_'));

    await act(() => onMessage(JSON.stringify({
      type: 'error',
      client_event_id: languageEvent?.event_id,
      error: { message: 'Provider detail that should not be exposed.' },
    })));

    expect(result.current.activeResponseLanguage).toBe('en');
    expect(result.current.languageUpdatePending).toBe(false);
    expect(result.current.status).toBe('listening');
    expect(onError).toHaveBeenCalledWith('Asha could not switch languages. End this chat and start a new conversation to use the selected language.');
    expect(onError).not.toHaveBeenCalledWith(expect.stringContaining('Provider detail'));
    await unmount();
  });

  it('requests microphone permission only when Start Conversation connects and explains denial', async () => {
    permissionMock.mockResolvedValueOnce({ granted: false } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
    const { result, unmount } = await renderHook(() => useAshaLiveConversation(options()));
    expect(permissionMock).not.toHaveBeenCalled();

    await act(async () => {
      await expect(result.current.connect()).rejects.toThrow('iOS Settings');
    });
    expect(peerMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('disconnected');
    await unmount();
  });

  it('deduplicates transcript events and closes microphone/network resources', async () => {
    const peer = makePeer();
    let onMessage: (message: string) => void = () => undefined;
    peerMock.mockImplementation(async (peerOptions) => {
      onMessage = peerOptions.onMessage;
      peerOptions.onMessage(JSON.stringify({ type: 'session.started', session: { id: 'live_test' } }));
      return peer;
    });
    const onTranscript = jest.fn();
    const { result, unmount } = await renderHook(() => useAshaLiveConversation(options({ onTranscript })));
    await act(async () => { await result.current.connect(); });
    await act(() => {
      const event = JSON.stringify({ type: 'session.input_transcript.delta', event_id: 'same', delta: 'Mera naaam?', start_ms: 1, end_ms: 2 });
      onMessage(event);
      onMessage(event);
    });
    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith(expect.objectContaining({ text: 'Mera naaam?' }));

    await act(async () => { await result.current.disconnect(); });
    await act(async () => { await Promise.resolve(); });
    expect(peer.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    expect(peer.closeGracefully).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('disconnected');
    await unmount();
  });

  it('updates muted state locally when the learner mutes, unmutes, or interrupts', async () => {
    const peer = makePeer();
    let onMessage: (message: string) => void = () => undefined;
    peerMock.mockImplementation(async (peerOptions) => {
      onMessage = peerOptions.onMessage;
      peerOptions.onMessage(JSON.stringify({ type: 'session.started', session: { id: 'live_test' } }));
      return peer;
    });
    const { result, unmount } = await renderHook(() => useAshaLiveConversation(options()));
    await act(async () => { await result.current.connect(); });

    await act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(true);
    expect(peer.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    expect(peer.send).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'session.input_audio.mute' }));

    await act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(false);
    expect(peer.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
    expect(peer.send).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'session.input_audio.unmute' }));

    await act(() => onMessage(JSON.stringify({ type: 'session.input_audio.muted' })));
    expect(result.current.muted).toBe(true);
    await act(() => result.current.interrupt());
    expect(result.current.muted).toBe(false);
    expect(peer.send).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'session.input_audio.unmute' }));
    await unmount();
  });

  it('invalidates in-flight backend work when the learner interrupts', async () => {
    const peer = makePeer();
    let onMessage: (message: string) => void = () => undefined;
    let toolSignal: AbortSignal | undefined;
    executeToolMock.mockImplementation((input) => new Promise((_, reject) => {
      toolSignal = input.signal;
      input.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    peerMock.mockImplementation(async (peerOptions) => {
      onMessage = peerOptions.onMessage;
      peerOptions.onMessage(JSON.stringify({ type: 'session.started', session: { id: 'live_test' } }));
      return peer;
    });
    const { result, unmount } = await renderHook(() => useAshaLiveConversation(options()));
    await act(async () => { await result.current.connect(); });
    await act(() => {
      onMessage(JSON.stringify({ type: 'session.delegation.created', delegation: { id: 'delegation-1', target: 'responses' } }));
      onMessage(JSON.stringify({
        type: 'response.event',
        delegation_id: 'delegation-1',
        event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call-1', name: 'read_active_lesson', arguments: '{}' } },
      }));
    });
    expect(result.current.backendLoading).toBe(true);
    await act(() => result.current.interrupt());
    await act(async () => Promise.resolve());

    expect(toolSignal?.aborted).toBe(true);
    expect(result.current.backendLoading).toBe(false);
    expect(peer.setPlaybackEnabled).toHaveBeenCalledWith(false);
    expect(peer.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'response.item.create' }));
    expect(peer.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'response.create' }));
    await unmount();
  });

  it('invalidates in-flight backend work when new learner speech changes the request', async () => {
    const peer = makePeer();
    let onMessage: (message: string) => void = () => undefined;
    let toolSignal: AbortSignal | undefined;
    executeToolMock.mockImplementation((input) => new Promise((_, reject) => {
      toolSignal = input.signal;
      input.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    peerMock.mockImplementation(async (peerOptions) => {
      onMessage = peerOptions.onMessage;
      peerOptions.onMessage(JSON.stringify({ type: 'session.started', session: { id: 'live_test' } }));
      return peer;
    });
    const { result, unmount } = await renderHook(() => useAshaLiveConversation(options()));
    await act(async () => { await result.current.connect(); });
    await act(() => {
      onMessage(JSON.stringify({ type: 'session.delegation.created', delegation: { id: 'delegation-new-input', target: 'responses' } }));
      onMessage(JSON.stringify({ type: 'response.event', delegation_id: 'delegation-new-input', event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call-new-input', name: 'read_active_lesson', arguments: '{}' } } }));
    });
    await act(() => onMessage(JSON.stringify({ type: 'session.input_transcript.delta', event_id: 'changed-answer', delta: 'नहीं, गुरुवार।', start_ms: 50, end_ms: 80 })));
    await act(async () => { await Promise.resolve(); });

    expect(toolSignal?.aborted).toBe(true);
    expect(result.current.backendLoading).toBe(false);
    expect(peer.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'response.item.create' }));
    await unmount();
  });

  it('keeps a delegation active until its tool settles and drops stale output after a newer answer', async () => {
    const peer = makePeer();
    let onMessage: (message: string) => void = () => undefined;
    let toolSignal: AbortSignal | undefined;
    let resolveTool: ((value: { saved: boolean }) => void) | undefined;
    executeToolMock.mockImplementation((input) => {
      toolSignal = input.signal;
      return new Promise<{ saved: boolean }>((resolve) => { resolveTool = resolve; });
    });
    peerMock.mockImplementation(async (peerOptions) => {
      onMessage = peerOptions.onMessage;
      peerOptions.onMessage(JSON.stringify({ type: 'session.started', session: { id: 'live_test' } }));
      return peer;
    });
    const { result, unmount } = await renderHook(() => useAshaLiveConversation(options()));
    await act(async () => { await result.current.connect(); });
    await act(() => {
      onMessage(JSON.stringify({ type: 'session.delegation.created', delegation: { id: 'delegation-race', target: 'responses' } }));
      onMessage(JSON.stringify({
        type: 'response.event',
        delegation_id: 'delegation-race',
        event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call-race', name: 'save_confirmed_phrase', arguments: '{"originalText":"नमस्ते","confirmed":true}' } },
      }));
      onMessage(JSON.stringify({ type: 'response.event', delegation_id: 'delegation-race', event: { type: 'response.completed' } }));
    });
    expect(result.current.backendLoading).toBe(true);

    await act(() => onMessage(JSON.stringify({ type: 'session.input_transcript.delta', event_id: 'newer-answer', delta: 'नहीं, इसे मत सहेजिए।' })));
    expect(toolSignal?.aborted).toBe(true);
    expect(result.current.backendLoading).toBe(false);
    await act(async () => {
      resolveTool?.({ saved: true });
      await Promise.resolve();
    });

    expect(peer.send).not.toHaveBeenCalledWith(expect.objectContaining({ event_id: 'bolo_tool_call-race' }));
    expect(peer.send).not.toHaveBeenCalledWith(expect.objectContaining({ event_id: 'bolo_continue_call-race' }));
    await unmount();
  });

  it('requests a backend recap before graceful close', async () => {
    const peer = makePeer();
    peerMock.mockImplementation(async (peerOptions) => {
      peerOptions.onMessage(JSON.stringify({ type: 'session.started', session: { id: 'live_test' } }));
      return peer;
    });
    executeToolMock.mockResolvedValueOnce({ practicedPhrases: ['नमस्ते'], corrections: [], progress: 'Lesson started' });
    const { result, unmount } = await renderHook(() => useAshaLiveConversation(options()));
    await act(async () => { await result.current.connect(); });
    let recap: unknown;
    await act(async () => { recap = await result.current.createRecap(); });
    expect(recap).toEqual(expect.objectContaining({ practicedPhrases: ['नमस्ते'] }));
    expect(executeToolMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'create_session_recap',
      sessionId: 'live_test',
      signal: expect.any(AbortSignal),
    }));
    await unmount();
  });

  it('enters reconnecting and makes one bounded recovery attempt after network loss', async () => {
    jest.useFakeTimers();
    const firstPeer = makePeer();
    const recoveredPeer = makePeer();
    let closeConnection: () => void = () => undefined;
    peerMock
      .mockImplementationOnce(async (peerOptions) => {
        closeConnection = peerOptions.onClose;
        peerOptions.onMessage(JSON.stringify({ type: 'session.started', session: { id: 'live_first' } }));
        return firstPeer;
      })
      .mockImplementationOnce(async (peerOptions) => {
        peerOptions.onMessage(JSON.stringify({ type: 'session.started', session: { id: 'live_recovered' } }));
        return recoveredPeer;
      });
    const { result, unmount } = await renderHook(() => useAshaLiveConversation(options()));
    await act(async () => { await result.current.connect(); });
    await act(() => closeConnection());
    expect(result.current.status).toBe('reconnecting');
    await act(async () => { await jest.advanceTimersByTimeAsync(750); });
    expect(peerMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('listening');
    await unmount();
    jest.useRealTimers();
  });
});
