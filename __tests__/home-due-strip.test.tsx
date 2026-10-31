// Keep built-in journey fixtures independent of locally imported lessons.
jest.mock('../src/data/creator-lessons', () => ({ creatorLessons: [] }));

import { act, fireEvent, render, within } from '@testing-library/react-native';

import { dateKey } from '../src/lib/storage';

const mockRouterPush = jest.fn();
const DEVANAGARI = /[ऀ-ॿ]/u;

type Phrase = { en: string; hi: string; latin: string };
type Review = { mastery: number; intervalDays: number; dueAt: string; lastReviewedAt: string | null; correctReviews: number; totalReviews: number };

const phrases: Phrase[] = [
  { en: 'Hello', hi: 'नमस्ते', latin: 'namaste' },
  { en: 'Less sugar in the tea', hi: 'चाय में चीनी कम', latin: 'chaay mein cheeni kam' },
  { en: 'How much is it?', hi: 'कितने का है?', latin: 'kitne ka hai?' },
  { en: 'Please speak slowly', hi: 'धीरे बोलिए', latin: 'dheere boliye' },
  { en: 'Thank you', hi: 'धन्यवाद', latin: 'dhanyavaad' },
  { en: 'Water, please', hi: 'पानी, कृपया', latin: 'paani, kripya' },
  { en: 'Where is it?', hi: 'कहाँ है?', latin: 'kahan hai?' },
];

function review(mastery: number, dueAt = '2020-01-01'): Review {
  return { mastery, intervalDays: 1, dueAt, lastReviewedAt: null, correctReviews: mastery, totalReviews: mastery };
}

const mockAppState = {
  aiConsent: true,
  dailySteps: 1,
  duePhrases: [] as Phrase[],
  goal: 10 as 5 | 10 | 15,
  hydrated: true,
  learnerProfile: { completed: true, phrasePlaybackRate: 1, scriptPreference: 'both' } as { completed: boolean; phrasePlaybackRate?: number; scriptPreference: 'both' | 'devanagari' | 'latin' },
  phraseReviews: {} as Record<string, Review>,
  phrases: [] as Phrase[],
  practice: { chaiDone: true, date: dateKey(), liveDone: false, seconds: 300 },
  practiceHistory: [] as { date: string; seconds: number; correct: number; answers: number; reviews: number }[],
  reviewStreakDays: [] as string[],
  sceneProgress: {},
  setGoal: jest.fn(),
  streak: 2,
};

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
    useRouter: () => ({ push: mockRouterPush }),
  };
});

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => false),
  speakText: jest.fn(async () => true),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

import HomeScreen, { duePreviewLimit } from '../src/app/(tabs)/index';
import { hasOfflineSpeech, speakText, stopSpeaking } from '../src/lib/speech';

const hasOfflineSpeechMock = hasOfflineSpeech as jest.MockedFunction<typeof hasOfflineSpeech>;
const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;
const stopSpeakingMock = stopSpeaking as jest.MockedFunction<typeof stopSpeaking>;

type Rendered = Awaited<ReturnType<typeof render>>;

function dueSectionText(view: Rendered) {
  return JSON.stringify(view.getByTestId('today-due').children);
}

