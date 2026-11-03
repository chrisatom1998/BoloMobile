// Keep built-in journey fixtures independent of locally imported lessons.
jest.mock('../src/data/creator-lessons', () => ({ creatorLessons: [] }));

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { colors, layout } from '../src/theme';

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
    const nextToggle = view.getByTestId('today-next-toggle');
    const topbar = view.getByTestId('today-topbar');

    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(settings.props.style).minWidth).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(streak.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(portrait.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(portrait.props.style).width).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(talk.props.style).minHeight).toBeGreaterThanOrEqual(44);
    // The row body is the step action; the chevron beside it is a separate 44pt expand control.
    expect(StyleSheet.flatten(nextRow.props.style).minHeight).toBe(layout.nextRowMinHeight);
    expect(StyleSheet.flatten(nextRow.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(nextRow.props.accessibilityRole).toBe('button');
    expect(nextRow.props.accessibilityState?.expanded).toBeUndefined();
    expect(nextRow.props.accessibilityLabel).toBe('Start lesson, A warm hello, 0 of 5 min today');
    expect(nextRow.props.accessibilityHint).toBe('Starts the lesson');
    expect(StyleSheet.flatten(nextToggle.props.style).width).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(nextToggle.props.style).height).toBeGreaterThanOrEqual(44);
    expect(nextToggle.props.accessibilityRole).toBe('button');
    expect(nextToggle.props.accessibilityState).toEqual({ expanded: false });
    expect(nextToggle.props.accessibilityLabel).toBe('Next lesson, A warm hello, collapsed');
    // The ring is hidden from assistive tech, so queries must opt in to see it.
    const dial = view.getByTestId('today-goal-dial', { includeHiddenElements: true });
    expect(dial.props.accessibilityRole).toBe('progressbar');
    expect(dial.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 0 });
    expect(dial.props.accessibilityLabel).toBe('0 percent of daily goal complete');
    // Dynamic Type stays capped on the hero copy, as it is on the Asha screen header.
    for (const text of ['READY', 'Ready when you are']) {
      expect(view.getByText(text).props.maxFontSizeMultiplier).toBe(layout.headerFontScaleCap);
    }
    expect(view.queryByText('Tap Asha to start talking with her.')).toBeNull();
    expect(view.getByText('Ready when you are').props.accessibilityLiveRegion).toBe('polite');
    // The 44pt goal ring cannot grow with Dynamic Type, so its numeral is capped too; the row's minutes line carries the value.
    expect(view.getByText('0', { includeHiddenElements: true }).props.maxFontSizeMultiplier).toBe(layout.headerFontScaleCap);
    expect(view.queryByText('0')).toBeNull();
    // The caption leads with the one-word action; the row label above keeps the full "Start lesson".
    expect(view.getByTestId('today-goal-value').props.children).toBe('Start · 0 of 5 min today');
    // The caption wraps and scales like the row's title, so it never truncates at large Dynamic Type.
    expect(view.getByTestId('today-goal-value').props.numberOfLines).toBeUndefined();
    expect(view.getByTestId('today-goal-value').props.maxFontSizeMultiplier).toBeUndefined();
    // The minutes caption never drops below 12pt; it uses a type role, not an ad-hoc size.
    expect(StyleSheet.flatten(view.getByTestId('today-goal-value').props.style).fontSize).toBeGreaterThanOrEqual(12);
    expect(view.queryByText('of 5 min')).toBeNull();
    // The Play icon affordance is decorative: the row's own label already names the action, and it carries no text of its own.
    const affordance = view.getByTestId('today-next-start');
    expect(affordance.props.accessible).toBe(false);
    expect(affordance.props.importantForAccessibility).toBe('no');
    expect(within(affordance).getByTestId('today-next-start-circle')).toBeTruthy();
    expect(within(affordance).queryByText(/./u)).toBeNull();
    expect(view.queryByLabelText('Start')).toBeNull();
    expect(view.queryByText('Start')).toBeNull();
    // It sits between the text column and the chevron.
    const cardRow = view.getByTestId('today-next-card');
    const cardRowIds: string[] = [];
    const collect = (node: { children?: unknown[]; props?: { testID?: string } }) => {
      if (node.props?.testID) cardRowIds.push(node.props.testID);
      for (const child of node.children ?? []) {
        if (child && typeof child === 'object') collect(child as { children?: unknown[]; props?: { testID?: string } });
      }
    };
    collect(cardRow);
    expect(cardRowIds.indexOf('today-next-practice')).toBeLessThan(cardRowIds.indexOf('today-next-start-circle'));
    expect(cardRowIds.indexOf('today-next-start-circle')).toBeLessThan(cardRowIds.indexOf('today-next-toggle'));
    // The ring is hidden from VoiceOver inside the row so the minutes are not announced twice.
    expect(dial.props.accessible).toBe(false);
    expect(dial.props.accessibilityElementsHidden).toBe(true);
    expect(dial.props.importantForAccessibility).toBe('no-hide-descendants');
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
    for (const child of dial.children) {
      if (child && typeof child === 'object') visit(child as { children?: unknown; props?: Record<string, unknown> });
    }
    expect(leakedAccessibilityProps).toEqual([]);
    expect(view.getByText('0 days')).toBeTruthy();
    expect(StyleSheet.flatten(topbar.props.style)).toMatchObject({ justifyContent: 'space-between' });

    await fireEvent.press(nextToggle);
    expect(view.getByTestId('today-next-toggle').props.accessibilityState).toEqual({ expanded: true });
    expect(view.getByTestId('today-next-toggle').props.accessibilityLabel).toBe('Next lesson, A warm hello, expanded');
    const firstPlan = view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete');
    const nextStep = view.getByTestId('today-next-step');
    expect(StyleSheet.flatten(nextStep.props.style).minHeight).toBeGreaterThanOrEqual(layout.touchTarget);
    // An outline button on the shared 1pt secondary border: the rust fill stays with Talk with Asha, so the panel's action still reads as secondary.
    expect(StyleSheet.flatten(nextStep.props.style)).toMatchObject({ backgroundColor: 'transparent', borderColor: colors.brand, borderWidth: 1 });
    expect(nextStep.props.accessibilityLabel).toBe('Start lesson');
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
      // The Play icon affordance wraps under the text column instead of squeezing the title.
      const row = view.getByTestId('today-next-row');
      const rowChildren = row.children.map((child) => (typeof child === 'object' ? child.props.testID : undefined));
      expect(rowChildren.indexOf('today-next-practice')).toBeLessThan(rowChildren.indexOf('today-next-start'));
      expect(StyleSheet.flatten(view.getByTestId('today-next-start').props.style)).toMatchObject({ alignSelf: 'flex-start' });
      expect(StyleSheet.flatten(view.getByTestId('today-asha-portrait').props.style).width).toBe(layout.todayPortraitSizeCompact);
      await fireEvent.press(view.getByTestId('today-next-toggle'));
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
      expect(StyleSheet.flatten(view.getByTestId('today-asha-portrait').props.style).width).toBe(layout.todayPortraitSizeCompact);
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });
});
