// Keep built-in journey fixtures independent of locally imported lessons.
jest.mock('../src/data/creator-lessons', () => ({ creatorLessons: [] }));

import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { getScene } from '../src/data/scenes';
import { dateKey } from '../src/lib/storage';
import { colors } from '../src/theme';

const mockRouterPush = jest.fn();
const mockSetGoal = jest.fn();
const mockAppState = {
  dailySteps: 1,
  duePhrases: [] as { en: string; hi: string; latin: string }[],
  goal: 10 as 5 | 10 | 15,
  hydrated: true,
  phraseReviews: {} as Record<string, { mastery: number; dueAt?: string }>,
  phrases: [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }] as { en: string; hi: string; latin: string }[],
  practice: { chaiDone: true, date: dateKey(), liveDone: false, seconds: 300 },
  practiceHistory: [] as { date: string; seconds: number; correct: number; answers: number; reviews: number }[],
  reviewStreakDays: [] as string[],
  sceneProgress: {} as Record<string, {
    completions: number;
    lastBeatIndex?: number;
    lastPracticedAt?: string | null;
  }>,
  setGoal: mockSetGoal,
  streak: 2,
};

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
    useRouter: () => ({ push: mockRouterPush }),
  };
});

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => false),
  speakText: jest.fn(async () => true),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

import HomeScreen from '../src/app/(tabs)/index';

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

