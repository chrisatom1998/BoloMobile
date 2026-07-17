import { fireEvent, render } from '@testing-library/react-native';

const mockRouterPush = jest.fn();
const mockSetGoal = jest.fn();
const mockAppState = {
  dailySteps: 1,
  goal: 10 as 5 | 10 | 15,
  hydrated: true,
  phrases: [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }],
  practice: { chaiDone: true, date: '2026-07-16', liveDone: false, seconds: 300 },
  setGoal: mockSetGoal,
  streak: 2,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('lucide-react-native', () => ({
  BookOpen: () => null,
  Check: () => null,
  ChevronRight: () => null,
  Flame: () => null,
  Mic: () => null,
  Settings: () => null,
  Sparkles: () => null,
  Target: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/components/scene-card', () => {
  const React = require('react') as typeof import('react');
  const { Pressable, Text } = require('react-native') as typeof import('react-native');
  return {
    SceneCard: ({ scene, onPress }: { scene: { id: string; title: string }; onPress: (scene: { id: string; title: string }) => void }) => React.createElement(
      Pressable,
      {
        accessibilityLabel: `Open scene ${scene.id}`,
        accessibilityRole: 'button',
        onPress: () => onPress(scene),
        testID: `scene-card-${scene.id}`,
      },
      React.createElement(Text, null, scene.title),
    ),
  };
});

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

import HomeScreen from '../src/app/index';

describe('HomeScreen primary journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.dailySteps = 1;
    mockAppState.goal = 10;
    mockAppState.hydrated = true;
    mockAppState.practice = { chaiDone: true, date: '2026-07-16', liveDone: false, seconds: 300 };
  });

  it('routes to Settings, saved phrases, live coaching, and the selected scene', async () => {
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByLabelText('Settings'));
    await fireEvent.press(view.getByLabelText('Saved phrases'));
    await fireEvent.press(view.getByText('Practice live with Mira'));
    await fireEvent.press(view.getByLabelText('Open scene chai'));

    expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/settings');
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/phrases');
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, '/live');
    expect(mockRouterPush).toHaveBeenNthCalledWith(4, {
      pathname: '/scene/[id]',
      params: { id: 'chai' },
    });
  });

  it('filters the catalog to the selected category', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByLabelText('Open scene chai')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Travel scenes, 7'));

    expect(view.getByLabelText('Travel scenes, 7').props.accessibilityState).toEqual({ selected: true });
    expect(view.queryByLabelText('Open scene chai')).toBeNull();
    expect(view.getAllByTestId(/^scene-card-/u)).toHaveLength(7);
  });

  it('updates the daily goal selection and renders progress from persisted practice', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByText('1 / 2 challenge steps')).toBeTruthy();
    expect(view.getByText('50% of daily goal')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('15 minute daily goal'));
    expect(mockSetGoal).toHaveBeenCalledWith(15);

    mockAppState.goal = 15;
    await view.rerender(<HomeScreen />);
    expect(view.getByLabelText('15 minute daily goal').props.accessibilityState).toEqual({ selected: true });
    expect(view.getByText('33% of daily goal')).toBeTruthy();
  });
});
