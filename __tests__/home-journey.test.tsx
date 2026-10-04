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
  learnerProfile: undefined as { completed: boolean; scriptPreference: 'devanagari' | 'latin' } | undefined,
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
  ArrowRight: () => null,
  AudioLines: () => null,
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
    mockAppState.learnerProfile = undefined;
    mockAppState.duePhrases = [];
    mockAppState.phraseReviews = {};
    mockAppState.phrases = [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }];
    mockAppState.practice = { chaiDone: true, date: '2026-07-16', liveDone: false, seconds: 300 };
    mockAppState.sceneProgress = {};
    mockAppState.streak = 2;
  });

  it('renders the Namaste header with streak and keeps Settings navigation working', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-topbar').children).toHaveLength(2);
    expect(view.getByLabelText('Namaste').props.accessibilityRole).toBe('header');
    expect(view.getByText('नमस्ते', { exact: false })).toBeTruthy();
    expect(view.getByText('2 days')).toBeTruthy();
    expect(view.queryByText('LANGUAGE GARDEN')).toBeNull();
    expect(view.queryByText('Make Hindi yours.')).toBeNull();
    expect(view.getByTestId('today-asha-portrait')).toBeTruthy();

    const settings = view.getByLabelText('Settings');
    expect(settings.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(settings);
    expect(mockRouterPush).toHaveBeenCalledWith('/settings');

    const streak = view.getByLabelText('View practice streak, 2 days');
    expect(StyleSheet.flatten(streak.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(streak);
    expect(mockRouterPush).toHaveBeenLastCalledWith('/progress');
  });

  it('routes to Settings, saved phrases, the next lesson, the current plan, the full catalog, and Asha', async () => {
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByLabelText('Settings'));
    await fireEvent.press(view.getByLabelText('Open saved phrases'));
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

    const asha = view.getByLabelText('Talk with Asha');
    expect(asha.props.accessibilityRole).toBe('button');
    await fireEvent.press(asha);
    expect(mockRouterPush).toHaveBeenLastCalledWith('/live');
  });

  it('renders the hero lesson, tiles, Asha banner, and current plan path in design order', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-guided-plan-list')).toBeTruthy();
    expect(view.getByText('NEXT LESSON')).toBeTruthy();
    expect(view.getByText('A warm hello')).toBeTruthy();
    expect(view.getByText('Your path')).toBeTruthy();
    expect(view.getByText('Start speaking · 0 of 10')).toBeTruthy();
    expect(view.getByLabelText('Browse all 10 plans')).toBeTruthy();
    expect(view.queryByLabelText('Make a connection, plan 2 of 10, 0 of 10 lessons complete')).toBeNull();
    expect(view.queryByText('Choose a path')).toBeNull();

    const heroButton = view.getByTestId('today-start-lesson');
    expect(StyleSheet.flatten(heroButton.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(StyleSheet.flatten(heroButton.props.style).backgroundColor).toBe(colors.gold);
    expect(StyleSheet.flatten(view.getByTestId('today-next-practice').props.style).backgroundColor).toBe(colors.brand);
    expect(view.getByTestId('today-lesson-words').children).toHaveLength(3);

    const testIds = collectTestIds(view.toJSON());
    const order = ['today-topbar', 'today-next-practice', 'today-daily-goal', 'today-review-phrases', 'today-talk-with-asha', 'today-current-plan', 'today-plan-catalog'];
    order.slice(1).forEach((id, index) => {
      expect(testIds.indexOf(order[index]!)).toBeLessThan(testIds.indexOf(id));
    });

    expect(view.getAllByTestId('today-path-segment-current', { includeHiddenElements: true })).toHaveLength(1);
    expect(view.getAllByTestId('today-path-segment-todo', { includeHiddenElements: true })).toHaveLength(9);
    expect(view.queryAllByTestId('today-path-segment-done', { includeHiddenElements: true })).toHaveLength(0);

    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/lesson-plans',
      params: { planId: 'essentials' },
    });
  });

  it('distributes leftover vertical space while keeping the screen scrollable', async () => {
    const view = await render(<HomeScreen />);
    const list = view.getByTestId('today-guided-plan-list');

    expect(StyleSheet.flatten(list.props.contentContainerStyle).flexGrow).toBe(1);
    expect(StyleSheet.flatten(view.getByTestId('today-topbar').parent?.props.style)).toMatchObject({ flexGrow: 1, justifyContent: 'space-between' });
  });

  it('honours the Devanagari script preference for lesson words and saved phrases', async () => {
    mockAppState.learnerProfile = { completed: true, scriptPreference: 'devanagari' };
    mockAppState.duePhrases = [{ en: 'How are you?', hi: 'आप कैसे हैं?', latin: 'Aap kaise hain?' }];

    const view = await render(<HomeScreen />);

    expect(view.getByText('आप कैसे हैं?')).toBeTruthy();
    expect(view.queryByText('Aap kaise hain?')).toBeNull();
    expect(view.getByText('कृपया')).toBeTruthy();
  });

  it('advances the current plan path after the prior plan is complete', async () => {
    mockAppState.sceneProgress = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `plan-essentials-${String(index + 1).padStart(2, '0')}`,
        { completions: 1 },
      ]),
    );

    const view = await render(<HomeScreen />);

    expect(view.getByText('Make a connection · 0 of 10')).toBeTruthy();
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
    expect(view.getByText('Start speaking · 1 of 10')).toBeTruthy();
    expect(view.getAllByTestId('today-path-segment-done', { includeHiddenElements: true })).toHaveLength(1);
    expect(view.getAllByTestId('today-path-segment-current', { includeHiddenElements: true })).toHaveLength(1);
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
    expect(view.getByText('Make a connection · 0 of 10')).toBeTruthy();
    expect(view.getByLabelText('Make a connection, plan 2 of 10, lesson 2 in progress, 0 of 10 lessons complete')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Continue'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/scene/[id]',
      params: { id: 'plan-connection-02' },
    });
    expect(mockRouterPush).not.toHaveBeenCalledWith('/live');
  });

  it('shows due phrases, streak, and the featured phrase in the review tile', async () => {
    mockAppState.duePhrases = [{ en: 'How are you?', hi: 'आप कैसे हैं?', latin: 'Aap kaise hain?' }];
    mockAppState.phrases = [...mockAppState.duePhrases];
    mockAppState.phraseReviews = { 'आप कैसे हैं?': { mastery: 2 } };
    mockAppState.practice = { chaiDone: false, date: '2026-07-16', liveDone: false, seconds: 300 };
    mockAppState.streak = 7;

    const view = await render(<HomeScreen />);

    expect(view.getByText('Ready to review')).toBeTruthy();
    expect(view.getByTestId('today-review-count').props.children).toBe(1);
    expect(view.getByText('phrase due')).toBeTruthy();
    expect(view.getByText('7 days')).toBeTruthy();
    expect(view.getByText('Aap kaise hain?')).toBeTruthy();
    expect(view.getByText('A warm hello')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('today-review-phrases').props.style).backgroundColor).toBe(colors.goldSoft);

    await fireEvent.press(view.getByLabelText('Review 1 saved phrase due today'));
    expect(mockRouterPush).toHaveBeenCalledWith('/phrases');
    expect(mockRouterPush).not.toHaveBeenCalledWith('/live');
  });

  it('reflects whether today’s Asha turn is done in the Asha banner', async () => {
    mockAppState.practice = { chaiDone: true, date: '2026-07-16', liveDone: true, seconds: 300 };

    const view = await render(<HomeScreen />);

    expect(view.getByText('Today’s Asha turn is done. Keep talking')).toBeTruthy();
  });

  it('updates the daily goal selection and renders progress from persisted practice', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-daily-goal')).toBeTruthy();
    expect(view.getByText('Daily goal')).toBeTruthy();
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('50 percent of daily goal complete');
    expect(view.getByTestId('today-goal-dial').props.accessibilityValue).toEqual({ max: 100, min: 0, now: 50 });
    expect(view.getByTestId('today-goal-value').props.children.join('')).toBe('10 min');
    expect(view.getByLabelText('5 minute daily goal')).toBeTruthy();
    expect(view.getByLabelText('10 minute daily goal').props.accessibilityState).toEqual({ selected: true });
    expect(view.getByLabelText('15 minute daily goal')).toBeTruthy();
    expect(view.getByText('5 to go')).toBeTruthy();
    expect(view.getByTestId('today-goal-progress-arc', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId('today-goal-arc-track', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(view.getByLabelText('15 minute daily goal'));
    expect(mockSetGoal).toHaveBeenCalledWith(15);

    mockAppState.goal = 15;
    await view.rerender(<HomeScreen />);
    expect(view.getByLabelText('15 minute daily goal').props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId('today-goal-value').props.children.join('')).toBe('15 min');
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('33 percent of daily goal complete');
    expect(view.getByText('10 to go')).toBeTruthy();
  });

  it('omits the progress arc before any practice and marks a met goal', async () => {
    mockAppState.practice = { chaiDone: false, date: '2026-07-16', liveDone: false, seconds: 0 };
    const view = await render(<HomeScreen />);
    expect(view.queryByTestId('today-goal-progress-arc', { includeHiddenElements: true })).toBeNull();

    mockAppState.practice = { chaiDone: false, date: '2026-07-16', liveDone: false, seconds: 900 };
    await view.rerender(<HomeScreen />);
    expect(view.getByText('Goal met')).toBeTruthy();
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('100 percent of daily goal complete');
  });
});
