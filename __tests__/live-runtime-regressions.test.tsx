import { act, fireEvent, render } from '@testing-library/react-native';
import * as mockReact from 'react';
import { Alert, Animated, AppState, Dimensions, FlatList, Pressable as MockPressable, StyleSheet, Text as MockText } from 'react-native';

import LiveScreen from '../src/app/live';
import { LiveTranslationRecorder } from '../src/components/live-translation-recorder';

const mockRouterBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockRouterBack }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('expo-audio', () => {
  let onBuffer: ((buffer: { channels: number; data: ArrayBuffer; sampleRate: number; timestamp: number }) => void) | undefined;
  const stream = {
    isStreaming: false,
    start: jest.fn(async () => {
      stream.isStreaming = true;
    }),
    stop: jest.fn(() => {
      stream.isStreaming = false;
    }),
  };

  return {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    setAudioModeAsync: jest.fn(async () => undefined),
    useAudioStream: jest.fn((options: { onBuffer?: typeof onBuffer }) => {
      onBuffer = options.onBuffer;
      return { isStreaming: stream.isStreaming, stream };
    }),
    __emitAudio: (data = new Int16Array([1, 2, 3, 4])) => onBuffer?.({
      channels: 1,
      data: data.buffer,
      sampleRate: 16_000,
      timestamp: 0,
    }),
    __mockStream: stream,
  };
});

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    base64: jest.fn(async () => 'YXVkaW8='),
    delete: jest.fn(),
    exists: true,
    type: 'audio/mp4',
    uri,
  })),
}));

jest.mock('lucide-react-native', () => ({
  ArrowDown: () => null,
  ArrowLeft: () => null,
  Check: () => null,
  Flag: () => null,
  Languages: () => null,
  MessageCircle: () => null,
  Mic: () => null,
  Send: () => null,
  Sparkles: () => null,
  Square: () => null,
  Trash2: () => null,
  Volume2: () => null,
}));

jest.mock('@/components/ai-consent-gate', () => {
  return {
    AiConsentGate: ({ children }: { children: never }) => mockReact.createElement(mockReact.Fragment, null, children),
  };
});

jest.mock('@/components/realtime-voice-button', () => {
  return {
    RealtimeVoiceButton: ({
      onStatusChange,
      onTurnComplete,
      responseLanguage,
    }: {
      onStatusChange?: (status: 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding') => void;
      onTurnComplete: (turn: { transcript: string; reply: string; language: 'en' | 'hi' }) => void;
      responseLanguage: 'en' | 'hi';
    }) => mockReact.createElement(
      mockReact.Fragment,
      null,
      mockReact.createElement(MockText, { testID: 'mock-realtime-language' }, responseLanguage),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Create Mira reply',
          onPress: () => onTurnComplete({ transcript: 'Namaste', reply: 'Hello there.', language: 'en' }),
        },
        mockReact.createElement(MockText, null, 'Create reply'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock realtime connecting',
          onPress: () => onStatusChange?.('connecting'),
        },
        mockReact.createElement(MockText, null, 'Mock connecting'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock realtime ready',
          onPress: () => onStatusChange?.('ready'),
        },
        mockReact.createElement(MockText, null, 'Mock ready'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock realtime recording',
          onPress: () => onStatusChange?.('recording'),
        },
        mockReact.createElement(MockText, null, 'Mock recording'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock realtime responding',
          onPress: () => onStatusChange?.('responding'),
        },
        mockReact.createElement(MockText, null, 'Mock responding'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock realtime disconnected',
          onPress: () => onStatusChange?.('disconnected'),
        },
        mockReact.createElement(MockText, null, 'Mock disconnected'),
      ),
    ),
  };
});

