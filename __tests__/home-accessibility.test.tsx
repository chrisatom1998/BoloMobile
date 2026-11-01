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
    streak: 1,
  }),
}));

import HomeScreen from '../src/app/(tabs)/index';

describe('home accessibility', () => {
  it('provides 44 point targets and selected state for compact controls', async () => {
    const view = await render(<HomeScreen />);
    const settings = view.getByLabelText('Settings');
    const streak = view.getByLabelText('1 day practice streak');
    const firstPlan = view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete');
    const nextStep = view.getByTestId('today-next-step');
    const topbar = view.getByTestId('today-topbar');

    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(settings.props.style).minWidth).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(streak.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('0 percent of daily goal complete');
    expect(view.getByText('नम', { includeHiddenElements: true }).props['aria-hidden']).toBe(true);
    const leakedAccessibilityProps: string[] = [];
    const visit = (node: { children?: unknown; props?: Record<string, unknown> }) => {
      if (node.props?.accessibilityElementsHidden || node.props?.importantForAccessibility) {
        leakedAccessibilityProps.push(String(node.props.accessibilityElementsHidden ?? node.props.importantForAccessibility));
      }
      if (!Array.isArray(node.children)) return;
      for (const child of node.children) {
        if (child && typeof child === 'object') visit(child as { children?: unknown; props?: Record<string, unknown> });
      }
    };
    visit(view.getByTestId('today-goal-dial'));
    expect(leakedAccessibilityProps).toEqual([]);
    expect(view.getByText('1 day')).toBeTruthy();
    expect(StyleSheet.flatten(nextStep.props.style).minHeight).toBeGreaterThanOrEqual(44);
    for (const tile of ['today-talk-with-asha', 'today-saved-phrases', 'today-plan-catalog']) {
      expect(StyleSheet.flatten(view.getByTestId(tile).props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
    for (const step of ['review', 'lesson', 'asha']) {
      const row = view.queryByTestId(`today-step-${step}`);
      if (row) expect(row.props.accessibilityLabel).toMatch(/^Step \d of [23], /);
    }
    expect(view.getByTestId('today-step-lesson')).toBeTruthy();
    expect(StyleSheet.flatten(firstPlan.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(topbar.props.style)).toMatchObject({ justifyContent: 'space-between' });

    const list = view.getByTestId('today-guided-plan-list');
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({ alignItems: 'stretch', width: '100%' });
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingTop).toBe(18);
    expect(list.props.contentInsetAdjustmentBehavior).toBe('never');
  });

  it('keeps the jump tiles in one row on regular phones', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 1, width: 360 }, window: { ...window, fontScale: 1, width: 360 } }));
    try {
      const view = await render(<HomeScreen />);
      expect(StyleSheet.flatten(view.getByTestId('today-jump-row').props.style)).toMatchObject({ flexDirection: 'row' });
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });

  it('reflows the Today header, hero footer, and jump tiles at accessibility text sizes', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 2 }, window: { ...window, fontScale: 2 } }));

    try {
      const view = await render(<HomeScreen />);
      expect(StyleSheet.flatten(view.getByTestId('today-topbar').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column', minHeight: 0 });
      expect(StyleSheet.flatten(view.getByTestId('today-jump-row').props.style)).toMatchObject({ flexDirection: 'column' });
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
