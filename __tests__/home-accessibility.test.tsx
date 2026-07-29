import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 59 }),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({
    dailySteps: 0,
    duePhrases: [],
    goal: 5,
    hydrated: true,
    phrases: [],
    practice: { chaiDone: false, date: '2026-07-14', liveDone: false, seconds: 0 },
    setGoal: jest.fn(),
    streak: 0,
  }),
}));

import HomeScreen from '../src/app/(tabs)/index';

describe('home accessibility', () => {
  it('provides 48 point targets and selected state for compact controls', async () => {
    const view = await render(<HomeScreen />);
    const settings = view.getByLabelText('Settings');
    const fiveMinuteGoal = view.getByLabelText('5 minute daily goal');
    const firstPlan = view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete');
    const topbar = view.getByTestId('today-topbar');

    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(settings.props.style).minWidth).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(fiveMinuteGoal.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(fiveMinuteGoal.props.style).minWidth).toBeGreaterThanOrEqual(48);
    expect(fiveMinuteGoal.props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('0 percent of daily goal complete');
    expect(StyleSheet.flatten(firstPlan.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(topbar.props.style)).toMatchObject({ justifyContent: 'space-between' });

    const list = view.getByTestId('today-guided-plan-list');
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({ alignItems: 'stretch', width: '100%' });
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingTop).toBe(18);
    expect(list.props.contentInsetAdjustmentBehavior).toBe('never');
  });
});
