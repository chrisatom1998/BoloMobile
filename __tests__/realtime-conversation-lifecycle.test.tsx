import { act, renderHook, waitFor } from '@testing-library/react-native';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { AppState, type AppStateStatus } from 'react-native';

import { useRealtimeConversation } from '../src/hooks/use-realtime-conversation';
import { createRealtimePeerSession } from '../src/lib/realtime-peer';
import type { RealtimePeerOptions, RealtimePeerSession } from '../src/lib/realtime-peer.types';
import { stopSpeaking } from '../src/lib/speech';
import { createRealtimeClientSecret } from '../src/services/bolo-api';

jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('@/lib/realtime-peer', () => ({
  createRealtimePeerSession: jest.fn(),
}));

jest.mock('@/lib/speech', () => ({
  stopSpeaking: jest.fn(),
}));

jest.mock('@/services/bolo-api', () => ({
  createRealtimeClientSecret: jest.fn(),
  OPENAI_REALTIME_MODEL: 'gpt-realtime-test',
}));

const requestPermissionMock = requestRecordingPermissionsAsync as jest.MockedFunction<typeof requestRecordingPermissionsAsync>;
const setAudioModeMock = setAudioModeAsync as jest.MockedFunction<typeof setAudioModeAsync>;
const createPeerMock = createRealtimePeerSession as jest.MockedFunction<typeof createRealtimePeerSession>;
const stopSpeakingMock = stopSpeaking as jest.MockedFunction<typeof stopSpeaking>;
const createSecretMock = createRealtimeClientSecret as jest.MockedFunction<typeof createRealtimeClientSecret>;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createPeer(): RealtimePeerSession {
  return {
    close: jest.fn(),
    send: jest.fn(),
    setMicrophoneEnabled: jest.fn(),
  };
}