describe('HomeScreen primary journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.dailySteps = 1;
    mockAppState.goal = 10;
    mockAppState.hydrated = true;
    mockAppState.duePhrases = [];
    mockAppState.phraseReviews = {};
    mockAppState.phrases = [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }];
    mockAppState.practice = { chaiDone: true, date: dateKey(), liveDone: false, seconds: 300 };
    mockAppState.practiceHistory = [];
    mockAppState.reviewStreakDays = [];
    mockAppState.sceneProgress = {};
    mockAppState.streak = 2;
  });

  it('renders the greeting header with the streak pill and keeps Settings navigation working', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-topbar').children).toHaveLength(2);
    expect(view.getByRole('header', { name: 'Namaste' })).toBeTruthy();
    expect(view.getAllByText('नमस्ते').length).toBeGreaterThanOrEqual(1);
    expect(view.getByText('2 days')).toBeTruthy();

    const settings = view.getByLabelText('Settings');
    expect(settings.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(settings);
    expect(mockRouterPush).toHaveBeenCalledWith('/settings');
  });

  it('starts the day with review when phrases are due and lists them on the due strip', async () => {
    mockAppState.phrases = [
      { en: 'Hello', hi: 'नमस्ते', latin: 'namaste' },
      { en: 'Thank you', hi: 'धन्यवाद', latin: 'Dhanyavaad' },
      { en: 'How much is it?', hi: 'कितने का है?', latin: 'Kitne ka hai?' },
      { en: 'Water, please', hi: 'पानी, कृपया', latin: 'Paani, kripya' },
    ];
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-hero-kicker')).toHaveTextContent('Step 1 of 3 · Review');
    expect(view.getByText('Review your phrases')).toBeTruthy();
    expect(view.getByText('4 phrases are due. Two minutes keeps them fresh.')).toBeTruthy();
    // The hero carries only the next step: no phrase chips and no checklist inside it.
    expect(within(view.getByTestId('today-primary-motion')).queryByText('नमस्ते')).toBeNull();
    expect(within(view.getByTestId('today-primary-motion')).queryByTestId('today-steps')).toBeNull();
    const strip = view.getByTestId('today-due-strip');
    expect(within(strip).getAllByTestId(/^today-due-card-\d+$/u)).toHaveLength(4);
    expect(within(strip).getByText('पानी, कृपया')).toBeTruthy();
    expect(view.getByTestId('today-due-meta')).toHaveTextContent('4 phrases due');
    expect(view.getByTestId('today-step-review').props.accessibilityLabel).toBe('Step 1 of 3, Review 4 saved phrases, up next');
    expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toBe('Step 2 of 3, Lesson: A warm hello, later');
    expect(view.getByTestId('today-step-asha').props.accessibilityLabel).toBe('Step 3 of 3, Say it out loud with Asha, later');

    await fireEvent.press(view.getByLabelText('Start review'));
    expect(mockRouterPush).toHaveBeenCalledWith('/review');
  });

  it('shows romanized due phrases, never Devanagari, for Latin-script learners', async () => {
    Object.assign(mockAppState, { learnerProfile: { completed: true, scriptPreference: 'latin' } });
    try {
      const view = await render(<HomeScreen />);
      const due = view.getByTestId('today-due');
      expect(within(due).getByText(/^namaste$/i)).toBeTruthy();
      expect(within(due).queryByText('नमस्ते')).toBeNull();
      expect(JSON.stringify(due.children)).not.toMatch(/[ऀ-ॿ]/u);
    } finally {
      delete (mockAppState as { learnerProfile?: unknown }).learnerProfile;
    }
  });

  it('moves to the next lesson once review is done, from real scene data', async () => {
    mockAppState.reviewStreakDays = [dateKey()];
    const scene = getScene('plan-essentials-01')!;
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-hero-kicker')).toHaveTextContent('Step 2 of 3 · Next lesson');
    expect(view.getByText('A warm hello')).toBeTruthy();
    expect(view.getByText(scene.subtitle)).toBeTruthy();
    expect(view.getByText(scene.place)).toBeTruthy();
    expect(view.queryByTestId('today-lesson-words')).toBeNull();
    expect(view.getByTestId('today-step-review').props.accessibilityLabel).toBe('Step 1 of 3, Reviewed phrases, done');
    expect(view.getByTestId('today-plan-next')).toHaveTextContent('Next lesson: A warm hello');

    await fireEvent.press(view.getByLabelText('Start lesson'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-essentials-01' } });
  });

  it('skips review when nothing is due', async () => {
    mockAppState.phrases = [];
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-hero-kicker')).toHaveTextContent('Step 2 of 3 · Next lesson');
    expect(view.getByTestId('today-step-review').props.accessibilityLabel).toBe('Step 1 of 3, No phrases due, skipped');
    expect(view.queryByTestId('today-due-strip')).toBeNull();
    expect(view.getByTestId('today-due-empty')).toBeTruthy();
  });

  it('invites the learner to speak with Asha after the lesson', async () => {
    mockAppState.phrases = [];
    mockAppState.practiceHistory = [{ answers: 10, correct: 9, date: dateKey(), reviews: 0, seconds: 300 }];
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-hero-kicker')).toHaveTextContent('Step 3 of 3 · Speak');
    expect(view.getByText('Say it out loud')).toBeTruthy();
    expect(view.getByTestId('today-asha-portrait')).toBeTruthy();
    expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toBe('Step 2 of 3, Finished a lesson, done');

    await fireEvent.press(view.getByTestId('today-next-step'));
    expect(mockRouterPush).toHaveBeenCalledWith('/live');
  });

  it('celebrates a finished day and still offers the next lesson', async () => {
    mockAppState.phrases = [];
    mockAppState.streak = 7;
    mockAppState.practice = { chaiDone: false, date: dateKey(), liveDone: true, seconds: 600 };
    mockAppState.practiceHistory = [{ answers: 10, correct: 9, date: dateKey(), reviews: 0, seconds: 600 }];
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-hero-kicker')).toHaveTextContent('Done for today');
    expect(view.getByText('Shabaash!')).toBeTruthy();
    expect(view.getByText('Today’s practice is complete. 7 days in a row. More is optional.')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('today-primary-motion').props.style).backgroundColor).toBe(colors.forest);
    expect(view.getByTestId('today-step-asha').props.accessibilityLabel).toBe('Step 3 of 3, Spoke with Asha, done');

    await fireEvent.press(view.getByLabelText('Keep going'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-essentials-01' } });
  });

  it('routes the due strip, the streak, and the current plan, with the jump tiles gone', async () => {
    const view = await render(<HomeScreen />);

    expect(view.queryByLabelText('Talk with Asha')).toBeNull();
    expect(view.queryByLabelText('Saved phrases, 1 phrase due')).toBeNull();
    expect(view.queryByLabelText('Browse all 10 plans')).toBeNull();
    expect(view.queryByText('Or jump to')).toBeNull();

    await fireEvent.press(view.getByLabelText('Review all 1 due phrase'));
    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete'));
    await fireEvent.press(view.getByLabelText('2 day practice streak'));

    expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/review');
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, { pathname: '/lesson-plans', params: { planId: 'essentials' } });
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, '/progress');
  });

  it('orders the hero, the steps card, the due strip, and the current plan', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByText('Your path')).toBeTruthy();
    expect(view.getByText('Plan 01 of 10')).toBeTruthy();
    expect(view.getByText('0 of 10 lessons')).toBeTruthy();
    expect(view.getByTestId('today-plan-next')).toHaveTextContent('Next lesson: A warm hello');
    expect(view.getByTestId('today-plan-segments').children).toHaveLength(10);
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-0').props.style).backgroundColor).toBe(colors.goldIcon);
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-1').props.style).backgroundColor).toBe(colors.line);
    expect(view.queryByLabelText('Make a connection, plan 2 of 10, 0 of 10 lessons complete')).toBeNull();
    const testIds = collectTestIds(view.toJSON());
    expect(testIds.indexOf('today-primary-motion')).toBeLessThan(testIds.indexOf('today-steps'));
    expect(testIds.indexOf('today-steps')).toBeLessThan(testIds.indexOf('today-due'));
    expect(testIds.indexOf('today-due')).toBeLessThan(testIds.indexOf('today-current-plan'));
    expect(view.queryByLabelText('5 minute daily goal')).toBeNull();
  });

  it('shows done steps with a check and readable muted text instead of strikethrough', async () => {
    mockAppState.reviewStreakDays = [dateKey()];
    const view = await render(<HomeScreen />);

    const doneRow = view.getByTestId('today-step-review');
    expect(doneRow.props.accessibilityRole).toBeUndefined();
    expect(StyleSheet.flatten(doneRow.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(view.getByTestId('today-step-review-check').props.style)).toMatchObject({ backgroundColor: colors.forest });
    expect(StyleSheet.flatten(view.getByTestId('today-step-lesson-check').props.style)).toMatchObject({ backgroundColor: colors.goldSoft, borderColor: colors.gold });
    const doneLabel = within(doneRow).getByText('Reviewed phrases');
    expect(StyleSheet.flatten(doneLabel.props.style)).toMatchObject({ color: colors.muted });
    expect(StyleSheet.flatten(doneLabel.props.style).textDecorationLine).toBeUndefined();
    expect(StyleSheet.flatten(within(doneRow).getByText('Done').props.style)).toMatchObject({ color: colors.forestText });
    expect(StyleSheet.flatten(view.getByTestId('today-steps').props.style)).toMatchObject({ backgroundColor: colors.paperRaised });
  });

  it('advances the current plan card after the prior plan is complete', async () => {
    mockAppState.sceneProgress = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `plan-essentials-${String(index + 1).padStart(2, '0')}`,
        { completions: 1 },
      ]),
    );

    const view = await render(<HomeScreen />);

    expect(view.getByText('Plan 02 of 10')).toBeTruthy();
    expect(view.getByLabelText('Make a connection, plan 2 of 10, 0 of 10 lessons complete')).toBeTruthy();
    expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toBe('Step 2 of 3, Lesson: Ask where someone lives, later');
  });

  it('prioritizes the most recently practiced unfinished lesson and its plan', async () => {
    mockAppState.phrases = [];
    mockAppState.sceneProgress = {
      'plan-essentials-03': { completions: 0, lastBeatIndex: 2, lastPracticedAt: '2026-07-20T12:00:00.000Z' },
      'plan-connection-02': { completions: 0, lastBeatIndex: 1, lastPracticedAt: '2026-07-21T12:00:00.000Z' },
    };

    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-hero-kicker')).toHaveTextContent('Step 2 of 3 · Continue lesson');
    expect(view.getByText('Say you are new')).toBeTruthy();
    expect(view.getByText('Lesson 2 in progress')).toBeTruthy();
    expect(view.getByLabelText('Make a connection, plan 2 of 10, lesson 2 in progress, 0 of 10 lessons complete')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Continue'));

    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-connection-02' } });
  });

  it('shows daily goal progress inside the guided card', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('50 percent of daily goal complete');
    expect(view.getByTestId('today-goal-value').props.children.join('')).toBe('of 10 min');

    mockAppState.goal = 15;
    await view.rerender(<HomeScreen />);
    expect(view.getByTestId('today-goal-value').props.children.join('')).toBe('of 15 min');
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('33 percent of daily goal complete');

    mockAppState.practice = { chaiDone: true, date: dateKey(), liveDone: true, seconds: 1200 };
    await view.rerender(<HomeScreen />);
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('100 percent of daily goal complete');
  });
});
