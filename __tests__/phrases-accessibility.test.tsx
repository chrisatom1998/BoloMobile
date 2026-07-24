import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('lucide-react-native', () => ({
  BookOpen: () => null,
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
    const listen = view.getByLabelText('Hear नमस्ते');
    const remove = view.getByLabelText('Remove नमस्ते');

    expect(listen.props.accessibilityRole).toBe('button');
    expect(listen.props.accessibilityState).toEqual({ disabled: true });
    expect(StyleSheet.flatten(listen.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(remove.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(remove.props.style)).toMatchObject({ height: 44, width: 44 });

    const list = view.getByTestId('saved-phrase-list');
    expect(StyleSheet.flatten(list.props.contentContainerStyle)).toMatchObject({ alignItems: 'stretch', width: '100%' });
  });
});