describe('Realtime connection lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    requestPermissionMock.mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
    setAudioModeMock.mockResolvedValue(undefined);
    stopSpeakingMock.mockImplementation(() => undefined);
  });

  it('sends the selected Hindi response language in the Realtime session configuration', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_hindi_voice',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      responseLanguage: 'hi',
      onError: jest.fn(),
      onTurnComplete: jest.fn(),
    }));

    try {
      let start!: Promise<void>;
      await act(() => {
        start = result.current.startTurn();
      });
      await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'session.update',
        session: expect.objectContaining({
          instructions: expect.stringContaining('Reply in concise, natural Hindi'),
        }),
      })));
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await start;
      });
    } finally {
      await unmount();
    }
  });

  it('reasserts full-volume speaker routing after WebRTC setup and when response audio starts', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    const speakerMode = {
      allowsRecording: true,
      interruptionMode: 'doNotMix',
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
    };
    createSecretMock.mockResolvedValue({
      value: 'ek_speaker_route',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError: jest.fn(),
      onTurnComplete: jest.fn(),
    }));

    try {
      let start!: Promise<void>;
      await act(() => {
        start = result.current.startTurn();
      });
      await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
      expect(setAudioModeMock.mock.calls.filter(([mode]) => (
        mode.allowsRecording === true && mode.shouldRouteThroughEarpiece === false
      ))).toHaveLength(2);

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await start;
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        await Promise.resolve();
      });

      expect(setAudioModeMock).toHaveBeenLastCalledWith(speakerMode);
      expect(setAudioModeMock.mock.calls.filter(([mode]) => (
        mode.allowsRecording === true && mode.shouldRouteThroughEarpiece === false
      ))).toHaveLength(3);
    } finally {
      await unmount();
    }
  });

  it('keeps a replacement attempt intact when a canceled token request resolves late', async () => {
    const firstToken = deferred<Awaited<ReturnType<typeof createRealtimeClientSecret>>>();
    const replacementPeer = createPeer();
    let replacementOptions: RealtimePeerOptions | undefined;

    createSecretMock
      .mockImplementationOnce((_clientId, signal) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        return firstToken.promise;
      })
      .mockResolvedValueOnce({
        value: 'ek_replacement',
        expires_at: Math.floor(Date.now() / 1000) + 60,
      });
    createPeerMock.mockImplementation(async (options) => {
      replacementOptions = options;
      return replacementPeer;
    });

    const onError = jest.fn();
    const { result } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError,
      onTurnComplete: jest.fn(),
    }));

    let firstStart!: Promise<void>;
    await act(() => {
      firstStart = result.current.startTurn();
    });
    await waitFor(() => expect(createSecretMock).toHaveBeenCalledTimes(1));
    const firstSignal = createSecretMock.mock.calls[0][1];

    await act(() => result.current.disconnect());
    expect(firstSignal?.aborted).toBe(true);

    let replacementStart!: Promise<void>;
    await act(() => {
      replacementStart = result.current.startTurn();
    });
    await waitFor(() => expect(replacementPeer.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session.update',
    })));

    await act(async () => {
      firstToken.resolve({
        value: 'ek_stale',
        expires_at: Math.floor(Date.now() / 1000) + 60,
      });
      await firstStart;
    });

    expect(createRealtimePeerSession).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('connecting');

    await act(async () => {
      replacementOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
      await replacementStart;
    });

    expect(result.current.status).toBe('recording');
    expect(replacementPeer.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    expect(replacementPeer.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not create a peer or enable a microphone after unmounting during token fetch', async () => {
    const token = deferred<Awaited<ReturnType<typeof createRealtimeClientSecret>>>();
    createSecretMock.mockReturnValue(token.promise);

    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError: jest.fn(),
      onTurnComplete: jest.fn(),
    }));

    let start!: Promise<void>;
    await act(() => {
      start = result.current.startTurn();
    });
    await waitFor(() => expect(createSecretMock).toHaveBeenCalledTimes(1));
    const signal = createSecretMock.mock.calls[0][1];

    await unmount();
    expect(signal?.aborted).toBe(true);

    token.resolve({
      value: 'ek_too_late',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    await expect(start).resolves.toBeUndefined();

    expect(createPeerMock).not.toHaveBeenCalled();
  });

  it('correlates delayed transcripts across consecutive turns and ignores duplicate or stale events', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_turn_correlation',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const onTurnComplete = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError: jest.fn(),
      onTurnComplete,
    }));

    let firstStart!: Promise<void>;
    await act(() => {
      firstStart = result.current.startTurn();
    });
    await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
    await act(async () => {
      peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
      await firstStart;
    });

    jest.useFakeTimers();
    try {
      const delays = [500, 2_000, 5_000];
      for (const [index, delayMs] of delays.entries()) {
        const turn = index + 1;
        const itemId = `input-turn-${turn}`;
        const transcript = `Learner turn ${turn}.`;
        const reply = `Mira reply ${turn}.`;

        if (index > 0) {
          await act(async () => {
            await result.current.startTurn();
          });
          expect(result.current.status).toBe('recording');
        }

        await act(async () => {
          peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: itemId }));
          if (index > 0) {
            peerOptions?.onMessage(JSON.stringify({
              type: 'conversation.item.input_audio_transcription.completed',
              item_id: `input-turn-${index}`,
              transcript: 'Stale transcript that must be ignored.',
            }));
          }
          peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
          peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
          peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: reply }));
          peerOptions?.onMessage(JSON.stringify({ type: 'response.done', response: { status: 'completed' } }));
          peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
          jest.advanceTimersByTime(delayMs);
          await Promise.resolve();
        });
        expect(onTurnComplete).toHaveBeenCalledTimes(index);
        expect(result.current.status).toBe('responding');

        await act(async () => {
          peerOptions?.onMessage(JSON.stringify({
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: itemId,
            transcript,
          }));
          peerOptions?.onMessage(JSON.stringify({
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: itemId,
            transcript: 'Duplicate transcript that must be ignored.',
          }));
          await Promise.resolve();
        });
        expect(onTurnComplete).toHaveBeenCalledTimes(turn);
        expect(onTurnComplete).toHaveBeenLastCalledWith({ transcript, reply, language: 'en' });
        expect(result.current.status).toBe('ready');
      }
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('closes a stalled session when Realtime never completes the response', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_response_watchdog',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const onError = jest.fn();
    const onTurnComplete = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError,
      onTurnComplete,
    }));

    let start!: Promise<void>;
    await act(() => {
      start = result.current.startTurn();
    });
    await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
    await act(async () => {
      peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
      await start;
    });

    jest.useFakeTimers();
    try {
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-stalled-response' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        jest.advanceTimersByTime(45_000);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('disconnected');
      expect(peer.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
      expect(peer.close).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('did not finish'));
      expect(onTurnComplete).not.toHaveBeenCalled();

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.output_audio_transcript.done',
          transcript: 'Stale reply after the watchdog.',
        }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.done', response: { status: 'completed' } }));
        await Promise.resolve();
      });
      expect(onTurnComplete).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('closes a stalled session when output never reports stopped or cleared', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_output_watchdog',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const onError = jest.fn();
    const onTurnComplete = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError,
      onTurnComplete,
    }));

    let start!: Promise<void>;
    await act(() => {
      start = result.current.startTurn();
    });
    await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
    await act(async () => {
      peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
      await start;
    });

    jest.useFakeTimers();
    try {
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-stalled-output' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-stalled-output',
          transcript: 'My complete input.',
        }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.output_audio_transcript.done',
          transcript: 'The complete reply.',
        }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.done', response: { status: 'completed' } }));
        await Promise.resolve();
      });
      expect(onTurnComplete).toHaveBeenCalledWith({
        transcript: 'My complete input.',
        reply: 'The complete reply.',
        language: 'en',
      });
      expect(result.current.status).toBe('responding');

      await act(async () => {
        jest.advanceTimersByTime(15_000);
        await Promise.resolve();
      });
      expect(result.current.status).toBe('disconnected');
      expect(peer.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
      expect(peer.close).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('playing or transcribing'));
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('rejects an incomplete Realtime response instead of saving partial output', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_incomplete_response',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const onError = jest.fn();
    const onTurnComplete = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError,
      onTurnComplete,
    }));

    let start!: Promise<void>;
    await act(() => {
      start = result.current.startTurn();
    });
    await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
    await act(async () => {
      peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
      await start;
    });

    jest.useFakeTimers();
    try {
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-incomplete' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Partial output' }));
        jest.mocked(peer.send).mockClear();
        peerOptions?.onMessage(JSON.stringify({ type: 'response.done', response: { status: 'incomplete' } }));
        await Promise.resolve();
      });

      expect(onError).toHaveBeenCalledWith(expect.stringContaining('incomplete'));
      expect(onTurnComplete).not.toHaveBeenCalled();
      expect(peer.send).toHaveBeenCalledWith({ type: 'output_audio_buffer.clear' });
      expect(result.current.status).toBe('responding');

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.cleared' }));
        jest.advanceTimersByTime(1_000);
        await Promise.resolve();
      });
      expect(result.current.status).toBe('ready');
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('keeps controls locked while clearing partial output after a Realtime error', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_error_audio_drain',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const onError = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError,
      onTurnComplete: jest.fn(),
    }));

    try {
      let start!: Promise<void>;
      await act(() => {
        start = result.current.startTurn();
      });
      await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await start;
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        jest.mocked(peer.send).mockClear();
        peerOptions?.onMessage(JSON.stringify({ type: 'error', error: { message: 'Realtime output failed.' } }));
        await Promise.resolve();
      });

      expect(onError).toHaveBeenCalledWith('Realtime output failed.');
      expect(peer.send).toHaveBeenCalledWith({ type: 'output_audio_buffer.clear' });
      expect(result.current.status).toBe('responding');

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.cleared' }));
        await Promise.resolve();
      });
      expect(result.current.status).toBe('ready');
    } finally {
      await unmount();
    }
  });

  it('does not start a new turn while a completed reply is waiting for its transcript', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_waiting_for_transcript',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const onTurnComplete = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError: jest.fn(),
      onTurnComplete,
    }));

    let start!: Promise<void>;
    await act(() => {
      start = result.current.startTurn();
    });
    await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
    await act(async () => {
      peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
      await start;
    });

    jest.useFakeTimers();
    try {
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-waiting' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Reply waiting.' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.done', response: { status: 'completed' } }));
        await Promise.resolve();
      });

      expect(result.current.status).toBe('responding');
      await act(async () => {
        await result.current.startTurn();
      });
      expect(result.current.status).toBe('responding');
      expect(peer.setMicrophoneEnabled).toHaveBeenCalledTimes(1);

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-waiting',
          transcript: 'My waiting input.',
        }));
        await Promise.resolve();
      });
      expect(onTurnComplete).toHaveBeenCalledWith({
        transcript: 'My waiting input.',
        reply: 'Reply waiting.',
        language: 'en',
      });
      expect(result.current.status).toBe('responding');

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });
      expect(result.current.status).toBe('ready');

      await act(async () => {
        await result.current.startTurn();
      });
      expect(result.current.status).toBe('recording');
      expect(peer.setMicrophoneEnabled).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('keeps controls locked until Realtime output audio has stopped playing', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_output_audio_drain',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const onTurnComplete = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError: jest.fn(),
      onTurnComplete,
    }));

    try {
      let start!: Promise<void>;
      await act(() => {
        start = result.current.startTurn();
      });
      await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await start;
      });

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-audio-drain' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-audio-drain',
          transcript: 'Play the full reply.',
        }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Full spoken reply.' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.done', response: { status: 'completed' } }));
        await Promise.resolve();
      });

      expect(onTurnComplete).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('responding');

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });
      expect(result.current.status).toBe('ready');
    } finally {
      await unmount();
    }
  });

  it('disconnects an active microphone session when the app leaves the foreground', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    let appStateChange: ((state: AppStateStatus) => void) | undefined;
    const removeAppStateListener = jest.fn();
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'change') appStateChange = listener;
      return { remove: removeAppStateListener };
    });
    createSecretMock.mockResolvedValue({
      value: 'ek_background_disconnect',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });

    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError: jest.fn(),
      onTurnComplete: jest.fn(),
    }));
    try {
      let start!: Promise<void>;
      await act(() => {
        start = result.current.startTurn();
      });
      await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await start;
      });
      expect(result.current.status).toBe('recording');
      expect(appStateChange).toBeDefined();

      await act(() => appStateChange?.('background'));
      expect(result.current.status).toBe('disconnected');
      expect(peer.close).toHaveBeenCalledTimes(1);
      expect(setAudioModeMock).toHaveBeenLastCalledWith({ allowsRecording: false, playsInSilentMode: true });
    } finally {
      await unmount();
      appStateSpy.mockRestore();
    }
    expect(removeAppStateListener).toHaveBeenCalledTimes(1);
  });

  it('allows the iOS microphone permission prompt to become inactive during connection', async () => {
    const permission = deferred<Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>>();
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    let appStateChange: ((state: AppStateStatus) => void) | undefined;
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'change') appStateChange = listener;
      return { remove: jest.fn() };
    });
    requestPermissionMock.mockReturnValue(permission.promise);
    createSecretMock.mockResolvedValue({
      value: 'ek_permission_prompt',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });

    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError: jest.fn(),
      onTurnComplete: jest.fn(),
    }));
    try {
      let start!: Promise<void>;
      await act(() => {
        start = result.current.startTurn();
      });
      await waitFor(() => expect(requestPermissionMock).toHaveBeenCalledTimes(1));

      await act(() => appStateChange?.('inactive'));
      expect(result.current.status).toBe('connecting');

      await act(() => appStateChange?.('active'));
      permission.resolve({ granted: true } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
      await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await start;
      });

      expect(result.current.status).toBe('recording');
      expect(peer.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    } finally {
      await unmount();
      appStateSpy.mockRestore();
    }
  });
});