jest.mock('@/hooks/use-foreground-timer', () => ({
  useForegroundTimer: () => ({ elapsedSeconds: () => 0 }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

let mockAiConsent = true;

jest.mock('@/state/app-state', () => ({
  __appendChatMessagesMock: jest.fn(),
  __clearChatHistoryMock: jest.fn(),
  useAppState: () => {
    const appState = jest.requireMock('@/state/app-state') as {
      __appendChatMessagesMock: jest.Mock;
      __clearChatHistoryMock: jest.Mock;
    };
    const [chatHistory, setChatHistory] = mockReact.useState<
      { id: string; role: 'you' | 'mira'; text: string; language?: 'en' | 'hi' }[]
    >([]);
    const appendChatMessages = mockReact.useCallback((messages: typeof chatHistory) => {
      appState.__appendChatMessagesMock(messages);
      setChatHistory((current) => [...current, ...messages].slice(-100));
    }, []);
    const clearChatHistory = mockReact.useCallback(() => {
      appState.__clearChatHistoryMock();
      setChatHistory([]);
    }, []);
    return {
      addPracticeSeconds: jest.fn(),
      aiConsent: mockAiConsent,
      appendChatMessages,
      chatHistory,
      clearChatHistory,
      clientId: 'client-12345678',
      markLiveTurn: jest.fn(),
    };
  },
}));

jest.mock('@/lib/speech', () => ({
  preloadSpeech: jest.fn(async () => undefined),
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('@/services/bolo-api', () => ({
  reportGeneratedMessage: jest.fn(),
  sendMobileChat: jest.fn(),
  translateHindiAudio: jest.fn(),
}));

const expoAudio = jest.requireMock('expo-audio') as {
  __emitAudio: (data?: Int16Array) => void;
  __mockStream: {
    isStreaming: boolean;
    start: jest.Mock;
    stop: jest.Mock;
  };
  requestRecordingPermissionsAsync: jest.Mock;
  setAudioModeAsync: jest.Mock;
};
const boloApi = jest.requireMock('@/services/bolo-api') as {
  reportGeneratedMessage: jest.Mock;
  sendMobileChat: jest.Mock;
  translateHindiAudio: jest.Mock;
};
const speech = jest.requireMock('@/lib/speech') as {
  preloadSpeech: jest.Mock;
  speakText: jest.Mock;
  stopSpeaking: jest.Mock;
};
const appState = jest.requireMock('@/state/app-state') as {
  __appendChatMessagesMock: jest.Mock;
  __clearChatHistoryMock: jest.Mock;
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  });
}

type FiberNode = {
  memoizedProps?: Record<string, unknown>;
  return: FiberNode | null;
};

function getOnPress(instance: unknown) {
  let fiber: FiberNode | null | undefined = (instance as { unstable_fiber?: FiberNode }).unstable_fiber;
  while (fiber) {
    const onPress = fiber.memoizedProps?.onPress;
    if (typeof onPress === 'function') return onPress as () => void;
    fiber = fiber.return;
  }
  throw new Error('The rendered element does not have an onPress callback.');
}

describe('live consent layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAiConsent = false;
  });

  afterEach(() => {
    mockAiConsent = true;
    jest.restoreAllMocks();
  });

  it('keeps the disclosure at the top instead of scrolling to the welcome message', async () => {
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const view = await render(<LiveScreen />);
    const list = view.getByTestId('live-chat-list');

    await act(async () => {
      list.props.onContentSizeChange();
      await Promise.resolve();
    });

    expect(scrollToEnd).not.toHaveBeenCalled();
    await view.unmount();
  }, 20_000);
});

describe('immersive live conversation design', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the voice-first hierarchy from the supplied design without hiding typed coaching', async () => {
    const view = await render(<LiveScreen />);
    const hero = view.getByTestId('voice-conversation-hero');

    expect(StyleSheet.flatten(hero.props.style).backgroundColor).toBe('#0D1513');
    expect(view.getByText('Conversational Hindi coach · English replies')).toBeTruthy();
    expect(view.getByText('Start speaking')).toBeTruthy();
    expect(view.getByText('Start speaking').props.accessibilityLiveRegion).toBe('polite');
    expect(view.queryByText('Tap the orb and ask anything in Hindi.')).toBeNull();
    expect(view.queryByText('Live Mira caption')).toBeNull();
    expect(view.queryByLabelText('Open text phrase help')).toBeNull();
    expect(view.getByText('Ask Mira')).toBeTruthy();
    expect(view.getByText('How do I say…?')).toBeTruthy();
    expect(view.getByLabelText('Open chat history')).toBeTruthy();

    const sheet = view.getByTestId('ask-mira-sheet');
    const sheetStyle = StyleSheet.flatten(sheet.props.style);
    expect(sheetStyle.marginTop).toBeLessThan(0);
    expect(sheetStyle.borderTopLeftRadius).toBeGreaterThanOrEqual(30);
    expect(view.getByTestId('ask-mira-sheet-handle')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    expect(view.getByText('Connecting to Mira…')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime recording'));
    expect(view.getByText('Listening to your Hindi…')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime responding'));
    expect(view.getByText('Mira is preparing your English reply…')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.queryByText('Live Mira caption')).toBeNull();

    await fireEvent.press(view.getByLabelText('Create Mira reply'));
    expect(view.getByText('Live Mira caption')).toBeTruthy();
    expect(view.getAllByText('Hello there.').length).toBeGreaterThan(0);

    await fireEvent.press(view.getByLabelText('Go back'));
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(view.getByLabelText('Message Mira')).toBeTruthy();

    await view.unmount();
    await flushMicrotasks();
  });

  it('keeps the live caption mounted from connection through the ready state', async () => {
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    expect(view.getByText('Live Mira caption')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    expect(view.getByText('Live Mira caption')).toBeTruthy();
    expect(view.getByText('Captions appear after your first turn.')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.queryByText('Live Mira caption')).toBeNull();

    await view.unmount();
    await flushMicrotasks();
  });

  it('compresses the raised sheet header on short iPhones so the title remains above the composer', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    const compactSize = { fontScale: 1, height: 667, scale: 1, width: 375 };
    await act(async () => {
      Dimensions.set({ screen: compactSize, window: compactSize });
      await Promise.resolve();
    });
    try {
      const view = await render(<LiveScreen />);
      const heroStyle = StyleSheet.flatten(view.getByTestId('voice-conversation-hero').props.style);
      const sheetStyle = StyleSheet.flatten(view.getByTestId('ask-mira-sheet').props.style);
      const headingStyle = StyleSheet.flatten(view.getByTestId('ask-mira-heading').props.style);

      expect(heroStyle.gap).toBe(4);
      expect(sheetStyle.gap).toBe(4);
      expect(sheetStyle.paddingTop).toBe(4);
      expect(headingStyle.gap).toBe(0);
      await view.unmount();
      await flushMicrotasks();
    } finally {
      await act(async () => {
        Dimensions.set({ screen: originalScreen, window: originalWindow });
        await Promise.resolve();
      });
    }
  });
});

describe('live translation retry control', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    expoAudio.__mockStream.isStreaming = false;
    expoAudio.requestRecordingPermissionsAsync.mockResolvedValue({ granted: true });
    expoAudio.setAudioModeAsync.mockResolvedValue(undefined);
    boloApi.translateHindiAudio.mockRejectedValue(new Error('Translation service unavailable.'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('backs off exponentially and returns to idle after four consecutive failures', async () => {
    const view = await render(<LiveTranslationRecorder onTranslation={jest.fn()} />);
    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();

    for (let segment = 0; segment < 4; segment += 1) {
      expoAudio.__emitAudio();
      await advance(3_600);
    }
    await flushMicrotasks();
    expect(boloApi.translateHindiAudio).toHaveBeenCalledTimes(4);
    expect(view.getByLabelText('Start live translation')).toBeTruthy();
    expect(view.getByText('Ready for Hindi speech')).toBeTruthy();
    expect(view.getByText('Live translation stopped after repeated errors. Check your connection, then start again.')).toBeTruthy();

    await advance(30_000);
    expect(boloApi.translateHindiAudio).toHaveBeenCalledTimes(4);
    await view.unmount();
    await flushMicrotasks();
  });

  it('retries the same audio segment after a transient translation failure', async () => {
    const onTranslation = jest.fn();
    boloApi.translateHindiAudio
      .mockRejectedValueOnce(new Error('Temporary translation failure.'))
      .mockResolvedValueOnce({ english: 'Recovered segment.' });
    const view = await render(<LiveTranslationRecorder onTranslation={onTranslation} />);
    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();

    expoAudio.__emitAudio();
    await advance(3_600);
    expect(boloApi.translateHindiAudio).toHaveBeenCalledTimes(1);

    await advance(500);
    expect(boloApi.translateHindiAudio).toHaveBeenCalledTimes(2);
    expect(onTranslation).toHaveBeenCalledWith('Recovered segment.');

    await fireEvent.press(view.getByLabelText('Stop live translation'));
    await flushMicrotasks();
    await view.unmount();
  });

  it('exposes a disabled starting state and allows only one pending permission flow', async () => {
    const permission = deferred<{ granted: boolean }>();
    expoAudio.requestRecordingPermissionsAsync.mockReturnValue(permission.promise);
    const view = await render(<LiveTranslationRecorder onTranslation={jest.fn()} />);
    const start = view.getByLabelText('Start live translation');

    await fireEvent.press(start);
    await flushMicrotasks();
    const starting = view.getByLabelText('Starting live translation');
    expect(starting.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(view.getByText('Starting\u2026')).toBeTruthy();
    expect(view.getByText('Starting live translation\u2026')).toBeTruthy();
    await fireEvent.press(starting);
    expect(expoAudio.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      permission.resolve({ granted: true });
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(expoAudio.__mockStream.start).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByLabelText('Stop live translation'));
    await flushMicrotasks();
    await view.unmount();
  });

  it('waits for active after a transient inactive microphone permission prompt', async () => {
    const permission = deferred<{ granted: boolean }>();
    let appStateListener: ((state: 'active' | 'background' | 'inactive' | 'unknown' | 'extension') => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    expoAudio.requestRecordingPermissionsAsync.mockReturnValue(permission.promise);
    const view = await render(<LiveTranslationRecorder onTranslation={jest.fn()} />);

    await fireEvent.press(view.getByLabelText('Start live translation'));
    await act(async () => {
      appStateListener?.('inactive');
      permission.resolve({ granted: true });
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });

    expect(expoAudio.__mockStream.start).not.toHaveBeenCalled();
    expect(view.getByLabelText('Starting live translation').props.accessibilityState).toEqual({ busy: true, disabled: true });

    await act(async () => {
      appStateListener?.('active');
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(expoAudio.__mockStream.start).toHaveBeenCalledTimes(1);
    expect(view.getByLabelText('Stop live translation')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Stop live translation'));
    await flushMicrotasks();
    await view.unmount();
  });

  it('invalidates a pending start when permission resolves after backgrounding', async () => {
    const permission = deferred<{ granted: boolean }>();
    let appStateListener: ((state: 'active' | 'background' | 'inactive' | 'unknown' | 'extension') => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    expoAudio.requestRecordingPermissionsAsync.mockReturnValue(permission.promise);
    const view = await render(<LiveTranslationRecorder onTranslation={jest.fn()} />);

    await fireEvent.press(view.getByLabelText('Start live translation'));
    await act(async () => {
      appStateListener?.('background');
      permission.resolve({ granted: true });
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });

    expect(expoAudio.setAudioModeAsync.mock.calls.some(([mode]) => mode.allowsRecording === true)).toBe(false);
    expect(expoAudio.__mockStream.start).not.toHaveBeenCalled();
    expect(view.getByLabelText('Start live translation')).toBeTruthy();
    expect(view.getByText('Live translation stopped when Bolo left the foreground. Start again when you return.')).toBeTruthy();
    await view.unmount();
  });

  it('does not enable recording when permission resolves after unmount', async () => {
    const permission = deferred<{ granted: boolean }>();
    expoAudio.requestRecordingPermissionsAsync.mockReturnValue(permission.promise);
    const view = await render(<LiveTranslationRecorder onTranslation={jest.fn()} />);
    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();

    await view.unmount();
    await act(async () => {
      permission.resolve({ granted: true });
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });

    expect(expoAudio.setAudioModeAsync.mock.calls.some(([mode]) => mode.allowsRecording === true)).toBe(false);
    expect(expoAudio.__mockStream.start).not.toHaveBeenCalled();
  });

  it('clears a rejected translation request before the user stops', async () => {
    let rejectedSignal: AbortSignal | undefined;
    boloApi.translateHindiAudio.mockImplementation((_input: unknown, signal: AbortSignal) => {
      rejectedSignal = signal;
      return Promise.reject(new Error('Translation failed.'));
    });
    const view = await render(<LiveTranslationRecorder onTranslation={jest.fn()} />);
    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();
    expoAudio.__emitAudio();
    await advance(3_600);
    expect(rejectedSignal).toBeDefined();

    await fireEvent.press(view.getByLabelText('Stop live translation'));
    await flushMicrotasks();
    expect(rejectedSignal?.aborted).toBe(false);
    await view.unmount();
  });

  it('resets the failure count after a successful translation', async () => {
    const onTranslation = jest.fn();
    boloApi.translateHindiAudio
      .mockRejectedValueOnce(new Error('First transient failure.'))
      .mockResolvedValueOnce({ english: 'Please wait here.' })
      .mockRejectedValueOnce(new Error('Second transient failure.'))
      .mockResolvedValue({ english: 'The service recovered.' });
    const view = await render(<LiveTranslationRecorder onTranslation={onTranslation} />);
    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();

    expoAudio.__emitAudio();
    await advance(3_600);
    expoAudio.__emitAudio();
    await advance(3_600);
    expect(onTranslation).toHaveBeenCalledWith('Please wait here.');

    expoAudio.__emitAudio();
    await advance(3_600);
    expoAudio.__emitAudio();
    await advance(3_600);
    expect(onTranslation).toHaveBeenLastCalledWith('The service recovered.');

    await fireEvent.press(view.getByLabelText('Stop live translation'));
    await flushMicrotasks();
    await view.unmount();
    await flushMicrotasks();
  });

  it('ignores a valid no-speech segment and translates the next spoken segment without restarting', async () => {
    const onTranslation = jest.fn();
    boloApi.translateHindiAudio
      .mockResolvedValueOnce({ english: '' })
      .mockResolvedValueOnce({ english: 'How are you?' });
    const view = await render(<LiveTranslationRecorder onTranslation={onTranslation} />);
    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();

    expoAudio.__emitAudio();
    await advance(3_600);
    expect(boloApi.translateHindiAudio).toHaveBeenCalledTimes(1);
    expect(onTranslation).not.toHaveBeenCalled();
    expect(view.getByLabelText('Stop live translation')).toBeTruthy();

    expoAudio.__emitAudio();
    await advance(3_600);
    expect(boloApi.translateHindiAudio).toHaveBeenCalledTimes(2);
    expect(onTranslation).toHaveBeenCalledWith('How are you?');
    expect(view.queryByText('Live translation stopped after repeated errors. Check your connection, then start again.')).toBeNull();

    await fireEvent.press(view.getByLabelText('Stop live translation'));
    await flushMicrotasks();
    await view.unmount();
  });

  it('keeps one microphone stream open while thirty seconds of ordered audio waits on a slow request', async () => {
    const firstRequest = deferred<{ english: string }>();
    const onTranslation = jest.fn();
    boloApi.translateHindiAudio
      .mockImplementationOnce(() => firstRequest.promise)
      .mockResolvedValueOnce({ english: 'Segment two.' })
      .mockResolvedValueOnce({ english: 'Segment three.' })
      .mockResolvedValueOnce({ english: 'Segment four.' })
      .mockResolvedValueOnce({ english: 'Segment five.' })
      .mockResolvedValueOnce({ english: 'Segment six.' })
      .mockResolvedValueOnce({ english: 'Segment seven.' })
      .mockResolvedValueOnce({ english: 'Segment eight.' });
    const view = await render(<LiveTranslationRecorder onTranslation={onTranslation} />);
    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();

    for (let segment = 0; segment < 8; segment += 1) {
      expoAudio.__emitAudio(new Int16Array([segment + 1, segment + 2]));
      await advance(3_600);
    }
    expoAudio.__emitAudio(new Int16Array([9, 10]));
    await advance(1_200);

    expect(expoAudio.__mockStream.start).toHaveBeenCalledTimes(1);
    expect(expoAudio.__mockStream.stop).not.toHaveBeenCalled();
    expect(boloApi.translateHindiAudio).toHaveBeenCalledTimes(1);
    const firstPayload = boloApi.translateHindiAudio.mock.calls[0][0] as { audioBase64: string; mimeType: string };
    const wavBytes = Uint8Array.from(atob(firstPayload.audioBase64), (character) => character.charCodeAt(0));
    const wavHeader = new DataView(wavBytes.buffer);
    expect(firstPayload.mimeType).toBe('audio/wav');
    expect(String.fromCharCode(...wavBytes.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wavBytes.subarray(8, 12))).toBe('WAVE');
    expect(wavHeader.getUint16(20, true)).toBe(1);
    expect(wavHeader.getUint16(22, true)).toBe(1);
    expect(wavHeader.getUint32(24, true)).toBe(16_000);

    await act(async () => {
      firstRequest.resolve({ english: 'Segment one.' });
      for (let index = 0; index < 40; index += 1) await Promise.resolve();
    });
    expect(onTranslation.mock.calls.map(([translation]) => translation)).toEqual([
      'Segment one.',
      'Segment two.',
      'Segment three.',
      'Segment four.',
      'Segment five.',
      'Segment six.',
      'Segment seven.',
      'Segment eight.',
    ]);

    await fireEvent.press(view.getByLabelText('Stop live translation'));
    await view.unmount();
  });

  it('stops with an actionable error instead of growing an unbounded slow-request backlog', async () => {
    const firstRequest = deferred<{ english: string }>();
    boloApi.translateHindiAudio.mockImplementationOnce(() => firstRequest.promise);
    const view = await render(<LiveTranslationRecorder onTranslation={jest.fn()} />);
    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();

    for (let segment = 0; segment < 11; segment += 1) {
      expoAudio.__emitAudio();
      await advance(3_600);
    }

    expect(expoAudio.__mockStream.stop).toHaveBeenCalled();
    expect(view.getByText('Live translation fell too far behind. Pause, check your connection, then start again.')).toBeTruthy();
    expect(view.getByLabelText('Start live translation')).toBeTruthy();
    firstRequest.resolve({ english: 'Too late.' });
    await flushMicrotasks();
    await view.unmount();
  });

  it('aborts queued translation work when the user stops', async () => {
    const request = deferred<{ english: string }>();
    let requestSignal: AbortSignal | undefined;
    const onTranslation = jest.fn();
    boloApi.translateHindiAudio.mockImplementation((_input: unknown, signal: AbortSignal) => {
      requestSignal = signal;
      return request.promise;
    });
    const view = await render(<LiveTranslationRecorder onTranslation={onTranslation} />);
    await fireEvent.press(view.getByLabelText('Start live translation'));
    expoAudio.__emitAudio();
    await advance(3_600);

    await fireEvent.press(view.getByLabelText('Stop live translation'));
    expect(requestSignal?.aborted).toBe(true);
    request.resolve({ english: 'Late result.' });
    await flushMicrotasks();
    expect(onTranslation).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('stops capture and aborts translation when the app leaves the foreground', async () => {
    const request = deferred<{ english: string }>();
    let appStateListener: ((state: 'active' | 'background' | 'inactive' | 'unknown' | 'extension') => void) | undefined;
    let requestSignal: AbortSignal | undefined;
    const addEventListener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    boloApi.translateHindiAudio.mockImplementation((_input: unknown, signal: AbortSignal) => {
      requestSignal = signal;
      return request.promise;
    });
    const view = await render(<LiveTranslationRecorder onTranslation={jest.fn()} />);
    await fireEvent.press(view.getByLabelText('Start live translation'));
    expoAudio.__emitAudio();
    await advance(3_600);

    await act(async () => {
      appStateListener?.('background');
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(expoAudio.__mockStream.stop).toHaveBeenCalled();
    expect(view.getByText('Live translation stopped when Bolo left the foreground. Start again when you return.')).toBeTruthy();
    request.resolve({ english: 'Late background result.' });
    await view.unmount();
    addEventListener.mockRestore();
  });
});

describe('generated-message reporting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deduplicates an in-flight report and permits a retry after failure', async () => {
    const firstRequest = deferred<{ reported: true }>();
    boloApi.reportGeneratedMessage
      .mockImplementationOnce(() => firstRequest.promise)
      .mockResolvedValueOnce({ reported: true });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Mira reply'));
    await fireEvent.press(view.getByLabelText(/Report reply:/u));

    const firstReason = (alert.mock.calls[0][2] as { onPress?: () => void }[])[0].onPress;
    await act(async () => {
      firstReason?.();
      firstReason?.();
      await Promise.resolve();
    });

    expect(boloApi.reportGeneratedMessage).toHaveBeenCalledTimes(1);
    expect(view.getByText('Reporting\u2026')).toBeTruthy();

    await act(async () => {
      firstRequest.reject(new Error('Network unavailable.'));
      await firstRequest.promise.catch(() => undefined);
    });
    expect(view.getByText('Report')).toBeTruthy();
    expect(alert).toHaveBeenCalledWith('Could not send report', 'Network unavailable.');

    await fireEvent.press(view.getByLabelText(/Report reply:/u));
    const retryPrompt = alert.mock.calls.findLast(([title]) => title === 'Report Mira\u2019s reply');
    const retryReason = (retryPrompt?.[2] as { onPress?: () => void }[] | undefined)?.[0].onPress;
    await act(async () => {
      retryReason?.();
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });

    expect(boloApi.reportGeneratedMessage).toHaveBeenCalledTimes(2);
    expect(view.getByText('Reported')).toBeTruthy();
    await view.unmount();
    await flushMicrotasks();
    alert.mockRestore();
  }, 20_000);
});

describe('typed live coaching request control', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('announces pending work and the completed Mira reply', async () => {
    const request = deferred<{ transcript: string; reply: string; language: 'en' }>();
    boloApi.sendMobileChat.mockReturnValue(request.promise);
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Mira'), 'Please help with this sentence.');
    await fireEvent.press(view.getByLabelText('Send message'));

    expect(view.getByText('Mira is thinking\u2026').props.accessibilityLiveRegion).toBe('polite');
    await act(async () => {
      request.resolve({ transcript: '', reply: 'Here is an announced correction.', language: 'en' });
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(view.getByText('Here is an announced correction.').props.accessibilityLiveRegion).toBe('polite');
    await view.unmount();
    await flushMicrotasks();
  });

  it('never persists a learner-only turn when the request fails before a reply', async () => {
    boloApi.sendMobileChat.mockRejectedValueOnce(new Error('Mira is unavailable.'));
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Mira'), 'Do not leave this orphaned.');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();

    expect(appState.__appendChatMessagesMock).not.toHaveBeenCalled();
    expect(view.queryByText('Do not leave this orphaned.')).toBeNull();
    expect(view.getByText('Mira is unavailable.').props.accessibilityRole).toBe('alert');
    await view.unmount();
    await flushMicrotasks();
  });

  it('allows one request and persists the completed learner/Mira pair atomically', async () => {
    const request = deferred<{ transcript: string; reply: string; language: 'en' }>();
    boloApi.sendMobileChat.mockReturnValue(request.promise);
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Mira'), 'Please correct this.');
    const send = view.getByLabelText('Send message');
    const onPress = getOnPress(send);

    await act(async () => {
      onPress();
      onPress();
      await Promise.resolve();
    });
    expect(boloApi.sendMobileChat).toHaveBeenCalledTimes(1);
    expect(appState.__appendChatMessagesMock).not.toHaveBeenCalled();
    expect(view.getByText('Please correct this.')).toBeTruthy();

    await act(async () => {
      request.resolve({ transcript: '', reply: 'Here is the correction.', language: 'en' });
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledTimes(1);
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'you', text: 'Please correct this.' }),
      expect.objectContaining({ role: 'mira', text: 'Here is the correction.', language: 'en' }),
    ]);
    expect(view.getByText('Please correct this.')).toBeTruthy();
    expect(view.getByText('Here is the correction.')).toBeTruthy();
    await view.unmount();
    await flushMicrotasks();
  });

  it('aborts a typed request and ignores its late reply after switching modes', async () => {
    const request = deferred<{ transcript: string; reply: string; language: 'en' }>();
    let requestSignal: AbortSignal | undefined;
    boloApi.sendMobileChat.mockImplementation((_input: unknown, signal: AbortSignal) => {
      requestSignal = signal;
      return request.promise;
    });
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Mira'), 'A delayed question.');
    await fireEvent.press(view.getByLabelText('Send message'));
    await fireEvent.press(view.getByText('Live translate'));

    expect(requestSignal?.aborted).toBe(true);
    expect(appState.__appendChatMessagesMock).not.toHaveBeenCalled();
    expect(view.queryByText('A delayed question.')).toBeNull();
    await act(async () => {
      request.resolve({ transcript: '', reply: 'This reply arrived too late.', language: 'en' });
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(speech.speakText).not.toHaveBeenCalled();

    await view.unmount();
    await flushMicrotasks();
  });

  it('aborts without persisting the local learner message when the screen unmounts before a reply', async () => {
    const request = deferred<{ transcript: string; reply: string; language: 'en' }>();
    let requestSignal: AbortSignal | undefined;
    boloApi.sendMobileChat.mockImplementation((_input: unknown, signal: AbortSignal) => {
      requestSignal = signal;
      return request.promise;
    });
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Mira'), 'Pending during unmount.');
    await fireEvent.press(view.getByLabelText('Send message'));
    await view.unmount();
    expect(requestSignal?.aborted).toBe(true);
    expect(appState.__appendChatMessagesMock).not.toHaveBeenCalled();
    request.resolve({ transcript: '', reply: 'Too late after unmount.', language: 'en' });
    await flushMicrotasks();
    expect(appState.__appendChatMessagesMock).not.toHaveBeenCalled();
  });

  it('preserves both messages when only reply playback fails', async () => {
    boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: 'The text reply succeeded.', language: 'en' });
    speech.speakText.mockRejectedValueOnce(new Error('Voice playback failed.'));
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Mira'), 'Keep this completed turn.');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();

    expect(appState.__appendChatMessagesMock).toHaveBeenCalledTimes(1);
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'you', text: 'Keep this completed turn.' }),
      expect.objectContaining({ role: 'mira', text: 'The text reply succeeded.', language: 'en' }),
    ]);
    expect(view.getByText('Keep this completed turn.')).toBeTruthy();
    expect(view.getByText('The text reply succeeded.')).toBeTruthy();
    const playbackError = view.getByText('Mira replied, but the voice audio could not play. Voice playback failed.');
    expect(playbackError.props.accessibilityRole).toBe('alert');
    await view.unmount();
    await flushMicrotasks();
  });
});

describe('live mode state separation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    expoAudio.__mockStream.isStreaming = false;
    boloApi.translateHindiAudio.mockResolvedValue({ english: 'Translated current segment.' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('announces the selected coaching mode and updates it after switching', async () => {
    const view = await render(<LiveScreen />);
    const correctTab = view.getByRole('tab', { name: 'Correct me' });
    const translateTab = view.getByRole('tab', { name: 'Live translate' });
    expect(correctTab.props.accessibilityState).toEqual({ disabled: false, selected: true });
    expect(translateTab.props.accessibilityState).toEqual({ disabled: false, selected: false });
    expect(view.getAllByRole('tab').filter((tab) => tab.props.accessibilityState?.selected)).toHaveLength(1);
    expect(StyleSheet.flatten(correctTab.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(translateTab.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(view.getByText('Live translate').props.style).color).toBe('#C1C8C5');
    expect(view.getByLabelText('Open chat history')).toBeTruthy();

    await fireEvent.press(view.getByRole('tab', { name: 'Live translate' }));
    expect(view.getByRole('tab', { name: 'Correct me' }).props.accessibilityState).toEqual({ disabled: false, selected: false });
    expect(view.getByRole('tab', { name: 'Live translate' }).props.accessibilityState).toEqual({ disabled: false, selected: true });
    expect(view.queryByLabelText('Open chat history')).toBeNull();
    await fireEvent.press(view.getByRole('tab', { name: 'Correct me' }));
    expect(view.getByLabelText('Open chat history')).toBeTruthy();
    await view.unmount();
    await flushMicrotasks();
  });

  it('locks both mode tabs during an active realtime turn and unlocks them after disconnect', async () => {
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Mock realtime recording'));
    expect(view.getByRole('tab', { name: 'Correct me' }).props.accessibilityState).toEqual({ disabled: true, selected: true });
    expect(view.getByRole('tab', { name: 'Live translate' }).props.accessibilityState).toEqual({ disabled: true, selected: false });
    await fireEvent.press(view.getByRole('tab', { name: 'Live translate' }));
    expect(view.getByRole('tab', { name: 'Correct me' }).props.accessibilityState).toEqual({ disabled: true, selected: true });
    expect(view.queryByText('Speak Hindi. Read English.')).toBeNull();

    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    await fireEvent.press(view.getByRole('tab', { name: 'Live translate' }));
    expect(view.getByText('Speak Hindi. Read English.')).toBeTruthy();

    await view.unmount();
    await flushMicrotasks();
  });

  it('keeps the live-translation caption surface hidden until capture starts', async () => {
    const animate = jest.spyOn(Animated, 'timing');
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByRole('tab', { name: 'Live translate' }));

    expect(view.queryByText('English live caption')).toBeNull();
    expect(view.queryByText('Your English translation will appear here.')).toBeNull();

    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();
    expect(view.getByText('English live caption')).toBeTruthy();
    expect(view.getAllByText('Listening for Hindi…').length).toBeGreaterThan(0);
    expect(animate).toHaveBeenCalledWith(expect.anything(), {
      duration: 260,
      toValue: 1,
      useNativeDriver: true,
    });

    await fireEvent.press(view.getByLabelText('Stop live translation'));
    await flushMicrotasks();
    expect(view.queryByText('English live caption')).toBeNull();
    await view.unmount();
    await flushMicrotasks();
    animate.mockRestore();
  });

  it('selects English or Hindi for typed and realtime Mira responses and locks the choice during a live session', async () => {
    boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: 'धन्यवाद।', language: 'hi' });
    const view = await render(<LiveScreen />);
    const english = view.getByRole('button', { name: 'Mira voice language: English' });
    const hindi = view.getByRole('button', { name: 'Mira voice language: Hindi' });

    expect(english.props.accessibilityState).toEqual({ disabled: false, selected: true });
    expect(hindi.props.accessibilityState).toEqual({ disabled: false, selected: false });
    expect(view.getByTestId('mock-realtime-language').props.children).toBe('en');

    await fireEvent.press(hindi);
    expect(view.getByRole('button', { name: 'Mira voice language: Hindi' }).props.accessibilityState)
      .toEqual({ disabled: false, selected: true });
    expect(view.getByTestId('mock-realtime-language').props.children).toBe('hi');
    expect(view.getByText('Conversational Hindi coach · Hindi replies')).toBeTruthy();

    await fireEvent.changeText(view.getByLabelText('Message Mira'), 'How do I say thank you?');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();
    expect(boloApi.sendMobileChat).toHaveBeenCalledWith(expect.objectContaining({
      text: 'How do I say thank you?',
      responseLanguage: 'hi',
    }), expect.any(AbortSignal));
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'you', text: 'How do I say thank you?' }),
      expect.objectContaining({ role: 'mira', text: 'धन्यवाद।', language: 'hi' }),
    ]);

    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    expect(view.getByRole('button', { name: 'Mira voice language: English' }).props.accessibilityState.disabled).toBe(true);
    expect(view.getByRole('button', { name: 'Mira voice language: Hindi' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(view.getByRole('button', { name: 'Mira voice language: English' }));
    expect(view.getByTestId('mock-realtime-language').props.children).toBe('hi');

    await view.unmount();
    await flushMicrotasks();
  });

  it('preserves coaching chat without turning a translation into a reportable Mira reply', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Mira reply'));
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'you', text: 'Namaste' }),
      expect.objectContaining({ role: 'mira', text: 'Hello there.', language: 'en' }),
    ]);
    expect(speech.preloadSpeech).toHaveBeenCalledWith('Hello there.');
    expect(view.getByText('Namaste')).toBeTruthy();
    expect(view.getAllByText('Hello there.').length).toBeGreaterThan(0);

    await fireEvent.press(view.getByText('Live translate'));
    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();
    expoAudio.__emitAudio();
    await advance(3_600);
    expect(view.getByText('Translated current segment.')).toBeTruthy();

    await fireEvent.press(view.getByText('Correct me'));
    expect(view.getAllByText('Hello there.').length).toBeGreaterThan(0);
    expect(view.queryByText('Translated current segment.')).toBeNull();

    await view.unmount();
    await flushMicrotasks();
  });

  it('appends translated segments to the visible history in completion order', async () => {
    boloApi.translateHindiAudio
      .mockResolvedValueOnce({ english: 'First translated thought.' })
      .mockResolvedValueOnce({ english: 'Second translated thought.' });
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByText('Live translate'));
    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();

    expoAudio.__emitAudio();
    await advance(3_600);
    expoAudio.__emitAudio();
    await advance(3_600);

    expect(view.getAllByTestId('translation-entry').map((entry) => entry.props.children)).toEqual([
      'First translated thought.',
      'Second translated thought.',
    ]);
    await fireEvent.press(view.getByLabelText('Stop live translation'));
    await view.unmount();
    await flushMicrotasks();
  });

  it('caps live translation history to the chat history limit', async () => {
    const segmentCount = 105;
    for (let index = 1; index <= segmentCount; index += 1) {
      boloApi.translateHindiAudio.mockResolvedValueOnce({ english: `Translated segment ${index}.` });
    }
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByText('Live translate'));
    await fireEvent.press(view.getByLabelText('Start live translation'));
    await flushMicrotasks();

    for (let index = 0; index < segmentCount; index += 1) {
      expoAudio.__emitAudio();
      await advance(3_600);
    }

    const entries = view.getAllByTestId('translation-entry').map((entry) => entry.props.children);
    expect(entries).toHaveLength(100);
    expect(entries[0]).toBe('Translated segment 6.');
    expect(entries.at(-1)).toBe('Translated segment 105.');
    await fireEvent.press(view.getByLabelText('Stop live translation'));
    await view.unmount();
    await flushMicrotasks();
  });

  it('clears saved coaching history only after destructive confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    expect(view.queryByLabelText('Clear Mira chat history')).toBeNull();
    await fireEvent.press(view.getByLabelText('Create Mira reply'));

    const clear = view.getByLabelText('Clear Mira chat history');
    expect(clear.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(clear.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(clear);
    expect(view.getByText('Namaste')).toBeTruthy();
    expect(view.getAllByText('Hello there.').length).toBeGreaterThan(0);

    const firstPrompt = alert.mock.calls.find(([title]) => title === 'Clear Mira chat?');
    const cancelAction = (firstPrompt?.[2] as { text?: string; style?: string; onPress?: () => void }[] | undefined)
      ?.find(({ text }) => text === 'Cancel');
    expect(cancelAction).toMatchObject({ text: 'Cancel', style: 'cancel' });
    await act(async () => {
      cancelAction?.onPress?.();
      await Promise.resolve();
    });
    expect(appState.__clearChatHistoryMock).not.toHaveBeenCalled();
    expect(view.getByText('Namaste')).toBeTruthy();
    expect(view.getAllByText('Hello there.').length).toBeGreaterThan(0);

    await fireEvent.press(clear);
    const confirmPrompt = alert.mock.calls.findLast(([title]) => title === 'Clear Mira chat?');
    const clearAction = (confirmPrompt?.[2] as { text?: string; onPress?: () => void }[] | undefined)
      ?.find(({ text }) => text === 'Clear chat');
    await act(async () => {
      clearAction?.onPress?.();
      await Promise.resolve();
    });

    expect(appState.__clearChatHistoryMock).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Namaste')).toBeNull();
    expect(view.queryByText('Hello there.')).toBeNull();
    expect(view.getByText(/Hi! Tell me what you would like to practice/u)).toBeTruthy();
    expect(view.queryByLabelText('Clear Mira chat history')).toBeNull();
    await view.unmount();
    await flushMicrotasks();
    alert.mockRestore();
  });

  it('stops reply playback when the user clears the chat that owns it', async () => {
    const playback = deferred<void>();
    speech.speakText.mockReturnValue(playback.promise);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Mira reply'));
    const listenActions = view.getAllByLabelText(/Read reply aloud/u);
    await fireEvent.press(listenActions[listenActions.length - 1]);
    expect(speech.speakText).toHaveBeenCalledWith('Hello there.');

    await fireEvent.press(view.getByLabelText('Clear Mira chat history'));
    const prompt = alert.mock.calls.findLast(([title]) => title === 'Clear Mira chat?');
    const clearAction = (prompt?.[2] as { text?: string; onPress?: () => void }[] | undefined)
      ?.find(({ text }) => text === 'Clear chat');
    await act(async () => {
      clearAction?.onPress?.();
      await Promise.resolve();
    });

    expect(speech.stopSpeaking).toHaveBeenCalledTimes(1);
    playback.resolve();
    await flushMicrotasks();
    await view.unmount();
    await flushMicrotasks();
    alert.mockRestore();
  });

  it('gives each Mira message action a unique bounded accessible name', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Mira reply'));
    const actionLabels = view.getAllByRole('button')
      .map(({ props }) => props.accessibilityLabel)
      .filter((label): label is string => typeof label === 'string');
    const listenLabels = actionLabels.filter((label) => label.startsWith('Read reply aloud:'));
    const reportLabels = actionLabels.filter((label) => label.startsWith('Report reply:'));

    expect(listenLabels).toHaveLength(2);
    expect(new Set(listenLabels).size).toBe(2);
    expect(listenLabels.every((label) => label.length <= 96)).toBe(true);
    expect(listenLabels.some((label) => label.includes('Hello there.'))).toBe(true);
    expect(reportLabels).toEqual(['Report reply: Hello there.']);
    await view.unmount();
    await flushMicrotasks();
  });
});

