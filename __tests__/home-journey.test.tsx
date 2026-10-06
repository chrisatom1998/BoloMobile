// Keep built-in journey fixtures independent of locally imported lessons.
jest.mock('../src/data/creator-lessons', () => ({ creatorLessons: [] }));

import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { getScene } from '../src/data/scenes';
import { colors } from '../src/theme';

const mockRouterPush = jest.fn();
const mockSetGoal = jest.fn();
const mockAppState = {
  dailySteps: 1,
  duePhrases: [] as { en: string; hi: string; latin: string }[],
  goal: 10 as 5 | 10 | 15,
  hydrated: true,
  phraseReviews: {} as Record<string, { mastery: number; dueAt?: string }>,
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

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

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

  it('renders the greeting header with the streak pill and keeps Settings navigation working', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-topbar').children).toHaveLength(2);
    expect(view.getByText('Namaste')).toBeTruthy();
    expect(view.getAllByText('नमस्ते').length).toBeGreaterThanOrEqual(1);
    expect(view.getByText('2 days')).toBeTruthy();
    expect(view.getByTestId('today-asha-portrait')).toBeTruthy();

    const settings = view.getByLabelText('Settings');
    expect(settings.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(settings);
    expect(mockRouterPush).toHaveBeenCalledWith('/settings');
  });

  it('routes to Settings, saved phrases, the next lesson, Asha, the current plan, and the full catalog', async () => {
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByLabelText('Settings'));
    await fireEvent.press(view.getByLabelText('Review 1 saved phrase due now'));
    await fireEvent.press(view.getByLabelText('Start lesson'));
    await fireEvent.press(view.getByLabelText('Talk with Asha'));
    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete'));
    await fireEvent.press(view.getByLabelText('Browse all 10 plans'));

    expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/settings');
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/review');
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, {
      pathname: '/scene/[id]',
      params: { id: 'plan-essentials-01' },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(4, '/live');
    expect(mockRouterPush).toHaveBeenNthCalledWith(5, {
      pathname: '/lesson-plans',
      params: { planId: 'essentials' },
    });
    expect(mockRouterPush).toHaveBeenNthCalledWith(6, '/lesson-plans');
  });

  it('shows the next lesson hero from real scene data and only the current guided plan', async () => {
    const scene = getScene('plan-essentials-01')!;
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-guided-plan-list')).toBeTruthy();
    expect(view.getByText('NEXT LESSON')).toBeTruthy();
    expect(view.getByText('A warm hello')).toBeTruthy();
    expect(view.getByText(scene.subtitle)).toBeTruthy();
    expect(view.getByText(scene.place)).toBeTruthy();
    for (const word of scene.words) expect(view.getAllByText(word).length).toBeGreaterThanOrEqual(1);
    expect(view.getByText(`${scene.beats.length} beats`)).toBeTruthy();
    expect(view.getByText('Your path')).toBeTruthy();
    expect(view.getByText('Plan 01 of 10')).toBeTruthy();
    expect(view.getByText('0 of 10 lessons')).toBeTruthy();
    expect(view.getByTestId('today-plan-segments').children).toHaveLength(10);
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-0').props.style).backgroundColor).toBe(colors.goldIcon);
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-1').props.style).backgroundColor).toBe(colors.line);
    expect(view.getByLabelText('Browse all 10 plans')).toBeTruthy();
    expect(view.queryByLabelText('Make a connection, plan 2 of 10, 0 of 10 lessons complete')).toBeNull();
    const testIds = collectTestIds(view.toJSON());
    expect(testIds.indexOf('today-primary-motion')).toBeLessThan(testIds.indexOf('today-daily-goal'));
    expect(testIds.indexOf('today-daily-goal')).toBeLessThan(testIds.indexOf('today-talk-with-asha'));
    expect(testIds.indexOf('today-talk-with-asha')).toBeLessThan(testIds.indexOf('today-current-plan'));
    expect(testIds.indexOf('today-current-plan')).toBeLessThan(testIds.indexOf('today-plan-catalog'));

    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/lesson-plans',
      params: { planId: 'essentials' },
    });
  });

  it('advances the current plan card after the prior plan is complete', async () => {
    mockAppState.sceneProgress = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `plan-essentials-${String(index + 1).padStart(2, '0')}`,
        { completions: 1 },
      ]),
    );

    const view = await render(<HomeScreen />);

    expect(view.getByText('Plan 02 of 10')).toBeTruthy();
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
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-0').props.style).backgroundColor).toBe(colors.brand);
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-1').props.style).backgroundColor).toBe(colors.goldIcon);
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
    expect(view.getByLabelText('Make a connection, plan 2 of 10, lesson 2 in progress, 0 of 10 lessons complete')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Continue'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/scene/[id]',
      params: { id: 'plan-connection-02' },
    });
    expect(mockRouterPush).not.toHaveBeenCalledWith('/live');
  });

  it('shows the full due-phrase count, streak, and routes review to the quick review flow', async () => {
    const due = [
      { en: 'How are you?', hi: 'आप कैसे हैं?', latin: 'Aap kaise hain?' },
      { en: 'Thank you', hi: 'धन्यवाद', latin: 'Dhanyavaad' },
    ];
    mockAppState.duePhrases = [due[0]!];
    mockAppState.phrases = due;
    mockAppState.phraseReviews = { 'आप कैसे हैं?': { mastery: 2 } };
    mockAppState.streak = 7;

    const view = await render(<HomeScreen />);

    expect(view.getByText('7 days')).toBeTruthy();
    expect(view.getByText('Ready to review')).toBeTruthy();
    expect(view.getByText('2')).toBeTruthy();
    expect(view.getByText('phrases due')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Review 2 saved phrases due now'));
    expect(mockRouterPush).toHaveBeenCalledWith('/review');
    await fireEvent.press(view.getByLabelText('7 day practice streak'));
    expect(mockRouterPush).toHaveBeenCalledWith('/progress');
    expect(mockRouterPush).not.toHaveBeenCalledWith('/live');
  });

  it('previews up to three due phrases on a white review card, fading the last', async () => {
    mockAppState.phrases = [
      { en: 'Hello', hi: 'नमस्ते', latin: 'namaste' },
      { en: 'Thank you', hi: 'धन्यवाद', latin: 'Dhanyavaad' },
      { en: 'How much is it?', hi: 'कितने का है?', latin: 'Kitne ka hai?' },
      { en: 'Water, please', hi: 'पानी, कृपया', latin: 'Paani, kripya' },
    ];

    const view = await render(<HomeScreen />);

    const card = view.getByTestId('today-language-garden');
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({ backgroundColor: colors.paperRaised, borderTopColor: colors.gold });
    expect(view.getByText('4')).toBeTruthy();
    const preview = view.getByTestId('today-review-preview');
    expect(preview.children).toHaveLength(3);
    expect(within(preview).getByText('धन्यवाद')).toBeTruthy();
    expect(within(preview).queryByText('पानी, कृपया')).toBeNull();
    const faded = within(preview).getByText('कितने का है?');
    expect(StyleSheet.flatten(faded.props.style).opacity).toBeLessThan(1);
    expect(faded.props.numberOfLines).toBe(1);
  });

  it('previews romanized phrases for Latin-script learners and keeps the empty copy at zero', async () => {
    Object.assign(mockAppState, { learnerProfile: { completed: true, scriptPreference: 'latin' } });
    try {
      const view = await render(<HomeScreen />);
      const preview = view.getByTestId('today-review-preview');
      expect(within(preview).getByText(/^namaste$/i)).toBeTruthy();
      expect(within(preview).queryByText('नमस्ते')).toBeNull();

      mockAppState.phrases = [];
      await view.rerender(<HomeScreen />);
      expect(view.queryByTestId('today-review-preview')).toBeNull();
      expect(view.getByText('Saved phrases')).toBeTruthy();
      expect(view.getByText('Save one from any lesson')).toBeTruthy();
      expect(view.getByLabelText('Open saved phrases')).toBeTruthy();
    } finally {
      delete (mockAppState as { learnerProfile?: unknown }).learnerProfile;
    }
  });

  it('updates the daily goal selection and renders progress from persisted practice', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('50 percent of daily goal complete');
    expect(view.getByTestId('today-goal-value').props.children.join('')).toBe('10 min');
    expect(view.getByText('5')).toBeTruthy();
    expect(view.getByText(' min')).toBeTruthy();
    expect(view.getByText('5 to go')).toBeTruthy();
    expect(view.getByLabelText('5 minute daily goal')).toBeTruthy();
    expect(view.getByLabelText('10 minute daily goal').props.accessibilityState).toEqual({ selected: true });
    expect(view.getByLabelText('15 minute daily goal')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('15 minute daily goal'));
    expect(mockSetGoal).toHaveBeenCalledWith(15);

    mockAppState.goal = 15;
    await view.rerender(<HomeScreen />);
    expect(view.getByLabelText('15 minute daily goal').props.accessibilityState).toEqual({ selected: true });
    expect(view.getByTestId('today-goal-value').props.children.join('')).toBe('15 min');
    expect(view.getByText('10 to go')).toBeTruthy();
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('33 percent of daily goal complete');

    mockAppState.practice = { chaiDone: true, date: '2026-07-16', liveDone: true, seconds: 1200 };
    await view.rerender(<HomeScreen />);
    expect(view.getByText('Goal reached')).toBeTruthy();
    expect(view.getByTestId('today-goal-dial').props.accessibilityLabel).toBe('100 percent of daily goal complete');
  });
});
