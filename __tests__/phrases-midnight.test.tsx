import { act, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
    useRouter: () => ({ push: jest.fn() }),
  };
});

jest.mock('lucide-react-native', () => ({
  BookOpen: () => null,
  Leaf: () => null,
  Search: () => null,
  Trash2: () => null,
  Volume2: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/components/ai-consent-gate', () => ({
  AiConsentGate: ({ children }: PropsWithChildren) => children,
}));

jest.mock('@/lib/app-alert', () => ({ showAppAlert: jest.fn() }));

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => false),
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

const mockPhrase = { en: 'Hello', hi: 'नमस्ते', latin: 'namaste' };
const mockAppState = {
  aiConsent: true,
  learnerProfile: { scriptPreference: 'devanagari', phrasePlaybackRate: 1 },
  updateLearnerProfile: jest.fn(),
  // Due tomorrow (2026-11-01) relative to the fake clock below.
  phraseReviews: { [mockPhrase.hi]: { mastery: 0, intervalDays: 1, dueAt: '2026-11-01', lastReviewedAt: null, correctReviews: 1, totalReviews: 1 } },
  phrases: [mockPhrase],
  removePhrase: jest.fn(),
  sceneProgress: {},
};

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

import PhrasesScreen from '../src/app/(tabs)/phrases';

describe('PhrasesScreen due list across midnight', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists a phrase as due once the calendar day rolls over while the tab stays mounted', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 31, 23, 59, 59) });
    const view = await render(<PhrasesScreen />);

    expect(view.getByText('All caught up')).toBeTruthy();
    expect(view.queryByText('Ready for review')).toBeNull();

    // The calendar-day hook refreshes one second after midnight.
    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });

    expect(view.getByText('Ready for review')).toBeTruthy();
    expect(view.getByLabelText('Review 1 phrase due today')).toBeTruthy();

    await view.unmount();
  });
});