describe('live audio control exclusion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks typed chat and AI playback while realtime is capturing audio', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Mira reply'));
    await fireEvent.press(view.getByLabelText('Mock realtime recording'));

    expect(view.getByLabelText('Message Mira').props.editable).toBe(false);
    for (const listen of view.getAllByLabelText(/Read reply aloud:/u)) {
      expect(listen.props.accessibilityState?.disabled ?? listen.props.disabled).toBe(true);
      await fireEvent.press(listen);
    }
    await fireEvent.press(view.getByText('Correct my Hindi'));
    expect(boloApi.sendMobileChat).not.toHaveBeenCalled();
    expect(speech.speakText).not.toHaveBeenCalled();

    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.getByLabelText('Message Mira').props.editable).toBe(true);
    expect(view.getAllByLabelText(/Read reply aloud:/u)[0].props.accessibilityState?.disabled
      ?? view.getAllByLabelText(/Read reply aloud:/u)[0].props.disabled).toBe(false);

    await view.unmount();
    await flushMicrotasks();
  }, 20_000);

  it('saves and preloads typed replies without starting Expo playback while realtime owns the iOS audio session', async () => {
    boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: 'A reply while realtime stays connected.', language: 'en' });
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));

    expect(view.getByLabelText('Message Mira').props.editable).toBe(true);
    await fireEvent.changeText(view.getByLabelText('Message Mira'), 'Keep this typed question.');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();

    expect(appState.__appendChatMessagesMock).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'you', text: 'Keep this typed question.' }),
      expect.objectContaining({ role: 'mira', text: 'A reply while realtime stays connected.' }),
    ]);
    expect(speech.preloadSpeech).toHaveBeenCalledWith('A reply while realtime stays connected.');
    expect(speech.speakText).not.toHaveBeenCalled();
    expect(view.queryByText(/UnexpectedException/u)).toBeNull();

    const listen = view.getByLabelText('Read reply aloud: A reply while realtime stays connected.');
    expect(listen.props.accessibilityState?.disabled ?? listen.props.disabled).toBe(true);
    await fireEvent.press(listen);
    expect(speech.speakText).not.toHaveBeenCalled();

    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.getByLabelText('Read reply aloud: A reply while realtime stays connected.').props.accessibilityState?.disabled
      ?? view.getByLabelText('Read reply aloud: A reply while realtime stays connected.').props.disabled).toBe(false);
    await fireEvent.press(view.getByLabelText('Read reply aloud: A reply while realtime stays connected.'));
    await flushMicrotasks();
    expect(speech.speakText).toHaveBeenCalledWith('A reply while realtime stays connected.');

    await view.unmount();
    await flushMicrotasks();
  }, 20_000);

  it('keeps live coaching actions accessible and at least 44 points tall', async () => {
    const view = await render(<LiveScreen />);
    const listen = view.getByLabelText(/Read reply aloud:/u);
    const example = view.getByRole('button', { name: 'Correct my Hindi' });
    const send = view.getByLabelText('Send message');

    expect(listen.props.accessibilityRole).toBe('button');
    expect(listen.props.accessibilityState).toEqual({ disabled: false });
    expect(StyleSheet.flatten(listen.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(example.props.accessibilityState).toEqual({ disabled: false });
    expect(StyleSheet.flatten(example.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(send.props.accessibilityState).toEqual({ disabled: true });
    expect(StyleSheet.flatten(send.props.style).height).toBeGreaterThanOrEqual(44);

    await view.unmount();
    await flushMicrotasks();
  });
});
