// Keep built-in journey fixtures independent of locally imported lessons.
jest.mock('../src/data/creator-lessons', () => ({ creatorLessons: [] }));

import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { layout } from '../src/theme';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 59 }),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({
    duePhrases: [],
    goal: 5,
    hydrated: true,
    phrases: [],
    practice: { chaiDone: false, date: '2026-07-14', liveDone: false, seconds: 0 },
    setGoal: jest.fn(),
    streak: 0,
  }),
}));

jest.mock('@/state/asha-voice-session', () => ({
  useAshaVoiceSession: () => ({ available: false, expand: jest.fn(), minimized: false, status: 'disconnected' }),
}));

import HomeScreen from '../src/app/(tabs)/index';

describe('home accessibility', () => {
  it('provides 44 point targets and selected state for compact controls', async () => {
    const view = await render(<HomeScreen />);
    const settings = view.getByLabelText('Settings');
    const streak = view.getByLabelText('0 day practice streak');
    const portrait = view.getByTestId('today-asha-portrait');
    const talk = view.getByTestId('today-talk-with-asha');
    const nextRow = view.getByTestId('today-next-row');
    const topbar = view.getByTestId('today-topbar');

    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(settings.props.style).minWidth).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(streak.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(portrait.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(portrait.props.style).width).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(talk.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(nextRow.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(nextRow.props.accessibilityRole).toBe('button');
    expect(nextRow.props.accessibilityState).toEqual({ expanded: false });
    expect(nextRow.props.accessibilityLabel).toBe('STEP 1 OF 2 · NEXT LESSON, A warm hello, 0 of 5 min practised today');
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('0 percent of daily goal complete');
    // Dynamic Type stays capped on the hero copy, as it is on the Asha screen header.
    for (const text of ['READY', 'Ready when you are', 'Tap Asha to start talking with her.']) {
      expect(view.getByText(text).props.maxFontSizeMultiplier).toBe(layout.headerFontScaleCap);
    }
    expect(view.getByText('Ready when you are').props.accessibilityLiveRegion).toBe('polite');
    // The 44pt goal ring cannot grow with Dynamic Type, so its numeral is capped too; the row's label carries the value.
    expect(view.getByText('0').props.maxFontSizeMultiplier).toBe(layout.headerFontScaleCap);
    expect(view.getByTestId('today-goal-value').props.maxFontSizeMultiplier).toBe(layout.headerFontScaleCap);
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
    expect(view.getByText('0 days')).toBeTruthy();
    expect(StyleSheet.flatten(topbar.props.style)).toMatchObject({ justifyContent: 'space-between' });

    await fireEvent.press(nextRow);
    const firstPlan = view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete');
    const nextStep = view.getByTestId('today-next-step');
    expect(StyleSheet.flatten(nextStep.props.style).minHeight).toBeGreaterThanOrEqual(44);
    for (const tile of ['today-plan-catalog']) {
      expect(StyleSheet.flatten(view.getByTestId(tile).props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
    for (const step of ['review', 'lesson', 'asha']) {
      const row = view.queryByTestId(`today-step-${step}`);
      if (row) expect(row.props.accessibilityLabel).toMatch(/^Step \d of [23], /);
    }
    expect(view.getByTestId('today-step-lesson')).toBeTruthy();
    expect(StyleSheet.flatten(firstPlan.props.style).minHeight).toBeGreaterThanOrEqual(48);

    const list = view.getByTestId('today-guided-plan-list');
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({ alignItems: 'stretch', width: '100%' });
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingTop).toBe(16);
    expect(list.props.contentInsetAdjustmentBehavior).toBe('never');
  });

  it('reflows the Today header, next row, hero portrait and details footer at accessibility text sizes', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 2 }, window: { ...window, fontScale: 2 } }));

    try {
      const view = await render(<HomeScreen />);
      expect(StyleSheet.flatten(view.getByTestId('today-topbar').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column', minHeight: 0 });
      expect(StyleSheet.flatten(view.getByTestId('today-next-row').props.style)).toMatchObject({ alignItems: 'flex-start', flexDirection: 'column' });
      expect(StyleSheet.flatten(view.getByTestId('today-asha-portrait').props.style).width).toBeLessThan(200);
      await fireEvent.press(view.getByTestId('today-next-row'));
      expect(StyleSheet.flatten(view.getByTestId('today-hero-footer').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column' });
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });

  it('stacks the greeting row and shrinks the portrait on narrow default-text phones', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 1, width: 360 }, window: { ...window, fontScale: 1, width: 360 } }));

    try {
      const view = await render(<HomeScreen />);
      expect(StyleSheet.flatten(view.getByTestId('today-topbar').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column', minHeight: 0, paddingRight: 0 });
      expect(StyleSheet.flatten(view.getByTestId('today-asha-portrait').props.style).width).toBeLessThan(200);
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });
});
