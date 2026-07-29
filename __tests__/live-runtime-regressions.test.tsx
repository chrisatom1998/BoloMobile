import { act, fireEvent, render, within } from '@testing-library/react-native';
import * as mockReact from 'react';
import { Alert, Animated, Dimensions, FlatList, Pressable as MockPressable, StyleSheet, Text as MockText, type StyleProp, type TextStyle } from 'react-native';

import LiveScreen, { createLiveStyles } from '../src/app/(tabs)/live';
import { romanizeDevanagari } from '../src/lib/devanagari-romanization';
import { lightColors, spacing } from '../src/theme';

function expectDefined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected the value to be defined.');
  return value;
}

function collectTestIds(node: unknown, ids: string[] = []) {
  if (!node || typeof node === 'string' || typeof node === 'number') return ids;
  if (Array.isArray(node)) {
    node.forEach((child) => collectTestIds(child, ids));
    return ids;
  }
  const testNode = node as { children?: unknown[]; props?: { testID?: string } };
  if (testNode.props?.testID) ids.push(testNode.props.testID);
  testNode.children?.forEach((child) => collectTestIds(child, ids));
  return ids;
}

const mockRouterPush = jest.fn();
const longDevanagariReply = 'आप कैसे हैं? धन्यवाद, आशा। ज़रूर। आप कैसे हैं? धन्यवाद, आशा। ज़रूर।';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useFocusEffect: (effect: () => void | (() => void)) => mockReact.useEffect(effect, [effect]),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('expo-image', () => ({
  Image: ({ style, testID }: { style?: StyleProp<TextStyle>; testID?: string }) => mockReact.createElement(MockText, { style, testID }, 'Asha portrait'),
}));

jest.mock('lucide-react-native', () => ({
  ArrowDown: () => null,
  BookmarkPlus: () => null,
  Flag: () => null,
  MessageCircle: () => null,
  Send: () => null,
  Sparkles: () => null,
  Sprout: () => null,
  Trash2: () => null,
  Volume2: () => null,
  X: () => null,
}));

jest.mock('@/components/ai-consent-gate', () => {
  return {
    AiConsentGate: ({
      actionLabel = 'I agree and want to continue',
      title = 'Before using Asha',
    }: {
      actionLabel?: string;
      title?: string;
    }) => mockReact.createElement(
      mockReact.Fragment,
      null,
      mockReact.createElement(MockText, { testID: 'mock-ai-consent-gate' }, title),
      mockReact.createElement(MockText, null, actionLabel),
    ),
  };
});

jest.mock('@/components/realtime-voice-button', () => {
  return {
    RealtimeVoiceButton: ({
      disabled,
      onError,
      onInputTranscriptComplete,
      onStatusChange,
      onTranscriptChange,
      onTurnActionReady,
      onTurnComplete,
      responseLanguage,
    }: {
      disabled?: boolean;
      onError: (message: string) => void;
      onInputTranscriptComplete?: (result: { itemId: string; transcript: string }) => void;
      onStatusChange?: (status: 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding') => void;
      onTranscriptChange?: (update: { speaker: 'you' | 'asha'; text: string }) => void;
      onTurnActionReady?: (action: (() => void) | null) => void;
      onTurnComplete: (turn: { transcript: string; reply: string; language: 'en' | 'hi' }) => void;
      responseLanguage: 'en' | 'hi';
    }) => {
      mockReact.useEffect(() => {
        onTurnActionReady?.(() => onStatusChange?.('recording'));
        return () => onTurnActionReady?.(null);
      }, [onStatusChange, onTurnActionReady]);
      return mockReact.createElement(
      mockReact.Fragment,
      null,
      mockReact.createElement(MockText, { testID: 'mock-realtime-language' }, responseLanguage),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Create Asha reply',
          accessibilityState: { disabled: Boolean(disabled) },
          disabled,
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
          accessibilityLabel: 'Create long Devanagari Asha reply',
          onPress: () => {
            onInputTranscriptComplete?.({ itemId: 'mock-hindi-input', transcript: 'मेरा नाम क्रिस है।' });
            onTurnComplete({
              transcript: 'मेरा नाम क्रिस है।',
              reply: longDevanagariReply,
              language: 'hi',
            });
          },
        },
        mockReact.createElement(MockText, null, 'Create long Devanagari reply'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock realtime error',
          onPress: () => onError('I didn’t receive enough audio.'),
        },
        mockReact.createElement(MockText, null, 'Mock realtime error'),
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
          onPress: () => onTranscriptChange?.({ speaker: 'you', text: 'नमस्ते, मेरा नाम Chris है।' }),
        },
        mockReact.createElement(MockText, null, 'Mock learner transcript'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock Asha transcript',
          onPress: () => onTranscriptChange?.({ speaker: 'asha', text: 'नमस्ते Chris, आप कैसे हैं?' }),
        },
        mockReact.createElement(MockText, null, 'Mock Asha transcript'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock realtime disconnected',
          onPress: () => onStatusChange?.('disconnected'),
        },
        mockReact.createElement(MockText, null, 'Mock disconnected'),
      ),
      );
    },
  };
});

