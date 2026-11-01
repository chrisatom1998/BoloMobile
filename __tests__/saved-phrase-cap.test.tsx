import { act, render, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

jest.mock('@/lib/ai-voice-player', () => ({ clearAiVoicePlaybackCache: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      __store: store,
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
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
jest.mock('@/lib/app-alert', () => ({ showAppAlert: jest.fn() }));
jest.mock('@/lib/observability', () => ({ clearObservability: jest.fn(async () => undefined), observe: jest.fn() }));

import { MAX_SAVED_PHRASES, storageKeys } from '../src/lib/storage';
import { AppStateProvider, useAppState } from '../src/state/app-state';

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
  multiSet: jest.Mock;
};

let latestState: ReturnType<typeof useAppState>;

function StateProbe() {
  const state = useAppState();
  useEffect(() => { latestState = state; }, [state]);
  return <Text testID="status">{state.hydrated ? 'Ready' : 'Hydrating'}</Text>;
}

const savedPhrase = (index: number) => ({ hi: `वाक्य ${index}`, latin: `vaakya ${index}`, en: `Sentence ${index}` });
const review = (index: number) => ({ mastery: 2, intervalDays: 3, dueAt: '2099-01-01', lastReviewedAt: '2026-10-30', correctReviews: index, totalReviews: index + 1 });

async function renderFullCollection() {
  const phrases = Array.from({ length: MAX_SAVED_PHRASES }, (_, index) => savedPhrase(index));
  const reviews = Object.fromEntries(phrases.map((phrase, index) => [phrase.hi, review(index)]));
  asyncStorage.__store.set(storageKeys.phrases, JSON.stringify(phrases));
  asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify(reviews));
  const view = await render(<AppStateProvider><StateProbe /></AppStateProvider>);
  await waitFor(() => expect(view.getByTestId('status').props.children).toBe('Ready'));
  expect(latestState.phrases).toHaveLength(MAX_SAVED_PHRASES);
  asyncStorage.multiSet.mockClear();
  return { phrases, reviews, view };
}

describe('saved phrase cap', () => {
  beforeEach(() => {
    asyncStorage.__store.clear();
  });

  it('refuses the 101st phrase, keeps every saved phrase and review, and reports the collection as full', async () => {
    const { phrases, reviews, view } = await renderFullCollection();

    let result: Awaited<ReturnType<typeof latestState.togglePhrase>> | undefined;
    await act(async () => {
      result = await latestState.togglePhrase({ hi: 'नया वाक्य', latin: 'naya vaakya', en: 'New sentence' });
    });

    expect(result).toBe('full');
    expect(latestState.phrases).toEqual(phrases);
    expect(latestState.phraseReviews).toEqual(reviews);
    expect(latestState.phrases.some((phrase) => phrase.hi === 'नया वाक्य')).toBe(false);
    expect(asyncStorage.multiSet).not.toHaveBeenCalled();
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.phrases) ?? '[]')).toHaveLength(MAX_SAVED_PHRASES);
    expect(Object.keys(JSON.parse(asyncStorage.__store.get(storageKeys.phraseReviews) ?? '{}'))).toHaveLength(MAX_SAVED_PHRASES);

    await view.unmount();
  });

  it('still removes a phrase at the cap and then accepts a new one', async () => {
    const { phrases, view } = await renderFullCollection();
    const oldest = phrases[0]!;

    let removed: Awaited<ReturnType<typeof latestState.togglePhrase>> | undefined;
    await act(async () => {
      removed = await latestState.togglePhrase(oldest);
    });
    expect(removed).toBe('removed');
    expect(latestState.phrases).toHaveLength(MAX_SAVED_PHRASES - 1);
    expect(latestState.phrases.some((phrase) => phrase.hi === oldest.hi)).toBe(false);
    expect(latestState.phraseReviews[oldest.hi]).toBeUndefined();
    expect(latestState.phraseReviews[phrases[1]!.hi]).toEqual(review(1));

    let saved: Awaited<ReturnType<typeof latestState.togglePhrase>> | undefined;
    await act(async () => {
      saved = await latestState.togglePhrase({ hi: 'नया वाक्य', latin: 'naya vaakya', en: 'New sentence' });
    });
    expect(saved).toBe('saved');
    expect(latestState.phrases).toHaveLength(MAX_SAVED_PHRASES);
    expect(latestState.phrases.at(-1)).toEqual({ hi: 'नया वाक्य', latin: 'naya vaakya', en: 'New sentence' });
    expect(latestState.phraseReviews['नया वाक्य']).toBeDefined();

    await view.unmount();
  });

  it('reports a failed write as failed and rolls the phrase back', async () => {
    const { view } = await renderFullCollection();
    await act(async () => { await latestState.togglePhrase(savedPhrase(0)); });
    asyncStorage.multiSet.mockRejectedValueOnce(new Error('disk full'));
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    let result: Awaited<ReturnType<typeof latestState.togglePhrase>> | undefined;
    await act(async () => {
      result = await latestState.togglePhrase({ hi: 'नया वाक्य', latin: 'naya vaakya', en: 'New sentence' });
    });

    expect(result).toBe('failed');
    expect(latestState.phrases.some((phrase) => phrase.hi === 'नया वाक्य')).toBe(false);
    warning.mockRestore();
    await view.unmount();
  });
});
