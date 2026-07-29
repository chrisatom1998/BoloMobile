import { fireEvent, render } from '@testing-library/react-native';

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterBack = jest.fn();
let mockPlanId: string | undefined = 'essentials';
let mockSceneProgress: Record<string, {
  completions: number;
  lastBeatIndex?: number;
  lastPracticedAt?: string | null;
}> = {};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ planId: mockPlanId }),
  useRouter: () => ({ back: mockRouterBack, push: mockRouterPush, replace: mockRouterReplace }),
}));

jest.mock('@/components/journal-chrome', () => {
  const React = require('react') as typeof import('react');
  const { Text, View } = require('react-native') as typeof import('react-native');
  return {
    JournalDisplay: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    JournalKicker: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(Text, props, children),
    JournalMotif: ({ accessibilityLabel }: { accessibilityLabel?: string }) => React.createElement(View, { accessibilityLabel }),
  };
});

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({ sceneProgress: mockSceneProgress }),
}));

import LessonPlansScreen from '../src/app/lesson-plans';

describe('lesson plan navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanId = 'essentials';
    mockSceneProgress = {};
  });

  it('opens a plan and exposes its ten ordered lessons', async () => {
    const view = await render(<LessonPlansScreen />);

    expect(view.getByText('Start speaking')).toBeTruthy();
    expect(view.getByText('A warm hello')).toBeTruthy();
    expect(view.getByLabelText('A warm hello, lesson 1 of 10, Next lesson')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('A warm hello, lesson 1 of 10, Next lesson'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-essentials-01' } });

    await fireEvent.press(view.getByLabelText('Back to all lesson plans'));
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });

  it('shows plans on the index and routes plan selection to its detail screen', async () => {
    mockPlanId = undefined;
    const view = await render(<LessonPlansScreen />);

    expect(view.getByLabelText('Ten ordered lesson plans')).toBeTruthy();
    expect(view.getByText('Plan 01 · Up next')).toBeTruthy();
    expect(view.getByText('Start plan →')).toBeTruthy();
    expect(view.getByTestId('lesson-plan-essentials').props.accessibilityState).toMatchObject({ selected: true });
    expect(view.getByTestId('lesson-plan-connection').props.accessibilityState).toMatchObject({ selected: false });
    expect(view.queryByText(/Open lessons · next is/u)).toBeNull();
    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, Up next, 0 of 10 lessons complete'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/lesson-plans', params: { planId: 'essentials' } });
  });

  it('marks the plan containing the active lesson as in progress and offers Continue plan', async () => {
    mockPlanId = undefined;
    mockSceneProgress = {
      'plan-connection-02': {
        completions: 0,
        lastBeatIndex: 3,
        lastPracticedAt: '2026-07-28T12:00:00.000Z',
      },
    };

    const view = await render(<LessonPlansScreen />);

    expect(view.getByText('Plan 02 · In progress · Lesson 2')).toBeTruthy();
    expect(view.getByText('Continue plan →')).toBeTruthy();
    expect(view.getByTestId('lesson-plan-connection').props.accessibilityState).toMatchObject({ selected: true });
    expect(view.getByLabelText('Make a connection, plan 2 of 10, In progress · Lesson 2, 0 of 10 lessons complete')).toBeTruthy();
  });

  it('returns an active lesson to its saved in-progress row on plan detail', async () => {
    mockSceneProgress = {
      'plan-essentials-02': {
        completions: 0,
        lastBeatIndex: 2,
        lastPracticedAt: '2026-07-28T12:00:00.000Z',
      },
    };

    const view = await render(<LessonPlansScreen />);

    expect(view.getByText('Continue: lesson 2 · Say your name')).toBeTruthy();
    expect(view.getByLabelText('Say your name, lesson 2 of 10, In progress')).toBeTruthy();
  });
});
