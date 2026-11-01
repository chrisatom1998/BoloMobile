jest.mock('../src/data/creator-lessons', () => ({ creatorLessons: [] }));

import { fireEvent, render } from '@testing-library/react-native';

const mockRouterPush = jest.fn();
const mockRetry = jest.fn();
const mockState = {
  goal: 10 as 5 | 10 | 15,
  hydrated: true,
  learnerProfile: { completed: true, level: 'new', primaryGoal: 'conversation' },
  phraseReviews: {},
  phrases: [] as { en: string; hi: string; latin: string }[],
  practice: { chaiDone: false, date: '2026-07-14', liveDone: false, seconds: 0 },
  practiceHistory: [] as { answers: number; correct: number; date: string; reviews: number; seconds: number }[],
  retryStorageLoad: mockRetry,
  reviewStreak: 0,
  reviewStreakDays: [] as string[],
  sceneProgress: {},
  storagePhase: 'ready' as 'loading' | 'ready' | 'error',
  streak: 0,
};

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    Redirect: () => null,
    Stack: { Screen: () => null },
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
    useLocalSearchParams: () => ({}),
    useRouter: () => ({ push: mockRouterPush }),
  };
});

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => false),
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockState,
  useAppStateValue: () => mockState,
  useAppActions: () => mockState,
}));

import { StatePreviewProvider } from '../src/components/states/preview-context';
import HomeScreen from '../src/app/(tabs)/index';
import PhrasesScreen from '../src/app/(tabs)/phrases';
import ProgressScreen from '../src/app/(tabs)/progress';
import LessonPlansScreen from '../src/app/lesson-plans';

describe('screen state wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.storagePhase = 'ready';
    mockState.phrases = [];
    mockState.streak = 0;
    mockState.practice.seconds = 0;
  });

  it('shows a fresh Today with one first lesson action', async () => {
    const view = await render(<HomeScreen />);
    expect(view.getByText('A fresh start')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Start your first lesson'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: expect.any(String) } });
  });

  it('shows Today loading and a retry when the plan cannot be read', async () => {
    mockState.storagePhase = 'loading';
    const loading = await render(<HomeScreen />);
    expect(loading.getByText('Getting today ready')).toBeTruthy();

    mockState.storagePhase = 'error';
    const error = await render(<HomeScreen />);
    await fireEvent.press(error.getByLabelText("Retry loading today's plan"));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('forces phrase, plan, and progress states from the screenshot preview', async () => {
    const phrases = await render(
      <StatePreviewProvider phase="loading" screen="phrases">
        <PhrasesScreen />
      </StatePreviewProvider>,
    );
    expect(phrases.getByText('Opening your phrases')).toBeTruthy();

    const plans = await render(
      <StatePreviewProvider phase="empty" screen="lesson-plans">
        <LessonPlansScreen />
      </StatePreviewProvider>,
    );
    expect(plans.getByText('No lessons here yet')).toBeTruthy();

    const progress = await render(
      <StatePreviewProvider phase="error" screen="progress">
        <ProgressScreen />
      </StatePreviewProvider>,
    );
    expect(progress.getByText("Progress didn't load")).toBeTruthy();
    await fireEvent.press(progress.getByLabelText('Retry loading progress'));
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });
});
