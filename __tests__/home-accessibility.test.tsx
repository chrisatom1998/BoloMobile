// Keep built-in journey fixtures independent of locally imported lessons.
jest.mock('../src/data/creator-lessons', () => ({ creatorLessons: [] }));

import { act, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
    useRouter: () => ({ push: jest.fn() }),
  };
});

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 59 }),
}));

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => false),
  speakText: jest.fn(async () => true),
  stopSpeaking: jest.fn(async () => undefined),
}));

const mockAppState = {
  aiConsent: true,
  dailySteps: 0,
  duePhrases: [],
  goal: 5,
  hydrated: true,
  phrases: [] as { en: string; hi: string; latin: string }[],
  practice: { chaiDone: false, date: '2026-07-14', liveDone: false, seconds: 0 },
  setGoal: jest.fn(),
  streak: 0,
};

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

import HomeScreen from '../src/app/(tabs)/index';

async function withWindow<T>(patch: { fontScale: number; width?: number }, run: () => Promise<T>) {
  const window = Dimensions.get('window');
  const screen = Dimensions.get('screen');
  await act(async () => Dimensions.set({ screen: { ...screen, ...patch }, window: { ...window, ...patch } }));
  try {
    return await run();
  } finally {
    await act(async () => Dimensions.set({ screen, window }));
  }
}

describe('home accessibility', () => {
  beforeEach(() => {
    mockAppState.phrases = [];
  });

  it('provides 44 point targets and selected state for compact controls', async () => {
    mockAppState.phrases = [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }];
    const view = await render(<HomeScreen />);
    const settings = view.getByLabelText('Settings');
    const streak = view.getByLabelText('0 day practice streak');
    const firstPlan = view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete');
    const nextStep = view.getByTestId('today-next-step');
    const topbar = view.getByTestId('today-topbar');

    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(settings.props.style).minWidth).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(streak.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('0 percent of daily goal complete');
    expect(view.getByText('बोलो', { includeHiddenElements: true }).props['aria-hidden']).toBe(true);
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
    expect(StyleSheet.flatten(nextStep.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(view.getByTestId('today-due-review-all').props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(view.getByTestId('today-due-card-0-listen').props.style)).toMatchObject({ minWidth: 44, minHeight: 44 });
    expect(view.getByTestId('today-due-card-0-devanagari').props.accessibilityLanguage).toBe('hi-IN');
    expect(view.getByTestId('today-steps').props.accessibilityRole).toBe('list');
    for (const step of ['review', 'lesson', 'asha']) {
      const row = view.getByTestId(`today-step-${step}`);
      expect(row.props.accessibilityLabel).toMatch(/^Step \d of 3, /);
      // Step rows are informational: no button role without a real action.
      expect(row.props.accessibilityRole).toBeUndefined();
      expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(StyleSheet.flatten(firstPlan.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(topbar.props.style)).toMatchObject({ justifyContent: 'space-between' });

    const list = view.getByTestId('today-guided-plan-list');
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({ alignItems: 'stretch', width: '100%' });
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingTop).toBe(18);
    expect(list.props.contentInsetAdjustmentBehavior).toBe('never');
  });

  it('never fades text on the rust hero below full opacity', async () => {
    mockAppState.phrases = [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }];
    const view = await render(<HomeScreen />);
    const faded: string[] = [];
    const visit = (node: { children?: unknown; props?: Record<string, unknown>; type?: string }) => {
      const style = (StyleSheet.flatten(node.props?.style as Parameters<typeof StyleSheet.flatten>[0]) ?? {}) as { opacity?: unknown };
      // Only text matters for WCAG text contrast; the MotionReveal wrapper animates its own opacity.
      if (node.type === 'Text' && typeof style.opacity === 'number' && style.opacity < 1) faded.push(String(node.props?.testID ?? node.type));
      if (!Array.isArray(node.children)) return;
      for (const child of node.children) {
        if (child && typeof child === 'object') visit(child as { children?: unknown; props?: Record<string, unknown> });
      }
    };
    visit(view.getByTestId('today-primary-motion'));
    expect(faded).toEqual([]);
  });

  it('keeps the step rows and the due strip horizontal on regular phones', async () => {
    mockAppState.phrases = [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }];
    await withWindow({ fontScale: 1, width: 360 }, async () => {
      const view = await render(<HomeScreen />);
      expect(StyleSheet.flatten(view.getByTestId('today-step-review-copy').props.style)).toMatchObject({ flexDirection: 'row' });
      expect(view.getByTestId('today-due-strip').props.horizontal).toBe(true);
      expect(StyleSheet.flatten(view.getByTestId('today-due-card-0').props.style)).toMatchObject({ width: 200 });
      expect(StyleSheet.flatten(view.getByTestId('today-due-card-0').props.style).height).toBeUndefined();
    });
  });

  it('reflows the Today header, hero footer, steps, and due strip at accessibility text sizes', async () => {
    mockAppState.phrases = [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }];
    await withWindow({ fontScale: 2 }, async () => {
      const view = await render(<HomeScreen />);
      expect(StyleSheet.flatten(view.getByTestId('today-topbar').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column', minHeight: 0 });
      expect(StyleSheet.flatten(view.getByTestId('today-hero-footer').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column' });
      expect(StyleSheet.flatten(view.getByTestId('today-step-review-copy').props.style)).toMatchObject({ flexDirection: 'column' });
      // The strip becomes a stacked column of full-width cards instead of a horizontal scroller.
      const strip = view.getByTestId('today-due-strip');
      expect(strip.props.horizontal).toBeUndefined();
      expect(StyleSheet.flatten(view.getByTestId('today-due-card-0').props.style)).toMatchObject({ width: '100%' });
      expect(StyleSheet.flatten(view.getByTestId('today-due-card-0').props.style).height).toBeUndefined();
      expect(StyleSheet.flatten(view.getByTestId('today-due-card-0-body').props.style)).toMatchObject({ flexDirection: 'column' });
    });
  });

  it('stacks the greeting row on narrow default-text phones', async () => {
    await withWindow({ fontScale: 1, width: 360 }, async () => {
      const view = await render(<HomeScreen />);
      expect(StyleSheet.flatten(view.getByTestId('today-topbar').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column', minHeight: 0, paddingRight: 0 });
    });
  });
});
