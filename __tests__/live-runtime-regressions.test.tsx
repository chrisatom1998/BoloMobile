import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import * as mockReact from 'react';
import { Alert, Animated, AppState, Dimensions, FlatList, Keyboard, Linking, Pressable as MockPressable, StyleSheet, Text as MockText, type StyleProp, type TextStyle } from 'react-native';

import LiveScreen, { createLiveStyles, visibleChipRowWidth } from '../src/app/(tabs)/live';
import { romanizeDevanagari } from '../src/lib/devanagari-romanization';
import { displayFont, layout, lightColors, spacing, type as typeScale } from '../src/theme';

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
  useFocusEffect: (effect: () => void | (() => void)) => mockReact.useEffect(() => {
    const cleanup = effect();
    mockBlurScreen = cleanup ?? (() => {});
    return cleanup;
  }, [effect]),
}));

let mockBlurScreen = () => {};

jest.mock('expo-status-bar', () => ({ StatusBar: () => null, setStatusBarStyle: jest.fn() }));

jest.mock('expo-image', () => ({
  Image: ({ style, testID }: { style?: StyleProp<TextStyle>; testID?: string }) => mockReact.createElement(MockText, { style, testID }, 'Asha portrait'),
}));

jest.mock('lucide-react-native', () => ({
  AlertCircle: () => null,
  ArrowDown: () => null,
  BookmarkPlus: () => null,
  ChevronDown: () => null,
  Ellipsis: () => null,
  Flag: () => null,
  History: () => null,
  Lock: () => null,
  MessageCircle: () => null,
  Mic: () => null,
  MicOff: () => null,
  Send: () => null,
  Settings: () => null,
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
      children,
      presentation = 'card',
      sheetVisible = false,
      title = 'Before using Asha',
    }: {
      actionLabel?: string;
      children?: import('react').ReactNode;
      presentation?: 'card' | 'sheet';
      sheetVisible?: boolean;
      title?: string;
    }) => {
      if (mockAiConsent) return children ?? null;
      if (presentation === 'sheet' && !sheetVisible) return null;
      return mockReact.createElement(
        mockReact.Fragment,
        null,
        mockReact.createElement(MockText, { testID: 'mock-ai-consent-gate' }, title),
        mockReact.createElement(MockText, null, actionLabel),
      );
    },
  };
});

const mockVoiceButtonProps: {
  history?: unknown;
  onConnectionStart?: (signal: AbortSignal) => void | Promise<void>;
} = {};

jest.mock('@/components/realtime-voice-button', () => {
  return {
    RealtimeVoiceButton: ({
      children,
      disabled,
      history,
      onConnectionStart,
      onError,
      onInputTranscriptComplete,
      onMicrophonePhase,
      onSessionEvent,
      onStatusChange,
      onTranscriptChange,
      onTurnActionReady,
      onTranscriptSnapshot,
      responseLanguage,
    }: {
      children?: import('react').ReactNode;
      disabled?: boolean;
      history?: unknown;
      onConnectionStart?: (signal: AbortSignal) => void | Promise<void>;
      onError: (message: string, details?: { kind?: string }) => void;
      onInputTranscriptComplete?: (result: { itemId: string; transcript: string }) => void;
      onMicrophonePhase?: (phase: 'idle' | 'explaining' | 'denied') => void;
      onSessionEvent?: (event: { type: 'starting' | 'ready' | 'ended'; reason?: string }) => void;
      onStatusChange?: (status: 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding') => void;
      onTranscriptChange?: (update: { speaker: 'you' | 'asha'; text: string }) => void;
      onTurnActionReady?: (action: (() => void) | null) => void;
      onTranscriptSnapshot?: (rows: { id: string; speaker: 'you' | 'asha'; text: string; startMs: number; endMs: number; fragments: never[] }[]) => void;
      responseLanguage: 'en' | 'hi';
    }) => {
      mockVoiceButtonProps.history = history;
      mockVoiceButtonProps.onConnectionStart = onConnectionStart;
      const onTurnComplete = (turn: { transcript: string; reply: string; language: 'en' | 'hi' }) => onTranscriptSnapshot?.([
        { id: 'live-user', speaker: 'you', text: turn.transcript, startMs: 0, endMs: 1000, fragments: [] },
        { id: 'live-asha', speaker: 'asha', text: turn.reply, startMs: 500, endMs: 1500, fragments: [] },
      ]);
      mockReact.useEffect(() => {
        onTurnActionReady?.(() => onStatusChange?.('recording'));
        return () => onTurnActionReady?.(null);
      }, [onStatusChange, onTurnActionReady]);
      return mockReact.createElement(
      mockReact.Fragment,
      null,
      children,
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
          onPress: async () => {
            onStatusChange?.('connecting');
            await onConnectionStart?.(new AbortController().signal);
          },
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
          accessibilityLabel: 'Mock completed realtime reply',
          onPress: () => {
            onTurnComplete({ transcript: 'Namaste', reply: 'A completed voice reply.', language: 'en' });
            onStatusChange?.('ready');
          },
        },
        mockReact.createElement(MockText, null, 'Mock completed reply'),
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
          accessibilityLabel: 'Mock overlapping captions',
          onPress: () => {
            const you = { id: 'you-overlap', speaker: 'you' as const, startMs: 0, endMs: 400, fragments: [] as never[] };
            const asha = { id: 'asha-overlap', speaker: 'asha' as const, startMs: 50, endMs: 200, fragments: [] as never[] };
            onTranscriptChange?.({ speaker: 'you', text: 'I' });
            onTranscriptSnapshot?.([{ ...you, text: 'I', endMs: 100 }]);
            onTranscriptChange?.({ speaker: 'asha', text: 'Yes?' });
            onTranscriptSnapshot?.([{ ...you, text: 'I', endMs: 100 }, { ...asha, text: 'Yes?' }]);
            onTranscriptChange?.({ speaker: 'you', text: 'I speak Hindi' });
            onTranscriptSnapshot?.([{ ...you, text: 'I speak Hindi' }, { ...asha, text: 'Yes?' }]);
          },
        },
        mockReact.createElement(MockText, null, 'Mock overlapping captions'),
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
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Show microphone explainer',
          onPress: () => onMicrophonePhase?.('explaining'),
        },
        mockReact.createElement(MockText, null, 'Show explainer'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Show microphone denied',
          onPress: () => onMicrophonePhase?.('denied'),
        },
        mockReact.createElement(MockText, null, 'Show denied'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock realtime offline',
          onPress: () => onError('Bolo is unavailable right now. Check your connection and try again.', { kind: 'network' }),
        },
        mockReact.createElement(MockText, null, 'Mock offline'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock realtime timeout',
          onPress: () => onError('The request timed out. Check your connection and try again.', { kind: 'timeout' }),
        },
        mockReact.createElement(MockText, null, 'Mock timeout'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock realtime unconfigured',
          onPress: () => onError('Live voice isn’t available right now. You can still type to Asha.', { kind: 'config' }),
        },
        mockReact.createElement(MockText, null, 'Mock unconfigured'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock realtime offline wording',
          onPress: () => onError('Bolo is unavailable right now. Check your connection and try again.', { kind: 'invalid_payload' }),
        },
        mockReact.createElement(MockText, null, 'Mock offline wording'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock session interrupted',
          onPress: () => {
            onSessionEvent?.({ type: 'ended', reason: 'connection_lost' });
            onStatusChange?.('disconnected');
          },
        },
        mockReact.createElement(MockText, null, 'Mock interrupted'),
      ),
      mockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: 'Mock session starting',
          onPress: () => onSessionEvent?.({ type: 'starting' }),
        },
        mockReact.createElement(MockText, null, 'Mock starting'),
      ),
      );
    },
  };
});

const mockElapsedSeconds = jest.fn(() => 42);
const mockResetPracticeTimer = jest.fn();

jest.mock('@/hooks/use-foreground-timer', () => ({
  useForegroundTimer: () => ({ elapsedSeconds: mockElapsedSeconds, reset: mockResetPracticeTimer , touch: jest.fn() }),
}));

let mockReducedMotion = false;

jest.mock('@/hooks/use-motion-preference', () => ({
  useMotionPreference: () => ({
    mode: mockReducedMotion ? 'reduced' : 'gentle',
    reducedMotion: mockReducedMotion,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ bottom: mockSafeAreaBottom, left: 0, right: 0, top: 0 }),
  };
});

let mockSafeAreaBottom = 0;

/** A keyboard event whose frame ends `height` points above the bottom edge, or floats `gap` points above it. */
function keyboardEvent(height: number, gap = 0) {
  const screenHeight = Dimensions.get('window').height;
  return { endCoordinates: { height, screenX: 0, screenY: screenHeight - height - gap, width: Dimensions.get('window').width } };
}

let mockAiConsent = true;
let mockFloatingAvailable = false;

jest.mock('@/state/asha-voice-session', () => {
  const actual = jest.requireActual('@/state/asha-voice-session') as Record<string, unknown>;
  return {
    ...actual,
    useAshaVoiceSession: () => ({
      available: mockFloatingAvailable,
      minimized: false,
      status: 'disconnected' as const,
      isPlaying: false,
      voice: null,
      snapshotIds: { current: [] as string[] },
      minimize: () => undefined,
      expand: () => undefined,
      endSession: () => undefined,
      setListeners: () => undefined,
    }),
  };
});

jest.mock('@/state/app-state', () => ({
  __appendChatMessagesMock: jest.fn(),
  __addPracticeSecondsMock: jest.fn(),
  __clearChatHistoryMock: jest.fn(),
  __markLiveTurnMock: jest.fn(),
  __togglePhraseMock: jest.fn(async () => 'saved'),
  useAppState: () => {
    const appState = jest.requireMock('@/state/app-state') as {
      __appendChatMessagesMock: jest.Mock;
      __addPracticeSecondsMock: jest.Mock;
      __clearChatHistoryMock: jest.Mock;
      __markLiveTurnMock: jest.Mock;
      __togglePhraseMock: jest.Mock;
    };
    const [chatHistory, setChatHistory] = mockReact.useState<
      { id: string; role: 'you' | 'asha'; text: string; language?: 'en' | 'hi' }[]
    >([]);
    const [learnerProfile, setLearnerProfile] = mockReact.useState<{
      completed: boolean;
      level: 'new' | 'beginner' | 'intermediate';
      microphoneTested: boolean;
      primaryGoal: 'conversation' | 'travel' | 'family' | 'work';
      responseLanguage: 'en' | 'hi';
      scriptPreference: 'both' | 'devanagari' | 'latin';
    }>({
      completed: true,
      level: 'new',
      microphoneTested: false,
      primaryGoal: 'conversation',
      responseLanguage: 'en',
      scriptPreference: 'both',
    });
    const appendChatMessages = mockReact.useCallback((messages: typeof chatHistory) => {
      appState.__appendChatMessagesMock(messages);
      setChatHistory((current) => [...current, ...messages].slice(-100));
    }, []);
    const replaceLiveChatSnapshot = mockReact.useCallback((previousIds: string[], messages: typeof chatHistory) => {
      appState.__appendChatMessagesMock(messages);
      setChatHistory((current) => [...current.filter((row) => !previousIds.includes(row.id)), ...messages].slice(-100));
    }, []);
    const clearChatHistory = mockReact.useCallback(async () => {
      const result = appState.__clearChatHistoryMock();
      setChatHistory([]);
      return (await result) !== false;
    }, []);
    return {
      addPracticeSeconds: appState.__addPracticeSecondsMock,
      aiConsent: mockAiConsent,
      appendChatMessages,
      replaceLiveChatSnapshot,
      chatHistory,
      clearChatHistory,
      clientId: 'client-12345678',
      markLiveTurn: appState.__markLiveTurnMock,
      learnerProfile,
      phraseReviews: {},
      phrases: [],
      togglePhrase: appState.__togglePhraseMock,
      updateLearnerProfile: (update: Partial<typeof learnerProfile>) => setLearnerProfile((current) => ({ ...current, ...update })),
    };
  },
}));

