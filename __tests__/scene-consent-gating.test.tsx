import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

const mockAppState = {
  aiConsent: false,
  checkpointScene: jest.fn(),
  clientId: 'client-12345678',
  learnerProfile: { scriptPreference: 'both' },
  markSceneComplete: jest.fn(),
  phrases: [] as { en: string; hi: string; latin: string }[],
  sceneProgress: {} as Record<string, unknown>,
  togglePhrase: jest.fn(),
};

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
  const { createElement } = jest.requireActual('react') as typeof import('react');
  const { Text } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    PronunciationRecorder: () => createElement(Text, { testID: 'pronunciation-recorder' }, 'Pronunciation practice'),
  };
});

jest.mock('@/hooks/use-foreground-timer', () => ({
  useForegroundTimer: () => ({ elapsedSeconds: () => 42, reset: jest.fn() }),
}));

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => true),
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

import SceneScreen from '../src/app/scene/[id]';

describe('scene pronunciation consent gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.aiConsent = false;
    mockAppState.phrases = [];
  });

  it('mounts pronunciation practice only after connected AI processing is agreed to', async () => {
    const view = await render(<SceneScreen />);

    expect(view.queryByTestId('pronunciation-recorder')).toBeNull();

    mockAppState.aiConsent = true;
    await view.rerender(<SceneScreen />);

    expect(view.getByTestId('pronunciation-recorder')).toBeTruthy();
  });
});
