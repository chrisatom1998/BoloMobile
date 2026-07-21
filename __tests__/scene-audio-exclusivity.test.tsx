import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'chai' }),
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('lucide-react-native', () => ({
  Bookmark: () => null,
  Check: () => null,
  ChevronRight: () => null,
  Heart: () => null,
  RotateCcw: () => null,
  Star: () => null,
  Volume2: () => null,
  X: () => null,
}));

jest.mock('@/components/ai-consent-gate', () => ({
  AiConsentGate: ({ children }: PropsWithChildren) => children,
}));

jest.mock('@/components/pronunciation-recorder', () => {
  const React = require('react') as typeof import('react');
  const { Pressable, Text, View } = require('react-native') as typeof import('react-native');
  return {
    PronunciationRecorder: ({ onActivityChange }: { onActivityChange?: (active: boolean) => void }) => React.createElement(
      View,
      null,
      React.createElement(Pressable, { accessibilityLabel: 'Start pronunciation activity', onPress: () => onActivityChange?.(true) }, React.createElement(Text, null, 'Start pronunciation activity')),
      React.createElement(Pressable, { accessibilityLabel: 'Finish pronunciation activity', onPress: () => onActivityChange?.(false) }, React.createElement(Text, null, 'Finish pronunciation activity')),
    ),
  };
});

jest.mock('@/hooks/use-foreground-timer', () => ({
  useForegroundTimer: () => ({ elapsedSeconds: () => 0, reset: jest.fn() }),
}));

jest.mock('@/lib/speech', () => ({
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({
    aiConsent: true,
    markSceneComplete: jest.fn(),
    phrases: [],
    togglePhrase: jest.fn(),
  }),
}));

import SceneScreen from '../src/app/scene/[id]';
import { speakText } from '../src/lib/speech';

const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;

describe('scene audio exclusivity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('blocks scene playback and answer selection throughout pronunciation activity', async () => {
    const view = await render(<SceneScreen />);
    const listen = view.getByLabelText('Hear Asha');
    const answer = view.getByLabelText(/^एक चाय दीजिए/u);

    await fireEvent.press(view.getByLabelText('Start pronunciation activity'));
    await waitFor(() => expect(listen.props.accessibilityState).toEqual({ disabled: true }));
    expect(answer.props.accessibilityState).toEqual({ disabled: true, selected: false });

    await fireEvent.press(listen);
    await fireEvent.press(answer);
    expect(speakTextMock).not.toHaveBeenCalled();

    await fireEvent.press(view.getByLabelText('Finish pronunciation activity'));
    await waitFor(() => expect(listen.props.accessibilityState).toEqual({ disabled: false }));
    await fireEvent.press(listen);
    expect(speakTextMock).toHaveBeenCalledTimes(1);
  });
});
