import { fireEvent, render } from '@testing-library/react-native';

const mockRouterPush = jest.fn();
const mockRouterReplace = jest.fn();
let mockPlanId: string | undefined = 'essentials';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ planId: mockPlanId }),
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
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
  useAppState: () => ({ sceneProgress: {} }),
}));

import LessonPlansScreen from '../src/app/lesson-plans';

describe('lesson plan navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanId = 'essentials';
  });

  it('opens a plan and exposes its ten ordered lessons', async () => {
    const view = await render(<LessonPlansScreen />);

    expect(view.getByText('Start speaking')).toBeTruthy();
    expect(view.getByText('A warm hello')).toBeTruthy();
    expect(view.getByLabelText('A warm hello, lesson 1 of 10, Next lesson')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('A warm hello, lesson 1 of 10, Next lesson'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-essentials-01' } });

    await fireEvent.press(view.getByLabelText('Back to all lesson plans'));
    expect(mockRouterReplace).toHaveBeenCalledWith('/lesson-plans');
  });

  it('shows plans on the index and routes plan selection to its detail screen', async () => {
    mockPlanId = undefined;
    const view = await render(<LessonPlansScreen />);

    expect(view.getByLabelText('Ten ordered lesson plans')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/lesson-plans', params: { planId: 'essentials' } });
  });
});
