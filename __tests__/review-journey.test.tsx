import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockRouterReplace = jest.fn();

jest.mock('@/lib/ai-voice-player', () => ({ clearAiVoicePlaybackCache: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      __store: store,
      multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null])),
      multiSet: jest.fn(async (entries: [string, string][]) => {
        entries.forEach(([key, value]) => store.set(key, value));
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    },
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => false, replace: mockRouterReplace }),
}));

jest.mock('lucide-react-native', () => ({
  Check: () => null,
  Flag: () => null,
  RotateCcw: () => null,
  ShieldCheck: () => null,
  Sparkles: () => null,
  Volume2: () => null,
}));

// Exercise the recorder's speech handoff without native microphone setup.
jest.mock('@/components/voice-turn-button', () => {
  const { createElement } = jest.requireActual('react') as typeof import('react');
  const { Pressable, Text } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    VoiceTurnButton: ({ idleLabel, onActivityChange }: Parameters<typeof import('../src/components/voice-turn-button').VoiceTurnButton>[0]) => createElement(Pressable, {
      accessibilityRole: 'button',
      accessibilityLabel: idleLabel,
      onPress: () => {
        onActivityChange?.(true);
        void jest.requireMock('@/lib/speech').stopSpeaking();
      },
    }, createElement(Text, null, idleLabel)),
  };
});

jest.mock('@/lib/app-alert', () => ({ showAppAlert: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('@/lib/observability', () => ({ clearObservability: jest.fn(async () => undefined), observe: jest.fn(), observeOncePerSession: jest.fn() }));
jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => true),
  speakText: jest.fn(async () => true),
  stopSpeaking: jest.fn(async () => undefined),
}));

import ReviewScreen from '../src/app/review';
import { hapticSuccess, hapticWarning } from '../src/lib/haptics';
import { createAiConsentRecord, dateKey, defaultPhraseReview, storageKeys } from '../src/lib/storage';
import type { PhraseReview } from '../src/state/app-state-types';
import { AppStateProvider, useAppStateValue } from '../src/state/app-state';
import { speakText, stopSpeaking } from '../src/lib/speech';

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
};
const hapticSuccessMock = hapticSuccess as jest.MockedFunction<typeof hapticSuccess>;
const hapticWarningMock = hapticWarning as jest.MockedFunction<typeof hapticWarning>;
const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;

const namaste = { en: 'Hello', hi: 'नमस्ते', latin: 'namaste' };
const chai = { en: 'One tea, please.', hi: 'एक चाय दीजिए।', latin: 'ek chai dijiye.' };

function tomorrow(today = dateKey()) {
  const value = new Date(`${today}T12:00:00`);
  value.setDate(value.getDate() + 1);
  return dateKey(value);
}

function ReviewsProbe() {
  const { hydrated, phraseReviews } = useAppStateValue();
  if (!hydrated) return <Text testID="reviews">{'{}'}</Text>;
  return <Text testID="reviews">{JSON.stringify(phraseReviews)}</Text>;
}

function readReviews(view: Awaited<ReturnType<typeof render>>) {
  return JSON.parse(String(view.getByTestId('reviews').props.children)) as Record<string, PhraseReview>;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function seedDuePhrases() {
  const today = dateKey();
  asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste, chai]));
  asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
    [namaste.hi]: defaultPhraseReview(today),
    [chai.hi]: defaultPhraseReview(today),
  }));
}

function renderReview() {
  return render(
    <AppStateProvider>
      <ReviewScreen />
      <ReviewsProbe />
    </AppStateProvider>,
  );
}

