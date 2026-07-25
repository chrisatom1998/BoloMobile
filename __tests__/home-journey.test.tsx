import { fireEvent, render } from '@testing-library/react-native';

const mockRouterPush = jest.fn();
const mockSetGoal = jest.fn();
const mockAppState = {
  dailySteps: 1,
  duePhrases: [],
  goal: 10 as 5 | 10 | 15,
  hydrated: true,
  phrases: [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }],
  practice: { chaiDone: true, date: '2026-07-16', liveDone: false, seconds: 300 },
  setGoal: mockSetGoal,
  streak: 2,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('lucide-react-native', () => ({
  BookOpen: () => null,
  Bookmark: () => null,
  BarChart3: () => null,
  Check: () => null,
  ChevronRight: () => null,
  Ear: () => null,
  Flame: () => null,
  Mic: () => null,
  Settings: () => null,
  Sparkles: () => null,
  Sprout: () => null,
  Target: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

import HomeScreen from '../src/app/(tabs)/index';

describe('HomeScreen primary journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.dailySteps = 1;
    mockAppState.goal = 10;
    mockAppState.hydrated = true;
    mockAppState.practice = { chaiDone: true, date: '2026-07-16', liveDone: false, seconds: 300 };
  });

  it('routes to Settings, the language garden, live coaching, and a selected plan', async () => {
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByLabelText('Settings'));
    await fireEvent.press(view.getByLabelText('Practice saved phrase नमस्ते'));
    await fireEvent.press(view.getByLabelText('Practice with Asha'));
    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete'));

    expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/settings');
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/phrases');
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, '/live');
    expect(mockRouterPush).toHaveBeenNthCalledWith(4, {
      pathname: '/lesson-plans',
      params: { planId: 'essentials' },
    });
  });

  it('shows ordered plans first and opens the selected plan lessons', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-guided-plan-list')).toBeTruthy();
    expect(view.getByText('10 plans · 100 lessons')).toBeTruthy();
    expect(view.queryByText('Choose a moment')).toBeNull();

    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/lesson-plans',
      params: { planId: 'essentials' },
    });
  });

  it('updates the daily goal selection and renders progress from persisted practice', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByText('✓ Chai scene')).toBeTruthy();
    expect(view.getByText('Today · 50% of 10 min')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('15 minute daily goal'));
    expect(mockSetGoal).toHaveBeenCalledWith(15);

    mockAppState.goal = 15;
    await view.rerender(<HomeScreen />);
    expect(view.getByLabelText('15 minute daily goal').props.accessibilityState).toEqual({ selected: true });
    expect(view.getByText('Today · 33% of 15 min')).toBeTruthy();
  });
});
