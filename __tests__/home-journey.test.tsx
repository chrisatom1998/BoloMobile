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

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
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
    expect(view.getByText('Namaste')).toBeTruthy();
    expect(view.getAllByText('नमस्ते').length).toBeGreaterThanOrEqual(1);
    expect(view.getByText('2 days')).toBeTruthy();

    const settings = view.getByLabelText('Settings');
    expect(settings.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(settings);
    expect(mockRouterPush).toHaveBeenCalledWith('/settings');
  });

  it('starts the day with review when phrases are due and previews them', async () => {
    mockAppState.phrases = [
      { en: 'Hello', hi: 'नमस्ते', latin: 'namaste' },
      { en: 'Thank you', hi: 'धन्यवाद', latin: 'Dhanyavaad' },
      { en: 'How much is it?', hi: 'कितने का है?', latin: 'Kitne ka hai?' },
      { en: 'Water, please', hi: 'पानी, कृपया', latin: 'Paani, kripya' },
    ];
    const view = await render(<HomeScreen />);

    expect(view.getByText('STEP 1 OF 3 · REVIEW')).toBeTruthy();
    expect(view.getByText('Review your phrases')).toBeTruthy();
    expect(view.getByText('4 phrases due. A quick recall keeps them fresh.')).toBeTruthy();
    const preview = view.getByTestId('today-review-preview');
    expect(preview.children).toHaveLength(3);
    expect(within(preview).queryByText('पानी, कृपया')).toBeNull();
    expect(view.getByTestId('today-step-review').props.accessibilityLabel).toBe('Step 1 of 3, Review saved phrases, up next');
    expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toBe('Step 2 of 3, Lesson: A warm hello, later');
    expect(view.getByTestId('today-step-asha').props.accessibilityLabel).toBe('Step 3 of 3, Chat with Asha, later');

    await fireEvent.press(view.getByLabelText('Start review'));
    expect(mockRouterPush).toHaveBeenCalledWith('/review');
  });

  it('previews romanized phrases for Latin-script learners', async () => {
    Object.assign(mockAppState, { learnerProfile: { completed: true, scriptPreference: 'latin' } });
    try {
      const view = await render(<HomeScreen />);
      const preview = view.getByTestId('today-review-preview');
      expect(within(preview).getByText(/^namaste$/i)).toBeTruthy();
      expect(within(preview).queryByText('नमस्ते')).toBeNull();
    } finally {
      delete (mockAppState as { learnerProfile?: unknown }).learnerProfile;
    }
  });

  it('moves to the next lesson once review is done, from real scene data', async () => {
    mockAppState.reviewStreakDays = [dateKey()];
    const scene = getScene('plan-essentials-01')!;
    const view = await render(<HomeScreen />);

    expect(view.getByText('STEP 2 OF 3 · NEXT LESSON')).toBeTruthy();
    expect(view.getByText('A warm hello')).toBeTruthy();
    // The subtitle names the phrase being taught instead of repeating the title.
    expect(view.getByText(`New phrase: “${scene.subtitle.replace(/[.!?]$/u, '')}”`)).toBeTruthy();
    expect(view.getByText('Start speaking · Lesson 1 of 10')).toBeTruthy();
    for (const word of scene.words) expect(view.getAllByText(word).length).toBeGreaterThanOrEqual(1);
    expect(view.getByTestId('today-step-review').props.accessibilityLabel).toBe('Step 1 of 3, Reviewed phrases, done');

    await fireEvent.press(view.getByLabelText('Start lesson'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-essentials-01' } });
  });

  it('skips review when nothing is due', async () => {
    mockAppState.phrases = [];
    const view = await render(<HomeScreen />);

    // With nothing due the review step is left out, so a new learner never sees a struck-out "Skipped" row.
    expect(view.getByText('STEP 1 OF 2 · NEXT LESSON')).toBeTruthy();
    expect(view.queryByTestId('today-step-review')).toBeNull();
    expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toMatch(/^Step 1 of 2, /u);
    expect(view.queryByTestId('today-review-preview')).toBeNull();
  });

  it('invites the learner to speak with Asha after the lesson', async () => {
    mockAppState.phrases = [];
    mockAppState.practiceHistory = [{ answers: 10, correct: 9, date: dateKey(), reviews: 0, seconds: 300 }];
    const view = await render(<HomeScreen />);

    expect(view.getByText('STEP 2 OF 2 · SPEAK')).toBeTruthy();
    expect(view.getByText('Say it out loud')).toBeTruthy();
    expect(view.getByTestId('today-asha-portrait')).toBeTruthy();
    expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toBe('Step 1 of 2, Finished a lesson, done');

    await fireEvent.press(view.getByTestId('today-next-step'));
    expect(mockRouterPush).toHaveBeenCalledWith('/live');
  });

  it('celebrates a finished day and still offers the next lesson', async () => {
    mockAppState.phrases = [];
    mockAppState.streak = 7;
    mockAppState.practice = { chaiDone: false, date: dateKey(), liveDone: true, seconds: 600 };
    mockAppState.practiceHistory = [{ answers: 10, correct: 9, date: dateKey(), reviews: 0, seconds: 600 }];
    const view = await render(<HomeScreen />);

    expect(view.getByText('DONE FOR TODAY')).toBeTruthy();
    expect(view.getByText('Shabaash!')).toBeTruthy();
    expect(view.getByText('Today’s practice is complete. 7 days in a row. More is optional.')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('today-primary-motion').props.style).backgroundColor).toBe(colors.forest);
    expect(view.getByTestId('today-step-asha').props.accessibilityLabel).toBe('Step 2 of 2, Spoke with Asha, done');

    await fireEvent.press(view.getByLabelText('Keep going'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-essentials-01' } });
  });

  it('routes the streak, the current plan, and the full catalog', async () => {
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByLabelText('Browse all 10 plans'));
    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete'));
    await fireEvent.press(view.getByLabelText('2 day practice streak'));

    expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/lesson-plans');
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, { pathname: '/lesson-plans', params: { planId: 'essentials' } });
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, '/progress');
  });

  it('keeps the guided card above the current plan', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByText('Your path')).toBeTruthy();
    expect(view.getByText('All plans')).toBeTruthy();
    expect(view.getByText('0 of 10 lessons')).toBeTruthy();
    expect(view.getByTestId('today-plan-segments').children).toHaveLength(10);
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-0').props.style).backgroundColor).toBe(colors.goldIcon);
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-1').props.style).backgroundColor).toBe(colors.line);
    expect(view.queryByLabelText('Make a connection, plan 2 of 10, 0 of 10 lessons complete')).toBeNull();
    const testIds = collectTestIds(view.toJSON());
    expect(testIds.indexOf('today-primary-motion')).toBeLessThan(testIds.indexOf('today-current-plan'));
    expect(view.queryByText('Or jump to')).toBeNull();
    expect(view.queryByLabelText('5 minute daily goal')).toBeNull();
  });

  it('advances the current plan card after the prior plan is complete', async () => {
    mockAppState.sceneProgress = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `plan-essentials-${String(index + 1).padStart(2, '0')}`,
        { completions: 1 },
      ]),
    );

    const view = await render(<HomeScreen />);

    expect(view.getByText('All plans')).toBeTruthy();
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

    expect(view.getByText('STEP 1 OF 2 · CONTINUE LESSON')).toBeTruthy();
    expect(view.getByText('Say you are new')).toBeTruthy();
    expect(view.getByText('Lesson 2 in progress')).toBeTruthy();
    expect(view.getByLabelText('Make a connection, plan 2 of 10, lesson 2 in progress, 0 of 10 lessons complete')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Continue'));

    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-connection-02' } });
  });

  it('shows daily goal progress inside the guided card', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('50 percent of daily goal complete');
    expect(view.getByTestId('today-goal-value').props.children).toBe('of 10 min');

    mockAppState.goal = 15;
    await view.rerender(<HomeScreen />);
    expect(view.getByTestId('today-goal-value').props.children).toBe('of 15 min');
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('33 percent of daily goal complete');

    mockAppState.practice = { chaiDone: true, date: dateKey(), liveDone: true, seconds: 1200 };
    await view.rerender(<HomeScreen />);
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('100 percent of daily goal complete');
  });
});
