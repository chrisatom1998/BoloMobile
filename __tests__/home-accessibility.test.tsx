import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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

jest.mock('@/components/scene-card', () => ({ SceneCard: () => null }));

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({
    dailySteps: 0,
    goal: 5,
    hydrated: true,
    phrases: [],
    practice: { chaiDone: false, date: '2026-07-14', liveDone: false, seconds: 0 },
    setGoal: jest.fn(),
    streak: 0,
  }),
}));

import HomeScreen from '../src/app/index';

describe('home accessibility', () => {
  it('provides 44 point targets and selected state for compact controls', async () => {
    const view = await render(<HomeScreen />);
    const settings = view.getByLabelText('Settings');
    const savedPhrases = view.getByLabelText('Saved phrases');
    const fiveMinuteGoal = view.getByLabelText('5 minute daily goal');
    const allScenes = view.getByLabelText(/^All scenes,/u);

    expect(StyleSheet.flatten(settings.props.style)).toMatchObject({ height: 44, width: 44 });
    expect(StyleSheet.flatten(savedPhrases.props.style)).toMatchObject({ minHeight: 44 });
    expect(StyleSheet.flatten(fiveMinuteGoal.props.style)).toMatchObject({ minHeight: 44, minWidth: 44 });
    expect(fiveMinuteGoal.props.accessibilityState).toEqual({ selected: true });
    expect(StyleSheet.flatten(allScenes.props.style)).toMatchObject({ minHeight: 44 });
    expect(allScenes.props.accessibilityState).toEqual({ selected: true });
  });
});
