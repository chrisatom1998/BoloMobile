import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockRouterReplace = jest.fn();

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
  useRouter: () => ({ replace: mockRouterReplace }),
}));

jest.mock('lucide-react-native', () => ({
  Check: () => null,
  RotateCcw: () => null,
  Volume2: () => null,
}));

jest.mock('@/lib/app-alert', () => ({ showAppAlert: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn(), hapticWarning: jest.fn() }));
jest.mock('@/lib/observability', () => ({ clearObservability: jest.fn(async () => undefined), observe: jest.fn() }));
jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => true),
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

import ReviewScreen from '../src/app/review';
import { hapticSuccess, hapticWarning } from '../src/lib/haptics';
import { dateKey, defaultPhraseReview, storageKeys } from '../src/lib/storage';
import type { PhraseReview } from '../src/state/app-state-types';
import { AppStateProvider, useAppStateValue } from '../src/state/app-state';
import { speakText } from '../src/lib/speech';

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
    speakTextMock.mockResolvedValue();
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

    await fireEvent.press(view.getByRole('button', { name: 'Back to today' }));
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
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));
    expect(view.getByText(chai.hi)).toBeTruthy();
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
