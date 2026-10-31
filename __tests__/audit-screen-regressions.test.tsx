import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import * as mockReact from 'react';
import { Dimensions, StyleSheet } from 'react-native';

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
let mockOnboardingMode: string | undefined;
const mockCompleteOnboarding = jest.fn();
const mockReviewPhrase = jest.fn();
const mockDiagnosticsSnapshot = {
  days: {
    '2026-07-20': {
      ai_request_succeeded: { count: 0, totalDurationMs: 100 },
    },
  },
};

let mockAppState: Record<string, unknown>;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => mockReact.useEffect(effect, [effect]),
  useLocalSearchParams: () => ({ mode: mockOnboardingMode }),
  useRouter: () => mockRouter,
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  };
});

jest.mock('expo-audio', () => ({
  AudioModule: {
    getRecordingPermissionsAsync: jest.fn(async () => ({ granted: false })),
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: false })),
  },
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
  useAppStateValue: () => mockAppState,
  useAppActions: () => mockAppState,
}));

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => false),
  speakText: jest.fn(),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('@/lib/observability', () => ({
  getObservabilitySnapshot: jest.fn(async () => mockDiagnosticsSnapshot),
  observe: jest.fn(),
  observeOncePerSession: jest.fn(),
}));

jest.mock('@/services/bolo-api', () => ({
  prepareSavedPhraseFromText: jest.fn(),
}));

import DiagnosticsScreen from '../src/app/diagnostics';
import OnboardingScreen from '../src/app/onboarding';
import ProgressScreen, { createProgressStyles } from '../src/app/(tabs)/progress';
import ReviewScreen from '../src/app/review';
import { TranscriptPhrasePicker } from '../src/components/transcript-phrase-picker';
import { dateKey } from '../src/lib/storage';
import { lightColors } from '../src/theme';

const boloApi = jest.requireMock('../src/services/bolo-api') as { prepareSavedPhraseFromText: jest.Mock };
const speech = jest.requireMock('../src/lib/speech') as { speakText: jest.Mock };

const phrase = { hi: 'आप कैसे हैं?', latin: 'Aap kaise hain?', en: 'How are you?' };

