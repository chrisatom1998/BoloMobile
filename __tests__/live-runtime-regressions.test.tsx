import { act, fireEvent, render } from '@testing-library/react-native';
import * as mockReact from 'react';
import { Alert, Animated, Dimensions, FlatList, Pressable as MockPressable, StyleSheet, Text as MockText } from 'react-native';

import LiveScreen, { createLiveStyles } from '../src/app/live';
import { darkColors } from '../src/theme';

const mockRouterBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockRouterBack }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('lucide-react-native', () => ({
  ArrowDown: () => null,
  ArrowLeft: () => null,
  BookmarkPlus: () => null,
  Flag: () => null,
  MessageCircle: () => null,
  Send: () => null,
  Sparkles: () => null,
  Trash2: () => null,
  Volume2: () => null,
  X: () => null,
}));

jest.mock('@/components/ai-consent-gate', () => {
  return {
    AiConsentGate: ({ children }: { children: never }) => mockReact.createElement(mockReact.Fragment, null, children),
  };
});

jest.mock('@/components/realtime-voice-button', () => {
  return {
    RealtimeVoiceButton: ({
      onInputTranscriptComplete,
      onStatusChange,
      onTranscriptChange,
      onTurnComplete,
      responseLanguage,
    }: {
      onInputTranscriptComplete?: (result: { itemId: string; transcript: string }) => void;
      onStatusChange?: (status: 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding') => void;
      onTranscriptChange?: (update: { speaker: 'you' | 'mira'; text: string }) => void;
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
          onPress: () => {
            onInputTranscriptComplete?.({ itemId: 'mock-input', transcript: 'Namaste' });
            onTurnComplete({ transcript: 'Namaste', reply: 'Hello there.', language: 'en' });
          },
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
          accessibilityLabel: 'Mock learner transcript',
          onPress: () => onTranscriptChange?.({ speaker: 'you', text: 'Namaste, mera naam Chris hai.' }),
        },
        mockReact.createElement(MockText, null, 'Mock learner transcript'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock Mira transcript',
          onPress: () => onTranscriptChange?.({ speaker: 'mira', text: 'Namaste Chris, aap kaise hain?' }),
        },
        mockReact.createElement(MockText, null, 'Mock Mira transcript'),
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

let mockReducedMotion = false;

jest.mock('@/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => mockReducedMotion,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

let mockAiConsent = true;

jest.mock('@/state/app-state', () => ({
  __appendChatMessagesMock: jest.fn(),
  __clearChatHistoryMock: jest.fn(),
  __togglePhraseMock: jest.fn(),
  useAppState: () => {
    const appState = jest.requireMock('@/state/app-state') as {
      __appendChatMessagesMock: jest.Mock;
      __clearChatHistoryMock: jest.Mock;
      __togglePhraseMock: jest.Mock;
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
      phrases: [],
      togglePhrase: appState.__togglePhraseMock,
    };
  },
}));

jest.mock('@/lib/speech', () => ({
  preloadSpeech: jest.fn(async () => undefined),
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('@/services/bolo-api', () => ({
  prepareSavedPhraseFromText: jest.fn(),
  reportGeneratedMessage: jest.fn(),
  sendMobileChat: jest.fn(),
}));

const boloApi = jest.requireMock('@/services/bolo-api') as {
  prepareSavedPhraseFromText: jest.Mock;
  reportGeneratedMessage: jest.Mock;
  sendMobileChat: jest.Mock;
};
const speech = jest.requireMock('@/lib/speech') as {
  preloadSpeech: jest.Mock;
  speakText: jest.Mock;
  stopSpeaking: jest.Mock;
};
const appState = jest.requireMock('@/state/app-state') as {
  __appendChatMessagesMock: jest.Mock;
  __clearChatHistoryMock: jest.Mock;
  __togglePhraseMock: jest.Mock;
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

describe('live theme styles', () => {
  it('uses the dark palette for the chat list, bubbles, and composer', () => {
    const styles = createLiveStyles(darkColors);

    expect(styles.list.backgroundColor).toBe(darkColors.background);
    expect(styles.miraMessage.backgroundColor).toBe(darkColors.paperRaised);
    expect(styles.messageText.color).toBe(darkColors.ink);
    expect(styles.composer.backgroundColor).toBe(darkColors.paperRaised);
    expect(styles.input.backgroundColor).toBe(darkColors.backgroundWarm);
  });
});

describe('immersive live conversation design', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReducedMotion = false;
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

  it('shows learner transcription and then Mira captions while the voice turn is in progress', async () => {
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Mock realtime responding'));
    await fireEvent.press(view.getByLabelText('Mock learner transcript'));
    expect(view.getByText('You said')).toBeTruthy();
    expect(view.getByText('Namaste, mera naam Chris hai.')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Mock Mira transcript'));
    expect(view.getByText('Live Mira caption')).toBeTruthy();
    expect(view.getByText('Namaste Chris, aap kaise hain?')).toBeTruthy();

    await view.unmount();
    await flushMicrotasks();
  });

  it('stops an active caption animation before applying reduced motion', async () => {
    const stopAnimation = jest.spyOn(Animated.Value.prototype, 'stopAnimation');
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    mockReducedMotion = true;
    await act(async () => {
      view.rerender(<LiveScreen />);
      await Promise.resolve();
    });

    expect(stopAnimation).toHaveBeenCalled();
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

  it('aborts an in-flight report when the screen unmounts', async () => {
    const request = deferred<{ reported: true }>();
    let reportSignal: AbortSignal | undefined;
    boloApi.reportGeneratedMessage.mockImplementation((_input: unknown, signal: AbortSignal) => {
      reportSignal = signal;
      return request.promise;
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Mira reply'));
    await fireEvent.press(view.getByLabelText(/Report reply:/u));
    const reason = (alert.mock.calls[0][2] as { onPress?: () => void }[])[0].onPress;
    await act(async () => {
      reason?.();
      await Promise.resolve();
    });

    await view.unmount();
    expect(reportSignal?.aborted).toBe(true);
    request.resolve({ reported: true });
    await flushMicrotasks();
    expect(alert).not.toHaveBeenCalledWith('Report received', expect.any(String));
    alert.mockRestore();
  });
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
    expect(boloApi.sendMobileChat.mock.calls[0][0]).toEqual(expect.objectContaining({ messages: [] }));
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

describe('live coaching state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not expose live translation controls or captions', async () => {
    const view = await render(<LiveScreen />);

    expect(view.queryByText(/Live translate/iu)).toBeNull();
    expect(view.queryByText(/English live caption/iu)).toBeNull();
    expect(view.queryByLabelText(/live translation/iu)).toBeNull();
    expect(view.getByLabelText('Open chat history')).toBeTruthy();

    await view.unmount();
    await flushMicrotasks();
  });

  it('selects a transcript excerpt and saves Romanized text with its English meaning', async () => {
    boloApi.prepareSavedPhraseFromText.mockResolvedValueOnce({
      hi: 'आप कैसे हैं?',
      latin: 'Aap kaise hain?',
      en: 'How are you?',
    });
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Mira reply'));

    expect(view.getByText('Namaste').props.selectable).toBe(true);
    await fireEvent.press(view.getByLabelText('Save transcript phrase: Namaste'));
    expect(view.getByLabelText('Selected transcript text').props.value).toBe('Namaste');
    await fireEvent.changeText(view.getByLabelText('Selected transcript text'), 'Aap kaise hain?');
    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    await flushMicrotasks();

    expect(boloApi.prepareSavedPhraseFromText).toHaveBeenCalledWith({
      clientId: 'client-12345678',
      text: 'Aap kaise hain?',
    }, expect.any(AbortSignal));
    expect(view.getByLabelText('Romanized Hindi phrase').props.value).toBe('Aap kaise hain?');
    expect(view.getByLabelText('Hindi phrase').props.value).toBe('आप कैसे हैं?');
    expect(view.getByLabelText('English phrase meaning').props.value).toBe('How are you?');
    await fireEvent.press(view.getByRole('button', { name: 'Save phrase' }));

    expect(appState.__togglePhraseMock).toHaveBeenCalledWith({
      hi: 'आप कैसे हैं?',
      latin: 'Aap kaise hain?',
      en: 'How are you?',
    });
    expect(view.queryByLabelText('Selected transcript text')).toBeNull();
    await view.unmount();
    await flushMicrotasks();
  });

  it('selects English or Hindi for typed and realtime Mira responses and locks the choice during a live session', async () => {
    boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: 'Dhanyavaad.', language: 'hi' });
    const view = await render(<LiveScreen />);
    const english = view.getByRole('radio', { name: 'Mira voice language: English' });
    const hindi = view.getByRole('radio', { name: 'Mira voice language: Hindi' });

    expect(english.props.accessibilityState).toEqual({ checked: true, disabled: false });
    expect(hindi.props.accessibilityState).toEqual({ checked: false, disabled: false });
    expect(view.getByTestId('mock-realtime-language').props.children).toBe('en');

    await fireEvent.press(hindi);
    expect(view.getByRole('radio', { name: 'Mira voice language: Hindi' }).props.accessibilityState)
      .toEqual({ checked: true, disabled: false });
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
      expect.objectContaining({ role: 'mira', text: 'Dhanyavaad.', language: 'hi' }),
    ]);

    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    expect(view.getByRole('radio', { name: 'Mira voice language: English' }).props.accessibilityState.disabled).toBe(true);
    expect(view.getByRole('radio', { name: 'Mira voice language: Hindi' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(view.getByRole('radio', { name: 'Mira voice language: English' }));
    expect(view.getByTestId('mock-realtime-language').props.children).toBe('hi');

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
