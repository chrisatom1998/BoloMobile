import { fireEvent, render } from '@testing-library/react-native';

const mockRouterReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

jest.mock('lucide-react-native', () => ({
  Check: () => null,
  RotateCcw: () => null,
  Volume2: () => null,
}));

jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
}));

jest.mock('@/lib/observability', () => ({ observe: jest.fn() }));

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => false),
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

type Phrase = { en: string; hi: string; latin: string };

const phraseA: Phrase = { en: 'Hello', hi: 'नमस्ते', latin: 'namaste' };
const phraseB: Phrase = { en: 'Thank you', hi: 'धन्यवाद', latin: 'dhanyavaad' };
const phraseC: Phrase = { en: 'One tea, please.', hi: 'एक चाय दीजिए।', latin: 'ek chai dijiye' };

const mockAppState = {
  aiConsent: true,
  duePhrases: [] as Phrase[],
  learnerProfile: { scriptPreference: 'both' },
  phraseReviews: {} as Record<string, { mastery: number }>,
  phrases: [] as Phrase[],
  // Mimics the provider: remembering a phrase re-derives duePhrases without it.
  reviewPhrase: jest.fn((hi: string, remembered: boolean) => {
    if (remembered) mockAppState.duePhrases = mockAppState.duePhrases.filter((phrase) => phrase.hi !== hi);
  }),
};

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({ ...mockAppState }),
}));

import ReviewScreen from '../src/app/review';
import { hasOfflineSpeech, speakText } from '../src/lib/speech';

const hasOfflineSpeechMock = hasOfflineSpeech as jest.MockedFunction<typeof hasOfflineSpeech>;
const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;

async function gradeCurrentPhrase(view: Awaited<ReturnType<typeof render>>, remembered: boolean) {
  await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
  await fireEvent.press(view.getByRole('button', { name: remembered ? 'Got it' : 'Again' }));
}

describe('ReviewScreen session stability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.aiConsent = true;
    mockAppState.duePhrases = [phraseA, phraseB, phraseC];
    mockAppState.phrases = [phraseA, phraseB, phraseC];
    mockAppState.phraseReviews = {};
    hasOfflineSpeechMock.mockReturnValue(false);
    speakTextMock.mockResolvedValue();
  });

  it('reviews every due phrase exactly once even as grading shrinks the due list', async () => {
    const view = await render(<ReviewScreen />);
    expect(view.getByText('Phrase 1 of 3')).toBeTruthy();
    expect(view.getByText('Hello')).toBeTruthy();

    await gradeCurrentPhrase(view, true);
    expect(view.getByText('Phrase 2 of 3')).toBeTruthy();
    expect(view.getByText('Thank you')).toBeTruthy();

    await gradeCurrentPhrase(view, true);
    expect(view.getByText('Phrase 3 of 3')).toBeTruthy();
    expect(view.getByText('One tea, please.')).toBeTruthy();

    await gradeCurrentPhrase(view, true);
    expect(view.getByText('Review complete')).toBeTruthy();
    expect(view.getByText('3 of 3 remembered')).toBeTruthy();
    expect(mockAppState.reviewPhrase.mock.calls.map(([hi]) => hi)).toEqual([phraseA.hi, phraseB.hi, phraseC.hi]);
  });

  it('completes a single-phrase session instead of falling into the low-mastery list', async () => {
    mockAppState.duePhrases = [phraseA];
    const view = await render(<ReviewScreen />);
    expect(view.getByText('Phrase 1 of 1')).toBeTruthy();

    await gradeCurrentPhrase(view, true);
    expect(view.getByText('Review complete')).toBeTruthy();
    expect(view.getByText('1 of 1 remembered')).toBeTruthy();
  });

  it('ignores a repeated grade from the same rendered phrase', async () => {
    mockAppState.duePhrases = [phraseA, phraseB];
    const view = await render(<ReviewScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    const gotIt = view.getByRole('button', { name: 'Got it' });

    await fireEvent.press(gotIt);
    await fireEvent.press(gotIt);

    expect(mockAppState.reviewPhrase).toHaveBeenCalledTimes(1);
    expect(view.getByText('Phrase 2 of 2')).toBeTruthy();
  });

  it('disables Listen without consent or bundled audio and surfaces playback failures', async () => {
    mockAppState.aiConsent = false;
    mockAppState.duePhrases = [phraseA];
    const view = await render(<ReviewScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));

    const listen = view.getByLabelText(`Hear ${phraseA.hi}`);
    expect(listen.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(listen);
    expect(speakTextMock).not.toHaveBeenCalled();

    hasOfflineSpeechMock.mockReturnValue(true);
    speakTextMock.mockRejectedValueOnce(new Error('Audio unavailable.'));
    await view.rerender(<ReviewScreen />);
    await fireEvent.press(view.getByLabelText(`Hear ${phraseA.hi}`));
    expect(await view.findByText('Audio unavailable.')).toBeTruthy();
  });
});