jest.mock('@/lib/speech', () => ({
  preloadSpeech: jest.fn(async () => undefined),
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

let mockRecoveryPending: Promise<void> | null = null;

jest.mock('@/lib/asha-session-log-store', () => ({
  clearAshaSessionContent: jest.fn(async () => undefined),
  ensureAshaSessionLogLoaded: jest.fn(() => mockRecoveryPending ?? Promise.resolve()),
  findAshaSessionIdForRow: jest.fn(() => undefined),
  logAshaSessionEvent: jest.fn(),
  logAshaSessionSnapshot: jest.fn(),
  registerLiveCallEnder: jest.fn(() => jest.fn()),
}));

const sessionLog = jest.requireMock('@/lib/asha-session-log-store') as {
  clearAshaSessionContent: jest.Mock;
  ensureAshaSessionLogLoaded: jest.Mock;
  findAshaSessionIdForRow: jest.Mock;
  logAshaSessionEvent: jest.Mock;
  logAshaSessionSnapshot: jest.Mock;
  registerLiveCallEnder: jest.Mock;
};

jest.mock('@/services/bolo-api', () => ({
  getContextualWordDefinition: jest.fn(),
  prepareSavedPhraseFromText: jest.fn(),
  reportGeneratedMessage: jest.fn(),
  sendMobileChat: jest.fn(),
}));

let mockOutboxEntries: { id: string; kind: 'report_message'; sessionId?: string; payload: { message: string; reason: string; messageId?: string }; createdAt: string; attempts: number; nextAttemptAt: string; state: 'pending' | 'in_flight' | 'failed'; lastError?: string }[] = [];
const queuedEntry = (overrides: Partial<(typeof mockOutboxEntries)[number]> = {}): (typeof mockOutboxEntries)[number] => ({
  id: 'entry-1',
  kind: 'report_message',
  payload: { message: 'Hello there.', reason: 'incorrect_or_misleading', messageId: 'live-asha' },
  createdAt: '2026-10-31T10:00:00.000Z',
  attempts: 1,
  nextAttemptAt: '2026-10-31T10:00:02.000Z',
  state: 'pending',
  ...overrides,
});
let mockOutboxClassification: 'transient' | 'permanent' = 'permanent';
const mockDeliveredListeners = new Set<(entry: (typeof mockOutboxEntries)[number]) => void>();
const mockOutboxGeneration = 7;

jest.mock('@/lib/sync-outbox', () => ({
  classifyOutboxError: () => mockOutboxClassification,
  outboxRetryAfterMs: (error: unknown) => (error as { retryAfterMs?: number } | null)?.retryAfterMs,
  syncOutbox: {
    discard: jest.fn(async () => undefined),
    enqueue: jest.fn(async (op: unknown) => ({ ...(op as object), id: 'entry-1', state: 'pending' })),
    generation: () => mockOutboxGeneration,
    retry: jest.fn(async () => undefined),
    subscribeDelivered: (listener: (entry: (typeof mockOutboxEntries)[number]) => void) => {
      mockDeliveredListeners.add(listener);
      return () => mockDeliveredListeners.delete(listener);
    },
  },
  useSyncOutbox: () => mockOutboxEntries,
}));

const outbox = jest.requireMock('@/lib/sync-outbox') as {
  syncOutbox: { discard: jest.Mock; enqueue: jest.Mock; retry: jest.Mock };
};

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
  __addPracticeSecondsMock: jest.Mock;
  __clearChatHistoryMock: jest.Mock;
  __markLiveTurnMock: jest.Mock;
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

function scrollLiveChat(view: { getByTestId: (id: string) => { props: Record<string, unknown> } }, offsetY: number, options?: { drag?: boolean }) {
  const list = view.getByTestId('live-chat-list');
  if (options?.drag !== false) {
    const beginDrag = list.props.onScrollBeginDrag;
    if (typeof beginDrag === 'function') beginDrag();
  }
  const onScroll = list.props.onScroll;
  if (typeof onScroll !== 'function') throw new Error('Expected the live chat list to handle scroll.');
  onScroll({
    nativeEvent: {
      contentOffset: { x: 0, y: offsetY },
      contentSize: { height: 2000, width: 390 },
      layoutMeasurement: { height: 800, width: 390 },
    },
  });
}

async function flushScrollFrames() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

type Rendered = Awaited<ReturnType<typeof render>>;

/** Secondary bubble actions (Words, Listen, Report) live behind each bubble's "More actions" button. */
async function openMoreMenu(view: Rendered, excerpt?: RegExp) {
  const buttons = view.getAllByLabelText(/^More actions:/u);
  const target = excerpt ? buttons.find((button) => excerpt.test(String(button.props.accessibilityLabel))) : buttons[buttons.length - 1];
  if (!target) throw new Error('The More actions button was not rendered.');
  await fireEvent.press(target);
}

async function pressReplyAction(view: Rendered, action: RegExp, excerpt?: RegExp) {
  await openMoreMenu(view, excerpt);
  await fireEvent.press(view.getByLabelText(action));
}

/** The chat line is a read-only TextInput: flat `value` for Latin text, nested spans once Devanagari is shown. */
function lineText(node: { props: { children?: unknown; value?: string } }): string {
  if (typeof node.props.value === 'string') return node.props.value;
  const flatten = (child: unknown): string => {
    if (child === null || child === undefined || typeof child === 'boolean') return '';
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (Array.isArray(child)) return child.map(flatten).join('');
    return flatten((child as { props?: { children?: unknown } }).props?.children);
  };
  return flatten(node.props.children);
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

  it('leads with Asha and keeps a live session closed until the consent sheet is accepted', async () => {
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    mockVoiceButtonProps.onConnectionStart = undefined;
    const view = await render(<LiveScreen />);
    const list = view.getByTestId('live-chat-list');

    expect(view.getByTestId('asha-header-portrait')).toBeTruthy();
    expect(view.getByText('Greet me like a neighbor and tell me your name')).toBeTruthy();
    expect(view.getByText('Your voice and a few lesson details are shared with Asha so she can answer.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Talk with Asha' })).toBeTruthy();
    expect(view.queryByTestId('mock-ai-consent-gate')).toBeNull();
    expect(view.queryByText('WebRTC')).toBeNull();
    expect(view.queryByText(/GPT-Live/u)).toBeNull();
    const testIds = collectTestIds(view.toJSON());
    expect(testIds.indexOf('asha-header-portrait')).toBeLessThan(testIds.indexOf('talk-with-asha'));
    // The voice-language switch only appears once Asha is turned on, so it never shows greyed out.
    expect(view.queryAllByRole('tab', { name: /Asha voice language/u })).toHaveLength(0);
    expect(view.queryByLabelText('Create Asha reply')).toBeNull();
    expect(mockVoiceButtonProps.onConnectionStart).toBeUndefined();
    expect(view.queryByTestId('live-input-caption')).toBeNull();
    expect(view.queryByTestId('live-output-caption')).toBeNull();
    expect(view.queryByText('Your words appear here as you speak.')).toBeNull();
    expect(view.queryByLabelText('Open transcript')).toBeNull();
    expect(view.queryByText('Ask Asha')).toBeNull();
    expect(view.queryByLabelText('Message Asha')).toBeNull();
    expect(view.queryByTestId('composer-mic-toggle')).toBeNull();
    expect(view.queryByTestId('featured-phrase-section')).toBeNull();

    await act(async () => {
      list.props.onContentSizeChange();
      await Promise.resolve();
    });

    expect(scrollToEnd).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole('button', { name: 'Talk with Asha' }));
    expect(view.getByTestId('mock-ai-consent-gate')).toBeTruthy();
    expect(view.getByText('Before your first live conversation')).toBeTruthy();
    expect(view.getByText('Enable live practice')).toBeTruthy();
    expect(view.queryByLabelText('Mock realtime connecting')).toBeNull();

    mockAiConsent = true;
    await view.rerender(<LiveScreen />);
    expect(view.queryByTestId('mock-ai-consent-gate')).toBeNull();
    expect(view.getByLabelText('Mock realtime connecting')).toBeTruthy();
    await view.unmount();
  }, 20_000);

  it('keeps the Last session entry reachable while consent is off, outside the consent-only section', async () => {
    const view = await render(<LiveScreen />);
    expect(view.queryByTestId('ask-asha-sheet')).toBeNull();
    const entry = view.getByLabelText('View last Asha session');
    expect(entry.props.accessibilityRole).toBe('button');
    await fireEvent.press(entry);
    expect(mockRouterPush).toHaveBeenCalledWith('/last-session');
    await view.unmount();
  });

  it('keeps the invite when consent is off and chat history is already stored', async () => {
    mockAiConsent = true;
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    expect(view.getByLabelText('Asha: Hello there.')).toBeTruthy();

    mockAiConsent = false;
    await act(async () => {
      view.rerender(<LiveScreen />);
      await Promise.resolve();
    });

    expect(view.getByText('Greet me like a neighbor and tell me your name')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Talk with Asha' })).toBeTruthy();
    expect(view.queryByText('Ready when you are')).toBeNull();
    expect(view.queryByTestId('composer-mic-toggle')).toBeNull();
    await view.unmount();
    await flushMicrotasks();
  });
});

describe('live microphone denial', () => {
  beforeEach(() => {
    mockAiConsent = true;
  });

  it('shows an Open Settings action when the microphone is denied', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Show microphone denied'));

    expect(view.getByText('The microphone is off')).toBeTruthy();
    expect(view.getByText('Microphone access is required for live voice practice.')).toBeTruthy();
    await fireEvent.press(view.getByTestId('mic-open-settings'));
    expect(openSettings).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByLabelText('Show microphone explainer'));
    expect(view.getByText('Asha needs the microphone to hear you.')).toBeTruthy();
    expect(view.queryByTestId('mic-open-settings')).toBeNull();
    await view.unmount();
  });
});

describe('live composer bottom inset', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    mockSafeAreaBottom = 0;
  });

  it('measures the tab bar inset natively on iOS and drops it while the keyboard is open', async () => {
    mockSafeAreaBottom = 83;
    const listeners = new Map<string, (event?: unknown) => void>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: (event?: unknown) => void) => {
      listeners.set(event, listener);
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    const view = await render(<LiveScreen />);
    const composerArea = () => view.getByTestId('live-composer-area');

    expect(composerArea().props.edges).toEqual({ bottom: 'additive' });
    expect(StyleSheet.flatten(composerArea().props.style).paddingBottom).toBe(spacing.sm);

    await act(async () => { expectDefined(listeners.get('keyboardWillShow'))(keyboardEvent(336)); });
    expect(composerArea().props.edges).toEqual({});

    await act(async () => { expectDefined(listeners.get('keyboardWillHide'))(); });
    expect(composerArea().props.edges).toEqual({ bottom: 'additive' });
    await view.unmount();
  }, 20_000);

  it.each([
    ['a hardware-keyboard shortcut bar', keyboardEvent(55)],
    ['a floating keyboard', keyboardEvent(260, 120)],
  ])('keeps the tab bar inset for %s', async (_label, keyboard) => {
    mockSafeAreaBottom = 83;
    const listeners = new Map<string, (event?: unknown) => void>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: (event?: unknown) => void) => {
      listeners.set(event, listener);
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    const view = await render(<LiveScreen />);

    await act(async () => { expectDefined(listeners.get('keyboardWillShow'))(keyboard); });
    expect(view.getByTestId('live-composer-area').props.edges).toEqual({ bottom: 'additive' });
    await view.unmount();
  }, 20_000);
});

describe('suggestion chip row width', () => {
  it('keeps a short peek of the next chip inside the inset', () => {
    expect(visibleChipRowWidth([100, 100, 100, 100], 360, layout.chipPeek, spacing.sm)).toBe(348);
    expect(visibleChipRowWidth([80, 80], 300, layout.chipPeek, spacing.sm)).toBe(168);
    expect(visibleChipRowWidth([0, 0, 0, 0], 300, layout.chipPeek, spacing.sm)).toBe(300);
  });
});