jest.mock('@/hooks/use-foreground-timer', () => ({
  useForegroundTimer: () => ({ elapsedSeconds: () => 0 }),
}));

let mockReducedMotion = false;

jest.mock('@/hooks/use-motion-preference', () => ({
  useMotionPreference: () => ({
    mode: mockReducedMotion ? 'reduced' : 'gentle',
    reducedMotion: mockReducedMotion,
  }),
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
      { id: string; role: 'you' | 'asha'; text: string; language?: 'en' | 'hi' }[]
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
  getContextualWordDefinition: jest.fn(),
  prepareSavedPhraseFromText: jest.fn(),
  reportGeneratedMessage: jest.fn(),
  sendMobileChat: jest.fn(),
}));

const boloApi = jest.requireMock('@/services/bolo-api') as {
  getContextualWordDefinition: jest.Mock;
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

  it('puts consent before visibly disabled live controls instead of scrolling to chat', async () => {
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const view = await render(<LiveScreen />);
    const list = view.getByTestId('live-chat-list');

    expect(view.getByTestId('mock-ai-consent-gate')).toBeTruthy();
    expect(view.getByText('Before your first live turn')).toBeTruthy();
    expect(view.getByText('Enable live practice')).toBeTruthy();
    const testIds = collectTestIds(view.toJSON());
    expect(testIds.indexOf('live-consent-section')).toBeLessThan(testIds.indexOf('live-voice-controls'));
    const languageTabs = view.getAllByRole('tab', { name: /Asha voice language/u });
    expect(languageTabs).toHaveLength(2);
    languageTabs.forEach((tab) => expect(tab.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true })));
    expect(view.getByLabelText('Create Asha reply').props.accessibilityState).toEqual({ disabled: true });
    expect(view.getByText('Live voice unlocks here')).toBeTruthy();
    expect(view.getByText('Your captions will appear here after the first turn.')).toBeTruthy();
    expect(view.queryByLabelText('Open chat history')).toBeNull();
    expect(view.queryByText('Ask Asha')).toBeNull();
    expect(view.queryByLabelText('Message Asha')).toBeNull();
    expect(view.queryByTestId('featured-phrase-section')).toBeNull();

    await act(async () => {
      list.props.onContentSizeChange();
      await Promise.resolve();
    });

    expect(scrollToEnd).not.toHaveBeenCalled();
    await view.unmount();
  }, 20_000);
});

