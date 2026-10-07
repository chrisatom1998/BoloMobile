// Keep built-in journey fixtures independent of locally imported lessons.
jest.mock('../src/data/creator-lessons', () => ({ creatorLessons: [] }));

import { act, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

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
  it('provides 44 point targets and selected state for compact controls', async () => {
    const view = await render(<HomeScreen />);
    const settings = view.getByLabelText('Settings');
    const streak = view.getByLabelText('0 day practice streak');
    const fiveMinuteGoal = view.getByLabelText('5 minute daily goal');
    const firstPlan = view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete');
    const startLesson = view.getByLabelText('Start lesson');
    const topbar = view.getByTestId('today-topbar');

    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(settings.props.style).minWidth).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(streak.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(fiveMinuteGoal.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(fiveMinuteGoal.props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('0 percent of daily goal complete');
    expect(view.getByText('0 days')).toBeTruthy();
    expect(view.getByText('Save one from any lesson')).toBeTruthy();
    expect(StyleSheet.flatten(startLesson.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(firstPlan.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(topbar.props.style)).toMatchObject({ justifyContent: 'space-between' });

    const list = view.getByTestId('today-guided-plan-list');
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({ alignItems: 'stretch', width: '100%' });
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingTop).toBe(18);
    expect(list.props.contentInsetAdjustmentBehavior).toBe('never');
  });

  it('keeps 44pt goal buttons by stacking the stat row on narrow phones', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 1, width: 360 }, window: { ...window, fontScale: 1, width: 360 } }));

    try {
      const view = await render(<HomeScreen />);
      expect(StyleSheet.flatten(view.getByTestId('today-stat-row').props.style)).toMatchObject({ flexDirection: 'column' });
      expect(StyleSheet.flatten(view.getByTestId('today-goal-choice-15').props.style)).toMatchObject({ minHeight: 44, minWidth: 44 });
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }

    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 1, width: 393 }, window: { ...window, fontScale: 1, width: 393 } }));
    try {
      const view = await render(<HomeScreen />);
      expect(StyleSheet.flatten(view.getByTestId('today-stat-row').props.style)).toMatchObject({ flexDirection: 'row' });
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });

  it('reflows the Today header, hero footer, and stat row at accessibility text sizes', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 2 }, window: { ...window, fontScale: 2 } }));

    try {
      const view = await render(<HomeScreen />);
      expect(StyleSheet.flatten(view.getByTestId('today-topbar').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column', minHeight: 0 });
      expect(StyleSheet.flatten(view.getByTestId('today-goal-dial').props.style)).toMatchObject({ flexDirection: 'column' });
      expect(StyleSheet.flatten(view.getByTestId('today-stat-row').props.style)).toMatchObject({ flexDirection: 'column' });
      expect(StyleSheet.flatten(view.getByTestId('today-hero-footer').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column' });
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });

  it('stacks the greeting row on narrow default-text phones', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 1, width: 360 }, window: { ...window, fontScale: 1, width: 360 } }));

    try {
      const view = await render(<HomeScreen />);
      expect(StyleSheet.flatten(view.getByTestId('today-topbar').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column', minHeight: 0, paddingRight: 0 });
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });
});