describe('live theme styles', () => {
  it('paints the chat list, bubbles, and composer from the active palette', () => {
    const styles = createLiveStyles(lightColors);

    expect(styles.list.backgroundColor).toBe(lightColors.night);
    expect(styles.ashaMessage.backgroundColor).toBe(lightColors.paperRaised);
    expect(styles.messageText.color).toBe(lightColors.ink);
    expect(styles.userMessage.backgroundColor).toBe(lightColors.nightSurface);
    expect(styles.composer.backgroundColor).toBe(lightColors.nightSurface);
    expect(styles.input.backgroundColor).toBe(lightColors.night);
    expect(styles.liveVoiceText.lineHeight).toBeGreaterThan(styles.liveVoiceText.fontSize);
    expect(styles.captionLabelBadge.minHeight).toBeGreaterThanOrEqual(30);
    expect(styles.captionLabelBadge.paddingVertical).toBeGreaterThanOrEqual(5);
    expect(styles.captionLabelBadge.overflow).toBe('visible');
    expect(styles.captionLabel.fontSize).toBeGreaterThanOrEqual(12);
    expect(styles.captionLabel.lineHeight).toBeGreaterThanOrEqual(18);
    expect(styles.captionLabel.fontWeight).toBe('700');
    expect(styles.captionLabel.letterSpacing).toBeLessThanOrEqual(0.25);
    expect('textTransform' in styles.captionLabel).toBe(false);
    expect('minHeight' in styles.voiceHero).toBe(false);
    expect('minHeight' in styles.voiceHeroCompact).toBe(false);
    expect('flexWrap' in styles.examples).toBe(false);
    expect(styles.examples.flexDirection).toBe('row');
    expect(styles.examples.paddingRight).toBe(layout.chipScrollInset);
    expect(styles.composer.paddingHorizontal).toBe(spacing.gutter);
    expect(styles.exampleClip.overflow).toBe('hidden');
    expect(styles.exampleClip.marginHorizontal).toBe(layout.chipScrollInset - spacing.gutter);
    expect(styles.exampleScroller.flexGrow).toBe(0);
    expect(layout.chipEndInset).toBe(spacing.gutter);
    expect(layout.chipScrollInset).toBe(spacing.lg);
    expect(layout.chipPeek).toBe(spacing.xl);
    expect(styles.voiceHeroResting.paddingBottom).toBe(spacing.sm);
    expect(styles.headerSettings.minHeight).toBe(layout.touchTarget);
    expect(styles.clearChatButton.borderWidth).toBe(styles.lastSessionButton.borderWidth);
    expect(styles.clearChatButton.backgroundColor).toBe('transparent');
    expect(styles.lastSessionButton.backgroundColor).toBe('transparent');
    expect(styles.clearChatButton.borderColor).toBe(styles.lastSessionButton.borderColor);
    expect(layout.touchTarget).toBe(44);
    expect(styles.askHeading.flexDirection).toBe('column');
    expect(styles.askTitle.alignSelf).toBe('stretch');
    expect(styles.askTitle.textAlign).toBe('left');
    expect('fontFamily' in styles.askTitle).toBe(false);
    expect(styles.headerTitle.fontFamily).toBe(displayFont);
    expect(styles.headerTitle.textAlign).toBe('left');
    expect('maxWidth' in styles.headerTitle).toBe(false);
    expect('maxWidth' in styles.heroTitle).toBe(false);
    expect('maxWidth' in styles.heroBody).toBe(false);
    expect('fontFamily' in styles.heroTitle).toBe(false);
    expect('borderWidth' in styles.privateBadge).toBe(false);
    expect(styles.privateBadge.flexShrink).toBe(0);
    expect(styles.secondaryActionText.flexShrink).toBe(0);
    expect(styles.messageLabel.flexShrink).toBe(0);
    expect(styles.example.paddingVertical).toBe(spacing.sm);
    expect(styles.voiceHero.overflow).toBe('visible');
    expect(layout.headerStackBelow).toBe(360);
    expect(styles.ashaPortraitCollapsed.height).toBe(layout.touchTarget);
    expect(styles.askHeadingActions.flexDirection).toBe('row');
    expect(styles.askHeadingActions.flexWrap).toBe('wrap');
    expect(styles.askHeadingActions.justifyContent).toBe('space-between');
    expect(styles.lastSessionSlot.marginLeft).toBe('auto');
    expect(styles.clearChatButton.minHeight).toBe(layout.touchTarget);
    expect(styles.clearChatButton.flexShrink).toBe(0);
    expect(styles.lastSessionButton.minHeight).toBe(layout.touchTarget);
    expect(styles.lastSessionButton.flexShrink).toBe(0);
    expect(styles.example.minHeight).toBe(layout.touchTarget);
    expect(styles.example.flexShrink).toBe(0);
  });

  it.each([1, 1.12, 2])('keeps the chat title off the Last session row at font scale %s', async (fontScale) => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    const size = { fontScale, height: 852, scale: 3, width: 393 };
    await act(async () => {
      Dimensions.set({ screen: size, window: size });
      await Promise.resolve();
    });
    try {
      const view = await render(<LiveScreen />);
      const actions = view.getByTestId('ask-asha-actions');
      const chips = view.getByTestId('live-example-chips');
      const accessibilityCompact = fontScale >= layout.accessibilityFontScale;

      expect(StyleSheet.flatten(view.getByTestId('ask-asha-heading-block').props.style).flexDirection).toBe('column');
      if (accessibilityCompact) {
        expect(view.queryByTestId('ask-asha-heading')).toBeNull();
        expect(view.getByText('Your Hindi coach')).toBeTruthy();
      } else {
        const heading = view.getByTestId('ask-asha-heading');
        expect(within(heading).getByText('How do I say…?')).toBeTruthy();
        expect(within(heading).queryByText('Last session')).toBeNull();
      }
      expect(within(actions).getByText('Last session')).toBeTruthy();
      expect(StyleSheet.flatten(actions.props.style)).toMatchObject({
        flexWrap: 'wrap',
        justifyContent: 'space-between',
      });
      expect(chips.props.horizontal).toBe(true);
      expect(StyleSheet.flatten(chips.props.contentContainerStyle)).toMatchObject({
        flexDirection: 'row',
        paddingRight: layout.chipScrollInset,
      });
      expect(view.getByLabelText('Settings')).toBeTruthy();
      expect(view.queryByLabelText('Clear Asha chat history')).toBeNull();
      expect(StyleSheet.flatten(chips.props.contentContainerStyle).flexWrap).toBeUndefined();
      expect(view.getByRole('button', { name: 'Correct my Hindi' })).toBeTruthy();
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

describe('immersive live conversation design', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReducedMotion = false;
  });

  it('ignores a keyboard opened on another tab', async () => {
    const listeners = new Map<string, (event?: unknown) => void>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: (event?: unknown) => void) => {
      listeners.set(event, listener);
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const view = await render(<LiveScreen />);
    try {
      await act(async () => { mockBlurScreen(); });
      scrollToEnd.mockClear();
      await act(async () => {
        expectDefined(listeners.get('keyboardWillShow'))(keyboardEvent(336));
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(scrollToEnd).not.toHaveBeenCalled();
    } finally {
      jest.restoreAllMocks();
      await view.unmount();
      await flushMicrotasks();
    }
  });

  it('does not auto-scroll when the voice header grows during a live session', async () => {
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const view = await render(<LiveScreen />);
    const scrollList = (offsetY: number) => {
      view.getByTestId('live-chat-list').props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: offsetY },
          contentSize: { height: 2000, width: 390 },
          layoutMeasurement: { height: 800, width: 390 },
        },
      });
    };
    try {
      await fireEvent.press(view.getByLabelText('Create Asha reply'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(scrollToEnd.mock.calls.length).toBeGreaterThan(0);
      scrollToEnd.mockClear();

      await fireEvent.press(view.getByLabelText('Mock realtime ready'));
      await act(async () => {
        view.getByTestId('live-chat-list').props.onContentSizeChange();
      });
      expect(scrollToEnd).not.toHaveBeenCalled();

      await act(async () => { scrollList(0); });
      await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
      scrollToEnd.mockClear();
      await act(async () => {
        view.getByTestId('live-chat-list').props.onContentSizeChange();
      });
      expect(scrollToEnd).not.toHaveBeenCalled();

      await act(async () => { scrollList(1160); });
      await act(async () => {
        view.getByTestId('live-chat-list').props.onContentSizeChange();
      });
      expect(scrollToEnd).toHaveBeenCalled();
    } finally {
      scrollToEnd.mockRestore();
      await view.unmount();
      await flushMicrotasks();
    }
  });

  it('follows a typed send only after the new message and typing row have rendered', async () => {
    const request = deferred<{ transcript: string; reply: string; language: 'en' }>();
    boloApi.sendMobileChat.mockReturnValue(request.promise);
    const view = await render(<LiveScreen />);
    const tailHadNewTurn: boolean[] = [];
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {
      const list = within(view.getByTestId('live-chat-list'));
      tailHadNewTurn.push(list.queryByLabelText('You: Show this turn.') != null && list.queryByTestId('asha-typing-indicator') != null);
    });
    try {
      scrollLiveChat(view, 0);
      scrollToEnd.mockClear();
      await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Show this turn.');
      await fireEvent.press(view.getByLabelText('Send message'));

      const list = within(view.getByTestId('live-chat-list'));
      expect(list.getByLabelText('You: Show this turn.')).toBeTruthy();
      expect(list.getByTestId('asha-typing-indicator')).toBeTruthy();
      expect(scrollToEnd).not.toHaveBeenCalled();

      await flushScrollFrames();
      expect(scrollToEnd).toHaveBeenNthCalledWith(1, { animated: true });
      expect(scrollToEnd).toHaveBeenNthCalledWith(2, { animated: true });
      expect(tailHadNewTurn).toEqual([true, true]);
    } finally {
      await act(async () => {
        request.resolve({ transcript: '', reply: 'Shown at the tail.', language: 'en' });
        for (let index = 0; index < 12; index += 1) await Promise.resolve();
      });
      scrollToEnd.mockRestore();
      await view.unmount();
      await flushMicrotasks();
    }
  });

  it('ignores a non-drag scroll during the send animation, then honors one after the scroll ends', async () => {
    const request = deferred<{ transcript: string; reply: string; language: 'en' }>();
    boloApi.sendMobileChat.mockReturnValue(request.promise);
    const view = await render(<LiveScreen />);
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => undefined);
    try {
      scrollLiveChat(view, 0);
      scrollToEnd.mockClear();
      await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Watch the animation.');
      await fireEvent.press(view.getByLabelText('Send message'));
      await flushScrollFrames();
      scrollToEnd.mockClear();

      scrollLiveChat(view, 0, { drag: false });
      await act(async () => {
        request.resolve({ transcript: '', reply: 'Still following.', language: 'en' });
        for (let index = 0; index < 12; index += 1) await Promise.resolve();
      });
      await flushScrollFrames();
      expect(within(view.getByTestId('live-chat-list')).getByLabelText('Asha: Still following.')).toBeTruthy();
      expect(scrollToEnd).toHaveBeenCalled();

      scrollToEnd.mockClear();
      const end = view.getByTestId('live-chat-list').props.onMomentumScrollEnd;
      if (typeof end !== 'function') throw new Error('Expected the live chat list to end momentum.');
      end();
      scrollLiveChat(view, 0, { drag: false });
      await act(async () => {
        view.getByTestId('live-chat-list').props.onContentSizeChange();
      });
      expect(scrollToEnd).not.toHaveBeenCalled();
    } finally {
      scrollToEnd.mockRestore();
      await view.unmount();
      await flushMicrotasks();
    }
  });

  it('jumps a typed send when motion is reduced', async () => {
    mockReducedMotion = true;
    const request = deferred<{ transcript: string; reply: string; language: 'en' }>();
    boloApi.sendMobileChat.mockReturnValue(request.promise);
    const view = await render(<LiveScreen />);
    const rowVisibleAtScroll: boolean[] = [];
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {
      rowVisibleAtScroll.push(within(view.getByTestId('live-chat-list')).queryByLabelText('You: Quiet send.') != null);
    });
    try {
      scrollLiveChat(view, 0);
      scrollToEnd.mockClear();
      await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Quiet send.');
      await fireEvent.press(view.getByLabelText('Send message'));
      await flushScrollFrames();

      expect(within(view.getByTestId('live-chat-list')).getByLabelText('You: Quiet send.')).toBeTruthy();
      expect(scrollToEnd).toHaveBeenNthCalledWith(1, { animated: false });
      expect(scrollToEnd).toHaveBeenNthCalledWith(2, { animated: false });
      expect(rowVisibleAtScroll).toEqual([true, true]);
    } finally {
      mockReducedMotion = false;
      await act(async () => {
        request.resolve({ transcript: '', reply: 'Quiet reply.', language: 'en' });
        for (let index = 0; index < 12; index += 1) await Promise.resolve();
      });
      scrollToEnd.mockRestore();
      await view.unmount();
      await flushMicrotasks();
    }
  });

  it('follows an example chip only after its message has rendered', async () => {
    const request = deferred<{ transcript: string; reply: string; language: 'en' }>();
    boloApi.sendMobileChat.mockReturnValue(request.promise);
    const view = await render(<LiveScreen />);
    const chipVisibleAtScroll: boolean[] = [];
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd').mockImplementation(() => {
      chipVisibleAtScroll.push(within(view.getByTestId('live-chat-list')).queryByLabelText('You: Order tea') != null);
    });
    try {
      scrollLiveChat(view, 0);
      scrollToEnd.mockClear();
      await fireEvent.press(view.getByRole('button', { name: 'Order tea' }));

      expect(within(view.getByTestId('live-chat-list')).getByLabelText('You: Order tea')).toBeTruthy();
      expect(scrollToEnd).not.toHaveBeenCalled();

      await flushScrollFrames();
      expect(scrollToEnd).toHaveBeenNthCalledWith(1, { animated: true });
      expect(scrollToEnd).toHaveBeenNthCalledWith(2, { animated: true });
      expect(chipVisibleAtScroll).toEqual([true, true]);
    } finally {
      await act(async () => {
        request.resolve({ transcript: '', reply: 'Chai, kripya.', language: 'en' });
        for (let index = 0; index < 12; index += 1) await Promise.resolve();
      });
      scrollToEnd.mockRestore();
      await view.unmount();
      await flushMicrotasks();
    }
  });

  it('does not follow an assistant reply that arrives after the reader scrolls back up', async () => {
    const request = deferred<{ transcript: string; reply: string; language: 'en' }>();
    boloApi.sendMobileChat.mockReturnValue(request.promise);
    const view = await render(<LiveScreen />);
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    try {
      scrollLiveChat(view, 0);
      await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Ask from the top.');
      await fireEvent.press(view.getByLabelText('Send message'));
      await flushScrollFrames();
      scrollToEnd.mockClear();

      scrollLiveChat(view, 0);
      await act(async () => {
        request.resolve({ transcript: '', reply: 'Reply below the fold.', language: 'en' });
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(within(view.getByTestId('live-chat-list')).getByLabelText('Asha: Reply below the fold.')).toBeTruthy();
      expect(scrollToEnd).not.toHaveBeenCalled();
    } finally {
      scrollToEnd.mockRestore();
      await view.unmount();
      await flushMicrotasks();
    }
  });

  it('does not follow a realtime voice turn while the reader is away from the tail', async () => {
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const view = await render(<LiveScreen />);
    try {
      scrollLiveChat(view, 0);
      scrollToEnd.mockClear();
      await fireEvent.press(view.getByLabelText('Create Asha reply'));
      await flushScrollFrames();

      const list = within(view.getByTestId('live-chat-list'));
      expect(list.getByLabelText('You: Namaste')).toBeTruthy();
      expect(list.getByLabelText('Asha: Hello there.')).toBeTruthy();
      expect(scrollToEnd).not.toHaveBeenCalled();
    } finally {
      scrollToEnd.mockRestore();
      await view.unmount();
      await flushMicrotasks();
    }
  });

  it('does not follow an unrelated voice turn after a failed send while scrolled up', async () => {
    boloApi.sendMobileChat.mockRejectedValueOnce(new Error('Asha is unavailable.'));
    const view = await render(<LiveScreen />);
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    try {
      scrollLiveChat(view, 0);
      scrollToEnd.mockClear();
      await fireEvent.changeText(view.getByLabelText('Message Asha'), 'This send fails.');
      await fireEvent.press(view.getByLabelText('Send message'));
      await flushScrollFrames();

      const list = within(view.getByTestId('live-chat-list'));
      expect(list.queryByLabelText('You: This send fails.')).toBeNull();
      expect(view.getByText('Asha is unavailable.')).toBeTruthy();
      scrollToEnd.mockClear();
      scrollLiveChat(view, 0);

      await fireEvent.press(view.getByLabelText('Create Asha reply'));
      await flushScrollFrames();
      expect(list.getByLabelText('You: Namaste')).toBeTruthy();
      expect(list.getByLabelText('Asha: Hello there.')).toBeTruthy();
      expect(scrollToEnd).not.toHaveBeenCalled();
    } finally {
      scrollToEnd.mockRestore();
      await view.unmount();
      await flushMicrotasks();
    }
  });

  it('does not follow the tail when a send is rejected', async () => {
    const scrollToEnd = jest.spyOn(FlatList.prototype, 'scrollToEnd');
    const view = await render(<LiveScreen />);
    try {
      await fireEvent.press(view.getByLabelText('Mock realtime ready'));
      scrollLiveChat(view, 0);
      scrollToEnd.mockClear();
      await act(async () => {
        getOnPress(view.getByRole('button', { name: 'Order tea' }))();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(boloApi.sendMobileChat).not.toHaveBeenCalled();
      expect(within(view.getByTestId('live-chat-list')).queryByLabelText('You: Order tea')).toBeNull();
      expect(scrollToEnd).not.toHaveBeenCalled();
    } finally {
      scrollToEnd.mockRestore();
      await view.unmount();
      await flushMicrotasks();
    }
  });

  it('uses the voice-first hierarchy from the supplied design without hiding typed coaching', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    const phone = { ...originalWindow, fontScale: 1, height: 852, width: 393 };
    await act(async () => {
      Dimensions.set({ screen: { ...originalScreen, ...phone }, window: phone });
      await Promise.resolve();
    });
    const view = await render(<LiveScreen />);
    try {
    const hero = view.getByTestId('voice-conversation-hero');

    expect(StyleSheet.flatten(hero.props.style).backgroundColor).toBe(lightColors.night);
    expect(StyleSheet.flatten(hero.props.style).minHeight).toBeUndefined();
    expect(view.getByText('Your Hindi coach')).toBeTruthy();
    expect(view.getAllByText('Speak with Asha')).toHaveLength(1);
    expect(view.getByText('Ready when you are')).toBeTruthy();
    expect(view.getByText('Tap Asha to start talking with her.')).toBeTruthy();
    expect(view.getAllByText(/Tap Asha/u)).toHaveLength(1);
    expect(view.queryByText(/orb/u)).toBeNull();
    expect(view.queryByTestId('live-caption-label-badge')).toBeNull();
    expect(view.queryByTestId('live-input-caption')).toBeNull();
    expect(view.queryByTestId('live-output-caption')).toBeNull();
    expect(view.queryByText('Your words appear here as you speak.')).toBeNull();
    expect(view.queryByText('Asha’s words appear here as she speaks.')).toBeNull();
    expect(view.queryByText('LIVE')).toBeNull();
    expect(view.queryByText('Tap the orb and ask anything in Hindi.')).toBeNull();
    expect(view.queryByText('Live Asha caption')).toBeNull();
    expect(view.queryByLabelText('Open text phrase help')).toBeNull();
    expect(view.queryByLabelText('Connect with Asha')).toBeNull();
    expect(view.queryByLabelText('Unmute microphone')).toBeNull();
    expect(view.queryByText('Live microphone')).toBeNull();
    expect(view.getByTestId('composer-mic-toggle').props.accessibilityLabel).toBe('Start a voice conversation');
    expect(view.getByText('Ask Asha')).toBeTruthy();
    expect(view.getByText('How do I say…?')).toBeTruthy();
    expect(view.getByLabelText('Open transcript')).toBeTruthy();
    expect(view.queryByLabelText('Go back')).toBeNull();
    expect(view.getByTestId('featured-phrase-section')).toBeTruthy();
    expect(within(hero).queryByText('Featured phrase')).toBeNull();

    const sheet = view.getByTestId('ask-asha-sheet');
    const sheetStyle = StyleSheet.flatten(sheet.props.style);
    expect(sheetStyle.marginTop).toBeLessThan(0);
    expect(sheetStyle.borderTopLeftRadius).toBeGreaterThanOrEqual(30);
    expect(view.queryByTestId('ask-asha-sheet-handle')).toBeNull();

    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    expect(view.getByText('Connecting to Asha')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime recording'));
    expect(view.getByText('Your microphone is on')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime responding'));
    expect(view.getByText('Asha is speaking')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.queryByText('Live Asha caption')).toBeNull();

    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    expect(view.queryByText('Ready when you are')).toBeNull();
    expect(view.getByText('Tap Asha to start talking with her.')).toBeTruthy();
    expect(view.getByTestId('asha-voice-status')).toBeTruthy();
    expect(within(view.getByTestId('live-chat-list')).queryByTestId('composer-mic-toggle')).toBeNull();
    expect(view.getByTestId('composer-mic-toggle').props.accessibilityLabel).toBe('Start a voice conversation');
    expect(view.queryByText('How do I say…?')).toBeNull();
    expect(view.queryByTestId('live-input-caption')).toBeNull();
    expect(view.getByTestId('live-output-caption').props.accessibilityLiveRegion).toBe('polite');
    expect(view.getByTestId('live-output-caption').props.children).toBe('Hello there.');
    expect(view.getByLabelText('Asha: Hello there.')).toBeTruthy();
    expect(view.queryByLabelText('Connect with Asha')).toBeNull();

    expect(view.getByLabelText('Message Asha')).toBeTruthy();
    } finally {
      await view.unmount();
      await flushMicrotasks();
      await act(async () => {
        Dimensions.set({ screen: originalScreen, window: originalWindow });
        await Promise.resolve();
      });
    }
  });

  it('hides caption cards until speech starts, then shows the latest line', async () => {
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    expect(view.queryByTestId('live-output-caption')).toBeNull();
    expect(view.queryByTestId('live-input-caption')).toBeNull();
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    expect(view.queryByText('Your words appear here as you speak.')).toBeNull();
    expect(view.queryByText('Asha’s words appear here as she speaks.')).toBeNull();
    await fireEvent.press(view.getByLabelText('Mock learner transcript'));
    expect(view.getByTestId('live-input-caption').props.children).toBe('Namaste, meraa naam Chris hai.');
    expect(view.queryByTestId('live-output-caption')).toBeNull();
    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.queryByText('Live Asha caption')).toBeNull();

    await view.unmount();
    await flushMicrotasks();
  });

  it('keeps the latest speaker when a snapshot still ends on the other person', async () => {
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Mock overlapping captions'));

    expect(view.getByTestId('live-input-caption').props.children).toBe('I speak Hindi');
    expect(view.queryByTestId('live-output-caption')).toBeNull();

    await view.unmount();
    await flushMicrotasks();
  });

  it('shows learner transcription and then Asha captions while the voice turn is in progress', async () => {
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Mock realtime recording'));
    await fireEvent.press(view.getByLabelText('Mock learner transcript'));
    expect(view.getByTestId('live-input-caption')).toBeTruthy();
    expect(view.getByText('Namaste, meraa naam Chris hai.')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Mock realtime responding'));
    await fireEvent.press(view.getByLabelText('Mock Asha transcript'));
    expect(view.queryByTestId('live-input-caption')).toBeNull();
    expect(view.getByTestId('live-output-caption')).toBeTruthy();
    expect(view.getByText('Namaste Chris, aap kaise hain?')).toBeTruthy();

    await view.unmount();
    await flushMicrotasks();
  });

  it('keeps a compact mute control beside the composer after messages exist', async () => {
    const view = await render(<LiveScreen />);

    const portrait = view.getByTestId('asha-header-portrait');
    expect(StyleSheet.flatten(portrait.props.style)).toEqual(expect.objectContaining({ height: 112, width: 112 }));
    expect(view.getAllByText('Asha portrait')).toHaveLength(1);
    expect(view.queryByText('Continue with Asha')).toBeNull();
    expect(view.queryByLabelText('Connect with Asha')).toBeNull();
    expect(view.queryByText('Live microphone')).toBeNull();
    expect(view.getByTestId('composer-mic-toggle').props.accessibilityLabel).toBe('Start a voice conversation');

    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));

    expect(view.queryByLabelText('Connect with Asha')).toBeNull();
    expect(view.queryByText('Live microphone')).toBeNull();
    expect(view.queryByText('Your microphone is muted')).toBeNull();
    expect(view.getByText('Tap Asha to unmute and join the conversation.')).toBeTruthy();
    expect(within(view.getByTestId('asha-voice-status')).getByText('MUTED')).toBeTruthy();
    const unmute = view.getByLabelText('Unmute microphone');
    expect(unmute.props.accessibilityHint).toBe('Mutes or unmutes your microphone.');
    expect(within(view.getByTestId('live-chat-list')).queryByLabelText('Unmute microphone')).toBeNull();
    await fireEvent.press(unmute);
    expect(view.getByLabelText('Mute microphone')).toBeTruthy();
    expect(view.getByText('Speak naturally, even while Asha talks. Tap to mute.')).toBeTruthy();

    await view.unmount();
    await flushMicrotasks();
  });

  it('hides the composer mic when a floating session has no voice controls', async () => {
    mockFloatingAvailable = true;
    try {
      const view = await render(<LiveScreen />);
      boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: 'Hello there.', language: 'en' });
      await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Need a conversation first.');
      await fireEvent.press(view.getByLabelText('Send message'));
      await flushMicrotasks();

      expect(view.getByLabelText('Asha: Hello there.')).toBeTruthy();
      expect(view.queryByTestId('asha-header-portrait')).toBeTruthy();
      expect(view.queryByLabelText('Create Asha reply')).toBeNull();
      expect(view.queryByTestId('composer-mic-toggle')).toBeNull();
      expect(view.queryByLabelText('Connect with Asha')).toBeNull();
      expect(view.queryByText('Live microphone')).toBeNull();
      await view.unmount();
      await flushMicrotasks();
    } finally {
      mockFloatingAvailable = false;
      boloApi.sendMobileChat.mockReset();
    }
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

  it('shows Devanagari voice turns with one romanization each while announcing Romanized text', async () => {
    const displayReply = romanizeDevanagari(longDevanagariReply);
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Create long Devanagari Asha reply'));

    // The default script preference is "both": Devanagari in Tiro, then exactly one romanization per run.
    const message = view.getByLabelText(`Asha: ${displayReply}`);
    expect(lineText(message)).toBe('आप कैसे हैं (Aap kaise hain)? धन्यवाद, आशा (Dhanyavaad, Asha)। ज़रूर (Zaroor)। आप कैसे हैं (Aap kaise hain)? धन्यवाद, आशा (Dhanyavaad, Asha)। ज़रूर (Zaroor)।');
    expect(lineText(message).match(/Zaroor/gu)).toHaveLength(2);
    expect(view.getAllByText('ज़रूर')[0]?.props.accessibilityLanguage).toBe('hi-IN');
    expect(view.queryByDisplayValue(longDevanagariReply)).toBeNull();
    const learnerLine = expectDefined(view.getAllByLabelText(/^You: /u).find((candidate) => lineText(candidate).includes('क्रिस')));
    expect(lineText(learnerLine)).toMatch(/^मेरा नाम क्रिस है \([A-Za-z ]+\)।$/u);
    expect(String(learnerLine.props.accessibilityLabel)).not.toMatch(/[\u0900-\u097F]/u);
    // The bubble is sized by a hidden Text twin, never by a pinned input height
    // that can go stale after a narrow first layout.
    const inputStyle = StyleSheet.flatten(message.props.style);
    expect(inputStyle.height).toBeUndefined();
    expect(inputStyle.position).toBe('absolute');
    expect(message.props.onContentSizeChange).toBeUndefined();
    // The sizer itself must exist, stay invisible, and stay out of the
    // accessibility tree, so removing it fails this test.
    // The nested Devanagari span is what the query matches; the sizer is its hidden parent Text.
    const sizer = view.getAllByText(/आप कैसे हैं/u, { includeHiddenElements: true })
      .map((span) => {
        let node = span.parent;
        while (node && StyleSheet.flatten(node.props.style)?.opacity !== 0) node = node.parent;
        return node;
      })
      .find(Boolean);
    if (!sizer) throw new Error('The hidden sizer Text for the Asha message was not rendered.');
    expect(sizer.props.accessibilityElementsHidden).toBe(true);
    expect(sizer.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(speech.preloadSpeech).not.toHaveBeenCalled();

    await view.unmount();
    await flushMicrotasks();
  });

  it('stops an active caption animation before applying reduced motion', async () => {
    const stopAnimation = jest.spyOn(Animated.Value.prototype, 'stopAnimation');
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Mock learner transcript'));
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
      expect(heroStyle.minHeight).toBeUndefined();
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
      expect(view.getByText('Your Hindi coach').props.numberOfLines).toBeUndefined();
      await view.unmount();
      await flushMicrotasks();
    } finally {
      await act(async () => {
        Dimensions.set({ screen: originalScreen, window: originalWindow });
        await Promise.resolve();
      });
    }
  });

  it('keeps one header row on a 393pt phone at the default text size', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    const phone = { fontScale: 1, height: 852, scale: 3, width: 393 };
    await act(async () => {
      Dimensions.set({ screen: phone, window: phone });
      await Promise.resolve();
    });
    try {
      const view = await render(<LiveScreen />);
      const topbarStyle = StyleSheet.flatten(view.getByTestId('asha-header-topbar').props.style);
      const titleStyle = StyleSheet.flatten(view.getByText('Speak with Asha').props.style);
      const askStyle = StyleSheet.flatten(view.getByText('How do I say…?').props.style);

      expect(topbarStyle.flexDirection).toBe('row');
      expect(titleStyle.textAlign).toBe('left');
      expect(titleStyle.fontFamily).toBe(displayFont);
      expect(askStyle.textAlign).toBe('left');
      expect(askStyle.fontFamily).not.toBe(displayFont);
      expect(view.getByText('English')).toBeTruthy();
      expect(view.getByText('Hindi')).toBeTruthy();
      expect('borderWidth' in StyleSheet.flatten(view.getByLabelText('Private conversation').props.style)).toBe(false);
      await view.unmount();
      await flushMicrotasks();
    } finally {
      await act(async () => {
        Dimensions.set({ screen: originalScreen, window: originalWindow });
        await Promise.resolve();
      });
    }
  });

  it('keeps only the title in the fixed header while typing at the largest text size', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    const largest = { fontScale: 3.12, height: 852, scale: 3, width: 393 };
    const listeners = new Map<string, (event?: unknown) => void>();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, listener: (event?: unknown) => void) => {
      listeners.set(event, listener);
      return { remove: jest.fn() };
    }) as unknown as typeof Keyboard.addListener);
    await act(async () => {
      Dimensions.set({ screen: largest, window: largest });
      await Promise.resolve();
    });
    try {
      const view = await render(<LiveScreen />);
      await fireEvent.press(view.getByLabelText('Create Asha reply'));
      expect(view.getByLabelText('Settings')).toBeTruthy();
      expect(view.getByText('English')).toBeTruthy();

      await act(async () => { expectDefined(listeners.get('keyboardWillShow'))(keyboardEvent(336)); });
      expect(view.getByText('Speak with Asha')).toBeTruthy();
      expect(view.queryByLabelText('Settings')).toBeNull();
      expect(view.queryByText('English')).toBeNull();

      await act(async () => { expectDefined(listeners.get('keyboardWillHide'))(); });
      expect(view.getByLabelText('Settings')).toBeTruthy();
      expect(view.getByText('English')).toBeTruthy();
      await view.unmount();
      await flushMicrotasks();
    } finally {
      await act(async () => {
        Dimensions.set({ screen: originalScreen, window: originalWindow });
        await Promise.resolve();
      });
    }
  });

  it('wraps header labels at the largest text size and collapses after a message', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    const largest = { fontScale: 3.12, height: 852, scale: 3, width: 393 };
    await act(async () => {
      Dimensions.set({ screen: largest, window: largest });
      await Promise.resolve();
    });
    try {
      const view = await render(<LiveScreen />);
      const topbarStyle = StyleSheet.flatten(view.getByTestId('asha-header-topbar').props.style);
      const title = view.getByText('Speak with Asha');
      const subtitle = view.getByText('Your Hindi coach');
      const bodyStyle = StyleSheet.flatten(view.getByText('Tap Asha to start talking with her.').props.style);
      const privateText = view.getByText('Private');

      expect(topbarStyle.flexDirection).toBe('column');
      expect(title.props.maxFontSizeMultiplier).toBe(layout.headerFontScaleCap);
      expect(subtitle.props.maxFontSizeMultiplier).toBe(layout.headerFontScaleCap);
      expect(privateText.props.maxFontSizeMultiplier).toBe(layout.headerFontScaleCap);
      expect(StyleSheet.flatten(privateText.props.style).color).toBe(lightColors.heroSubtle);
      expect('maxWidth' in bodyStyle).toBe(false);
      expect(view.queryByText('How do I say…?')).toBeNull();
      expect(view.getByText('English')).toBeTruthy();
      expect(view.getByText('Hindi')).toBeTruthy();
      expect(StyleSheet.flatten(view.getByTestId('asha-header-portrait').props.style).height).toBe(112);
      expect(StyleSheet.flatten(view.getByLabelText('Message Asha').props.style).minHeight).toBe(
        (typeScale.body.lineHeight ?? 0) * Math.min(3.12, layout.composerFontScaleCap) * layout.composerLines + spacing.lg * 2 + layout.composerLineSlack,
      );
      expect(view.getByLabelText('Message Asha').props.maxFontSizeMultiplier).toBe(layout.composerFontScaleCap);
      expect(view.getByText('English').props.maxFontSizeMultiplier).toBe(layout.headerFontScaleCap);

      await fireEvent.press(view.getByLabelText('Create Asha reply'));
      expect(view.getByText('Your Hindi coach')).toBeTruthy();
      expect(StyleSheet.flatten(view.getByTestId('asha-header-portrait').props.style).height).toBe(112);
      expect(view.getByText('Clear chat')).toBeTruthy();
      expect(view.getByText('Last session')).toBeTruthy();
      expect(view.getByLabelText('Settings')).toBeTruthy();
      expect(view.getByLabelText('Open transcript')).toBeTruthy();
      await view.unmount();
      await flushMicrotasks();
    } finally {
      await act(async () => {
        Dimensions.set({ screen: originalScreen, window: originalWindow });
        await Promise.resolve();
      });
    }
  });

  it('collapses the voice header while the thread is scrolled and restores it at the top', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    const phone = { ...originalWindow, fontScale: 1, height: 852, width: 393 };
    await act(async () => {
      Dimensions.set({ screen: { ...originalScreen, ...phone }, window: phone });
      await Promise.resolve();
    });
    const view = await render(<LiveScreen />);
    const scrollList = (offsetY: number) => {
      view.getByTestId('live-chat-list').props.onScroll({
        nativeEvent: {
          contentOffset: { x: 0, y: offsetY },
          contentSize: { height: 1600, width: 393 },
          layoutMeasurement: { height: 700, width: 393 },
        },
      });
    };

    try {
      expect(view.getByText('How do I say…?')).toBeTruthy();
      await act(async () => { scrollList(layout.headerCollapseOffset + 8); });
      expect(view.queryByText('How do I say…?')).toBeNull();
      expect(StyleSheet.flatten(view.getByTestId('asha-header-portrait').props.style).height).toBe(layout.touchTarget);
      await act(async () => { scrollList(0); });
      expect(view.getByText('How do I say…?')).toBeTruthy();
    } finally {
      await view.unmount();
      await flushMicrotasks();
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
    await pressReplyAction(view, /Report reply:/u);

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
    expect(view.queryByText('Reporting\u2026')).toBeNull();
    expect(alert).toHaveBeenCalledWith('Could not send report', 'Network unavailable.');

    await openMoreMenu(view);
    expect(view.getByLabelText(/Report reply:/u).props.accessibilityState).toEqual({ disabled: false });
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
    await pressReplyAction(view, /Report reply:/u);
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

describe('offline capture and queued reports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOutboxEntries = [];
    mockOutboxClassification = 'permanent';
  });

  it('explains that live voice needs a connection only when a transport failure or timeout stops a call from starting', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Mock realtime offline'));
    expect(view.getByText('Bolo is unavailable right now. Check your connection and try again.')).toBeTruthy();
    expect(view.queryByLabelText('Go to today’s lesson')).toBeNull();

    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    await fireEvent.press(view.getByLabelText('Mock realtime offline'));
    const notice = view.getByText('Live voice needs an internet connection. Lessons and saved phrases work offline.');
    expect(notice.props.accessibilityRole).toBe('alert');
    const link = view.getByLabelText('Go to today’s lesson');
    expect(link.props.accessibilityRole).toBe('link');
    await fireEvent.press(link);
    expect(mockRouterPush).toHaveBeenCalledWith('/');

    await fireEvent.press(view.getByLabelText('Mock realtime timeout'));
    expect(view.getByText('Live voice needs an internet connection. Lessons and saved phrases work offline.')).toBeTruthy();

    // A missing Live URL, a rejected payload, and offline-sounding wording with another kind keep their own copy.
    await fireEvent.press(view.getByLabelText('Mock realtime unconfigured'));
    expect(view.getByText('Live voice isn’t available right now. You can still type to Asha.')).toBeTruthy();
    expect(view.queryByLabelText('Go to today’s lesson')).toBeNull();
    await fireEvent.press(view.getByLabelText('Mock realtime offline wording'));
    expect(view.getByText('Bolo is unavailable right now. Check your connection and try again.')).toBeTruthy();
    expect(view.queryByLabelText('Go to today’s lesson')).toBeNull();
    await view.unmount();
  });

  it('waits for session log recovery before resetting chat for a new conversation', async () => {
    let finishRecovery!: () => void;
    mockRecoveryPending = new Promise<void>((resolve) => { finishRecovery = resolve; });
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    let settled = false;
    let connection!: Promise<void> | void;
    await act(async () => {
      connection = mockVoiceButtonProps.onConnectionStart?.(new AbortController().signal);
      void Promise.resolve(connection).then(() => { settled = true; });
      await flushMicrotasks();
    });
    expect(sessionLog.ensureAshaSessionLogLoaded).toHaveBeenCalled();
    expect(appState.__clearChatHistoryMock).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    await act(async () => {
      finishRecovery();
      await connection;
    });
    expect(appState.__clearChatHistoryMock).toHaveBeenCalledTimes(1);
    mockRecoveryPending = null;
    await view.unmount();
  });

  it('keeps the transcript and shows an interrupted banner after a lost connection until the next session starts', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    await flushMicrotasks();
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    expect(view.queryByTestId('live-interrupted-banner')).toBeNull();

    await fireEvent.press(view.getByLabelText('Mock session interrupted'));
    const banner = view.getByTestId('live-interrupted-banner');
    expect(within(banner).getByText('Connection lost. This conversation is saved on your device.')).toBeTruthy();
    expect(banner.props.accessibilityLiveRegion).toBe('polite');
    expect(view.getByLabelText('Asha: Hello there.')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Mock session starting'));
    expect(view.queryByTestId('live-interrupted-banner')).toBeNull();
    await view.unmount();
  });

  it('queues a report that fails without a connection and shows its progress on the reply', async () => {
    mockOutboxClassification = 'transient';
    boloApi.reportGeneratedMessage.mockRejectedValueOnce(new Error('Bolo is unavailable right now. Check your connection and try again.'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await pressReplyAction(view, /Report reply:/u);
    const reason = (alert.mock.calls[0]?.[2] as { onPress?: () => void }[] | undefined)?.[1]?.onPress;
    await act(async () => {
      reason?.();
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    // The clear generation captured before the first attempt travels with the enqueue.
    expect(outbox.syncOutbox.enqueue).toHaveBeenCalledWith({ kind: 'report_message', payload: { message: 'Hello there.', reason: 'incorrect_or_misleading', messageId: 'live-asha' } }, { generation: mockOutboxGeneration });
    expect(alert).toHaveBeenCalledWith('Report saved', 'It will be sent when you’re back online.');
    expect(alert).not.toHaveBeenCalledWith('Could not send report', expect.any(String));

    mockOutboxEntries = [queuedEntry()];
    await act(async () => { view.rerender(<LiveScreen />); });
    const waiting = view.getByLabelText(/Report queued:/u);
    expect(within(waiting).getByText('Waiting to send')).toBeTruthy();
    expect(waiting.props.accessibilityState).toEqual({ disabled: true });

    mockOutboxEntries = [{ ...mockOutboxEntries[0]!, state: 'failed', lastError: 'Bolo stopped retrying after too many attempts.' }];
    await act(async () => { view.rerender(<LiveScreen />); });
    expect(view.getByText('Couldn’t send')).toBeTruthy();
    await pressReplyAction(view, /Retry report:/u);
    expect(outbox.syncOutbox.retry).toHaveBeenCalledWith('entry-1');
    await pressReplyAction(view, /Discard report:/u);
    expect(outbox.syncOutbox.discard).toHaveBeenCalledWith('entry-1');

    mockOutboxEntries = [];
    await act(async () => { view.rerender(<LiveScreen />); });
    await openMoreMenu(view);
    expect(view.getByLabelText(/Report reply:/u).props.accessibilityState).toMatchObject({ disabled: false });
    expect(alert).not.toHaveBeenCalledWith('Report received', expect.any(String));
    await view.unmount();
    alert.mockRestore();
  });

  it('carries the Retry-After of the first attempt into the queued report', async () => {
    mockOutboxClassification = 'transient';
    boloApi.reportGeneratedMessage.mockRejectedValueOnce(Object.assign(new Error('Slow down'), { retryAfterMs: 60 * 60 * 1000 }));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await pressReplyAction(view, /Report reply:/u);
    const reason = (alert.mock.calls[0]?.[2] as { onPress?: () => void }[] | undefined)?.[1]?.onPress;
    await act(async () => {
      reason?.();
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    // A 429 cooldown from the screen's own attempt must hold for the outbox's first retry too.
    expect(outbox.syncOutbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({ kind: 'report_message' }), { generation: mockOutboxGeneration, retryAfterMs: 60 * 60 * 1000 });
    expect(alert).toHaveBeenCalledWith('Report saved', 'It will be sent when you’re back online.');
    await view.unmount();
    alert.mockRestore();
  });

  it('associates a queued report with the saved session that holds the reply', async () => {
    mockOutboxClassification = 'transient';
    sessionLog.findAshaSessionIdForRow.mockReturnValueOnce('session-7');
    boloApi.reportGeneratedMessage.mockRejectedValueOnce(new Error('offline'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await pressReplyAction(view, /Report reply:/u);
    const reason = (alert.mock.calls[0]?.[2] as { onPress?: () => void }[] | undefined)?.[1]?.onPress;
    await act(async () => {
      reason?.();
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(sessionLog.findAshaSessionIdForRow).toHaveBeenCalledWith('live-asha');
    expect(outbox.syncOutbox.enqueue).toHaveBeenCalledWith({ kind: 'report_message', sessionId: 'session-7', payload: { message: 'Hello there.', reason: 'incorrect_or_misleading', messageId: 'live-asha' } }, { generation: mockOutboxGeneration });
    await view.unmount();
    alert.mockRestore();
  });

  it('lists queued reports whose reply is no longer on screen, with Retry and Discard', async () => {
    mockOutboxEntries = [
      queuedEntry({ id: 'orphan-failed', state: 'failed', lastError: 'Bolo stopped retrying after too many attempts.', payload: { message: 'An earlier reply that was cleared.', reason: 'incorrect_or_misleading', messageId: 'gone-row' } }),
      queuedEntry({ id: 'typed', payload: { message: 'A typed reply without a row id.', reason: 'unsafe_or_inappropriate' } }),
    ];
    const view = await render(<LiveScreen />);
    const list = view.getByTestId('queued-reports');
    expect(within(list).getByRole('header', { name: 'Reports waiting to send' })).toBeTruthy();
    expect(within(list).getAllByTestId('queued-report-row')).toHaveLength(2);
    expect(within(list).getByText(/Couldn’t send\. Bolo stopped retrying/u)).toBeTruthy();
    expect(within(list).getByText(/Waiting to send\./u)).toBeTruthy();
    await fireEvent.press(view.getByLabelText(/^Retry report: An earlier reply/u));
    expect(outbox.syncOutbox.retry).toHaveBeenCalledWith('orphan-failed');
    await fireEvent.press(view.getByLabelText(/^Discard report: A typed reply/u));
    expect(outbox.syncOutbox.discard).toHaveBeenCalledWith('typed');

    // Once the reply is on screen again, its report shows on the row instead of in the list.
    mockOutboxEntries = [queuedEntry()];
    await act(async () => { view.rerender(<LiveScreen />); });
    expect(view.queryByTestId('queued-reports')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    expect(view.queryByTestId('queued-reports')).toBeNull();
    expect(view.getByLabelText(/Report queued:/u)).toBeTruthy();
    await view.unmount();
  });

  it('marks a queued report as received only when the outbox reports its delivery, not when it merely disappears', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const entry = queuedEntry();
    mockOutboxEntries = [entry];
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    expect(view.getByText('Waiting to send')).toBeTruthy();
    // Removed without a delivery (consent withdrawn, data deleted, or discarded elsewhere): not received.
    mockOutboxEntries = [];
    await act(async () => { view.rerender(<LiveScreen />); });
    expect(view.queryByText('Reported')).toBeNull();
    expect(alert).not.toHaveBeenCalledWith('Report received', expect.any(String));
    // An explicit delivery is.
    await act(async () => {
      mockDeliveredListeners.forEach((listener) => listener(entry));
    });
    expect(view.getByText('Reported')).toBeTruthy();
    // The provider announces a delivery once for the whole app; a screen must not repeat it.
    expect(alert).not.toHaveBeenCalledWith('Report received', expect.any(String));
    await view.unmount();
    expect(mockDeliveredListeners.size).toBe(0);
    alert.mockRestore();
  });

  it('still reports a permanent failure immediately', async () => {
    boloApi.reportGeneratedMessage.mockRejectedValueOnce(new Error('Bad request'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await pressReplyAction(view, /Report reply:/u);
    const reason = (alert.mock.calls[0]?.[2] as { onPress?: () => void }[] | undefined)?.[0]?.onPress;
    await act(async () => {
      reason?.();
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(outbox.syncOutbox.enqueue).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('Could not send report', 'Bad request');
    await view.unmount();
    alert.mockRestore();
  });

  it('links to the last saved session from the Asha screen', async () => {
    const view = await render(<LiveScreen />);
    const link = view.getByLabelText('View last Asha session');
    expect(link.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(link);
    expect(mockRouterPush).toHaveBeenCalledWith('/last-session');
    await view.unmount();
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
    expect(view.getByLabelText('Asha: Here is an announced correction.').props.accessibilityLiveRegion).toBe('polite');
    await view.unmount();
    await flushMicrotasks();
  });

  it('retains a failed draft for retry without persisting a learner-only turn', async () => {
    boloApi.sendMobileChat.mockRejectedValueOnce(new Error('Asha is unavailable.'));
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Do not leave this orphaned.');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();

    expect(appState.__appendChatMessagesMock).not.toHaveBeenCalled();
    expect(view.queryByText('Do not leave this orphaned.')).toBeNull();
    expect(view.getByText('Asha is unavailable.').props.accessibilityRole).toBe('alert');
    expect(view.getByLabelText('Message Asha').props.value).toBe('Do not leave this orphaned.');
    expect(view.getByLabelText('Send message').props.accessibilityState.disabled).toBe(false);

    boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: 'The retry worked.', language: 'en' });
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();
    expect(boloApi.sendMobileChat).toHaveBeenCalledTimes(2);
    expect(boloApi.sendMobileChat).toHaveBeenLastCalledWith(expect.objectContaining({
      text: 'Do not leave this orphaned.', messages: [],
    }), expect.any(AbortSignal));
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledTimes(1);
    expect(view.getByLabelText('Message Asha').props.value).toBe('');
    expect(view.getByLabelText('Asha: The retry worked.')).toBeTruthy();
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
    expect(view.getByLabelText('You: Please correct this.')).toBeTruthy();
    expect(view.getByLabelText('Message Asha').props.value).toBe('Please correct this.');

    await act(async () => {
      request.resolve({ transcript: '', reply: 'Here is the correction.', language: 'en' });
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledTimes(1);
    expect(appState.__appendChatMessagesMock).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'you', text: 'Please correct this.' }),
      expect.objectContaining({ role: 'asha', text: 'Here is the correction.', language: 'en' }),
    ]);
    expect(view.getByLabelText('You: Please correct this.')).toBeTruthy();
    expect(view.getByLabelText('Asha: Here is the correction.')).toBeTruthy();
    expect(view.getByLabelText('Message Asha').props.value).toBe('');
    await view.unmount();
    await flushMicrotasks();
  });

  it('re-enables the next voice turn only after typed-reply playback settles', async () => {
    const playback = deferred<void>();
    boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: 'Wait until my reply finishes.', language: 'en' });
    speech.speakText.mockReturnValueOnce(playback.promise);
    const view = await render(<LiveScreen />);

    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Can I speak after this?');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();

    expect(view.getByLabelText('Create Asha reply').props.accessibilityState).toEqual({ disabled: true });
    expect(view.queryByLabelText('Connect with Asha')).toBeNull();

    await act(async () => {
      playback.resolve();
      await flushMicrotasks();
    });

    expect(view.getByLabelText('Create Asha reply').props.accessibilityState).toEqual({ disabled: false });
    expect(view.queryByLabelText('Connect with Asha')).toBeNull();
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
    expect(view.getByLabelText('You: Keep this completed turn.')).toBeTruthy();
    expect(view.getByLabelText('Asha: The text reply succeeded.')).toBeTruthy();
    expect(view.getByLabelText('Message Asha').props.value).toBe('');
    expect(view.getByLabelText('Send message').props.accessibilityState.disabled).toBe(true);
    expect(speech.speakText).toHaveBeenCalledWith(
      'The text reply succeeded.',
      expect.any(AbortSignal),
      1,
      undefined,
      'playback',
      true,
    );
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
    expect(view.getByLabelText('Open transcript')).toBeTruthy();

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

    const message = view.getByLabelText('Asha: Hello there.');
    expect(message.props.readOnly).toBe(true);
    await fireEvent(message, 'selectionChange', { nativeEvent: { selection: { start: 0, end: 5 } } });
    // Losing focus collapses the native selection before the adjacent button
    // receives its press. The last non-empty highlighted range must survive.
    await fireEvent(message, 'selectionChange', { nativeEvent: { selection: { start: 5, end: 5 } } });
    await fireEvent.press(view.getByLabelText('Save phrase: Hello there.'));
    expect(view.getByLabelText('Selected transcript text').props.value).toBe('Hello');
    expect(view.getByText('Only the words you highlighted were copied here. Adjust them if needed, then let Bolo prepare the phrase details.')).toBeTruthy();
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
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const save = view.getByRole('button', { name: 'Save phrase' });
    await fireEvent.press(save);
    await fireEvent.press(save);

    expect(appState.__togglePhraseMock).toHaveBeenCalledWith({
      hi: 'आप कैसे हैं?',
      latin: 'Aap kaise hain?',
      en: 'How are you?',
    });
    expect(appState.__togglePhraseMock).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Phrase saved', 'Aap kaise hain? — How are you?'));
    expect(view.queryByLabelText('Selected transcript text')).toBeNull();
    alert.mockRestore();
    await view.unmount();
    await flushMicrotasks();
  });

  it('tells the learner the collection is full instead of confirming a transcript save', async () => {
    appState.__togglePhraseMock.mockResolvedValueOnce('full');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await fireEvent.press(view.getByLabelText('Save phrase: Hello there.'));
    await fireEvent.changeText(view.getByLabelText('Hindi phrase'), 'नमस्ते');
    await fireEvent.changeText(view.getByLabelText('Romanized Hindi phrase'), 'Namaste');
    await fireEvent.changeText(view.getByLabelText('English phrase meaning'), 'Hello');
    await fireEvent.press(view.getByRole('button', { name: 'Save phrase' }));

    expect(appState.__togglePhraseMock).toHaveBeenCalledWith({ hi: 'नमस्ते', latin: 'Namaste', en: 'Hello' });
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Saved phrases full', 'You have 100 saved phrases. Remove one in Phrases to save another.'));
    expect(alert).not.toHaveBeenCalledWith('Phrase saved', expect.anything());
    alert.mockRestore();
    await view.unmount();
    await flushMicrotasks();
  });

  it('keeps a newly opened phrase sheet when the previous close finishes late', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await fireEvent.press(view.getByLabelText('Save phrase: Hello there.'));
    await fireEvent.changeText(view.getByLabelText('Hindi phrase'), 'नमस्ते');
    await fireEvent.changeText(view.getByLabelText('Romanized Hindi phrase'), 'Namaste');
    await fireEvent.changeText(view.getByLabelText('English phrase meaning'), 'Hello');
    await fireEvent.press(view.getByRole('button', { name: 'Save phrase' }));
    await fireEvent.press(view.getByLabelText('Save phrase: Namaste'));

    expect(view.getByLabelText('Selected transcript text').props.value).toBe('Namaste');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(view.getByLabelText('Selected transcript text').props.value).toBe('Namaste');
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
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
    const message = view.getByLabelText(`Asha: ${displayReply}`);
    // Highlight the romanization shown beside the first Devanagari sentence.
    const selectedText = 'Aap kaise hain';
    const start = lineText(message).indexOf(selectedText);
    expect(start).toBeGreaterThan(0);
    await fireEvent(message, 'selectionChange', { nativeEvent: { selection: { start, end: start + selectedText.length } } });
    const saveSelection = view.getAllByLabelText(/^Save phrase:/u)
      .find((candidate) => String(candidate.props.accessibilityLabel).includes('Aap kaise hain?'));
    if (!saveSelection) throw new Error('The Asha save action was not rendered.');
    await fireEvent.press(saveSelection);

    expect(view.getByLabelText('Selected transcript text').props.value).toBe(selectedText);
    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    await flushMicrotasks();

    expect(boloApi.prepareSavedPhraseFromText).toHaveBeenCalledWith({
      clientId: 'client-12345678',
      sourceText: 'आप कैसे हैं',
      text: selectedText,
    }, expect.any(AbortSignal));
    await view.unmount();
    await flushMicrotasks();
  });

  it('opens Hindi-only word analysis from a completed Romanized Asha reply', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create long Devanagari Asha reply'));

    await pressReplyAction(view, /Explore Hindi words:/u, /Dhanyavaad/u);

    expect(view.getByText('Word by word')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Explain आप' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Explain Chris' })).toBeNull();
    await view.unmount();
    await flushMicrotasks();
  });

  it('opens Words for a purely Romanized Hindi reply using the structured source service', async () => {
    boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: 'Namaste! Main theek hoon.', language: 'hi' });
    boloApi.prepareSavedPhraseFromText.mockResolvedValueOnce({ hi: 'नमस्ते! मैं ठीक हूँ।', latin: 'Namaste! Main theek hoon.', en: 'Hello! I am well.' });
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Namaste');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();
    await pressReplyAction(view, /^Explore Hindi words: Namaste! Main theek hoon\.$/u);
    await waitFor(() => expect(view.getByRole('button', { name: 'Explain मैं' })).toBeTruthy());
    expect(boloApi.prepareSavedPhraseFromText).toHaveBeenCalledWith({ clientId: expect.any(String), text: 'Namaste! Main theek hoon.' }, expect.any(AbortSignal));
    await view.unmount();
  });

  it('preserves unknown Hindi spelling and proper names from native chat into the phrase picker', async () => {
    const latin = 'Kripayaa paanee dijiye.';
    boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: latin, language: 'hi' });
    boloApi.prepareSavedPhraseFromText.mockResolvedValueOnce({ hi: 'कृपया पानी दीजिए।', latin, en: 'Please give me water.' });
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'My friend Paanee is visiting.');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();
    expect(view.getByLabelText('You: My friend Paanee is visiting.').props.value).toBe('My friend Paanee is visiting.');
    expect(view.getByLabelText(`Asha: ${latin}`).props.value).toBe(latin);
    await fireEvent.press(view.getByLabelText(`Save phrase: ${latin}`));
    expect(view.getByLabelText('Selected transcript text').props.value).toBe(latin);
    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    await flushMicrotasks();
    expect(boloApi.prepareSavedPhraseFromText).toHaveBeenCalledWith({ clientId: 'client-12345678', text: latin, sourceText: latin, preserveRomanizedText: true }, expect.any(AbortSignal));
    expect(view.getByLabelText('Romanized Hindi phrase').props.value).toBe(latin);
    expect(view.getByLabelText('Hindi phrase').props.value).toBe('कृपया पानी दीजिए।');
    await view.unmount();
  });

  it('does not turn surrounding English prose into selectable Hindi words', async () => {
    boloApi.sendMobileChat.mockResolvedValueOnce({ transcript: '', reply: 'Say Namaste to greet your friend.', language: 'en' });
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Teach me a greeting');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();
    await openMoreMenu(view);
    expect(view.queryByLabelText('Explore Hindi words: Say Namaste to greet your friend.')).toBeNull();
    expect(view.getByLabelText('Read reply aloud: Say Namaste to greet your friend.')).toBeTruthy();
    await view.unmount();
  });

  it('keeps the full-message trimming fallback when no chat text was highlighted', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));

    await fireEvent.press(view.getByLabelText('Save phrase: Hello there.'));

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
    expect(view.getByText('Your Hindi coach')).toBeTruthy();

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

  it('clears the previous transcript and captions when a new conversation starts, before connection succeeds', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    expect(view.getByLabelText('Asha: Hello there.')).toBeTruthy();
    // The previous chat is neither shown nor sent as context for a new call.
    expect(mockVoiceButtonProps.history).toBeUndefined();
    await fireEvent.press(view.getByLabelText('Mock learner transcript'));
    await fireEvent.press(view.getByLabelText('Mock Asha transcript'));
    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    await flushMicrotasks();
    expect(appState.__clearChatHistoryMock).toHaveBeenCalledTimes(1);
    expect(view.queryByLabelText('You: Namaste')).toBeNull();
    expect(view.queryByLabelText('Asha: Hello there.')).toBeNull();
    expect(view.queryByTestId('live-input-caption')).toBeNull();
    expect(view.queryByTestId('live-output-caption')).toBeNull();
    expect(view.queryByText('Your words appear here as you speak.')).toBeNull();

    // A failed connection cannot restore the old transcript.
    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.queryByLabelText('Asha: Hello there.')).toBeNull();
    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    await flushMicrotasks();
    expect(appState.__clearChatHistoryMock).toHaveBeenCalledTimes(2);

    // A greeting arriving before the connected-status effect is not cleared.
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    expect(view.getByLabelText('Asha: Hello there.')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.getByLabelText('Asha: Hello there.')).toBeTruthy();
    expect(appState.__clearChatHistoryMock).toHaveBeenCalledTimes(2);
    await view.unmount();
    await flushMicrotasks();
  });

  it('rejects startup if clearing the previous transcript could not be persisted', async () => {
    const view = await render(<LiveScreen />);
    appState.__clearChatHistoryMock.mockResolvedValueOnce(false);
    await act(async () => {
      await expect(mockVoiceButtonProps.onConnectionStart?.(new AbortController().signal))
        .rejects.toThrow(/clear|saved/i);
    });
    await view.unmount();
  });

  it('clears saved coaching history only after destructive confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    expect(view.queryByLabelText('Clear Asha chat history')).toBeNull();
    await fireEvent.press(view.getByLabelText('Create Asha reply'));

    const clear = view.getByLabelText('Clear Asha chat history');
    expect(within(clear).getByText('Clear chat')).toBeTruthy();
    expect(clear.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(clear.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(clear);
    expect(view.getByLabelText('You: Namaste')).toBeTruthy();
    expect(view.getByLabelText('Asha: Hello there.').props.accessibilityHint).toBe('Read-only message. Highlight words, then use Save phrase below.');

    const firstPrompt = alert.mock.calls.find(([title]) => title === 'Clear Asha chat?');
    const cancelAction = (firstPrompt?.[2] as { text?: string; style?: string; onPress?: () => void }[] | undefined)
      ?.find(({ text }) => text === 'Cancel');
    expect(cancelAction).toMatchObject({ text: 'Cancel', style: 'cancel' });
    await act(async () => {
      cancelAction?.onPress?.();
      await Promise.resolve();
    });
    expect(appState.__clearChatHistoryMock).not.toHaveBeenCalled();
    expect(view.getByLabelText('You: Namaste')).toBeTruthy();
    expect(view.getByLabelText('Asha: Hello there.')).toBeTruthy();

    await fireEvent.press(clear);
    const confirmPrompt = alert.mock.calls.findLast(([title]) => title === 'Clear Asha chat?');
    const clearAction = (confirmPrompt?.[2] as { text?: string; onPress?: () => void }[] | undefined)
      ?.find(({ text }) => text === 'Clear chat');
    await act(async () => {
      clearAction?.onPress?.();
      await Promise.resolve();
    });

    expect(appState.__clearChatHistoryMock).toHaveBeenCalledTimes(1);
    // The learner's explicit Clear removes saved session content too, but keeps queued reports.
    expect(sessionLog.clearAshaSessionContent).toHaveBeenCalledTimes(1);
    expect(confirmPrompt?.[1]).toBe('Clear all saved chat transcripts? Saved phrases and progress will remain. Pending reports will still be sent under your existing AI consent.');
    expect(outbox.syncOutbox.discard).not.toHaveBeenCalled();
    expect(view.queryByLabelText('You: Namaste')).toBeNull();
    expect(view.queryByLabelText('Asha: Hello there.')).toBeNull();
    expect(view.getByDisplayValue('Hi! Tell me what you would like to practice. Choose English or Hindi for my replies above.').props.accessibilityHint).toBe('Read-only message.');
    expect(view.queryByLabelText('Clear Asha chat history')).toBeNull();
    await view.unmount();
    await flushMicrotasks();
    alert.mockRestore();
  });

  it('does not let an old Clear chat confirmation erase a newly started conversation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await fireEvent.press(view.getByLabelText('Clear Asha chat history'));
    const prompt = alert.mock.calls.findLast(([title]) => title === 'Clear Asha chat?');
    const clearAction = (prompt?.[2] as { text?: string; onPress?: () => void }[] | undefined)
      ?.find(({ text }) => text === 'Clear chat');
    await fireEvent.press(view.getByLabelText('Mock realtime connecting'));
    await flushMicrotasks();
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await act(async () => { clearAction?.onPress?.(); await Promise.resolve(); });
    expect(appState.__clearChatHistoryMock).toHaveBeenCalledTimes(1);
    expect(view.getByLabelText('Asha: Hello there.')).toBeTruthy();
    await view.unmount();
    alert.mockRestore();
  });

  it('does not let a late typed reply repopulate a new voice conversation', async () => {
    const reply = deferred<{ reply: string; language: 'en' }>();
    boloApi.sendMobileChat.mockReturnValueOnce(reply.promise);
    const view = await render(<LiveScreen />);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Old pending question');
    await fireEvent.press(view.getByLabelText('Send message'));
    const signal = boloApi.sendMobileChat.mock.calls.at(-1)?.[1] as AbortSignal;
    expect(signal.aborted).toBe(false);
    await act(async () => {
      await mockVoiceButtonProps.onConnectionStart?.(new AbortController().signal);
    });
    expect(signal.aborted).toBe(true);
    reply.resolve({ reply: 'Obsolete answer', language: 'en' });
    await flushMicrotasks();
    expect(view.queryByLabelText('You: Old pending question')).toBeNull();
    expect(view.queryByLabelText('Asha: Obsolete answer')).toBeNull();
    expect(appState.__appendChatMessagesMock).not.toHaveBeenCalled();
    expect(speech.speakText).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('sends the next typed request without old context after a confirmed clear', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    boloApi.sendMobileChat.mockResolvedValueOnce({ reply: 'Fresh typed answer', language: 'en' });
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await fireEvent.press(view.getByLabelText('Clear Asha chat history'));
    const prompt = alert.mock.calls.findLast(([title]) => title === 'Clear Asha chat?');
    const clearAction = (prompt?.[2] as { text?: string; onPress?: () => void }[] | undefined)
      ?.find(({ text }) => text === 'Clear chat');
    await act(async () => { clearAction?.onPress?.(); });
    await flushMicrotasks();
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'A new topic');
    await fireEvent.press(view.getByLabelText('Send message'));
    await flushMicrotasks();
    expect(boloApi.sendMobileChat).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'A new topic', messages: [] }),
      expect.any(AbortSignal),
    );
    expect(view.queryByLabelText('Asha: Hello there.')).toBeNull();
    expect(view.getByLabelText('Asha: Fresh typed answer')).toBeTruthy();
    await view.unmount();
    alert.mockRestore();
  });

  it('stops reply playback when the user clears the chat that owns it', async () => {
    const playback = deferred<void>();
    speech.speakText.mockReturnValue(playback.promise);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    await pressReplyAction(view, /Read reply aloud/u);
    expect(speech.speakText).toHaveBeenCalledWith(
      'Hello there.',
      undefined,
      1,
      undefined,
      'playback',
      true,
    );

    await fireEvent.press(view.getByLabelText('Clear Asha chat history'));
    const prompt = alert.mock.calls.findLast(([title]) => title === 'Clear Asha chat?');
    const clearAction = (prompt?.[2] as { text?: string; onPress?: () => void }[] | undefined)
      ?.find(({ text }) => text === 'Clear chat');
    await act(async () => {
      clearAction?.onPress?.();
      await Promise.resolve();
    });

    expect(speech.stopSpeaking).toHaveBeenCalled();
    playback.resolve();
    await flushMicrotasks();
    await view.unmount();
    await flushMicrotasks();
    alert.mockRestore();
  });

  it('gives each Asha message action a unique bounded accessible name', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    const rowLabels = view.getAllByRole('button')
      .map(({ props }) => props.accessibilityLabel)
      .filter((label): label is string => typeof label === 'string');
    expect(rowLabels.filter((label) => label.startsWith('Save phrase:'))).toEqual(['Save phrase: Namaste', 'Save phrase: Hello there.']);
    expect(rowLabels.filter((label) => label.startsWith('More actions:'))).toEqual(['More actions: Hello there.']);
    await openMoreMenu(view);
    const actionLabels = view.getAllByRole('button')
      .map(({ props }) => props.accessibilityLabel)
      .filter((label): label is string => typeof label === 'string');
    const listenLabels = actionLabels.filter((label) => label.startsWith('Read reply aloud:'));
    const reportLabels = actionLabels.filter((label) => label.startsWith('Report reply:'));

    expect(listenLabels).toHaveLength(1);
    expect(new Set(listenLabels).size).toBe(1);
    expect(listenLabels.every((label) => label.length <= 96)).toBe(true);
    expect(listenLabels.some((label) => label.includes('Hello there.'))).toBe(true);
    expect(reportLabels).toEqual(['Report reply: Hello there.']);
    await view.unmount();
    await flushMicrotasks();
  });
});

