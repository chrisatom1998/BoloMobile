import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

const mockReact = jest.requireActual('react');
const mockRemovePhrase = jest.fn();
const mockPhrase = { en: 'Hello', hi: 'नमस्ते', latin: 'namaste' };
// A phrase with no review record is due immediately; schedule this one for
// tomorrow so the header's "everything reviewed" branch stays reachable.
const reviewedTomorrow = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const key = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  return { [mockPhrase.hi]: { mastery: 0, intervalDays: 1, dueAt: key, lastReviewedAt: null, correctReviews: 1, totalReviews: 1 } };
};
const mockAppState = {
  aiConsent: true,
  learnerProfile: { scriptPreference: 'devanagari' },
  phraseReviews: {} as ReturnType<typeof reviewedTomorrow>,
  phrases: [] as (typeof mockPhrase)[],
  removePhrase: mockRemovePhrase,
};

jest.mock('lucide-react-native', () => ({
  BookOpen: () => null,
  Leaf: () => null,
  Search: () => null,
  Trash2: () => null,
  Volume2: () => null,
}));

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => mockReact.useEffect(effect, [effect]),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/components/ai-consent-gate', () => ({
  AiConsentGate: ({ children }: PropsWithChildren) => children,
}));

jest.mock('@/lib/app-alert', () => ({
  showAppAlert: jest.fn(),
}));

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => false),
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

import PhrasesScreen from '../src/app/(tabs)/phrases';
import { showAppAlert } from '../src/lib/app-alert';
import { speakText, stopSpeaking } from '../src/lib/speech';

const showAppAlertMock = showAppAlert as jest.MockedFunction<typeof showAppAlert>;
const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;
const stopSpeakingMock = stopSpeaking as jest.MockedFunction<typeof stopSpeaking>;

function expectDefined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected the value to be defined.');
  return value;
}

describe('PhrasesScreen primary journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.aiConsent = true;
    mockAppState.phraseReviews = reviewedTomorrow();
    mockAppState.phrases = [];
    speakTextMock.mockResolvedValue();
  });

  it('renders the empty phrase-book state', async () => {
    const view = await render(<PhrasesScreen />);

    expect(view.getByText('Your phrase book is ready')).toBeTruthy();
    expect(view.getByText(/Save useful answers from any scene/u)).toBeTruthy();
    expect(view.queryByText('Saved phrases')).toBeNull();
  });

  it('labels every due phrase, not just the first five', async () => {
    mockAppState.phrases = Array.from({ length: 8 }, (_, index) => ({ en: `English ${index}`, hi: `हिन्दी-${index}`, latin: `latin-${index}` }));
    mockAppState.phraseReviews = {};
    const view = await render(<PhrasesScreen />);

    expect(view.getByText('A quick practice keeps 8 phrases fresh.')).toBeTruthy();
    expect(view.getAllByText(/Due now/u)).toHaveLength(8);
  });

  it('always renders the Romanized phrase and English meaning on each saved card', async () => {
    mockAppState.phrases = [mockPhrase];
    const view = await render(<PhrasesScreen />);

    expect(view.getByText('Everything is reviewed for today.')).toBeTruthy();
    expect(view.getByText('नमस्ते')).toBeTruthy();
    expect(view.getByText('namaste')).toBeTruthy();
    expect(view.getByText('Hello')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Hear नमस्ते'));
    expect(speakTextMock).toHaveBeenCalledWith('नमस्ते', undefined, 1);

    await view.unmount();
    expect(stopSpeakingMock).toHaveBeenCalled();
  });

  it('replays a saved phrase at each requested slower speed', async () => {
    mockAppState.phrases = [mockPhrase];
    const view = await render(<PhrasesScreen />);

    for (const [label, rate] of [['0.10×', 0.1], ['0.25×', 0.25], ['0.50×', 0.5]] as const) {
      await fireEvent.press(view.getByLabelText(`Replay namaste at ${label} speed`));
      expect(speakTextMock).toHaveBeenLastCalledWith(mockPhrase.hi, undefined, rate);
    }
  });

  it('removes a phrase only after destructive confirmation', async () => {
    mockAppState.phrases = [mockPhrase];
    const view = await render(<PhrasesScreen />);

    await fireEvent.press(view.getByLabelText('Remove नमस्ते'));
    expect(showAppAlertMock).toHaveBeenCalledWith(
      'Remove saved phrase?',
      'नमस्ते',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Remove', style: 'destructive' }),
      ]),
    );
    expect(mockRemovePhrase).not.toHaveBeenCalled();

    const actions = expectDefined(showAppAlertMock.mock.calls[0])[2] as { onPress?: () => void; text: string }[];
    actions.find(({ text }) => text === 'Remove')?.onPress?.();
    expect(mockRemovePhrase).toHaveBeenCalledWith('नमस्ते');
  });

  it('renders playback failures as accessible alerts', async () => {
    mockAppState.phrases = [mockPhrase];
    speakTextMock.mockRejectedValueOnce(new Error('AI voice playback failed.'));
    const view = await render(<PhrasesScreen />);

    await fireEvent.press(view.getByLabelText('Hear नमस्ते'));
    await waitFor(() => expect(view.getByRole('alert').props.children).toBe('AI voice playback failed.'));
  });
});
