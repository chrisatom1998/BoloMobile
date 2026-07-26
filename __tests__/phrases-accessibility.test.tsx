import { act, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import * as mockReact from 'react';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => mockReact.useEffect(effect, [effect]),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('lucide-react-native', () => ({
  BookOpen: () => null,
  Leaf: () => null,
  Search: () => null,
  Trash2: () => null,
  Volume2: () => null,
}));

jest.mock('@/components/ai-consent-gate', () => ({ AiConsentGate: () => null }));
jest.mock('@/lib/speech', () => ({ hasOfflineSpeech: jest.fn(() => false), speakText: jest.fn(), stopSpeaking: jest.fn() }));
jest.mock('@/state/app-state', () => ({
  useAppState: () => ({
    aiConsent: false,
    phrases: [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }],
    removePhrase: jest.fn(),
  }),
}));

import PhrasesScreen from '../src/app/(tabs)/phrases';

describe('saved phrase accessibility', () => {
  it('exposes 44 point buttons and the disabled playback state', async () => {
    const view = await render(<PhrasesScreen />);
    const listen = view.getByTestId('saved-phrase-listen');
    const remove = view.getByLabelText('Remove नमस्ते');

    expect(listen.props.testID).toBe('saved-phrase-listen');
    expect(listen.props.accessibilityLabel).toBe('Hear नमस्ते');
    expect(listen.props.accessibilityRole).toBe('button');
    expect(listen.props.accessibilityState).toEqual({ disabled: true });
    expect(StyleSheet.flatten(listen.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(remove.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(remove.props.style)).toMatchObject({ height: 44, width: 44 });

    const list = view.getByTestId('saved-phrase-list');
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({ alignItems: 'stretch', width: '100%' });
  });

  it('removes the saved-phrase hero title cap at accessibility text sizes', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 2 }, window: { ...window, fontScale: 2 } }));

    try {
      const view = await render(<PhrasesScreen />);
      expect(StyleSheet.flatten(view.getByTestId('phrases-header-hero').props.style)).toMatchObject({ alignItems: 'stretch' });
      expect(StyleSheet.flatten(view.getByText('Words you want to keep.').props.style).maxWidth).toBe('100%');
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });
});