describe('live theme styles', () => {
  it('paints the chat list, bubbles, and composer from the active palette', () => {
    const styles = createLiveStyles(lightColors);

    expect(styles.list.backgroundColor).toBe(lightColors.background);
    expect(styles.ashaMessage.backgroundColor).toBe(lightColors.paperRaised);
    expect(styles.messageText.color).toBe(lightColors.ink);
    expect(styles.composer.backgroundColor).toBe(lightColors.paperRaised);
    expect(styles.input.backgroundColor).toBe(lightColors.backgroundWarm);
    expect(styles.liveVoiceText.lineHeight).toBeGreaterThan(styles.liveVoiceText.fontSize);
    expect(styles.captionLabelBadge.minHeight).toBeGreaterThanOrEqual(30);
    expect(styles.captionLabelBadge.paddingVertical).toBeGreaterThanOrEqual(5);
    expect(styles.captionLabelBadge.overflow).toBe('visible');
    expect(styles.captionLabel.fontSize).toBeGreaterThanOrEqual(12);
    expect(styles.captionLabel.lineHeight).toBeGreaterThanOrEqual(18);
    expect(styles.captionLabel.fontWeight).toBe('800');
    expect(styles.captionLabel.letterSpacing).toBeLessThanOrEqual(0.25);
    expect('textTransform' in styles.captionLabel).toBe(false);
    expect(styles.examples.paddingRight).toBe(spacing.xl);
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

    expect(StyleSheet.flatten(hero.props.style).backgroundColor).toBe('#F6F3ED');
    expect(view.getByText('Private Hindi coach · English replies')).toBeTruthy();
    expect(view.getAllByText('Speak with Asha')).toHaveLength(1);
    expect(view.getByText('Ready when you are')).toBeTruthy();
    expect(view.getByText('Tap the orb to begin a Hindi voice turn.')).toBeTruthy();
    expect(view.getAllByText(/Tap the orb/u)).toHaveLength(1);
    const captionBadge = view.getByTestId('live-caption-label-badge');
    expect(within(captionBadge).getByText('Live')).toBeTruthy();
    expect(view.queryByText('LIVE')).toBeNull();
    expect(view.getByText('Your live captions will appear here.').props.accessibilityLiveRegion).toBe('polite');
    expect(view.queryByText('Tap the orb and ask anything in Hindi.')).toBeNull();
    expect(view.queryByText('Live Asha caption')).toBeNull();
    expect(view.queryByLabelText('Open text phrase help')).toBeNull();
    expect(view.getByText('Ask Asha')).toBeTruthy();
    expect(view.getByText('How do I say…?')).toBeTruthy();
    expect(view.getByLabelText('Open chat history')).toBeTruthy();
    expect(view.queryByLabelText('Go back')).toBeNull();
    expect(view.getByTestId('featured-phrase-section')).toBeTruthy();
    expect(within(hero).queryByText('Featured phrase')).toBeNull();

    const sheet = view.getByTestId('ask-asha-sheet');
    const sheetStyle = StyleSheet.flatten(sheet.props.style);
    expect(sheetStyle.marginTop).toBeLessThan(0);
    expect(sheetStyle.borderTopLeftRadius).toBeGreaterThanOrEqual(30);
    expect(view.getByTestId('ask-asha-sheet-handle')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    expect(view.getByText('Connecting to Asha…')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime recording'));
    expect(view.getByText('Listening to your Hindi…')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime responding'));
    expect(view.getByText('Asha is preparing your English reply…')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.queryByText('Live Asha caption')).toBeNull();

    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    expect(view.getByText('Live Asha caption')).toBeTruthy();
    expect(view.getByLabelText('Selectable chat text: Hello there.')).toBeTruthy();

    expect(view.getByLabelText('Message Asha')).toBeTruthy();

    await view.unmount();
    await flushMicrotasks();
  });

  it('keeps the live caption mounted from connection through the ready state', async () => {
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    expect(view.getByText('Live Asha caption')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    expect(view.getByText('Live Asha caption')).toBeTruthy();
    expect(view.getByText('Captions appear after your first turn.')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.queryByText('Live Asha caption')).toBeNull();

    await view.unmount();
    await flushMicrotasks();
  });

  it('shows learner transcription and then Asha captions while the voice turn is in progress', async () => {
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Mock realtime recording'));
    await fireEvent.press(view.getByLabelText('Mock learner transcript'));
    expect(view.getByText('Your transcript')).toBeTruthy();
    expect(view.getByText('Namaste, meraa naam Chris hai.')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Mock realtime responding'));
    await fireEvent.press(view.getByLabelText('Mock Asha transcript'));
    expect(view.getByText('Live Asha caption')).toBeTruthy();
    expect(view.getByText('Namaste Chris, aap kaise hain?')).toBeTruthy();

    await view.unmount();
    await flushMicrotasks();
  });

  it('keeps the compact Asha portrait and exposes one transcript-footer action that reuses the active voice turn', async () => {
    const view = await render(<LiveScreen />);

    const portrait = view.getByTestId('asha-header-portrait');
    expect(StyleSheet.flatten(portrait.props.style)).toEqual(expect.objectContaining({ height: 52, width: 52 }));
    expect(view.getAllByText('Asha portrait')).toHaveLength(1);
    expect(view.queryByText('Continue with Asha')).toBeNull();

    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));

    const nextTurn = view.getByLabelText('Start next Asha turn');
    expect(nextTurn.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(nextTurn);
    expect(view.getByText('Asha is listening')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Mock realtime responding'));
    const waiting = view.getByLabelText('Asha is responding…');
    expect(waiting.props.accessibilityState.disabled).toBe(true);

    await view.unmount();
    await flushMicrotasks();
  });

  it('clears a stale voice error when the next recording actually starts', async () => {
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Mock realtime error'));
    expect(view.getByText('I didn’t receive enough audio.').props.accessibilityRole).toBe('alert');

    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    expect(view.getByText('I didn’t receive enough audio.')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Mock realtime recording'));
    expect(view.queryByText('I didn’t receive enough audio.')).toBeNull();

    await view.unmount();
    await flushMicrotasks();
  });

  it('shows full Romanized voice turns while retaining the original text for voice playback', async () => {
    const displayReply = romanizeDevanagari(longDevanagariReply);
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Create long Devanagari Asha reply'));

    const message = view.getAllByLabelText(/^Selectable chat text:/u)
      .find((candidate) => candidate.props.value === displayReply);
    if (!message) throw new Error('The Romanized Asha message was not rendered.');
    expect(message.props.value).toBe(displayReply);
    expect(view.queryByDisplayValue(longDevanagariReply)).toBeNull();
    const initialStyle = StyleSheet.flatten(message.props.style);
    expect(initialStyle.height).toBeUndefined();
    expect(initialStyle.minHeight).toBe(23);

    await act(async () => {
      message.props.onContentSizeChange({ nativeEvent: { contentSize: { height: 138 } } });
      await Promise.resolve();
    });
    const resizedMessage = view.getAllByLabelText(/^Selectable chat text:/u)
      .find((candidate) => candidate.props.value === displayReply);
    if (!resizedMessage) throw new Error('The Romanized Asha message was removed after measurement.');
    expect(StyleSheet.flatten(resizedMessage.props.style).height).toBe(138);
    expect(speech.preloadSpeech).toHaveBeenCalledWith(longDevanagariReply, 'hi');

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
      const sheetStyle = StyleSheet.flatten(view.getByTestId('ask-asha-sheet').props.style);
      const headingStyle = StyleSheet.flatten(view.getByTestId('ask-asha-heading').props.style);

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

  it('reflows the Asha identity before medium Dynamic Type can clip it on a narrow iPhone', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    const enlargedNarrowSize = { fontScale: 1.25, height: 844, scale: 1, width: 320 };
    await act(async () => {
      Dimensions.set({ screen: enlargedNarrowSize, window: enlargedNarrowSize });
      await Promise.resolve();
    });
    try {
      const view = await render(<LiveScreen />);
      const topbar = view.getByTestId('asha-header-topbar');
      const topbarStyle = StyleSheet.flatten(topbar.props.style);
      const header = within(topbar);

      expect(topbarStyle.flexDirection).toBe('column');
      expect(topbarStyle.paddingRight).toBe(0);
      expect(header.getByText('Speak with Asha').props.numberOfLines).toBeUndefined();
      expect(header.getByText('Private Hindi coach · English replies').props.numberOfLines).toBeUndefined();
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
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await fireEvent.press(view.getByLabelText(/Report reply:/u));

    const firstReason = (alert.mock.calls[0]?.[2] as { onPress?: () => void }[] | undefined)?.[0]?.onPress;
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
    const retryPrompt = alert.mock.calls.findLast(([title]) => title === 'Report Asha\u2019s reply');
    const retryReason = (retryPrompt?.[2] as { onPress?: () => void }[] | undefined)?.[0]?.onPress;
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
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await fireEvent.press(view.getByLabelText(/Report reply:/u));
    const reason = (alert.mock.calls[0]?.[2] as { onPress?: () => void }[] | undefined)?.[0]?.onPress;
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

  it('announces pending work and the completed Asha reply', async () => {
    const request = deferred<{ transcript: string; reply: string; language: 'en' }>();
    boloApi.sendMobileChat.mockReturnValue(request.promise);
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Please help with this sentence.');
    await fireEvent.press(view.getByLabelText('Send message'));

    expect(view.getByText('Asha is thinking\u2026').props.accessibilityLiveRegion).toBe('polite');
    await act(async () => {
      request.resolve({ transcript: '', reply: 'Here is an announced correction.', language: 'en' });
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(view.getByLabelText('Selectable chat text: Here is an announced correction.').props.accessibilityLiveRegion).toBe('polite');
    await view.unmount();
    await flushMicrotasks();
  });

  it('never persists a learner-only turn when the request fails before a reply', async () => {
    boloApi.sendMobileChat.mockRejectedValueOnce(new Error('Asha is unavailable.'));
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Do not leave this orphaned.');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();

    expect(appState.__appendChatMessagesMock).not.toHaveBeenCalled();
    expect(view.queryByText('Do not leave this orphaned.')).toBeNull();
    expect(view.getByText('Asha is unavailable.').props.accessibilityRole).toBe('alert');
    await view.unmount();
    await flushMicrotasks();
  });

  it('allows one request and persists the completed learner/Asha pair atomically', async () => {
    const request = deferred<{ transcript: string; reply: string; language: 'en' }>();
    boloApi.sendMobileChat.mockReturnValue(request.promise);
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Please correct this.');
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
    expect(view.getByLabelText('Selectable chat text: Please correct this.')).toBeTruthy();

    await act(async () => {
      request.resolve({ transcript: '', reply: 'Here is the correction.', language: 'en' });
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledTimes(1);
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'you', text: 'Please correct this.' }),
      expect.objectContaining({ role: 'asha', text: 'Here is the correction.', language: 'en' }),
    ]);
    expect(view.getByLabelText('Selectable chat text: Please correct this.')).toBeTruthy();
    expect(view.getByLabelText('Selectable chat text: Here is the correction.')).toBeTruthy();
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
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Pending during unmount.');
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
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Keep this completed turn.');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();

    expect(appState.__appendChatMessagesMock).toHaveBeenCalledTimes(1);
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'you', text: 'Keep this completed turn.' }),
      expect.objectContaining({ role: 'asha', text: 'The text reply succeeded.', language: 'en' }),
    ]);
    expect(view.getByLabelText('Selectable chat text: Keep this completed turn.')).toBeTruthy();
    expect(view.getByLabelText('Selectable chat text: The text reply succeeded.')).toBeTruthy();
    const playbackError = view.getByText('Asha replied, but the voice audio could not play. Voice playback failed.');
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
    await fireEvent.press(view.getByLabelText('Create Asha reply'));

    const message = view.getByLabelText('Selectable chat text: Hello there.');
    expect(message.props.readOnly).toBe(true);
    await fireEvent(message, 'selectionChange', { nativeEvent: { selection: { start: 0, end: 5 } } });
    // Losing focus collapses the native selection before the adjacent button
    // receives its press. The last non-empty highlighted range must survive.
    await fireEvent(message, 'selectionChange', { nativeEvent: { selection: { start: 5, end: 5 } } });
    await fireEvent.press(view.getByLabelText('Save transcript phrase: Hello there.'));
    expect(view.getByLabelText('Selected transcript text').props.value).toBe('Hello there.');
    expect(view.getByText('Highlight words in chat before tapping Save, or trim the transcript here. Bolo will add a Romanized Hindi version and English meaning.')).toBeTruthy();
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

  it('retains the original Hindi source behind a selected Romanized chat phrase', async () => {
    boloApi.prepareSavedPhraseFromText.mockResolvedValueOnce({
      hi: 'आप कैसे हैं?',
      latin: 'Aap kaise hain?',
      en: 'How are you?',
    });
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create long Devanagari Asha reply'));

    const displayReply = romanizeDevanagari(longDevanagariReply);
    const message = view.getAllByLabelText(/^Selectable chat text:/u)
      .find((candidate) => candidate.props.value === displayReply);
    if (!message) throw new Error('The Romanized Asha message was not rendered.');
    const selectedText = 'Aap kaise hain?';
    await fireEvent(message, 'selectionChange', { nativeEvent: { selection: { start: 0, end: selectedText.length } } });
    const saveSelection = view.getAllByLabelText(/^Save transcript phrase:/u)
      .find((candidate) => String(candidate.props.accessibilityLabel).includes('Aap kaise hain?'));
    if (!saveSelection) throw new Error('The Asha save action was not rendered.');
    await fireEvent.press(saveSelection);

    expect(view.getByLabelText('Selected transcript text').props.value).toBe(selectedText);
    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    await flushMicrotasks();

    expect(boloApi.prepareSavedPhraseFromText).toHaveBeenCalledWith({
      clientId: 'client-12345678',
      sourceText: 'आप कैसे हैं?',
      text: selectedText,
    }, expect.any(AbortSignal));
    await view.unmount();
    await flushMicrotasks();
  });

  it('opens Romanized word analysis from a completed English-mode Asha reply', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create long Devanagari Asha reply'));

    const words = view.getAllByLabelText(/Explore Hindi words:/u)
      .find((candidate) => String(candidate.props.accessibilityLabel).includes('Dhanyavaad'));
    if (!words) throw new Error('The completed Asha Words action was not rendered.');
    await fireEvent.press(words);

    expect(view.getByText('Word by word')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Explain Aap' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Explain आप' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Explain Chris' })).toBeNull();
    await view.unmount();
    await flushMicrotasks();
  });

  it('keeps the full-message trimming fallback when no chat text was highlighted', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));

    await fireEvent.press(view.getByLabelText('Save transcript phrase: Hello there.'));

    expect(view.getByLabelText('Selected transcript text').props.value).toBe('Hello there.');
    expect(view.getByText('Highlight words in chat before tapping Save, or trim the transcript here. Bolo will add a Romanized Hindi version and English meaning.')).toBeTruthy();
    await view.unmount();
    await flushMicrotasks();
  });

  it('selects English or Hindi for typed and realtime Asha responses and locks the choice during a live session', async () => {
    boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: 'Dhanyavaad.', language: 'hi' });
    const view = await render(<LiveScreen />);
    const english = view.getByRole('tab', { name: 'Asha voice language: English' });
    const hindi = view.getByRole('tab', { name: 'Asha voice language: Hindi' });

    expect(english.props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(hindi.props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(view.getByTestId('mock-realtime-language').props.children).toBe('en');

    await fireEvent.press(hindi);
    expect(view.getByRole('tab', { name: 'Asha voice language: Hindi' }).props.accessibilityState)
      .toEqual({ selected: true, disabled: false });
    expect(view.getByTestId('mock-realtime-language').props.children).toBe('hi');
    expect(view.getByText('Private Hindi coach · Hindi replies')).toBeTruthy();

    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'How do I say thank you?');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();
    expect(boloApi.sendMobileChat).toHaveBeenCalledWith(expect.objectContaining({
      text: 'How do I say thank you?',
      responseLanguage: 'hi',
    }), expect.any(AbortSignal));
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'you', text: 'How do I say thank you?' }),
      expect.objectContaining({ role: 'asha', text: 'Dhanyavaad.', language: 'hi' }),
    ]);

    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    expect(view.getByRole('tab', { name: 'Asha voice language: English' }).props.accessibilityState.disabled).toBe(true);
    expect(view.getByRole('tab', { name: 'Asha voice language: Hindi' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(view.getByRole('tab', { name: 'Asha voice language: English' }));
    expect(view.getByTestId('mock-realtime-language').props.children).toBe('hi');

    await view.unmount();
    await flushMicrotasks();
  });

  it('clears saved coaching history only after destructive confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    expect(view.queryByLabelText('Clear Asha chat history')).toBeNull();
    await fireEvent.press(view.getByLabelText('Create Asha reply'));

    const clear = view.getByLabelText('Clear Asha chat history');
    expect(clear.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(clear.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(clear);
    expect(view.getByLabelText('Selectable chat text: Namaste')).toBeTruthy();
    expect(view.getByLabelText('Selectable chat text: Hello there.')).toBeTruthy();

    const firstPrompt = alert.mock.calls.find(([title]) => title === 'Clear Asha chat?');
    const cancelAction = (firstPrompt?.[2] as { text?: string; style?: string; onPress?: () => void }[] | undefined)
      ?.find(({ text }) => text === 'Cancel');
    expect(cancelAction).toMatchObject({ text: 'Cancel', style: 'cancel' });
    await act(async () => {
      cancelAction?.onPress?.();
      await Promise.resolve();
    });
    expect(appState.__clearChatHistoryMock).not.toHaveBeenCalled();
    expect(view.getByLabelText('Selectable chat text: Namaste')).toBeTruthy();
    expect(view.getByLabelText('Selectable chat text: Hello there.')).toBeTruthy();

    await fireEvent.press(clear);
    const confirmPrompt = alert.mock.calls.findLast(([title]) => title === 'Clear Asha chat?');
    const clearAction = (confirmPrompt?.[2] as { text?: string; onPress?: () => void }[] | undefined)
      ?.find(({ text }) => text === 'Clear chat');
    await act(async () => {
      clearAction?.onPress?.();
      await Promise.resolve();
    });

    expect(appState.__clearChatHistoryMock).toHaveBeenCalledTimes(1);
    expect(view.queryByLabelText('Selectable chat text: Namaste')).toBeNull();
    expect(view.queryByLabelText('Selectable chat text: Hello there.')).toBeNull();
    expect(view.getByDisplayValue('Hi! Tell me what you would like to practice. Choose English or Hindi for my replies above.')).toBeTruthy();
    expect(view.queryByLabelText('Clear Asha chat history')).toBeNull();
    await view.unmount();
    await flushMicrotasks();
    alert.mockRestore();
  });

  it('stops reply playback when the user clears the chat that owns it', async () => {
    const playback = deferred<void>();
    speech.speakText.mockReturnValue(playback.promise);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    const listenActions = view.getAllByLabelText(/Read reply aloud/u);
    await fireEvent.press(expectDefined(listenActions[listenActions.length - 1]));
    expect(speech.speakText).toHaveBeenCalledWith('Hello there.');

    await fireEvent.press(view.getByLabelText('Clear Asha chat history'));
    const prompt = alert.mock.calls.findLast(([title]) => title === 'Clear Asha chat?');
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

  it('gives each Asha message action a unique bounded accessible name', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
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
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await fireEvent.press(view.getByLabelText('Mock realtime recording'));

    expect(view.getByLabelText('Message Asha').props.editable).toBe(false);
    for (const listen of view.getAllByLabelText(/Read reply aloud:/u)) {
      expect(listen.props.accessibilityState?.disabled ?? listen.props.disabled).toBe(true);
      await fireEvent.press(listen);
    }
    await fireEvent.press(view.getByText('Correct my Hindi'));
    expect(boloApi.sendMobileChat).not.toHaveBeenCalled();
    expect(speech.speakText).not.toHaveBeenCalled();

    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.getByLabelText('Message Asha').props.editable).toBe(true);
    const firstListen = expectDefined(view.getAllByLabelText(/Read reply aloud:/u)[0]);
    expect(firstListen.props.accessibilityState?.disabled
      ?? firstListen.props.disabled).toBe(false);

    await view.unmount();
    await flushMicrotasks();
  }, 20_000);

  it('saves and preloads typed replies without starting Expo playback while realtime owns the iOS audio session', async () => {
    boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: 'A reply while realtime stays connected.', language: 'en' });
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));

    expect(view.getByLabelText('Message Asha').props.editable).toBe(true);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Keep this typed question.');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();

    expect(appState.__appendChatMessagesMock).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'you', text: 'Keep this typed question.' }),
      expect.objectContaining({ role: 'asha', text: 'A reply while realtime stays connected.' }),
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
