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

function expectDefined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected the value to be defined.');
  return value;
}

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

type ResponseEventOptions = {
  attempt?: number;
  id?: string;
  status?: string;
  statusDetails?: {
    error?: { message?: string };
    reason?: string;
    type?: string;
  };
  turn?: number;
};

function responseIdentity({ attempt = 1, id, turn = 1 }: ResponseEventOptions = {}) {
  return {
    id: id ?? `response-${turn}-${attempt}`,
    metadata: {
      bolo_attempt: String(attempt),
      bolo_turn: String(turn),
    },
  };
}

function responseCreatedEvent(options: ResponseEventOptions = {}) {
  return {
    type: 'response.created',
    response: {
      ...responseIdentity(options),
      status: 'in_progress',
    },
  };
}

function responseDoneEvent(options: ResponseEventOptions = {}) {
  return {
    type: 'response.done',
    response: {
      ...responseIdentity(options),
      status: options.status ?? 'completed',
      ...(options.statusDetails ? { status_details: options.statusDetails } : {}),
    },
  };
}

function finishRecordedTurn(result: { current: { finishTurn: () => void } }) {
  const later = Date.now() + 1_500;
  const now = jest.spyOn(Date, 'now').mockReturnValue(later);
  try {
    result.current.finishTurn();
  } finally {
    now.mockRestore();
  }
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
        now.mockReturnValue(2_000);
        await result.current.finishTurn();
        expect(peer.send).toHaveBeenCalledWith({ type: 'input_audio_buffer.commit' });
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-canonical' }));
        expect(peer.send).toHaveBeenCalledWith({
          type: 'response.create',
          response: expect.objectContaining({ output_modalities: ['text'] }),
        });
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-canonical',
          transcript: 'Say hello.',
        }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_text.delta', delta: 'नमस्ते' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_text.done', text: 'नमस्ते!' }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent()));
        await Promise.resolve();
      });

      expect(speakTextMock).toHaveBeenCalledWith('नमस्ते!', expect.any(AbortSignal), 1, 'hi', 'realtimePlayback');
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

      setAudioModeMock.mockClear();
      jest.mocked(peer.setMicrophoneEnabled).mockClear();
      await act(async () => {
        await result.current.startTurn();
      });

      expect(setAudioModeMock).not.toHaveBeenCalled();
      expect(peer.setMicrophoneEnabled).toHaveBeenCalledWith(true);
      expect(result.current.status).toBe('recording');
    } finally {
      now.mockRestore();
      await unmount();
    }
  });

  it('waits for committed microphone audio and recovers cleanly when Realtime receives none', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_empty_input',
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
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);

    try {
      let start!: Promise<void>;
      await act(() => {
        start = result.current.startTurn();
      });
      await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await start;
        jest.mocked(peer.send).mockClear();
        now.mockReturnValue(2_000);
        await result.current.finishTurn();
      });

      expect(peer.send).toHaveBeenCalledWith({ type: 'input_audio_buffer.commit' });
      expect(peer.send).not.toHaveBeenCalledWith({ type: 'response.create', response: { output_modalities: ['text'] } });

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({
          type: 'error',
          error: { message: 'Error committing input audio buffer: buffer too small. Expected at least 100ms of audio, but buffer only has 0.00ms of audio.' },
        }));
        await Promise.resolve();
      });

      expect(onError).toHaveBeenCalledWith('I didn’t receive enough audio. Speak for at least a second, then tap the orb again to send.');
      expect(peer.send).toHaveBeenCalledWith({ type: 'input_audio_buffer.clear' });
      expect(result.current.status).toBe('ready');
    } finally {
      now.mockRestore();
      await unmount();
    }
  });

  it('restores the recording-capable speaker route after WebRTC initializes', async () => {
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
      expect(setAudioModeMock).toHaveBeenCalledTimes(2);
      expect(setAudioModeMock).toHaveBeenNthCalledWith(1, speakerMode);
      expect(setAudioModeMock).toHaveBeenNthCalledWith(2, speakerMode);

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await start;
        await Promise.resolve();
      });

      expect(setAudioModeMock).toHaveBeenLastCalledWith(speakerMode);
      expect(setAudioModeMock.mock.calls.filter(([mode]) => (
        mode.allowsRecording === true && mode.shouldRouteThroughEarpiece === false
      ))).toHaveLength(2);
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
    const firstSignal = expectDefined(createSecretMock.mock.calls[0])[1];

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
    const signal = expectDefined(createSecretMock.mock.calls[0])[1];

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
      const delayCycle = [500, 2_000, 5_000] as const;
      const delays = Array.from({ length: 12 }, (_, index) => delayCycle[index % 3] ?? delayCycle[0]);
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
          finishRecordedTurn(result);
          peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: itemId }));
          if (index > 0) {
            peerOptions?.onMessage(JSON.stringify({
              type: 'conversation.item.input_audio_transcription.completed',
              item_id: `input-turn-${index}`,
              transcript: 'Stale transcript that must be ignored.',
            }));
          }
          peerOptions?.onMessage(JSON.stringify(responseCreatedEvent({ turn })));
          peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
          peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: reply }));
          peerOptions?.onMessage(JSON.stringify(responseDoneEvent({ turn })));
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

  it('completes twenty correlated text-only voice turns with canonical audio every time', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_twenty_turn_endurance',
      expires_at: Math.floor(Date.now() / 1000) + 600,
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
    let clock = 10_000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);

    try {
      let firstStart!: Promise<void>;
      await act(() => {
        firstStart = result.current.startTurn();
      });
      await waitFor(() => expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'session.update' })));
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'session.updated' }));
        await firstStart;
      });

      let previousResponseId: string | null = null;
      for (let index = 0; index < 20; index += 1) {
        const turn = index + 1;
        const itemId = `input-endurance-${turn}`;
        const responseId = `resp-endurance-${turn}`;
        const transcript = `Learner endurance turn ${turn}.`;
        const reply = `Asha endurance reply ${turn}.`;
        const metadata = { bolo_turn: String(turn), bolo_attempt: '1' };

        if (index > 0) {
          clock += 100;
          await act(async () => {
            await result.current.startTurn();
          });
          expect(result.current.status).toBe('recording');
        }

        if (previousResponseId) {
          await act(async () => {
            peerOptions?.onMessage(JSON.stringify({
              type: 'response.created',
              response: { id: previousResponseId, status: 'in_progress' },
            }));
            peerOptions?.onMessage(JSON.stringify({
              type: 'response.output_text.done',
              response_id: previousResponseId,
              text: 'A metadata-free stale reply that must not play.',
            }));
            peerOptions?.onMessage(JSON.stringify({
              type: 'response.done',
              response: { id: previousResponseId, status: 'completed' },
            }));
            await Promise.resolve();
          });
          expect(result.current.status).toBe('recording');
        }

        clock += 1_500;
        await act(async () => {
          result.current.finishTurn();
          if (previousResponseId) {
            const staleMetadata = { bolo_turn: String(turn - 1), bolo_attempt: '1' };
            peerOptions?.onMessage(JSON.stringify({
              type: 'response.created',
              response: { id: previousResponseId, metadata: staleMetadata, status: 'in_progress' },
            }));
            peerOptions?.onMessage(JSON.stringify({
              type: 'response.output_text.done',
              response_id: previousResponseId,
              text: 'A stale reply that must not play.',
            }));
            peerOptions?.onMessage(JSON.stringify({
              type: 'response.done',
              response: { id: previousResponseId, metadata: staleMetadata, status: 'completed' },
            }));
          }
          peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: itemId }));
          peerOptions?.onMessage(JSON.stringify({
            type: 'response.created',
            response: { id: responseId, metadata, status: 'in_progress' },
          }));
          peerOptions?.onMessage(JSON.stringify({
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: itemId,
            transcript,
          }));
          peerOptions?.onMessage(JSON.stringify({
            type: 'response.output_text.delta',
            response_id: responseId,
            delta: reply.slice(0, 10),
          }));
          peerOptions?.onMessage(JSON.stringify({
            type: 'response.output_text.done',
            response_id: responseId,
            text: reply,
          }));
          peerOptions?.onMessage(JSON.stringify({
            type: 'response.done',
            response: { id: responseId, metadata, status: 'completed' },
          }));
          await Promise.resolve();
          await Promise.resolve();
        });

        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(onTurnComplete).toHaveBeenCalledTimes(turn);
        expect(onTurnComplete).toHaveBeenLastCalledWith({ transcript, reply, language: 'en' });
        expect(speakTextMock).toHaveBeenCalledTimes(turn);
        expect(speakTextMock).toHaveBeenLastCalledWith(
          reply,
          expect.any(AbortSignal),
          1,
          'en',
          'realtimePlayback',
        );
        expect(onError).not.toHaveBeenCalled();
        previousResponseId = responseId;
      }

      expect(jest.mocked(peer.setMicrophoneEnabled).mock.calls).toEqual(
        Array.from({ length: 20 }, () => [[true], [false]]).flat(),
      );
      expect(jest.mocked(peer.send).mock.calls.filter(([event]) => event.type === 'response.create')).toHaveLength(20);
    } finally {
      now.mockRestore();
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
        finishRecordedTurn(result);
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
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-hindi' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-hindi',
          transcript: 'Namaste, Asha.',
        }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 'आप कैसे' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: ' हैं?' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.output_audio_transcript.done',
          transcript: 'आप कैसे हैं?',
        }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent()));
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-delayed-failure' }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent({
          status: 'incomplete',
          statusDetails: { reason: 'content_filter' },
        })));
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-stalled-response' }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        jest.advanceTimersByTime(45_000);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('responding');
      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'response.cancel',
        response_id: 'response-1-1',
        event_id: expect.any(String),
      }));
      expect(jest.mocked(peer.send).mock.calls.filter(([event]) => event.type === 'response.create')).toHaveLength(1);
      expect(peer.close).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent({ status: 'cancelled' })));
        await Promise.resolve();
      });

      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'response.create',
        response: expect.objectContaining({ instructions: expect.stringContaining('one short sentence') }),
      }));

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
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent()));
        await Promise.resolve();
      });
      expect(onTurnComplete).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('ignores the expected cancellation completion while a watchdog retry succeeds', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_correlated_watchdog_retry',
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
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);

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
      now.mockReturnValue(2_500);
      result.current.finishTurn();
      peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-watchdog-retry' }));
      peerOptions?.onMessage(JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'input-watchdog-retry',
        transcript: 'Please retry this response.',
      }));
      peerOptions?.onMessage(JSON.stringify({
        type: 'response.created',
        response: { id: 'resp-watchdog-original', metadata: { bolo_turn: '1', bolo_attempt: '1' }, status: 'in_progress' },
      }));
      });

      await act(async () => {
        jest.advanceTimersByTime(45_000);
        await Promise.resolve();
      });

      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'response.cancel',
        response_id: 'resp-watchdog-original',
        event_id: expect.any(String),
      }));
      expect(jest.mocked(peer.send).mock.calls.filter(([event]) => event.type === 'response.create')).toHaveLength(1);
      expect(result.current.status).toBe('responding');

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.done',
          response: {
            id: 'resp-watchdog-original',
            metadata: { bolo_turn: '1', bolo_attempt: '1' },
            status: 'cancelled',
          },
        }));
        await Promise.resolve();
      });

      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'response.create',
        response: expect.objectContaining({
          metadata: { bolo_turn: '1', bolo_attempt: '2' },
        }),
      }));

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.created',
          response: { id: 'resp-watchdog-retry', metadata: { bolo_turn: '1', bolo_attempt: '2' }, status: 'in_progress' },
        }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.output_text.done',
          response_id: 'resp-watchdog-retry',
          text: 'The retry completed.',
        }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.done',
          response: {
            id: 'resp-watchdog-retry',
            metadata: { bolo_turn: '1', bolo_attempt: '2' },
            status: 'completed',
          },
        }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(onError).not.toHaveBeenCalled();
      expect(onTurnComplete).toHaveBeenCalledWith({
        transcript: 'Please retry this response.',
        reply: 'The retry completed.',
        language: 'en',
      });
      expect(speakTextMock).toHaveBeenCalledWith(
        'The retry completed.',
        expect.any(AbortSignal),
        1,
        'en',
        'realtimePlayback',
      );
      expect(result.current.status).toBe('ready');
    } finally {
      jest.useRealTimers();
      now.mockRestore();
      await unmount();
    }
  });

  it('waits for an id-less cancellation rejection before starting a watchdog retry', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_idless_watchdog_retry',
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-idless-retry' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-idless-retry',
          transcript: 'Retry without a response ID.',
        }));
        jest.advanceTimersByTime(45_000);
        await Promise.resolve();
      });

      const cancellationEvent = jest.mocked(peer.send).mock.calls
        .map(([event]) => event)
        .find((event) => event.type === 'response.cancel') as {
          event_id?: string;
          response_id?: string;
          type?: string;
        } | undefined;
      expect(cancellationEvent).toEqual(expect.objectContaining({
        type: 'response.cancel',
        event_id: expect.any(String),
      }));
      expect(cancellationEvent).not.toHaveProperty('response_id');
      expect(jest.mocked(peer.send).mock.calls.filter(([event]) => event.type === 'response.create')).toHaveLength(1);

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({
          type: 'error',
          error: {
            event_id: cancellationEvent?.event_id,
            message: 'No active response found to cancel.',
          },
        }));
        await Promise.resolve();
      });

      expect(jest.mocked(peer.send).mock.calls.filter(([event]) => event.type === 'response.create')).toHaveLength(2);
      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'response.create',
        response: expect.objectContaining({
          metadata: { bolo_turn: '1', bolo_attempt: '2' },
        }),
      }));
      expect(onError).not.toHaveBeenCalled();
      expect(result.current.status).toBe('responding');
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('fails closed when a response cancellation is not acknowledged', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_cancel_timeout',
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-cancel-timeout' }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent({ id: 'resp-cancel-timeout' })));
        jest.advanceTimersByTime(45_000);
        await Promise.resolve();
      });

      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'response.cancel',
        response_id: 'resp-cancel-timeout',
        event_id: expect.any(String),
      }));
      expect(jest.mocked(peer.send).mock.calls.filter(([event]) => event.type === 'response.create')).toHaveLength(1);

      await act(async () => {
        jest.advanceTimersByTime(10_000);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('disconnected');
      expect(peer.close).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('did not finish'));
      expect(jest.mocked(peer.send).mock.calls.filter(([event]) => event.type === 'response.create')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('does not extend the cancellation timeout when response.created arrives after an id-less cancel', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_late_response_id_cancel_timeout',
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-late-response-id' }));
        jest.advanceTimersByTime(45_000);
        await Promise.resolve();
      });

      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'response.cancel',
        event_id: expect.any(String),
      }));
      await act(async () => {
        jest.advanceTimersByTime(5_000);
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent({ id: 'resp-late-cancel-id' })));
        await Promise.resolve();
      });
      expect(result.current.status).toBe('responding');

      await act(async () => {
        jest.advanceTimersByTime(5_000);
        await Promise.resolve();
      });

      expect(result.current.status).toBe('disconnected');
      expect(peer.close).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('did not finish'));
      expect(jest.mocked(peer.send).mock.calls.filter(([event]) => event.type === 'response.create')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('uses a real completion that wins the cancellation race without creating a duplicate retry', async () => {
    const peer = createPeer();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_cancel_completion_race',
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-cancel-race' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-cancel-race',
          transcript: 'Let the original answer finish.',
        }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent({ id: 'resp-cancel-race' })));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.output_text.done',
          response_id: 'resp-cancel-race',
          text: 'The original response completed.',
        }));
        jest.advanceTimersByTime(45_000);
        await Promise.resolve();
      });

      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({
        type: 'response.cancel',
        response_id: 'resp-cancel-race',
      }));
      const cancellationEvent = jest.mocked(peer.send).mock.calls
        .map(([event]) => event)
        .find((event) => event.type === 'response.cancel') as { event_id?: string } | undefined;
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({
          type: 'error',
          error: {
            event_id: cancellationEvent?.event_id,
            message: 'No active response found to cancel.',
          },
        }));
        await Promise.resolve();
      });
      expect(result.current.status).toBe('responding');
      expect(onError).not.toHaveBeenCalled();

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent({ id: 'resp-cancel-race' })));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(jest.mocked(peer.send).mock.calls.filter(([event]) => event.type === 'response.create')).toHaveLength(1);
      expect(speakTextMock).toHaveBeenCalledWith(
        'The original response completed.',
        expect.any(AbortSignal),
        1,
        'en',
        'realtimePlayback',
      );
      expect(onTurnComplete).toHaveBeenCalledWith({
        transcript: 'Let the original answer finish.',
        reply: 'The original response completed.',
        language: 'en',
      });
      const microphoneCallCount = jest.mocked(peer.setMicrophoneEnabled).mock.calls.length;
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({
          type: 'error',
          error: {
            event_id: cancellationEvent?.event_id,
            message: 'No active response found to cancel.',
          },
        }));
        await Promise.resolve();
      });
      expect(onError).not.toHaveBeenCalled();
      expect(peer.setMicrophoneEnabled).toHaveBeenCalledTimes(microphoneCallCount);
      expect(result.current.status).toBe('ready');
    } finally {
      jest.useRealTimers();
      await unmount();
    }
  });

  it('aborts canonical speech when the remote WebRTC connection closes', async () => {
    const peer = createPeer();
    const playback = deferred<void>();
    let peerOptions: RealtimePeerOptions | undefined;
    createSecretMock.mockResolvedValue({
      value: 'ek_remote_close_during_tts',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    createPeerMock.mockImplementation(async (options) => {
      peerOptions = options;
      return peer;
    });
    speakTextMock.mockReturnValue(playback.promise);
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-remote-close' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-remote-close',
          transcript: 'Keep speaking until disconnect.',
        }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_text.done', text: 'This playback will be interrupted.' }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent()));
        await Promise.resolve();
      });
      const playbackSignal = speakTextMock.mock.calls.at(-1)?.[1];
      expect(playbackSignal?.aborted).toBe(false);

      await act(async () => {
        peerOptions?.onClose();
        await Promise.resolve();
      });

      expect(playbackSignal?.aborted).toBe(true);
      expect(result.current.status).toBe('disconnected');
      expect(onError).toHaveBeenCalledWith('The live voice connection closed. Start a new session to continue.');
      playback.resolve();
      await act(async () => {
        await Promise.resolve();
      });
      expect(onTurnComplete).not.toHaveBeenCalled();
    } finally {
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-stalled-output' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-stalled-output',
          transcript: 'My complete input.',
        }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'response.output_audio_transcript.done',
          transcript: 'The complete reply.',
        }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent()));
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-continued' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-continued',
          transcript: 'Please give me the full answer.',
        }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'The first part' }));
        jest.mocked(peer.send).mockClear();
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent({
          status: 'incomplete',
          statusDetails: { type: 'incomplete', reason: 'max_output_tokens' },
        })));
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
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent({ attempt: 2 })));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'and the final part.' }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent({ attempt: 2 })));
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

  it('continues past two output-limited responses instead of speaking a partial reply', async () => {
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-retry-limit' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-retry-limit',
          transcript: 'Please answer fully.',
        }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'First partial.' }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent({
          status: 'incomplete',
          statusDetails: { type: 'incomplete', reason: 'max_output_tokens' },
        })));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });
      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'response.create' }));

      jest.mocked(peer.send).mockClear();
      await act(async () => {
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent({ attempt: 2 })));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Second partial.' }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent({
          attempt: 2,
          status: 'incomplete',
          statusDetails: { type: 'incomplete', reason: 'max_output_tokens' },
        })));
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
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent({ attempt: 3 })));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Third partial.' }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent({
          attempt: 3,
          status: 'incomplete',
          statusDetails: { type: 'incomplete', reason: 'max_output_tokens' },
        })));
        await Promise.resolve();
      });

      expect(peer.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'response.create' }));
      expect(onError).not.toHaveBeenCalled();
      expect(onTurnComplete).not.toHaveBeenCalled();

      await act(async () => {
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
        await Promise.resolve();
      });
      expect(peer.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'response.create' }));
      expect(result.current.status).toBe('responding');
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-incomplete' }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Partial output' }));
        jest.mocked(peer.send).mockClear();
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent({
          status: 'incomplete',
          statusDetails: { type: 'incomplete', reason: 'content_filter' },
        })));
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-output-error' }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-waiting' }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Reply waiting.' }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent()));
        await Promise.resolve();
      });

      expect(result.current.status).toBe('responding');
      const microphoneCallCount = jest.mocked(peer.setMicrophoneEnabled).mock.calls.length;
      await act(async () => {
        await result.current.startTurn();
      });
      expect(result.current.status).toBe('responding');
      expect(peer.setMicrophoneEnabled).toHaveBeenCalledTimes(microphoneCallCount);

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
      expect(peer.setMicrophoneEnabled).toHaveBeenCalledTimes(microphoneCallCount + 1);
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-audio-drain' }));
        peerOptions?.onMessage(JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: 'input-audio-drain',
          transcript: 'Play the full reply.',
        }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Full spoken reply.' }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent()));
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-empty-transcript' }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Reply that should not be saved.' }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent()));
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
        finishRecordedTurn(result);
        peerOptions?.onMessage(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'input-failed-transcript' }));
        peerOptions?.onMessage(JSON.stringify(responseCreatedEvent()));
        peerOptions?.onMessage(JSON.stringify({ type: 'output_audio_buffer.started' }));
        peerOptions?.onMessage(JSON.stringify({ type: 'response.output_audio_transcript.done', transcript: 'Reply that should not be saved.' }));
        peerOptions?.onMessage(JSON.stringify(responseDoneEvent()));
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