describe('live practice time', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checkpoints a real practice visit once before the app backgrounds', async () => {
    let appStateListener: ((state: 'active' | 'background') => void) | undefined;
    const addEventListener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener as (state: 'active' | 'background') => void;
      return { remove: jest.fn() };
    });
    const view = await render(<LiveScreen />);

    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    expect(appState.__markLiveTurnMock).toHaveBeenCalledTimes(1);

    await act(async () => appStateListener?.('background'));
    expect(appState.__addPracticeSecondsMock).toHaveBeenCalledWith(42);
    await act(async () => appStateListener?.('background'));
    expect(appState.__addPracticeSecondsMock).toHaveBeenCalledTimes(1);
    await act(async () => appStateListener?.('active'));
    await act(async () => appStateListener?.('background'));
    expect(appState.__addPracticeSecondsMock).toHaveBeenCalledTimes(2);

    await view.unmount();
    addEventListener.mockRestore();
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
    await openMoreMenu(view);
    for (const listen of view.getAllByLabelText(/Read reply aloud:/u)) {
      expect(listen.props.accessibilityState?.disabled ?? listen.props.disabled).toBe(true);
      await fireEvent.press(listen);
    }
    await fireEvent.press(view.getByLabelText('Close menu'));
    await fireEvent.press(view.getByText('Correct my Hindi'));
    expect(boloApi.sendMobileChat).not.toHaveBeenCalled();
    expect(speech.speakText).not.toHaveBeenCalled();

    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(view.getByLabelText('Message Asha').props.editable).toBe(true);
    await openMoreMenu(view);
    const firstListen = expectDefined(view.getAllByLabelText(/Read reply aloud:/u)[0]);
    expect(firstListen.props.accessibilityState?.disabled
      ?? firstListen.props.disabled).toBe(false);

    await view.unmount();
    await flushMicrotasks();
  }, 20_000);

  it('blocks typed chat and replay while the connected microphone is muted', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    expect(view.getByLabelText('Message Asha').props.editable).toBe(false);
    await fireEvent.press(view.getByLabelText('Send message'));
    expect(boloApi.sendMobileChat).not.toHaveBeenCalled();
    expect(speech.speakText).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('keeps replay disabled through live playback and muted state until disconnect', async () => {
    const view = await render(<LiveScreen />);
    await fireEvent.press(view.getByLabelText('Mock realtime responding'));
    await fireEvent.press(view.getByLabelText('Mock completed realtime reply'));
    // The menu stays open across status changes, so the Listen item reflects each state.
    await openMoreMenu(view);
    const read = () => view.getByLabelText('Read reply aloud: A completed voice reply.');
    expect(read().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(view.getByLabelText('Mock realtime ready'));
    expect(read().props.accessibilityState.disabled).toBe(true);
    expect(speech.preloadSpeech).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText('Mock realtime disconnected'));
    expect(read().props.accessibilityState.disabled).toBe(false);
    await view.unmount();
  });

  it('keeps live coaching actions accessible and easy to tap', async () => {
    const view = await render(<LiveScreen />);
    expect(view.queryByLabelText(/More actions:/u)).toBeNull();
    await fireEvent.press(view.getByLabelText('Create Asha reply'));
    const more = view.getByLabelText('More actions: Hello there.');
    expect(more.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(more.props.style)).toMatchObject({ minWidth: 44, minHeight: 44 });
    const save = view.getByLabelText('Save phrase: Hello there.');
    const saveSlop = save.props.hitSlop as { bottom: number; top: number };
    expect(StyleSheet.flatten(save.props.style).minHeight + saveSlop.top + saveSlop.bottom).toBeGreaterThanOrEqual(44);
    await fireEvent.press(more);
    const listen = view.getByLabelText('Read reply aloud: Hello there.');
    const example = view.getByRole('button', { name: 'Correct my Hindi' });
    const send = view.getByLabelText('Send message');
    const listenStyle = StyleSheet.flatten(listen.props.style);

    expect(listen.props.accessibilityRole).toBe('button');
    expect(listen.props.accessibilityState).toEqual({ disabled: false });
    expect(listenStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(example.props.accessibilityState).toEqual({ disabled: false });
    expect(StyleSheet.flatten(example.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(send.props.accessibilityState).toEqual({ disabled: true });
    expect(StyleSheet.flatten(send.props.style).height).toBeGreaterThanOrEqual(44);

    await view.unmount();
    await flushMicrotasks();
  });
});
