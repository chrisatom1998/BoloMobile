import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouterReplace = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ replace: mockRouterReplace }),
}));

jest.mock('lucide-react-native', () => ({
  Check: () => null,
  Flag: () => null,
  RotateCcw: () => null,
  ShieldCheck: () => null,
  Sparkles: () => null,
  Volume2: () => null,
}));

// Stands in for the native recorder: one tap reports activity and hands over a finished clip.
jest.mock('@/components/voice-turn-button', () => {
  const { createElement } = jest.requireActual('react') as typeof import('react');
  const { Pressable, Text } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    VoiceTurnButton: ({ idleLabel, onActivityChange, onRecordingReady }: Parameters<typeof import('../src/components/voice-turn-button').VoiceTurnButton>[0]) => createElement(Pressable, {
      accessibilityLabel: idleLabel,
      accessibilityRole: 'button',
      onPress: () => {
        onActivityChange?.(true);
        void onRecordingReady({ audioBase64: 'YXVkaW8=', mimeType: 'audio/mp4' }).finally(() => onActivityChange?.(false));
      },
    }, createElement(Text, null, idleLabel)),
  };
});

jest.mock('@/services/bolo-api', () => ({
  checkPronunciation: jest.fn(),
  reportGeneratedMessage: jest.fn(),
}));

jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
}));

jest.mock('@/lib/observability', () => ({ observe: jest.fn(), observeOncePerSession: jest.fn() }));

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => false),
  speakText: jest.fn(async () => true),
  stopSpeaking: jest.fn(async () => undefined),
}));

type Phrase = { en: string; hi: string; latin: string };

const phraseA: Phrase = { en: 'Hello', hi: 'नमस्ते', latin: 'namaste' };
const phraseB: Phrase = { en: 'Thank you', hi: 'धन्यवाद', latin: 'dhanyavaad' };
const phraseC: Phrase = { en: 'One tea, please.', hi: 'एक चाय दीजिए।', latin: 'ek chai dijiye' };

const mockAppState = {
  aiConsent: true,
  clientId: 'client-12345678',
  duePhrases: [] as Phrase[],
  learnerProfile: { scriptPreference: 'both' },
  phraseReviews: {} as Record<string, { mastery: number }>,
  phrases: [] as Phrase[],
  // Mimics the provider: remembering a phrase re-derives duePhrases without it.
  reviewPhrase: jest.fn((hi: string, remembered: boolean) => {
    if (remembered) mockAppState.duePhrases = mockAppState.duePhrases.filter((phrase) => phrase.hi !== hi);
  }),
  setAiConsent: jest.fn(async () => true),
};

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({ ...mockAppState }),
}));

import ReviewScreen from '../src/app/review';
import { hasOfflineSpeech, speakText, stopSpeaking } from '../src/lib/speech';
import { checkPronunciation } from '../src/services/bolo-api';

const hasOfflineSpeechMock = hasOfflineSpeech as jest.MockedFunction<typeof hasOfflineSpeech>;
const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;
const stopSpeakingMock = stopSpeaking as jest.MockedFunction<typeof stopSpeaking>;
const checkPronunciationMock = checkPronunciation as jest.MockedFunction<typeof checkPronunciation>;

async function gradeCurrentPhrase(view: Awaited<ReturnType<typeof render>>, remembered: boolean) {
  await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
  await fireEvent.press(view.getByRole('button', { name: remembered ? 'Got it' : 'Again' }));
}

// Start a mature target at odd index 1 so these tests exercise listen-first.
async function renderTargetCard(mastery: number) {
  mockAppState.phraseReviews = { [phraseA.hi]: { mastery } };
  if (mastery >= 3) mockAppState.duePhrases = [phraseC, phraseA, phraseB];
  const view = await render(<ReviewScreen />);
  if (mastery >= 3) await gradeCurrentPhrase(view, false);
  return view;
}

