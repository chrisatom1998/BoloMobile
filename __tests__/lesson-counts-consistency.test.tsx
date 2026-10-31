// Keep built-in journey fixtures independent of locally imported lessons.
jest.mock('../src/data/creator-lessons', () => ({ creatorLessons: [] }));

import { render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { dateKey } from '../src/lib/storage';
import { colors } from '../src/theme';

const mockRouter = { back: jest.fn(), canGoBack: () => false, push: jest.fn(), replace: jest.fn() };
let mockPlanId: string | undefined;

/** A learner who installed Bolo today and has just finished lesson 1 of the first plan, nothing else. */
const justFinishedLessonOne = {
  'plan-essentials-01': {
    bestAccuracy: 100,
    bestScore: 500,
    completions: 1,
    lastBeatIndex: 0,
    lastPracticedAt: new Date().toISOString(),
    totalAnswers: 10,
    totalCorrect: 10,
    weakPhrases: [],
  },
};

const mockAppState = {
  dailySteps: 0,
  duePhrases: [] as { en: string; hi: string; latin: string }[],
  goal: 10 as 5 | 10 | 15,
  hydrated: true,
  learnerProfile: {
    completed: true,
    level: 'new',
    microphoneTested: false,
    primaryGoal: 'conversation',
    responseLanguage: 'en',
    scriptPreference: 'both',
  },
  phraseReviews: {},
  phrases: [] as { en: string; hi: string; latin: string }[],
  practice: { chaiDone: false, date: dateKey(), liveDone: false, seconds: 180 },
  practiceHistory: [{ date: dateKey(), seconds: 180, correct: 10, answers: 10, reviews: 0 }],
  reviewStreak: 0,
  reviewStreakDays: [] as string[],
  sceneProgress: justFinishedLessonOne as Record<string, typeof justFinishedLessonOne['plan-essentials-01']>,
  setGoal: jest.fn(),
  streak: 1,
};

jest.mock('expo-router', () => ({
  Redirect: () => null,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ planId: mockPlanId }),
  useRouter: () => mockRouter,
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
  useAppStateValue: () => mockAppState,
}));

import HomeScreen from '../src/app/(tabs)/index';
import ProgressScreen from '../src/app/(tabs)/progress';
import LessonPlansScreen from '../src/app/lesson-plans';
import { getPlanProgress } from '../src/lib/lesson-path';

describe('lesson counts agree across Today, Plan detail and Progress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanId = undefined;
    mockAppState.sceneProgress = justFinishedLessonOne;
  });

  it('shares one answer for a fresh install that just finished lesson 1', () => {
    expect(getPlanProgress('essentials', mockAppState.sceneProgress)).toEqual({ completed: 1, inProgressIndex: -1, nextIndex: 1, total: 10 });
  });

  it('Today counts lesson 1 as done and marks lesson 2 as current, never lesson 1 in progress', async () => {
    const view = await render(<HomeScreen />);

    expect(view.queryByText(/in progress/iu)).toBeNull();
    expect(view.getByText('1 of 10 lessons')).toBeTruthy();
    expect(view.getByLabelText('Start speaking, plan 1 of 10, 1 of 10 lessons complete')).toBeTruthy();
    // The lesson step is done for today; the path strip already shows lesson 1 finished and lesson 2 current.
    expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toBe('Step 1 of 2, Finished a lesson, done');
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-0').props.style).backgroundColor).toBe(colors.brand);
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-1').props.style).backgroundColor).toBe(colors.goldIcon);
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-2').props.style).backgroundColor).toBe(colors.line);
  });

  it('Today offers lesson 2 as the next lesson the following day', async () => {
    mockAppState.practice = { chaiDone: false, date: dateKey(), liveDone: false, seconds: 0 };
    mockAppState.practiceHistory = [];
    try {
      const view = await render(<HomeScreen />);

      expect(view.queryByText(/in progress/iu)).toBeNull();
      expect(view.getByText('STEP 1 OF 2 · NEXT LESSON')).toBeTruthy();
      expect(view.getByText('Say your name')).toBeTruthy();
      expect(view.getByText('Start speaking · Lesson 2 of 10')).toBeTruthy();
      expect(view.getByText('1 of 10 lessons')).toBeTruthy();
      expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toBe('Step 1 of 2, Lesson: Say your name, up next');
    } finally {
      mockAppState.practice = { chaiDone: false, date: dateKey(), liveDone: false, seconds: 180 };
      mockAppState.practiceHistory = [{ date: dateKey(), seconds: 180, correct: 10, answers: 10, reviews: 0 }];
    }
  });

  it('Plan detail counts the same finished lesson and names lesson 2 as next', async () => {
    mockPlanId = 'essentials';
    const view = await render(<LessonPlansScreen />);

    expect(view.getByText('1/10 lessons complete')).toBeTruthy();
    expect(view.getByText('Next: lesson 2 · Say your name')).toBeTruthy();
    expect(view.getByLabelText('A warm hello, lesson 1 of 10, Complete')).toBeTruthy();
    expect(view.getByLabelText('Say your name, lesson 2 of 10, Next lesson')).toBeTruthy();
    expect(view.queryByText(/in progress/iu)).toBeNull();
    expect(view.getAllByText(/Up next/u)).toHaveLength(1);
  });

  it('Progress shows one finished lesson, singular, and the same per-plan count', async () => {
    const view = await render(<ProgressScreen />);

    const stat = view.getByTestId('progress-stat-scenes');
    expect(within(stat).getByText('1')).toBeTruthy();
    expect(within(stat).getByText('lesson')).toBeTruthy();
    expect(within(stat).queryByText('lessons')).toBeNull();
    expect(stat.props.accessibilityLabel).toBe('1 lesson finished');
    expect(view.getByText('1 lesson finished · 0 reviews this week')).toBeTruthy();
    expect(view.getByText('Next lesson')).toBeTruthy();
    expect(view.getByText('Plan 01 · Lesson 2 of 10 · 10 turns')).toBeTruthy();
    expect(view.getByLabelText('Start speaking: 1 of 10 lessons complete')).toBeTruthy();
    expect(view.getByText('1/10')).toBeTruthy();
  });

  it('pluralizes the Progress stat once more lessons are finished', async () => {
    mockAppState.sceneProgress = {
      ...justFinishedLessonOne,
      'plan-essentials-02': { ...justFinishedLessonOne['plan-essentials-01'] },
    };
    const view = await render(<ProgressScreen />);

    const stat = view.getByTestId('progress-stat-scenes');
    expect(within(stat).getByText('2')).toBeTruthy();
    expect(within(stat).getByText('lessons')).toBeTruthy();
    expect(view.getByLabelText('Start speaking: 2 of 10 lessons complete')).toBeTruthy();
  });
});
