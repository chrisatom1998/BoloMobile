import { act, renderHook, waitFor } from '@testing-library/react-native';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { AppState, type AppStateStatus } from 'react-native';

import { useRealtimeConversation } from '../src/hooks/use-realtime-conversation';
import { createRealtimePeerSession } from '../src/lib/realtime-peer';
import type { RealtimePeerOptions, RealtimePeerSession } from '../src/lib/realtime-peer.types';
import { speakText, stopSpeaking } from '../src/lib/speech';
import { createRealtimeClientSecret } from '../src/services/bolo-api';

let mockIsDevice = true;

jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('expo-device', () => ({
  get isDevice() {
    return mockIsDevice;
  },
}));

jest.mock('@/lib/realtime-peer', () => ({
  createRealtimePeerSession: jest.fn(),
}));

jest.mock('@/lib/speech', () => ({
  speakText: jest.fn(async () => undefined),
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
const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;
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
    mockIsDevice = true;
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    requestPermissionMock.mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
    setAudioModeMock.mockResolvedValue(undefined);
    stopSpeakingMock.mockImplementation(() => undefined);
    speakTextMock.mockResolvedValue(undefined);
  });

  it('rejects iOS Simulator before WebRTC can trigger a native audio crash', async () => {
    mockIsDevice = false;
    const onError = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError,
      onTurnComplete: jest.fn(),
    }));

    try {
      await act(async () => {
        await expect(result.current.startTurn()).rejects.toThrow('Live voice requires a physical iPhone');
      });
      expect(requestPermissionMock).not.toHaveBeenCalled();
      expect(createSecretMock).not.toHaveBeenCalled();
      expect(createPeerMock).not.toHaveBeenCalled();
      expect(result.current.status).toBe('disconnected');
    } finally {
      mockIsDevice = true;
      await unmount();
    }
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
          instructions: expect.stringContaining('Reply in concise, natural spoken Hindi'),
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

  it('renders text-only Realtime output through canonical Asha TTS before unlocking the next turn', async () => {
    const peer = createPeer();
    const playback = deferred<void>();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_canonical_voice',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    speakTextMock.mockReturnValue(playback.promise);
    const onTurnComplete = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      responseLanguage: 'hi',
      onError: jest.fn(),
      onTurnComplete,
    }));
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);

    try {
      let start!: Promise<void>;
      await act(() => {
        start = result.current.startTurn();
      });
      await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'session.update',
        session: expect.objectContaining({ output_modalities: ['text'] }),
      })));
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await start;
        now.mockReturnValue(1_500);
        await result.current.finishTurn();
        expect(peer.send).toHaveBeenCalledWith({ type: 'response.create', response: { output_modalities: ['text'] } });
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-canonical' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-canonical',
          transcript: 'Say hello.',
        }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_text.delta', delta: 'नमस्ते' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_text.done', text: 'नमस्ते!' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.done', response: { status: 'completed' } }));
        await Promise.resolve();
      });

      expect(speakTextMock).toHaveBeenCalledWith('नमस्ते!', expect.any(AbortSignal), 1, 'hi');
      expect(onTurnComplete).not.toHaveBeenCalled();
      expect(result.current.status).toBe('responding');

      await act(async () => {
        playback.resolve();
        await Promise.resolve();
      });

      expect(onTurnComplete).toHaveBeenCalledWith({
        transcript: 'Say hello.',
        reply: 'नमस्ते!',
        language: 'hi',
      });
      expect(result.current.status).toBe('ready');
    } finally {
      now.mockRestore();
      await unmount();
    }
  });

  it('waits for WebRTC output before applying speaker routing to avoid an iOS audio-session race', async () => {
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
      ))).toHaveLength(0);

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
      ))).toHaveLength(1);
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

  it('correlates delayed transcripts across twelve consecutive turns and ignores duplicate or stale events', async () => {
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
      const delays = Array.from({ length: 12 }, (_, index) => [500, 2_000, 5_000][index % 3]);
      for (const [index, delayMs] of delays.entries()) {
        const turn = index + 1;
        const itemId = `input-turn-${turn}`;
        const transcript = `Learner turn ${turn}.`;
        const reply = `Asha reply ${turn}.`;

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

  it('publishes learner and Asha transcript deltas while a voice turn is still in progress', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_live_transcripts',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const onTranscriptChange = jest.fn();
    const onInputTranscriptComplete = jest.fn();
    const onTurnComplete = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError: jest.fn(),
      onInputTranscriptComplete,
      onTranscriptChange,
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
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-live' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.delta',
          item_id: 'input-live',
          delta: 'Namaste',
        }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.delta',
          item_id: 'input-live',
          delta: ', Asha',
        }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-live',
          transcript: 'Namaste, Asha.',
        }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 'Hello' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: ' there' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.output_audio_transcript.done',
          transcript: 'Hello there.',
        }));
        await Promise.resolve();
      });

      expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'you', text: 'Namaste' });
      expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'you', text: 'Namaste, Asha' });
      expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'you', text: 'Namaste, Asha.' });
      expect(onInputTranscriptComplete).toHaveBeenCalledWith({
        itemId: 'input-live',
        transcript: 'Namaste, Asha.',
      });
      expect(onInputTranscriptComplete).toHaveBeenCalledTimes(1);
      expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'asha', text: 'Hello' });
      expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'asha', text: 'Hello there' });
      expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'asha', text: 'Hello there.' });
      expect(onTurnComplete).not.toHaveBeenCalled();
    } finally {
      await unmount();
    }
  });

  it('keeps the Devanagari speech transcript for accurate replay', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_devanagari_speech',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const onTranscriptChange = jest.fn();
    const onTurnComplete = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      responseLanguage: 'hi',
      onError: jest.fn(),
      onTranscriptChange,
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
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-hindi' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-hindi',
          transcript: 'Namaste, Asha.',
        }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 'आप कैसे' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: ' हैं?' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.output_audio_transcript.done',
          transcript: 'आप कैसे हैं?',
        }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.done', response: { status: 'completed' } }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });

      expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'asha', text: 'आप कैसे' });
      expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'asha', text: 'आप कैसे हैं?' });
      expect(onTurnComplete).toHaveBeenCalledWith({
        transcript: 'Namaste, Asha.',
        reply: 'आप कैसे हैं?',
        language: 'hi',
      });
      expect(result.current.status).toBe('ready');
    } finally {
      await unmount();
    }
  });

  it('keeps a delayed learner transcript when Asha fails before transcription finishes', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_delayed_transcript_after_failure',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    const onInputTranscriptComplete = jest.fn();
    const onTurnComplete = jest.fn();
    const { result, unmount } = await renderHook(() => useRealtimeConversation({
      clientId: 'client-12345678',
      onError: jest.fn(),
      onInputTranscriptComplete,
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
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-delayed-failure' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.done',
          response: { status: 'incomplete', status_details: { reason: 'content_filter' } },
        }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-delayed-failure',
          transcript: 'Keep my words even when Asha fails.',
        }));
        await Promise.resolve();
      });

      expect(onInputTranscriptComplete).toHaveBeenCalledWith({
        itemId: 'input-delayed-failure',
        transcript: 'Keep my words even when Asha fails.',
      });
      expect(onInputTranscriptComplete).toHaveBeenCalledTimes(1);
      expect(onTurnComplete).not.toHaveBeenCalled();
    } finally {
      await unmount();
    }
  });

  it('retries one stalled Realtime response and then closes if the retry also stalls', async () => {
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

      expect(result.current.status).toBe('responding');
      expect(peer.send).toHaveBeenCalledWith({ type: 'response.cancel' });
      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'response.create',
        response: expect.objectContaining({ instructions: expect.stringContaining('one short sentence') }),
      }));
      expect(peer.close).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      await act(async () => {
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
      expect(result.current.status).toBe('responding');
      expect(peer.close).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(30_000);
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

  it('continues one output-limited Realtime response and saves the complete combined reply', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_incomplete_continuation',
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
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-continued' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-continued',
          transcript: 'Please give me the full answer.',
        }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'The first part' }));
        jest.mocked(peer.send).mockClear();
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.done',
          response: { status: 'incomplete', status_details: { type: 'incomplete', reason: 'max_output_tokens' } },
        }));
        await Promise.resolve();
      });

      expect(peer.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'response.create' }));
      expect(onError).not.toHaveBeenCalled();

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });
      expect(peer.send).toHaveBeenCalledWith({
        type: 'response.create',
        response: expect.objectContaining({
          output_modalities: ['text'],
          instructions: expect.stringContaining('Continue the previous reply'),
        }),
      });

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'and the final part.' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.done', response: { status: 'completed' } }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });

      expect(onTurnComplete).toHaveBeenCalledWith({
        transcript: 'Please give me the full answer.',
        reply: 'The first part and the final part.',
        language: 'en',
      });
      expect(onTurnComplete).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(result.current.status).toBe('ready');
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('allows two output-limited continuations and then preserves the bounded partial reply', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_incomplete_retry_limit',
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
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-retry-limit' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-retry-limit',
          transcript: 'Please answer fully.',
        }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'First partial.' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.done',
          response: { status: 'incomplete', status_details: { type: 'incomplete', reason: 'max_output_tokens' } },
        }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });
      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'response.create' }));

      jest.mocked(peer.send).mockClear();
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Second partial.' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.done',
          response: { status: 'incomplete', status_details: { type: 'incomplete', reason: 'max_output_tokens' } },
        }));
        await Promise.resolve();
      });

      expect(peer.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'response.create' }));
      expect(onError).not.toHaveBeenCalled();

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });
      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'response.create' }));

      jest.mocked(peer.send).mockClear();
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Third partial.' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.done',
          response: { status: 'incomplete', status_details: { type: 'incomplete', reason: 'max_output_tokens' } },
        }));
        await Promise.resolve();
      });

      expect(peer.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'response.create' }));
      expect(onError).not.toHaveBeenCalled();
      expect(onTurnComplete).toHaveBeenCalledWith({
        transcript: 'Please answer fully.',
        reply: 'First partial. Second partial. Third partial.',
        language: 'en',
      });

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });
      expect(result.current.status).toBe('ready');
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('rejects a safety-filtered incomplete Realtime response instead of retrying or saving partial output', async () => {
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
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.done',
          response: { status: 'incomplete', status_details: { type: 'incomplete', reason: 'content_filter' } },
        }));
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

  it('fails the pending connection attempt when the service reports an error during configuration', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_configuration_error',
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
      expect(result.current.status).toBe('connecting');

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'error', error: { message: 'The session configuration was rejected.' } }));
        await expect(start).rejects.toThrow('The session configuration was rejected.');
      });

      expect(result.current.status).toBe('disconnected');
      expect(peer.close).toHaveBeenCalledTimes(1);
      expect(peer.setMicrophoneEnabled).not.toHaveBeenCalledWith(true);
      expect(onError).not.toHaveBeenCalled();
    } finally {
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

  it('unlocks the session without saving a turn when transcription completes empty', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_empty_transcript',
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

    try {
      let start!: Promise<void>;
      await act(() => {
        start = result.current.startTurn();
      });
      await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await start;
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-empty-transcript' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Reply that should not be saved.' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.done', response: { status: 'completed' } }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });
      expect(result.current.status).toBe('responding');

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-empty-transcript',
          transcript: '   ',
        }));
        await Promise.resolve();
      });

      expect(onError).toHaveBeenCalledWith(expect.stringContaining('could not hear'));
      expect(onTurnComplete).not.toHaveBeenCalled();
      expect(result.current.status).toBe('ready');
    } finally {
      await unmount();
    }
  });

  it('unlocks the session without saving a turn when input transcription fails', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_failed_transcript',
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

    try {
      let start!: Promise<void>;
      await act(() => {
        start = result.current.startTurn();
      });
      await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await start;
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-failed-transcript' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.created' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Reply that should not be saved.' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.done', response: { status: 'completed' } }));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });
      expect(result.current.status).toBe('responding');

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.failed',
          item_id: 'input-failed-transcript',
          error: { message: 'Transcription failed.' },
        }));
        await Promise.resolve();
      });

      expect(onError).toHaveBeenCalledWith('Transcription failed.');
      expect(onTurnComplete).not.toHaveBeenCalled();
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