describe('ReviewScreen session stability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.aiConsent = true;
    mockAppState.duePhrases = [phraseA, phraseB, phraseC];
    mockAppState.phrases = [phraseA, phraseB, phraseC];
    mockAppState.phraseReviews = {};
    hasOfflineSpeechMock.mockReturnValue(false);
    speakTextMock.mockResolvedValue(true);
    checkPronunciationMock.mockResolvedValue({ outcome: 'speech', transcript: 'namaste', feedback: 'Keep the first vowel short.' });
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

  it.each([3, 4, 5])('auto-plays mastery %i with offline audio and hides all phrase text until Reveal', async (mastery) => {
    mockAppState.aiConsent = false;
    hasOfflineSpeechMock.mockReturnValue(true);
    const view = await renderTargetCard(mastery);

    expect(view.getByText('Listen, then say what it means')).toBeTruthy();
    expect(view.queryByText(phraseA.en)).toBeNull();
    expect(view.queryByText(phraseA.hi)).toBeNull();
    expect(view.queryByText(/namaste/i)).toBeNull();
    expect(view.queryByLabelText(`Hear ${phraseA.hi}`)).toBeNull();
    expect(speakTextMock).toHaveBeenCalledTimes(1);
    expect(speakTextMock).toHaveBeenLastCalledWith(phraseA.hi, undefined, 1);

    await fireEvent.press(view.getByRole('button', { name: 'Replay phrase' }));
    expect(speakTextMock).toHaveBeenCalledTimes(2);
    expect(speakTextMock).toHaveBeenLastCalledWith(phraseA.hi, undefined, 1);

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    expect(view.getByText(phraseA.en)).toBeTruthy();
    expect(view.getByText(phraseA.hi)).toBeTruthy();
    expect(view.getByText(/namaste/i)).toBeTruthy();
    expect(speakTextMock).toHaveBeenCalledTimes(2);
  });

  it('uses connected audio with consent and lets the learner retry an auto-play failure', async () => {
    speakTextMock.mockRejectedValueOnce(new Error('Audio unavailable.'));
    const view = await renderTargetCard(3);

    expect(await view.findByText('Audio unavailable.')).toBeTruthy();
    expect(view.queryByText(phraseA.en)).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Replay phrase' }));
    expect(speakTextMock).toHaveBeenLastCalledWith(phraseA.hi, undefined, 1);
    expect(view.queryByText('Audio unavailable.')).toBeNull();
  });

  it.each([0, 1, 2])('keeps mastery %i as an English prompt without auto-play', async (mastery) => {
    hasOfflineSpeechMock.mockReturnValue(true);
    const view = await renderTargetCard(mastery);

    expect(view.getByText('Say it in Hindi')).toBeTruthy();
    expect(view.getByText(phraseA.en)).toBeTruthy();
    expect(view.queryByText(phraseA.hi)).toBeNull();
    expect(view.queryByRole('button', { name: 'Replay phrase' })).toBeNull();
    expect(speakTextMock).not.toHaveBeenCalled();
  });

  it('falls back to the normal card at high mastery without offline audio or consent', async () => {
    mockAppState.aiConsent = false;
    const view = await renderTargetCard(3);

    expect(view.getByText('Say it in Hindi')).toBeTruthy();
    expect(view.getByText(phraseA.en)).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Replay phrase' })).toBeNull();
    expect(speakTextMock).not.toHaveBeenCalled();
    await gradeCurrentPhrase(view, false);
    expect(mockAppState.reviewPhrase).toHaveBeenCalledWith(phraseA.hi, false);
  });

  it('keeps a high-mastery fallback card in place when consent is granted mid-review', async () => {
    mockAppState.aiConsent = false;
    mockAppState.duePhrases = [phraseA, phraseB];
    mockAppState.phraseReviews = {
      [phraseA.hi]: { mastery: 3 },
      [phraseB.hi]: { mastery: 3 },
    };
    const view = await render(<ReviewScreen />);

    expect(view.getByText('Say it in Hindi')).toBeTruthy();
    expect(view.getByText(phraseA.en)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));

    mockAppState.aiConsent = true;
    await view.rerender(<ReviewScreen />);

    expect(view.getByText('Say it in Hindi')).toBeTruthy();
    expect(view.getByText(phraseA.en)).toBeTruthy();
    expect(view.queryByText('Listen, then say what it means')).toBeNull();
    expect(speakTextMock).not.toHaveBeenCalled();
    expect(view.getByLabelText(`Hear ${phraseA.hi}`).props.accessibilityState).toEqual({ disabled: false });

    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(view.getByText('Listen, then say what it means')).toBeTruthy();
    expect(view.queryByText(phraseB.en)).toBeNull();
    expect(speakTextMock).toHaveBeenCalledTimes(1);
    expect(speakTextMock).toHaveBeenLastCalledWith(phraseB.hi, undefined, 1);
  });

  it.each([false, true])('keeps an odd-index fallback card stable when consent changes (revealed=%s)', async (revealed) => {
    mockAppState.aiConsent = false;
    const view = await renderTargetCard(3);
    expect(view.getByText('Phrase 2 of 3')).toBeTruthy();
    expect(view.getByText('Say it in Hindi')).toBeTruthy();
    expect(view.getByText(phraseA.en)).toBeTruthy();
    if (revealed) await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));

    mockAppState.aiConsent = true;
    await view.rerender(<ReviewScreen />);

    expect(view.getByText('Say it in Hindi')).toBeTruthy();
    expect(view.getByText(phraseA.en)).toBeTruthy();
    expect(view.queryByText('Listen, then say what it means')).toBeNull();
    expect(speakTextMock).not.toHaveBeenCalled();
    if (!revealed) {
      expect(view.getByRole('button', { name: 'Hear a hint' }).props.accessibilityState).toEqual({ disabled: false });
      await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    }
    expect(view.getByLabelText(`Hear ${phraseA.hi}`).props.accessibilityState).toEqual({ disabled: false });
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(mockAppState.reviewPhrase).toHaveBeenLastCalledWith(phraseA.hi, true);
  });

  it('mixes mature cards as speak, listen, speak in one stable session', async () => {
    mockAppState.phraseReviews = Object.fromEntries([phraseA, phraseB, phraseC].map((phrase) => [phrase.hi, { mastery: 3 }]));
    const view = await render(<ReviewScreen />);
    expect(view.getByText('Say it in Hindi')).toBeTruthy();
    expect(view.getByText(phraseA.en)).toBeTruthy();
    expect(speakTextMock).not.toHaveBeenCalled();

    await gradeCurrentPhrase(view, true);
    expect(view.getByText('Listen, then say what it means')).toBeTruthy();
    expect(view.queryByText(phraseB.en)).toBeNull();
    expect(speakTextMock).toHaveBeenCalledTimes(1);
    expect(speakTextMock).toHaveBeenLastCalledWith(phraseB.hi, undefined, 1);
    await fireEvent.press(view.getByRole('button', { name: 'Replay phrase' }));
    await gradeCurrentPhrase(view, true);
    expect(mockAppState.reviewPhrase).toHaveBeenLastCalledWith(phraseB.hi, true);

    expect(view.getByText('Say it in Hindi')).toBeTruthy();
    expect(view.getByText(phraseC.en)).toBeTruthy();
    expect(speakTextMock).toHaveBeenCalledTimes(2);
    await gradeCurrentPhrase(view, true);
    expect(view.getByText('3 of 3 remembered')).toBeTruthy();
  });

  it('counts an audio hint as supported recall and clears it for the next card', async () => {
    const view = await render(<ReviewScreen />);
    expect(view.queryByText(phraseA.hi)).toBeNull();
    expect(view.queryByText(/namaste/i)).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Hear a hint' }));
    expect(speakTextMock).toHaveBeenLastCalledWith(phraseA.hi, undefined, 1);
    expect(view.queryByText(phraseA.hi)).toBeNull();
    await gradeCurrentPhrase(view, true);
    expect(mockAppState.reviewPhrase).toHaveBeenLastCalledWith(phraseA.hi, false);

    await gradeCurrentPhrase(view, true);
    expect(mockAppState.reviewPhrase).toHaveBeenLastCalledWith(phraseB.hi, true);
    await gradeCurrentPhrase(view, true);
    expect(view.getByText('2 of 3 remembered')).toBeTruthy();
  });

  it('disables audio hints without consent or offline audio', async () => {
    mockAppState.aiConsent = false;
    const view = await render(<ReviewScreen />);
    const hint = view.getByRole('button', { name: 'Hear a hint' });
    expect(hint.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(hint);
    await gradeCurrentPhrase(view, true);
    expect(speakTextMock).not.toHaveBeenCalled();
    expect(mockAppState.reviewPhrase).toHaveBeenLastCalledWith(phraseA.hi, true);
  });

  it.each(['Listen', 'Slow'])('grades speak-first normally after using %s after Reveal', async (button) => {
    const view = await render(<ReviewScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByLabelText(`Hear ${phraseA.hi}${button === 'Slow' ? ' slowly' : ''}`));
    expect(speakTextMock).toHaveBeenLastCalledWith(phraseA.hi, undefined, button === 'Slow' ? 0.72 : 1);
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(mockAppState.reviewPhrase).toHaveBeenLastCalledWith(phraseA.hi, true);
  });
});