describe('ReviewScreen spaced-repetition journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asyncStorage.__store.clear();
    speakTextMock.mockResolvedValue(true);
  });

  it('invites the learner to save a phrase before any review exists', async () => {
    const view = await renderReview();

    expect(view.getByText('Save a phrase to start reviewing')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Choose a scene' }));
    expect(mockRouterReplace).toHaveBeenCalledWith('/');
  });

  it('reschedules a forgotten phrase for today and a remembered phrase for tomorrow', async () => {
    seedDuePhrases();
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Phrase 1 of 2')).toBeTruthy());
    expect(view.getByText('Mastery 0/5')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    expect(view.getByText(namaste.hi)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Again' }));

    await waitFor(() => expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({
      mastery: 0,
      intervalDays: 0,
      dueAt: dateKey(),
      correctReviews: 0,
      totalReviews: 1,
    })));
    expect(hapticWarningMock).toHaveBeenCalledTimes(1);
    expect(view.getByText('Phrase 2 of 2')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));

    await waitFor(() => expect(readReviews(view)[chai.hi]).toEqual(expect.objectContaining({
      mastery: 1,
      intervalDays: 1,
      dueAt: tomorrow(),
      correctReviews: 1,
      totalReviews: 1,
    })));
    expect(hapticSuccessMock).toHaveBeenCalledTimes(1);
    expect(view.getByText('Review complete')).toBeTruthy();

    await waitFor(() => {
      const persisted = JSON.parse(asyncStorage.__store.get(storageKeys.phraseReviews) ?? 'null') as Record<string, PhraseReview>;
      expect(persisted[chai.hi]?.dueAt).toBe(tomorrow());
    });
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.reviewStreakDays) ?? 'null')).toEqual([dateKey()]);

    await fireEvent.press(view.getByRole('button', { name: 'Done' }));
    expect(mockRouterReplace).toHaveBeenCalledWith('/');
  });

  it('opens the session with the weakest due phrase', async () => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste, chai]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 3 },
      [chai.hi]: { ...defaultPhraseReview(today), mastery: 1 },
    }));
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Phrase 1 of 2')).toBeTruthy());

    expect(view.getByText('Mastery 1/5')).toBeTruthy();
    expect(speakTextMock).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    expect(view.getByText(chai.hi)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(view.getByText('Phrase 2 of 2')).toBeTruthy();
    expect(view.getByText('Listen, then say what it means')).toBeTruthy();
    expect(view.queryByText(namaste.en)).toBeNull();
    expect(speakTextMock).toHaveBeenCalledTimes(1);
    expect(speakTextMock).toHaveBeenLastCalledWith(namaste.hi, undefined, 1);
  });

  it('mixes speak-first and listen-first cards and returns a forgotten phrase to speak-first', async () => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste, chai]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 3 },
      [chai.hi]: { ...defaultPhraseReview(today), mastery: 3 },
    }));
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Mastery 3/5')).toBeTruthy());
    expect(view.getByText(namaste.en)).toBeTruthy();
    expect(view.getByText('Say it in Hindi')).toBeTruthy();
    expect(speakTextMock).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    expect(view.getByText(namaste.en)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Again' }));
    expect(readReviews(view)[namaste.hi]?.mastery).toBe(2);
    expect(view.getByText('Phrase 2 of 2')).toBeTruthy();
    expect(view.queryByText(chai.en)).toBeNull();
    expect(speakTextMock).toHaveBeenCalledTimes(1);
    expect(speakTextMock).toHaveBeenLastCalledWith(chai.hi, undefined, 1);

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(view.getByText('1 of 2 remembered')).toBeTruthy();
    expect(readReviews(view)[chai.hi]).toEqual(expect.objectContaining({ mastery: 4, intervalDays: 14 }));
    expect(speakTextMock).toHaveBeenCalledTimes(1);

    await view.unmount();
    const nextSession = await renderReview();
    await waitFor(() => expect(nextSession.getByText('Mastery 2/5')).toBeTruthy());
    expect(nextSession.getByText(namaste.en)).toBeTruthy();
    expect(nextSession.getByText('Say it in Hindi')).toBeTruthy();
    expect(speakTextMock).toHaveBeenCalledTimes(1);
  });

  it('keeps raising mastery across repeated correct reviews', async () => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 2, intervalDays: 3, correctReviews: 2, totalReviews: 2 },
    }));
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Mastery 2/5')).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));

    await waitFor(() => expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({
      mastery: 3,
      intervalDays: 7,
      correctReviews: 3,
      totalReviews: 3,
    })));
  });

  it('keeps Got it as real recall when the hint never played', async () => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 2, correctReviews: 2, totalReviews: 2 },
    }));
    speakTextMock.mockRejectedValueOnce(new Error('Audio unavailable.'));
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Say it in Hindi')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Hear a hint' }));
    expect(await view.findByText('Audio unavailable.')).toBeTruthy();
    await waitFor(() => expect(view.queryByText('Hint used, so this card counts as Again.')).toBeNull());
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));

    expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({ mastery: 3, correctReviews: 3, totalReviews: 3 }));
    expect(view.getByText('1 of 1 remembered')).toBeTruthy();
  });

  it('keeps the hint penalty when playback fails after it started', async () => {
    seedDuePhrases();
    speakTextMock.mockImplementationOnce(async (_text, _signal, _rate, _language, _mode, _normalize, onStarted) => {
      onStarted?.();
      throw new Error('Playback interrupted.');
    });
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Say it in Hindi')).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: 'Hear a hint' }));
    expect(await view.findByText('Playback interrupted.')).toBeTruthy();
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));

    expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({
      mastery: 0, correctReviews: 0, totalReviews: 1, intervalDays: 0,
    }));
  });

  it('downgrades Got it when the learner grades while the hint is still playing', async () => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste, chai]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 2, correctReviews: 2, totalReviews: 2 },
      [chai.hi]: { ...defaultPhraseReview(today), mastery: 2, correctReviews: 2, totalReviews: 2 },
    }));
    const firstHint = deferred<boolean>();
    const secondHint = deferred<boolean>();
    speakTextMock.mockReturnValueOnce(firstHint.promise).mockReturnValueOnce(secondHint.promise);
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Say it in Hindi')).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: 'Hear a hint' }));
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));

    expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({
      mastery: 1,
      intervalDays: 0,
      correctReviews: 2,
      totalReviews: 3,
      dueAt: today,
    }));
    expect(view.getByText('One tea, please.')).toBeTruthy();
    expect(view.queryByText('Hint used, so this card counts as Again.')).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Hear a hint' }));
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();
    await act(async () => {
      firstHint.resolve(false);
      await firstHint.promise;
    });
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();
    expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({ mastery: 1, correctReviews: 2 }));

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(readReviews(view)[chai.hi]).toEqual(expect.objectContaining({ mastery: 1, correctReviews: 2, totalReviews: 3, dueAt: today }));
    expect(view.getByText('0 of 2 remembered')).toBeTruthy();
  });

  it('keeps Got it as real recall when hint playback is cancelled', async () => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 2, correctReviews: 2, totalReviews: 2 },
    }));
    speakTextMock.mockResolvedValueOnce(false);
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Say it in Hindi')).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: 'Hear a hint' }));
    await waitFor(() => expect(view.queryByText('Hint used, so this card counts as Again.')).toBeNull());
    expect(view.queryByRole('alert')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));

    expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({ mastery: 3, correctReviews: 3, totalReviews: 3 }));
    expect(view.getByText('1 of 1 remembered')).toBeTruthy();
  });

  it.each([false, true])('recorder cancellation with playback started=%s preserves only a heard hint', async (started) => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 2, correctReviews: 2, totalReviews: 2 },
    }));
    asyncStorage.__store.set(storageKeys.aiConsent, JSON.stringify(createAiConsentRecord()));
    const hint = deferred<boolean>();
    speakTextMock.mockImplementationOnce((_text, _signal, _rate, _language, _mode, _normalize, onStarted) => {
      if (started) onStarted?.();
      return hint.promise;
    });
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Say it in Hindi')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Hear a hint' }));
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    jest.mocked(stopSpeaking).mockImplementationOnce(async () => { hint.resolve(false); });

    await fireEvent.press(view.getByRole('button', { name: 'Record pronunciation' }));
    await waitFor(() => expect(!!view.queryByText('Hint used, so this card counts as Again.')).toBe(started));
    expect(view.queryByRole('alert')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));

    expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({
      mastery: started ? 1 : 3,
      correctReviews: started ? 2 : 3,
      totalReviews: 3,
    }));
    expect(view.getByText(`${started ? 0 : 1} of 1 remembered`)).toBeTruthy();
  });

  it('keeps the hint when a second tap cancels the first playback', async () => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 2, correctReviews: 2, totalReviews: 2 },
    }));
    const firstHint = deferred<boolean>();
    const secondHint = deferred<boolean>();
    speakTextMock.mockReturnValueOnce(firstHint.promise).mockReturnValueOnce(secondHint.promise);
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Say it in Hindi')).toBeTruthy());

    const hint = view.getByRole('button', { name: 'Hear a hint' });
    await fireEvent.press(hint);
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();
    await fireEvent.press(hint);
    await act(async () => {
      firstHint.resolve(false);
      await firstHint.promise;
    });
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();
    await act(async () => {
      secondHint.resolve(true);
      await secondHint.promise;
    });
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({
      mastery: 1,
      intervalDays: 0,
      correctReviews: 2,
      totalReviews: 3,
      dueAt: today,
    }));
    expect(view.getByText('0 of 1 remembered')).toBeTruthy();
  });

  it('keeps the hint when Listen cancels it after Reveal', async () => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 2, correctReviews: 2, totalReviews: 2 },
    }));
    const hintPlayback = deferred<boolean>();
    speakTextMock.mockReturnValueOnce(hintPlayback.promise);
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Say it in Hindi')).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: 'Hear a hint' }));
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByLabelText(`Hear ${namaste.hi}`));
    await act(async () => {
      hintPlayback.resolve(false);
      await hintPlayback.promise;
    });
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();
    expect(view.queryByRole('alert')).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({
      mastery: 1,
      intervalDays: 0,
      correctReviews: 2,
      totalReviews: 3,
      dueAt: today,
    }));
    expect(view.getByText('0 of 1 remembered')).toBeTruthy();
  });

  it('drops a failed retry only when no earlier hint finished', async () => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 2, correctReviews: 2, totalReviews: 2 },
    }));
    const firstHint = deferred<boolean>();
    speakTextMock.mockReturnValueOnce(firstHint.promise).mockRejectedValueOnce(new Error('Audio unavailable.'));
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Say it in Hindi')).toBeTruthy());

    const hint = view.getByRole('button', { name: 'Hear a hint' });
    await fireEvent.press(hint);
    await fireEvent.press(hint);
    expect(await view.findByText('Audio unavailable.')).toBeTruthy();
    await act(async () => {
      firstHint.resolve(false);
      await firstHint.promise;
    });
    await waitFor(() => expect(view.queryByText('Hint used, so this card counts as Again.')).toBeNull());

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({ mastery: 3, correctReviews: 3, totalReviews: 3 }));
    expect(view.getByText('1 of 1 remembered')).toBeTruthy();
  });

  it('keeps the hint when a later replay fails after one hint finished', async () => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 2, correctReviews: 2, totalReviews: 2 },
    }));
    speakTextMock.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('Audio unavailable.'));
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Say it in Hindi')).toBeTruthy());

    const hint = view.getByRole('button', { name: 'Hear a hint' });
    await fireEvent.press(hint);
    expect(await view.findByText('Hint used, so this card counts as Again.')).toBeTruthy();
    await fireEvent.press(hint);
    expect(await view.findByText('Audio unavailable.')).toBeTruthy();
    expect(view.getByText('Hint used, so this card counts as Again.')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));
    expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({
      mastery: 1,
      correctReviews: 2,
      totalReviews: 3,
      dueAt: today,
    }));
    expect(view.getByText('0 of 1 remembered')).toBeTruthy();
  });

  it.each([true, false])('applies the real recall schedule with audio before Reveal = %s', async (beforeReveal) => {
    const today = dateKey();
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([namaste]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({
      [namaste.hi]: { ...defaultPhraseReview(today), mastery: 2, correctReviews: 2, totalReviews: 2 },
    }));
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Say it in Hindi')).toBeTruthy());
    if (beforeReveal) {
      await fireEvent.press(view.getByRole('button', { name: 'Hear a hint' }));
      expect(await view.findByText('Hint used, so this card counts as Again.')).toBeTruthy();
    }
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    if (!beforeReveal) await fireEvent.press(view.getByLabelText(`Hear ${namaste.hi}`));
    expect(speakTextMock).toHaveBeenLastCalledWith(namaste.hi, undefined, 1, ...(beforeReveal ? [undefined, undefined, undefined, expect.any(Function)] : []));
    await fireEvent.press(view.getByRole('button', { name: 'Got it' }));

    expect(readReviews(view)[namaste.hi]).toEqual(expect.objectContaining({
      mastery: beforeReveal ? 1 : 3,
      intervalDays: beforeReveal ? 0 : 7,
      correctReviews: beforeReveal ? 2 : 3,
      totalReviews: 3,
      ...(beforeReveal ? { dueAt: today } : {}),
    }));
    expect(view.getByText(`${beforeReveal ? 0 : 1} of 1 remembered`)).toBeTruthy();
    await waitFor(() => {
      const persisted = JSON.parse(asyncStorage.__store.get(storageKeys.phraseReviews) ?? '{}') as Record<string, PhraseReview>;
      expect(persisted[namaste.hi]).toEqual(readReviews(view)[namaste.hi]);
    });
  });

  it('replays the revealed phrase at full and slow speed', async () => {
    seedDuePhrases();
    const view = await renderReview();
    await waitFor(() => expect(view.getByText('Phrase 1 of 2')).toBeTruthy());

    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    await fireEvent.press(view.getByLabelText(`Hear ${namaste.hi}`));
    expect(speakTextMock).toHaveBeenLastCalledWith(namaste.hi, undefined, 1);

    await fireEvent.press(view.getByLabelText(`Hear ${namaste.hi} slowly`));
    expect(speakTextMock).toHaveBeenLastCalledWith(namaste.hi, undefined, 0.72);
  });
});


it('keeps unknown saved spelling on review and speaks its canonical Hindi', async () => {
  jest.clearAllMocks();
  asyncStorage.__store.clear();
  const phrase = { hi: 'कृपया पानी दीजिए।', latin: 'Kripayaa paanee dijiye.', en: 'Please give me water.' };
  asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([phrase]));
  const view = await render(<AppStateProvider><ReviewScreen /></AppStateProvider>);
  await waitFor(() => expect(view.getByText(phrase.en)).toBeTruthy());
  await fireEvent.press(view.getByText('Reveal answer'));
  expect(view.getByText(phrase.latin)).toBeTruthy();
  await fireEvent.press(view.getByLabelText(`Hear ${phrase.hi}`));
  expect(speakTextMock).toHaveBeenLastCalledWith(phrase.hi, undefined, 1);
});