describe('previously uncovered audit screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnboardingMode = undefined;
    mockAppState = {
      aiConsent: false,
      completeOnboarding: mockCompleteOnboarding,
      duePhrases: [phrase],
      learnerProfile: {
        completed: true,
        level: 'new',
        microphoneTested: false,
        primaryGoal: 'conversation',
        responseLanguage: 'en',
        scriptPreference: 'both',
      },
      phraseReviews: {},
      phrases: [phrase],
      practiceHistory: [],
      reviewPhrase: mockReviewPhrase,
      reviewStreak: 0,
      sceneProgress: {},
      streak: 0,
    };
    boloApi.prepareSavedPhraseFromText.mockResolvedValue(phrase);
  });

  it('does not display an infinite diagnostics average for a zero-count counter', async () => {
    const view = await render(<DiagnosticsScreen />);

    await waitFor(() => expect(view.getByText('ai request succeeded')).toBeTruthy());
    expect(view.queryByText(/Infinity/u)).toBeNull();
    expect(view.getByText('0')).toBeTruthy();
  });

  it('disables connected review audio when consent is absent and no bundled clip exists', async () => {
    const view = await render(<ReviewScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));

    expect(view.getByRole('button', { name: `Hear ${phrase.hi}` }).props.accessibilityState).toEqual({ disabled: true });
    expect(speech.speakText).not.toHaveBeenCalled();
  });

  it('saves transcript phrases with distinct Devanagari and Romanized fields', async () => {
    const onSave = jest.fn();
    const view = await render(
      <TranscriptPhrasePicker
        aiConsent
        clientId="client-12345678"
        message={{ id: 'message-1', role: 'asha', text: 'How are you?' }}
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );
    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    expect(boloApi.prepareSavedPhraseFromText).toHaveBeenCalledWith({ clientId: 'client-12345678', text: 'How are you?' }, expect.any(AbortSignal));
    await waitFor(() => expect(view.getByLabelText('Hindi phrase').props.value).toBe(phrase.hi));
    await fireEvent.press(view.getByRole('button', { name: 'Save phrase' }));

    expect(onSave).toHaveBeenCalledWith(phrase);
  });

  it('resets a saved phrase sheet when another message opens it', async () => {
    const onSave = jest.fn();
    const view = await render(
      <TranscriptPhrasePicker
        aiConsent
        clientId="client-12345678"
        message={{ id: 'message-1', role: 'asha', text: 'First phrase' }}
        onClose={jest.fn()}
        onSave={onSave}
        visible
      />,
    );
    await fireEvent.changeText(view.getByLabelText('Hindi phrase'), 'नमस्ते');
    await fireEvent.changeText(view.getByLabelText('Romanized Hindi phrase'), 'Namaste');
    await fireEvent.changeText(view.getByLabelText('English phrase meaning'), 'Hello');
    await fireEvent.press(view.getByRole('button', { name: 'Save phrase' }));
    expect(onSave).toHaveBeenCalledTimes(1);

    await view.rerender(
      <TranscriptPhrasePicker
        aiConsent
        clientId="client-12345678"
        message={{ id: 'message-2', role: 'asha', text: 'Second phrase' }}
        onClose={jest.fn()}
        onSave={onSave}
        visible
      />,
    );

    expect(view.getByLabelText('Selected transcript text').props.value).toBe('Second phrase');
    expect(view.getByLabelText('Hindi phrase').props.value).toBe('');
    await fireEvent.changeText(view.getByLabelText('Hindi phrase'), 'धन्यवाद');
    await fireEvent.changeText(view.getByLabelText('Romanized Hindi phrase'), 'Dhanyavaad');
    await fireEvent.changeText(view.getByLabelText('English phrase meaning'), 'Thanks');
    await fireEvent.press(view.getByRole('button', { name: 'Save phrase' }));
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('starts from only the excerpt highlighted in the chat message', async () => {
    const view = await render(
      <TranscriptPhrasePicker
        aiConsent
        clientId="client-12345678"
        message={{ id: 'message-1', role: 'asha', text: 'Namaste. Aap kaise hain?' }}
        onClose={jest.fn()}
        onSave={jest.fn()}
        selectedText="Aap kaise hain?"
      />,
    );

    expect(view.getByLabelText('Selected transcript text').props.value).toBe('Aap kaise hain?');
    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    expect(boloApi.prepareSavedPhraseFromText).toHaveBeenCalledWith(
      { clientId: 'client-12345678', text: 'Aap kaise hain?' },
      expect.any(AbortSignal),
    );
  });

  it('ignores an old preparation result after the selected text is edited', async () => {
    let finishOldRequest: ((value: typeof phrase) => void) | undefined;
    boloApi.prepareSavedPhraseFromText.mockImplementationOnce(() => new Promise((resolve) => { finishOldRequest = resolve; }));
    const view = await render(<TranscriptPhrasePicker aiConsent clientId="client-12345678"
      message={{ id: 'message-1', role: 'asha', text: 'Old selection' }} onClose={jest.fn()} onSave={jest.fn()} />);
    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    const oldSignal = boloApi.prepareSavedPhraseFromText.mock.calls[0]?.[1] as AbortSignal;
    await fireEvent.changeText(view.getByLabelText('Selected transcript text'), 'New selection');
    expect(oldSignal.aborted).toBe(true);
    expect(view.getByRole('button', { name: 'Add Romanized + English' }).props.accessibilityState.disabled).toBe(false);
    await act(async () => { finishOldRequest?.(phrase); });
    expect(view.getByLabelText('Hindi phrase').props.value).toBe('');
    expect(view.getByLabelText('Romanized Hindi phrase').props.value).toBe('');
    expect(view.getByLabelText('English phrase meaning').props.value).toBe('');
    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    await waitFor(() => expect(view.getByLabelText('Hindi phrase').props.value).toBe(phrase.hi));
    expect(boloApi.prepareSavedPhraseFromText).toHaveBeenLastCalledWith(
      { clientId: 'client-12345678', text: 'New selection' }, expect.any(AbortSignal));
  });

  it('still saves the highlighted excerpt when automatic phrase preparation is unavailable', async () => {
    const onSave = jest.fn();
    boloApi.prepareSavedPhraseFromText.mockRejectedValueOnce(new Error('Could not connect to the server.'));
    const view = await render(
      <TranscriptPhrasePicker
        aiConsent
        clientId="client-12345678"
        message={{ id: 'message-1', role: 'asha', text: 'Namaste. Aap kaise hain?' }}
        onClose={jest.fn()}
        onSave={onSave}
        selectedText="Aap kaise hain?"
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    await waitFor(() => expect(view.getByRole('alert').props.children).toContain('save manually'));
    await fireEvent.changeText(view.getByLabelText('Hindi phrase'), 'आप कैसे हैं?');
    await fireEvent.changeText(view.getByLabelText('Romanized Hindi phrase'), 'Aap kaise hain?');
    await fireEvent.changeText(view.getByLabelText('English phrase meaning'), 'How are you?');
    await fireEvent.press(view.getByRole('button', { name: 'Save phrase' }));

    expect(onSave).toHaveBeenCalledWith({
      hi: 'आप कैसे हैं?',
      latin: 'Aap kaise hain?',
      en: 'How are you?',
    });
  });

  /** Taps Continue `count` times from whichever onboarding step is showing. */
  async function continueSteps(view: Awaited<ReturnType<typeof render>>, count: number) {
    for (let index = 0; index < count; index += 1) {
      await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
    }
  }

  it('walks a new learner through five single-question steps and keeps the daily goal numeric', async () => {
    const view = await render(<OnboardingScreen />);

    expect(view.getByTestId('onboarding-screen')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Where are you starting?' })).toBeTruthy();
    expect(view.getByText('1 of 5')).toBeTruthy();
    expect(view.getByLabelText('Step 1 of 5').props.accessibilityValue).toEqual({ min: 1, max: 5, now: 1 });
    // Only one question renders per step, and a new learner has no Back or Cancel on step 1.
    expect(view.queryByRole('radiogroup', { name: 'Hindi script preference' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Cancel recalibration' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Build my practice plan' })).toBeNull();
    expect(view.queryByText(/microphone/iu)).toBeNull();

    await continueSteps(view, 1);
    expect(view.getByRole('header', { name: 'How should Hindi appear?' })).toBeTruthy();
    expect(view.getByText('2 of 5')).toBeTruthy();
    await continueSteps(view, 1);
    expect(view.getByRole('header', { name: 'What matters most?' })).toBeTruthy();
    await continueSteps(view, 1);
    expect(view.getByRole('header', { name: 'Asha’s replies' })).toBeTruthy();
    await continueSteps(view, 1);
    expect(view.getByRole('header', { name: 'Daily practice target' })).toBeTruthy();
    expect(view.getByText('5 of 5')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Continue' })).toBeNull();

    await fireEvent.press(view.getByRole('radio', { name: '5 minutes' }));
    await fireEvent.press(view.getByRole('button', { name: 'Build my practice plan' }));

    expect(mockCompleteOnboarding).toHaveBeenCalledWith(
      { level: 'new', scriptPreference: 'both', primaryGoal: 'conversation', responseLanguage: 'en', microphoneTested: false },
      5,
    );
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('previews the same sentence in each script option and names it for assistive tech', async () => {
    const view = await render(<OnboardingScreen />);
    await continueSteps(view, 1);

    expect(view.getByRole('radio', { name: 'Hindi script with roman letters, आप कैसे हैं?, aap kaise hain?' }).props.accessibilityState).toEqual({ checked: true });
    expect(view.getByRole('radio', { name: 'Hindi script only, आप कैसे हैं?' })).toBeTruthy();
    const latinOnly = view.getByRole('radio', { name: 'Roman letters only, aap kaise hain?' });
    expect(latinOnly).toBeTruthy();
    // The preview is visual only (the radio label already carries it), so it is hidden from
    // the accessibility tree. Latin-only learners are never shown Devanagari, even here.
    const hidden = { includeHiddenElements: true };
    expect(within(latinOnly).queryByText('आप कैसे हैं?', hidden)).toBeNull();
    expect(within(latinOnly).getByText('aap kaise hain?', hidden)).toBeTruthy();
    const hindiTexts = view.getAllByText('आप कैसे हैं?', hidden);
    expect(hindiTexts).toHaveLength(2);
    for (const text of hindiTexts) {
      expect(text.props.accessibilityLanguage).toBe('hi-IN');
      expect(StyleSheet.flatten(text.props.style).fontFamily).toBe('Tiro Devanagari Hindi');
      expect(StyleSheet.flatten(text.props.style).fontWeight).toBe('400');
    }
  });

  it('keeps edits when moving Back and forward between steps', async () => {
    const view = await render(<OnboardingScreen />);
    await fireEvent.press(view.getByRole('radio', { name: 'Beginner, I know greetings and a few phrases.' }));
    await continueSteps(view, 1);
    await fireEvent.press(view.getByRole('radio', { name: 'Hindi script only, आप कैसे हैं?' }));
    await continueSteps(view, 1);
    await fireEvent.press(view.getByRole('radio', { name: 'Travel' }));

    await fireEvent.press(view.getByRole('button', { name: 'Back' }));
    expect(view.getByRole('header', { name: 'How should Hindi appear?' })).toBeTruthy();
    expect(view.getByRole('radio', { name: 'Hindi script only, आप कैसे हैं?' }).props.accessibilityState).toEqual({ checked: true });
    await fireEvent.press(view.getByRole('button', { name: 'Back' }));
    expect(view.getByRole('radio', { name: 'Beginner, I know greetings and a few phrases.' }).props.accessibilityState).toEqual({ checked: true });
    expect(view.queryByRole('button', { name: 'Back' })).toBeNull();

    await continueSteps(view, 2);
    expect(view.getByRole('radio', { name: 'Travel' }).props.accessibilityState).toEqual({ checked: true });
    await continueSteps(view, 2);
    await fireEvent.press(view.getByRole('button', { name: 'Build my practice plan' }));

    expect(mockCompleteOnboarding).toHaveBeenCalledWith(
      { level: 'beginner', scriptPreference: 'devanagari', primaryGoal: 'travel', responseLanguage: 'en', microphoneTested: false },
      10,
    );
  });

  it('seeds recalibration from saved preferences and offers a cancel exit on the first step', async () => {
    mockOnboardingMode = 'recalibrate';
    mockAppState.goal = 5;
    mockAppState.learnerProfile = {
      completed: true,
      level: 'intermediate',
      microphoneTested: true,
      primaryGoal: 'travel',
      responseLanguage: 'hi',
      scriptPreference: 'latin',
    };
    const view = await render(<OnboardingScreen />);

    expect(view.getByText('Tune your plan')).toBeTruthy();
    expect(view.getByRole('radio', { name: 'Intermediate, Give me richer real-life situations.' }).props.accessibilityState).toEqual({ checked: true });
    await continueSteps(view, 1);
    expect(view.queryByRole('button', { name: 'Cancel recalibration' })).toBeNull();
    expect(view.getByRole('radio', { name: 'Roman letters only, aap kaise hain?' }).props.accessibilityState).toEqual({ checked: true });
    await continueSteps(view, 1);
    expect(view.getByRole('radio', { name: 'Travel' }).props.accessibilityState).toEqual({ checked: true });
    await continueSteps(view, 1);
    expect(view.getByRole('radio', { name: /^Hindi first/u }).props.accessibilityState).toEqual({ checked: true });
    await continueSteps(view, 1);
    expect(view.getByRole('radio', { name: '5 minutes' }).props.accessibilityState).toEqual({ checked: true });

    // Saving keeps every seeded value, including the retired microphone flag.
    await fireEvent.press(view.getByRole('button', { name: 'Save my practice plan' }));
    expect(mockCompleteOnboarding).toHaveBeenCalledWith(
      { level: 'intermediate', scriptPreference: 'latin', primaryGoal: 'travel', responseLanguage: 'hi', microphoneTested: true },
      5,
    );
  });

  it('keeps the onboarding footer compact at default text size and stacks it for Dynamic Type', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 1 }, window: { ...window, fontScale: 1 } }));

    try {
      const compact = await render(<OnboardingScreen />);
      await fireEvent.press(compact.getByRole('button', { name: 'Continue' }));
      expect(StyleSheet.flatten(compact.getByTestId('onboarding-progress').props.style)).toMatchObject({ flexDirection: 'row' });
      expect(StyleSheet.flatten(compact.getByTestId('onboarding-footer').props.style)).toMatchObject({ flexDirection: 'row' });
      // The icon-only Back control keeps its accessible name and a 44pt+ target.
      const back = compact.getByRole('button', { name: 'Back' });
      expect(within(back).queryByText('Back')).toBeNull();
      expect(StyleSheet.flatten(back.props.style)).toMatchObject({ minWidth: 56, minHeight: 52 });
      await compact.unmount();

      await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 2 }, window: { ...window, fontScale: 2 } }));
      const large = await render(<OnboardingScreen />);
      await fireEvent.press(large.getByRole('button', { name: 'Continue' }));
      expect(StyleSheet.flatten(large.getByTestId('onboarding-progress').props.style)).toMatchObject({ flexDirection: 'column' });
      expect(StyleSheet.flatten(large.getByTestId('onboarding-footer').props.style)).toMatchObject({ flexDirection: 'column-reverse' });
      expect(within(large.getByRole('button', { name: 'Back' })).getByText('Back')).toBeTruthy();
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });

  it('cancels recalibration from step 1 without saving', async () => {
    mockOnboardingMode = 'recalibrate';
    const view = await render(<OnboardingScreen />);

    expect(view.queryByRole('button', { name: 'Back' })).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Cancel recalibration' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockCompleteOnboarding).not.toHaveBeenCalled();
  });

  it('keeps review controls reachable in a scrolling Dynamic Type layout', async () => {
    const view = await render(<ReviewScreen />);
    expect(view.getByTestId('review-scroll').props.contentContainerStyle).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    expect(view.getByRole('button', { name: 'Got it' })).toBeTruthy();
  });

  it('renders the progress dashboard for an empty learning history', async () => {
    mockAppState.duePhrases = [];
    mockAppState.phrases = [];
    const view = await render(<ProgressScreen />);

    expect(view.getByText('Your first lesson')).toBeTruthy();
    expect(view.getByText('A warm hello')).toBeTruthy();
    expect(view.getByText('Plan 01 · Lesson 1 of 10 · 10 turns')).toBeTruthy();
    expect(view.getByText('0 scenes learned · 0 reviews this week')).toBeTruthy();
    expect(view.getByText('No practice streak yet')).toBeTruthy();
    expect(view.getByText('No activity yet')).toBeTruthy();
    expect(view.queryByText('Your Hindi is taking root.')).toBeNull();
    expect(view.queryByText('Your garden starts with one small turn.')).toBeNull();
    expect(view.getByText('Last 7 days')).toBeTruthy();
    expect(view.getByText('बोलो', { includeHiddenElements: true }).props['aria-hidden']).toBe(true);
    for (const bar of view.getAllByTestId('progress-day-bar')) {
      expect(StyleSheet.flatten(bar.props.style)).toMatchObject({ height: 0, minHeight: 0 });
    }
  });

  it('caps a practiced day at the full bar and leaves zero-minute days empty', async () => {
    mockAppState.practiceHistory = [{ date: dateKey(), seconds: 90, correct: 1, answers: 1, reviews: 0 }];
    const view = await render(<ProgressScreen />);
    const bars = view.getAllByTestId('progress-day-bar').map((bar) => StyleSheet.flatten(bar.props.style));
    const filled = bars.filter((style) => style.height !== 0);
    expect(filled).toHaveLength(1);
    expect(parseFloat(String(filled[0]?.height))).toBeLessThanOrEqual(100);
    expect(filled[0]?.backgroundColor).toBe(lightColors.gold);
    expect(bars.filter((style) => style.height === 0)).toHaveLength(6);
  });

  it('folds progress stats into one row and shows a dash for accuracy before any answers', async () => {
    mockAppState.phrases = [];
    const view = await render(<ProgressScreen />);

    expect(view.getByTestId('progress-stats').children).toHaveLength(4);
    expect(view.getByTestId('progress-stat-accuracy').props.accessibilityLabel).toBe('Answer accuracy, no answers yet');
    expect(view.getByText('–')).toBeTruthy();
    expect(view.queryByText('0%')).toBeNull();
    expect(view.getByTestId('progress-week-total').props.accessibilityLabel).toBe('0 minutes practiced in the last 7 days');
  });

  it('shows answer accuracy once turns are answered and paints solid cream bars', async () => {
    mockAppState.sceneProgress = {
      'plan-essentials-01': {
        bestAccuracy: 75,
        bestScore: 30,
        completions: 1,
        lastBeatIndex: 0,
        lastPracticedAt: '2026-07-28T12:00:00.000Z',
        totalAnswers: 4,
        totalCorrect: 3,
        weakPhrases: [],
      },
    };
    const view = await render(<ProgressScreen />);

    expect(view.getByText('75%')).toBeTruthy();
    expect(view.getByTestId('progress-stat-accuracy').props.accessibilityLabel).toBe('75 percent answer accuracy');
    const styles = createProgressStyles(lightColors);
    expect(styles.bar.backgroundColor).toBe(lightColors.backgroundWarm);
    expect(styles.barToday.backgroundColor).toBe(lightColors.gold);
    expect(styles.weekWatermark.fontSize).toBeLessThanOrEqual(72);
  });

  it('shows an unfinished lesson and active streak as the first progress summary', async () => {
    mockAppState.sceneProgress = {
      'plan-essentials-02': {
        bestAccuracy: 0,
        bestScore: 0,
        completions: 0,
        lastBeatIndex: 3,
        lastPracticedAt: '2026-07-28T12:00:00.000Z',
        totalAnswers: 0,
        totalCorrect: 0,
        weakPhrases: [],
      },
    };
    mockAppState.streak = 3;

    const view = await render(<ProgressScreen />);

    expect(view.getByText('Current lesson')).toBeTruthy();
    expect(view.getByText('Say your name')).toBeTruthy();
    expect(view.getByText('Plan 01 · Lesson 2 of 10 · Turn 4 of 10')).toBeTruthy();
    expect(view.getByText('3-day practice streak')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Continue lesson: Say your name'));
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-essentials-02' } });
  });

  it('keeps the progress hero legible against the active palette', () => {
    const styles = createProgressStyles(lightColors);

    expect(styles.hero.backgroundColor).toBe(lightColors.paperRaised);
    expect(styles.heroTitle.color).toBe(lightColors.ink);
    expect(styles.heroBody.color).toBe(lightColors.muted);
    expect(styles.content.paddingBottom).toBeGreaterThanOrEqual(100);
  });

  it('stacks the progress heading and uncaps its title at accessibility text sizes', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 2 }, window: { ...window, fontScale: 2 } }));

    try {
      const view = await render(<ProgressScreen />);
      expect(StyleSheet.flatten(view.getByTestId('progress-page-heading').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column' });
      expect(StyleSheet.flatten(view.getByText('What is taking root.').props.style).maxWidth).toBe('100%');
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });
});