describe('ReviewScreen say it aloud', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.aiConsent = true;
    mockAppState.duePhrases = [phraseA, phraseB];
    mockAppState.phrases = [phraseA, phraseB];
    mockAppState.phraseReviews = {};
    hasOfflineSpeechMock.mockReturnValue(true);
    speakTextMock.mockResolvedValue(true);
    checkPronunciationMock.mockResolvedValue({ outcome: 'speech', transcript: 'namaste', feedback: 'Keep the first vowel short.' });
  });

  it.each([0, 3])('offers recording only after Reveal, shows feedback, and resets on the next card (mastery %i)', async (mastery) => {
    const view = await renderTargetCard(mastery);
    expect(view.queryByLabelText('Record pronunciation')).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByLabelText('Record pronunciation'));

    expect(await view.findByText('Keep the first vowel short.')).toBeTruthy();
    expect(checkPronunciationMock).toHaveBeenCalledWith(expect.objectContaining({ target: phraseA }), expect.any(Object));

    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(mockAppState.reviewPhrase).toHaveBeenCalledWith(phraseA.hi, true);
    expect(view.getByText(mastery >= 3 ? 'Phrase 3 of 3' : 'Phrase 2 of 2')).toBeTruthy();
    expect(view.queryByLabelText('Record pronunciation')).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    expect(view.getByLabelText('Record pronunciation')).toBeTruthy();
    expect(view.queryByText('Keep the first vowel short.')).toBeNull();
  });

  it.each([0, 3])('grades without a recording (mastery %i)', async (mastery) => {
    const view = await renderTargetCard(mastery);
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    expect(view.getByLabelText('Record pronunciation')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Again' }));
    expect(mockAppState.reviewPhrase).toHaveBeenCalledWith(phraseA.hi, false);
    expect(checkPronunciationMock).not.toHaveBeenCalled();
    expect(view.getByText(mastery >= 3 ? 'Phrase 3 of 3' : 'Phrase 2 of 2')).toBeTruthy();
  });

  it('keeps the recorder behind the AI consent gate while grading still works', async () => {
    mockAppState.aiConsent = false;
    const view = await render(<ReviewScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));

    expect(view.queryByLabelText('Record pronunciation')).toBeNull();
    // The full privacy notice stays one tap away instead of filling the card.
    await fireEvent.press(view.getByRole('button', { name: 'Turn on Asha coaching' }));
    expect(view.getByText('Before using Asha')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'I agree and want to continue' }));
    expect(mockAppState.setAiConsent).toHaveBeenCalledWith(true);

    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(mockAppState.reviewPhrase).toHaveBeenCalledWith(phraseA.hi, true);
    expect(checkPronunciationMock).not.toHaveBeenCalled();
  });

  it('keeps the hint penalty when Say it aloud starts while the hint is still playing', async () => {
    let resolveHint: (played: boolean) => void = () => {};
    const hintPlayback = new Promise<boolean>((resolve) => {
      resolveHint = resolve;
    });
    speakTextMock.mockReturnValueOnce(hintPlayback);
    const view = await render(<ReviewScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Hear a hint' }));
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await act(async () => {
      resolveHint(false);
      await hintPlayback;
    });

    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(mockAppState.reviewPhrase).toHaveBeenLastCalledWith(phraseA.hi, false);
  });

  it.each([0, 3])('pauses Listen while a practice clip is being checked (mastery %i)', async (mastery) => {
    let finish!: (value: Awaited<ReturnType<typeof checkPronunciation>>) => void;
    checkPronunciationMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = await renderTargetCard(mastery);
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));

    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await waitFor(() => expect(view.getByLabelText(`Hear ${phraseA.hi}`).props.accessibilityState).toEqual({ disabled: true }));

    finish({ outcome: 'speech', transcript: 'namaste', feedback: 'Nice and clear.' });
    expect(await view.findByText('Nice and clear.')).toBeTruthy();
    expect(view.getByLabelText(`Hear ${phraseA.hi}`).props.accessibilityState).toEqual({ disabled: false });
  });

  it.each([
    { mastery: 0, remembered: false }, { mastery: 0, remembered: true },
    { mastery: 3, remembered: false }, { mastery: 3, remembered: true },
  ])('stops pronunciation feedback when grading mastery $mastery as remembered=$remembered', async ({ mastery, remembered }) => {
    const view = await renderTargetCard(mastery);
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    expect(await view.findByText('Keep the first vowel short.')).toBeTruthy();
    expect(speakTextMock).toHaveBeenLastCalledWith('Keep the first vowel short.', expect.any(AbortSignal));
    const stopsBeforeGrading = stopSpeakingMock.mock.calls.length;

    await fireEvent.press(view.getByRole('button', { name: remembered ? 'Got it' : 'Again' }));

    expect(stopSpeakingMock).toHaveBeenCalledTimes(stopsBeforeGrading + 1);
    expect(mockAppState.reviewPhrase).toHaveBeenCalledWith(phraseA.hi, remembered);
    expect(view.getByText(mastery >= 3 ? 'Phrase 3 of 3' : 'Phrase 2 of 2')).toBeTruthy();
  });
});
