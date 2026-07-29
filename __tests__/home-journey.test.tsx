import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors } from '../src/theme';

const mockRouterPush = jest.fn();
const mockSetGoal = jest.fn();
const mockAppState = {
  dailySteps: 1,
  duePhrases: [] as { en: string; hi: string; latin: string }[],
  goal: 10 as 5 | 10 | 15,
  hydrated: true,
  phraseReviews: {} as Record<string, { mastery: number }>,
  phrases: [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }] as { en: string; hi: string; latin: string }[],
  practice: { chaiDone: true, date: '2026-07-16', liveDone: false, seconds: 300 },
  sceneProgress: {} as Record<string, {
    completions: number;
    lastBeatIndex?: number;
    lastPracticedAt?: string | null;
  }>,
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

function collectTestIds(node: unknown, ids: string[] = []) {
  if (!node || typeof node === 'string' || typeof node === 'number') return ids;
  if (Array.isArray(node)) {
    node.forEach((child) => collectTestIds(child, ids));
    return ids;
  }
  const testNode = node as { children?: unknown[]; props?: { testID?: string } };
  if (testNode.props?.testID) ids.push(testNode.props.testID);
  testNode.children?.forEach((child) => collectTestIds(child, ids));
  return ids;
}

describe('HomeScreen primary journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.dailySteps = 1;
    mockAppState.goal = 10;
    mockAppState.hydrated = true;
    mockAppState.duePhrases = [];
    mockAppState.phraseReviews = {};
    mockAppState.phrases = [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }];
    mockAppState.practice = { chaiDone: true, date: '2026-07-16', liveDone: false, seconds: 300 };
    mockAppState.sceneProgress = {};
    mockAppState.streak = 2;
  });

  it('renders the approved warm editorial header and keeps Settings navigation working', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-topbar').children).toHaveLength(2);
    expect(view.getByText('A QUIET PRACTICE')).toBeTruthy();
    expect(view.getByText('Make Hindi yours.')).toBeTruthy();
    expect(view.queryByText('One useful moment at a time.')).toBeNull();
    expect(view.getByText('LANGUAGE GARDEN')).toBeTruthy();
    expect(view.getByText('Asha is here to help it grow.')).toBeTruthy();
    expect(view.getByTestId('today-asha-portrait')).toBeTruthy();

    const settings = view.getByLabelText('Settings');
    expect(settings.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(settings);
    expect(mockRouterPush).toHaveBeenCalledWith('/settings');
  });

  it('routes to Settings, the language garden, the next lesson, the current plan, and the full catalog', async () => {
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByLabelText('Settings'));
    await fireEvent.press(view.getByLabelText('Practice saved phrase नमस्ते'));
    await fireEvent.press(view.getByLabelText('Start lesson'));
    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete'));
    await fireEvent.press(view.getByLabelText('Browse all 10 plans'));

    expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/settings');
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/phrases');
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, {
      pathname: '/scene/[id]',
      params: { id: 'plan-essentials-01' },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(4, {
      pathname: '/lesson-plans',
      params: { planId: 'essentials' },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(5, '/lesson-plans');
    expect(mockRouterPush).not.toHaveBeenCalledWith('/live');
  });

  it('shows only the current guided plan and keeps the full catalog behind one link', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-guided-plan-list')).toBeTruthy();
    expect(view.getByText('NEXT LESSON')).toBeTruthy();
    expect(view.getByText('A warm hello')).toBeTruthy();
    expect(view.getByText('Your learning path')).toBeTruthy();
    expect(view.getByText('10 plans · 100 lessons')).toBeTruthy();
    expect(view.getByText('01')).toBeTruthy();
    expect(view.getByText('0 of 10 lessons')).toBeTruthy();
    expect(view.getByLabelText('Browse all 10 plans')).toBeTruthy();
    expect(view.queryByLabelText('Make a connection, plan 2 of 10, 0 of 10 lessons complete')).toBeNull();
    expect(view.queryByText('Choose a path')).toBeNull();
    const testIds = collectTestIds(view.toJSON());
    expect(testIds.indexOf('today-language-garden')).toBeLessThan(testIds.indexOf('today-current-plan'));
    expect(testIds.indexOf('today-current-plan')).toBeLessThan(testIds.indexOf('today-plan-catalog'));
    expect(testIds.indexOf('today-plan-catalog')).toBeLessThan(testIds.indexOf('today-daily-goal'));

    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/lesson-plans',
      params: { planId: 'essentials' },
    });
  });

  it('centers the yellow phrase card without changing the garden total spacing', async () => {
    const view = await render(<HomeScreen />);

    const phraseCardMargin = StyleSheet.flatten(view.getByTestId('today-language-garden').props.style).marginTop;
    const nextPracticeMargin = StyleSheet.flatten(view.getByTestId('today-next-practice').props.style).marginTop;

    expect(phraseCardMargin).toBe(22);
    expect(nextPracticeMargin).toBe(21);
    expect(phraseCardMargin + nextPracticeMargin).toBe(43);
    expect(Math.abs(phraseCardMargin - nextPracticeMargin)).toBeLessThanOrEqual(1);
  });

  it('advances the current plan card after the prior plan is complete', async () => {
    mockAppState.sceneProgress = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `plan-essentials-${String(index + 1).padStart(2, '0')}`,
        { completions: 1 },
      ]),
    );

    const view = await render(<HomeScreen />);

    expect(view.getByText('02')).toBeTruthy();
    expect(view.getByText('Ask where someone lives')).toBeTruthy();
    expect(view.getByLabelText('Make a connection, plan 2 of 10, 0 of 10 lessons complete')).toBeTruthy();
    expect(view.queryByLabelText('Start speaking, plan 1 of 10, 10 of 10 lessons complete')).toBeNull();
  });

  it('selects the second lesson after the first lesson is complete', async () => {
    mockAppState.sceneProgress = {
      'plan-essentials-01': { completions: 1 },
    };

    const view = await render(<HomeScreen />);

    expect(view.getByText('NEXT LESSON')).toBeTruthy();
    expect(view.getByText('Say your name')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Start lesson'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/scene/[id]',
      params: { id: 'plan-essentials-02' },
    });
    expect(mockRouterPush).not.toHaveBeenCalledWith('/live');
  });

  it('prioritizes the most recently practiced unfinished lesson and its plan', async () => {
    mockAppState.sceneProgress = {
      'plan-essentials-03': {
        completions: 0,
        lastBeatIndex: 2,
        lastPracticedAt: '2026-07-20T12:00:00.000Z',
      },
      'plan-connection-02': {
        completions: 0,
        lastBeatIndex: 1,
        lastPracticedAt: '2026-07-21T12:00:00.000Z',
      },
    };

    const view = await render(<HomeScreen />);

    expect(view.getByText('CONTINUE LESSON')).toBeTruthy();
    expect(view.getByText('Say you are new')).toBeTruthy();
    expect(view.getByText('Lesson 2 in progress')).toBeTruthy();
    expect(view.getByText('Continue →')).toBeTruthy();
    expect(view.getByLabelText('Make a connection, plan 2 of 10, lesson 2 in progress, 0 of 10 lessons complete')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Continue'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/scene/[id]',
      params: { id: 'plan-connection-02' },
    });
    expect(mockRouterPush).not.toHaveBeenCalledWith('/live');
  });

  it('shows live phrase, watering, streak, and mastery state in the garden', async () => {
    mockAppState.duePhrases = [{ en: 'How are you?', hi: 'आप कैसे हैं?', latin: 'Aap kaise hain?' }];
    mockAppState.phrases = [...mockAppState.duePhrases];
    mockAppState.phraseReviews = { 'आप कैसे हैं?': { mastery: 2 } };
    mockAppState.practice = { chaiDone: false, date: '2026-07-16', liveDone: false, seconds: 300 };
    mockAppState.streak = 7;

    const view = await render(<HomeScreen />);

    expect(view.getByText('One saved phrase is ready for a little water today.')).toBeTruthy();
    expect(view.getByText('7 days')).toBeTruthy();
    expect(view.getByText('1 to water')).toBeTruthy();
    expect(view.getByText('Aap kaise hain?')).toBeTruthy();
    expect(view.getByText('2/5 roots strong')).toBeTruthy();
    expect(view.getByText('A warm hello')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Practice saved phrase आप कैसे हैं?'));
    expect(mockRouterPush).toHaveBeenCalledWith('/phrases');
    expect(mockRouterPush).not.toHaveBeenCalledWith('/live');
  });

  it('updates the daily goal selection and renders progress from persisted practice', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-goal-dial')).toBeTruthy();
    expect(view.getByTestId('today-goal-value').props.children.join('')).toBe('10 min');
    expect(view.getByLabelText('5 minute daily goal')).toBeTruthy();
    expect(view.getByLabelText('10 minute daily goal')).toBeTruthy();
    expect(view.getByLabelText('15 minute daily goal')).toBeTruthy();
    expect(view.getByText('5 min today')).toBeTruthy();
    const goalArc = view.getByTestId('today-goal-arc', { includeHiddenElements: true });
    expect(StyleSheet.flatten(goalArc.props.style).top).toBe(-6);
    expect(goalArc.props.height).toBe(136);
    expect(StyleSheet.flatten(view.getByTestId('today-goal-choice-5').props.style).left).toBe('19.078947%');
    expect(StyleSheet.flatten(view.getByTestId('today-goal-choice-15').props.style).right).toBe('19.078947%');
    expect(StyleSheet.flatten(view.getByTestId('today-goal-label-5').props.style).transform).toEqual([
      { translateX: -8 },
    ]);
    expect(StyleSheet.flatten(view.getByTestId('today-goal-label-15').props.style).transform).toEqual([
      { translateX: 8 },
    ]);
    expect(StyleSheet.flatten(view.getByTestId('today-goal-marker-spot-5').props.style).bottom).toBe(2);
    expect(StyleSheet.flatten(view.getByTestId('today-goal-marker-spot-10').props.style).bottom).toBe(1.5);
    expect(StyleSheet.flatten(view.getByTestId('today-goal-marker-spot-15').props.style).bottom).toBe(2);
    expect(StyleSheet.flatten(view.getByTestId('today-goal-marker-5').props.style).backgroundColor).toBe(colors.gold);
    expect(StyleSheet.flatten(view.getByTestId('today-goal-status').props.style).marginTop).toBe(10);
    expect(view.getByText('✓ Chai scene')).toBeTruthy();
    expect(view.getByText('Today · 50% of 10 min')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('15 minute daily goal'));
    expect(mockSetGoal).toHaveBeenCalledWith(15);

    mockAppState.goal = 15;
    await view.rerender(<HomeScreen />);
    expect(view.getByLabelText('15 minute daily goal').props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId('today-goal-value').props.children.join('')).toBe('15 min');
    expect(view.getByText('Today · 33% of 15 min')).toBeTruthy();
  });
});