describe('Today due strip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hasOfflineSpeechMock.mockReturnValue(false);
    speakTextMock.mockResolvedValue(true);
    mockAppState.aiConsent = true;
    mockAppState.learnerProfile = { completed: true, phrasePlaybackRate: 1, scriptPreference: 'both' };
    mockAppState.phraseReviews = {};
    mockAppState.phrases = phrases.slice(0, 3);
    mockAppState.reviewStreakDays = [];
  });

  it('shows Devanagari, romanization, English and mastery for "both" learners', async () => {
    mockAppState.phraseReviews = { 'चाय में चीनी कम': review(2) };
    const view = await render(<HomeScreen />);

    // Weakest phrases come first, so the reviewed (mastery 2) phrase is last.
    const first = view.getByTestId('today-due-card-0');
    expect(within(first).getByTestId('today-due-card-0-devanagari')).toHaveTextContent('नमस्ते');
    expect(within(first).getByTestId('today-due-card-0-devanagari').props.accessibilityLanguage).toBe('hi-IN');
    expect(within(first).getByTestId('today-due-card-0-romanized')).toHaveTextContent(/namaste/iu);
    expect(within(first).getByTestId('today-due-card-0-english')).toHaveTextContent('Hello');
    expect(view.getByTestId('today-due-card-0-mastery').props.accessibilityLabel).toBe('Mastery 0 of 5');
    expect(view.getByTestId('today-due-card-0-mastery').props.accessibilityRole).toBe('progressbar');

    const reviewed = view.getByTestId('today-due-card-2');
    expect(within(reviewed).getByTestId('today-due-card-2-devanagari')).toHaveTextContent('चाय में चीनी कम');
    expect(view.getByTestId('today-due-card-2-mastery').props.accessibilityLabel).toBe('Mastery 2 of 5');
    expect(view.getByTestId('today-due-card-2-mastery').children).toHaveLength(5);
    expect(view.getByTestId('today-due-meta')).toHaveTextContent('Preview · 3 phrases due');
  });

  it('drops the romanization for "devanagari" learners', async () => {
    mockAppState.learnerProfile = { completed: true, scriptPreference: 'devanagari' };
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-due-card-0-devanagari')).toHaveTextContent('नमस्ते');
    expect(view.queryByTestId('today-due-card-0-romanized')).toBeNull();
    expect(view.getByTestId('today-due-card-0-english')).toHaveTextContent('Hello');
  });

  it('shows no Devanagari anywhere in the section for "latin" learners', async () => {
    mockAppState.learnerProfile = { completed: true, scriptPreference: 'latin' };
    const view = await render(<HomeScreen />);

    expect(view.queryByTestId('today-due-card-0-devanagari')).toBeNull();
    expect(view.getByTestId('today-due-card-0-romanized')).toHaveTextContent(/namaste/iu);
    expect(view.getByTestId('today-due-card-1-romanized')).toHaveTextContent(/chaay mein cheeni kam/iu);
    expect(dueSectionText(view)).not.toMatch(DEVANAGARI);
    expect(view.getByTestId('today-due-card-0-listen').props.accessibilityLabel).not.toMatch(DEVANAGARI);
  });

  it('previews at most five due phrases, says so, and routes "Review all" to the review session', async () => {
    mockAppState.phrases = phrases;
    const view = await render(<HomeScreen />);

    const strip = view.getByTestId('today-due-strip');
    expect(within(strip).getAllByTestId(/^today-due-card-\d+$/u)).toHaveLength(duePreviewLimit);
    expect(duePreviewLimit).toBe(5);
    expect(view.getByTestId('today-due-meta')).toHaveTextContent('Preview · 5 of 7 due phrases');
    expect(view.getByText('Due today').props.accessibilityRole).toBe('header');

    const reviewAll = view.getByLabelText('Review all 7 due phrases');
    expect(reviewAll.props.accessibilityRole).toBe('button');
    await fireEvent.press(reviewAll);
    expect(mockRouterPush).toHaveBeenCalledWith('/review');
  });

  it('shows an empty state when nothing is due and links to saved phrases', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    mockAppState.phrases = phrases.slice(0, 2);
    mockAppState.phraseReviews = {
      [phrases[0]!.hi]: review(3, dateKey(tomorrow)),
      [phrases[1]!.hi]: review(1, dateKey(tomorrow)),
    };
    const view = await render(<HomeScreen />);

    expect(view.queryByTestId('today-due-strip')).toBeNull();
    expect(view.queryByLabelText(/^Review all /u)).toBeNull();
    expect(view.getByTestId('today-due-meta')).toHaveTextContent('All caught up');
    expect(within(view.getByTestId('today-due-empty')).getByText(/^Nothing is due right now\./u)).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Saved phrases'));
    expect(mockRouterPush).toHaveBeenCalledWith('/phrases');
  });

  it('hides the saved-phrases link from the empty state when nothing has been saved yet', async () => {
    mockAppState.phrases = [];
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-due-empty')).toBeTruthy();
    expect(view.queryByLabelText('Saved phrases')).toBeNull();
  });

  it('plays a due phrase with the shared speech service at the remembered speed and shows a busy state', async () => {
    mockAppState.learnerProfile = { completed: true, phrasePlaybackRate: 0.75, scriptPreference: 'both' };
    let finish: (value: boolean) => void = () => undefined;
    speakTextMock.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const view = await render(<HomeScreen />);

    const listen = view.getByLabelText('Listen to Hello');
    expect(listen.props.accessibilityState).toMatchObject({ busy: false, disabled: false });
    await fireEvent.press(listen);

    expect(speakTextMock).toHaveBeenCalledWith('नमस्ते', undefined, 0.75);
    expect(view.getByLabelText('Listen to Hello').props.accessibilityState).toMatchObject({ busy: true });
    expect(view.getByTestId('today-due-card-0-listen-busy')).toBeTruthy();
    expect(view.getByLabelText('Listen to Less sugar in the tea').props.accessibilityState).toMatchObject({ busy: false });

    await act(async () => { finish(true); });
    expect(view.getByLabelText('Listen to Hello').props.accessibilityState).toMatchObject({ busy: false });
    expect(view.queryByTestId('today-due-card-0-listen-busy')).toBeNull();
  });

  it('keeps the latest tap busy when an earlier, cancelled clip finishes late', async () => {
    const pending: ((value: boolean) => void)[] = [];
    speakTextMock.mockImplementation(() => new Promise<boolean>((resolve) => { pending.push(resolve); }));
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByLabelText('Listen to Hello'));
    await fireEvent.press(view.getByLabelText('Listen to Hello'));
    expect(pending).toHaveLength(2);
    expect(view.getByLabelText('Listen to Hello').props.accessibilityState).toMatchObject({ busy: true });

    // The first (superseded) clip resolving must not clear the second run's busy state.
    await act(async () => { pending[0]!(false); });
    expect(view.getByLabelText('Listen to Hello').props.accessibilityState).toMatchObject({ busy: true });

    await act(async () => { pending[1]!(true); });
    expect(view.getByLabelText('Listen to Hello').props.accessibilityState).toMatchObject({ busy: false });
  });

  it('disables Listen without AI consent unless bundled audio exists offline', async () => {
    mockAppState.aiConsent = false;
    hasOfflineSpeechMock.mockImplementation((text: string) => text === 'नमस्ते');
    const view = await render(<HomeScreen />);

    const offline = view.getByLabelText('Listen to Hello');
    expect(offline.props.accessibilityState).toMatchObject({ disabled: false });
    await fireEvent.press(offline);
    expect(speakTextMock).toHaveBeenCalledWith('नमस्ते', undefined, 1);

    const gated = view.getByLabelText('Listen to Less sugar in the tea');
    expect(gated.props.accessibilityState).toMatchObject({ disabled: true });
    expect(gated.props.accessibilityHint).toBe('Agree to connected AI processing to enable Listen.');
    await fireEvent.press(gated);
    expect(speakTextMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a playback error under the strip', async () => {
    speakTextMock.mockRejectedValue(new Error('Bolo could not play the voice.'));
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByLabelText('Listen to Hello'));
    expect(await view.findByText('Bolo could not play the voice.')).toBeTruthy();
    expect(view.getByTestId('today-due-error').props.accessibilityRole).toBe('alert');
  });

  it('stops playback when the tab loses focus', async () => {
    const view = await render(<HomeScreen />);
    await view.unmount();
    expect(stopSpeakingMock).toHaveBeenCalled();
  });
});
