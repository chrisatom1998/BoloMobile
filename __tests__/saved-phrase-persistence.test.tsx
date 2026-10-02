import { act, renderHook, waitFor } from '@testing-library/react-native';

import { defaultPhraseReview, storageKeys } from '../src/lib/storage';
import { AppStateProvider, useAppState } from '../src/state/app-state';

jest.mock('@/lib/ai-voice-player', () => ({ clearAiVoicePlaybackCache: jest.fn() }));
jest.mock('@/lib/practice-widget', () => ({ updatePracticeWidget: jest.fn() }));
jest.mock('@/lib/practice-reminder', () => ({ cancelPracticeReminder: jest.fn() }));
jest.mock('@/lib/app-alert', () => ({ showAppAlert: jest.fn() }));
jest.mock('@/lib/observability', () => ({ clearObservability: jest.fn(async () => undefined), observe: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return { __esModule: true, default: {
    __store: store,
    multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null])),
    multiSet: jest.fn(async (entries: [string, string][]) => { entries.forEach(([key, value]) => store.set(key, value)); }),
    setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { store.delete(key); }),
  } };
});

const storage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
  multiGet: jest.Mock;
  multiSet: jest.Mock;
};
const { showAppAlert } = jest.requireMock('@/lib/app-alert') as { showAppAlert: jest.Mock };
const oldPhrase = { hi: 'नमस्ते', latin: 'Namaste', en: 'Hello' };
const newPhrase = { hi: 'धन्यवाद', latin: 'Dhanyavaad', en: 'Thanks' };
const thirdPhrase = { hi: 'हाँ', latin: 'Haan', en: 'Yes' };
const oldReview = { ...defaultPhraseReview('2099-01-01'), mastery: 3, intervalDays: 7, correctReviews: 3, totalReviews: 4 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function storedPhrases() { return JSON.parse(storage.__store.get(storageKeys.phrases) ?? '[]'); }
function storedReviews() { return JSON.parse(storage.__store.get(storageKeys.phraseReviews) ?? '{}'); }
function seed() {
  storage.__store.set(storageKeys.phrases, JSON.stringify([oldPhrase]));
  storage.__store.set(storageKeys.phraseReviews, JSON.stringify({ [oldPhrase.hi]: oldReview }));
}
async function setup(readFails = false) {
  if (readFails) storage.multiGet.mockRejectedValueOnce(new Error('transient read failure'));
  const view = await renderHook(() => useAppState(), { wrapper: AppStateProvider });
  await waitFor(() => expect(view.result.current.hydrated).toBe(true));
  return view;
}

describe('saved-phrase persistence recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.multiGet.mockReset().mockImplementation(async (keys: string[]) => keys.map((key) => [key, storage.__store.get(key) ?? null]));
    storage.multiSet.mockReset().mockImplementation(async (entries: [string, string][]) => { entries.forEach(([key, value]) => storage.__store.set(key, value)); });
    storage.__store.clear();
    storage.__store.set(storageKeys.clientId, 'client-12345678');
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('preserves stored phrases and their schedules after a failed initial read', async () => {
    seed();
    const view = await setup(true);
    expect(view.result.current.phrases).toEqual([]);

    await act(async () => { await view.result.current.savePhrase(newPhrase); });

    expect(storedPhrases()).toEqual([oldPhrase, newPhrase]);
    expect(view.result.current.phrases).toEqual([oldPhrase, newPhrase]);
    expect(storedReviews()[oldPhrase.hi]).toEqual(oldReview);
    expect(view.result.current.phraseReviews[oldPhrase.hi]).toEqual(oldReview);
  });

  it('leaves storage untouched if the recovery read also fails, then permits retry', async () => {
    seed();
    const view = await setup(true);
    storage.multiGet.mockRejectedValueOnce(new Error('still unavailable'));

    await act(async () => { await view.result.current.savePhrase(newPhrase); });

    expect(storedPhrases()).toEqual([oldPhrase]);
    expect(storedReviews()).toEqual({ [oldPhrase.hi]: oldReview });
    expect(view.result.current.phrases).toEqual([]);
    expect(showAppAlert).toHaveBeenLastCalledWith('Could not load saved phrases', expect.any(String));
    await act(async () => { await view.result.current.savePhrase(newPhrase); });
    expect(storedPhrases()).toEqual([oldPhrase, newPhrase]);
  });

  it('treats a successful missing-key read as empty and allows the first save', async () => {
    const view = await setup(true);
    await act(async () => { await view.result.current.savePhrase(newPhrase); });
    expect(storedPhrases()).toEqual([newPhrase]);
    expect(view.result.current.phraseReviews[newPhrase.hi]).toEqual(defaultPhraseReview());
  });

  it('does not interpret an incomplete paired read as an empty review map', async () => {
    seed();
    const view = await setup(true);
    storage.multiGet.mockResolvedValueOnce([[storageKeys.phrases, JSON.stringify([oldPhrase])]]);
    await act(async () => { await view.result.current.savePhrase(newPhrase); });
    expect(storedPhrases()).toEqual([oldPhrase]);
    expect(storedReviews()).toEqual({ [oldPhrase.hi]: oldReview });
  });

  it('restores an already-saved phrase without replacing its details or review schedule', async () => {
    seed();
    const view = await setup(true);
    await act(async () => { await view.result.current.savePhrase({ ...oldPhrase, hi: ` ${oldPhrase.hi} `, en: 'Changed' }); });
    expect(storedPhrases()).toEqual([oldPhrase]);
    expect(view.result.current.phrases).toEqual([oldPhrase]);
    expect(view.result.current.phraseReviews).toEqual({ [oldPhrase.hi]: oldReview });
  });

  it('preserves the Save intent of a bookmark tapped while existing phrases are unknown', async () => {
    seed();
    const view = await setup(true);
    await act(async () => { await view.result.current.togglePhrase(oldPhrase); });
    expect(storedPhrases()).toEqual([oldPhrase]);
    expect(storedReviews()).toEqual({ [oldPhrase.hi]: oldReview });
  });

  it('serializes repeated and different saves without dropping or toggling a phrase', async () => {
    seed();
    const view = await setup(true);
    await act(async () => {
      await Promise.all([
        view.result.current.savePhrase(newPhrase),
        view.result.current.savePhrase(newPhrase),
        view.result.current.savePhrase(thirdPhrase),
      ]);
    });
    expect(storedPhrases()).toEqual([oldPhrase, newPhrase, thirdPhrase]);
    expect(view.result.current.phrases).toEqual(storedPhrases());
    expect(storedReviews()[oldPhrase.hi]).toEqual(oldReview);
  });

  it('does not show a pending write as saved', async () => {
    seed();
    const view = await setup();
    const write = deferred<void>();
    storage.multiSet.mockImplementationOnce(async (entries: [string, string][]) => {
      await write.promise;
      entries.forEach(([key, value]) => storage.__store.set(key, value));
    });
    let save: unknown;
    await act(async () => { save = view.result.current.savePhrase(newPhrase); });
    expect(view.result.current.phrases).toEqual([oldPhrase]);
    await act(async () => { write.resolve(); await save; });
    expect(view.result.current.phrases).toEqual([oldPhrase, newPhrase]);
  });

  it('keeps the durable baseline after two overlapping writes fail', async () => {
    seed();
    const view = await setup();
    storage.multiSet.mockRejectedValueOnce(new Error('full')).mockRejectedValueOnce(new Error('full'));
    await act(async () => {
      await Promise.all([view.result.current.savePhrase(newPhrase), view.result.current.savePhrase(thirdPhrase)]);
    });
    expect(view.result.current.phrases).toEqual([oldPhrase]);
    expect(storedPhrases()).toEqual([oldPhrase]);
    await act(async () => { await view.result.current.savePhrase(thirdPhrase); });
    expect(storedPhrases()).toEqual([oldPhrase, thirdPhrase]);
  });

  it('does not carry a failed save into a later successful save', async () => {
    seed();
    const view = await setup();
    storage.multiSet.mockRejectedValueOnce(new Error('full'));
    await act(async () => {
      await Promise.all([view.result.current.savePhrase(newPhrase), view.result.current.savePhrase(thirdPhrase)]);
    });
    expect(storedPhrases()).toEqual([oldPhrase, thirdPhrase]);
    expect(view.result.current.phrases).toEqual(storedPhrases());
  });

  it('recovers actual storage after an ambiguous partial write before the next save', async () => {
    seed();
    const view = await setup();
    storage.multiSet.mockImplementationOnce(async (entries: [string, string][]) => {
      const first = entries[0];
      if (!first) throw new Error('Missing write entry');
      storage.__store.set(first[0], first[1]);
      throw new Error('second key failed');
    });
    await act(async () => { await view.result.current.savePhrase(newPhrase); });
    await act(async () => { await view.result.current.savePhrase(thirdPhrase); });
    expect(storedPhrases()).toEqual([oldPhrase, newPhrase, thirdPhrase]);
    expect(view.result.current.phrases).toEqual(storedPhrases());
    expect(storedReviews()[oldPhrase.hi]).toEqual(oldReview);
  });

  it('recovers before removal so it deletes only the requested phrase', async () => {
    seed();
    storage.__store.set(storageKeys.phrases, JSON.stringify([oldPhrase, newPhrase]));
    const view = await setup(true);
    await act(async () => { await view.result.current.removePhrase(newPhrase.hi); });
    expect(storedPhrases()).toEqual([oldPhrase]);
    expect(view.result.current.phraseReviews).toEqual({ [oldPhrase.hi]: oldReview });
  });

  it('leaves phrases and reviews intact when deletion cannot read or write', async () => {
    seed();
    const view = await setup(true);
    storage.multiGet.mockRejectedValueOnce(new Error('unavailable'));
    await act(async () => { await view.result.current.removePhrase(oldPhrase.hi); });
    expect(storedPhrases()).toEqual([oldPhrase]);
    storage.multiSet.mockRejectedValueOnce(new Error('full'));
    await act(async () => { await view.result.current.removePhrase(oldPhrase.hi); });
    expect(storedPhrases()).toEqual([oldPhrase]);
    expect(view.result.current.phrases).toEqual([oldPhrase]);
  });

  it('updates a recovered phrase review without losing other review entries', async () => {
    seed();
    storage.__store.set(storageKeys.phrases, JSON.stringify([oldPhrase, newPhrase]));
    const view = await setup(true);
    await act(async () => { await view.result.current.reviewPhrase(newPhrase.hi, true); });
    expect(storedReviews()[oldPhrase.hi]).toEqual(oldReview);
    expect(storedReviews()[newPhrase.hi].totalReviews).toBe(1);
    expect(storedPhrases()).toEqual([oldPhrase, newPhrase]);
  });

  it('preserves unrelated updates made while phrase recovery is pending', async () => {
    seed();
    const view = await setup(true);
    const read = deferred<[string, string | null][]>();
    storage.multiGet.mockImplementationOnce(() => read.promise);
    let save: unknown;
    await act(async () => { save = view.result.current.savePhrase(newPhrase); });
    await act(async () => { view.result.current.setGoal(15); });
    await act(async () => {
      read.resolve([[storageKeys.phrases, JSON.stringify([oldPhrase])], [storageKeys.phraseReviews, JSON.stringify({ [oldPhrase.hi]: oldReview })]]);
      await save;
    });
    expect(view.result.current.goal).toBe(15);
    expect(view.result.current.phrases).toEqual([oldPhrase, newPhrase]);
    await waitFor(() => expect(storage.__store.get(storageKeys.goal)).toBe('15'));
  });

  it('cancels queued recovery saves when all data is cleared', async () => {
    seed();
    const view = await setup(true);
    const read = deferred<[string, string | null][]>();
    storage.multiGet.mockImplementationOnce(() => read.promise);
    let save: unknown;
    let second: unknown;
    let clear: unknown;
    await act(async () => { save = view.result.current.savePhrase(newPhrase); });
    await act(async () => {
      second = view.result.current.savePhrase(thirdPhrase);
      clear = view.result.current.clearAllData();
    });
    await act(async () => {
      read.resolve([[storageKeys.phrases, JSON.stringify([oldPhrase])], [storageKeys.phraseReviews, JSON.stringify({ [oldPhrase.hi]: oldReview })]]);
      await Promise.all([save, second, clear]);
    });
    expect(storedPhrases()).toEqual([]);
    expect(storedReviews()).toEqual({});
    expect(view.result.current.phrases).toEqual([]);
    await act(async () => { await view.result.current.savePhrase(thirdPhrase); });
    expect(storedPhrases()).toEqual([thirdPhrase]);
  });

  it('preserves save/remove ordering for overlapping changes', async () => {
    seed();
    const view = await setup();
    await act(async () => {
      await Promise.all([view.result.current.savePhrase(newPhrase), view.result.current.removePhrase(newPhrase.hi)]);
    });
    expect(storedPhrases()).toEqual([oldPhrase]);
    expect(storedReviews()[newPhrase.hi]).toBeUndefined();
    await act(async () => {
      await Promise.all([view.result.current.removePhrase(oldPhrase.hi), view.result.current.savePhrase(oldPhrase)]);
    });
    expect(storedPhrases()).toEqual([oldPhrase]);
    expect(storedReviews()[oldPhrase.hi]).toEqual(defaultPhraseReview());
  });

  it('preserves practice counters changed during a pending phrase review', async () => {
    seed();
    const view = await setup();
    const write = deferred<void>();
    storage.multiSet.mockImplementationOnce(async (entries: [string, string][]) => {
      await write.promise;
      entries.forEach(([key, value]) => storage.__store.set(key, value));
    });
    let review: unknown;
    await act(async () => { review = view.result.current.reviewPhrase(oldPhrase.hi, true); });
    await act(async () => { view.result.current.markLiveTurn(30); });
    await act(async () => { write.resolve(); await review; });
    await waitFor(() => expect(JSON.parse(storage.__store.get(storageKeys.practiceHistory) ?? '[]'))
      .toEqual([expect.objectContaining({ seconds: 30, correct: 1, answers: 1, reviews: 1 })]));
    expect(view.result.current.practiceHistory).toEqual([expect.objectContaining({ seconds: 30, correct: 1, answers: 1, reviews: 1 })]);
    expect(storedReviews()[oldPhrase.hi].totalReviews).toBe(5);
  });

  it('does not record practice counters for a failed phrase review', async () => {
    seed();
    const view = await setup();
    storage.multiSet.mockRejectedValueOnce(new Error('full'));
    await act(async () => { await view.result.current.reviewPhrase(oldPhrase.hi, true); });
    expect(storedReviews()[oldPhrase.hi]).toEqual(oldReview);
    expect(view.result.current.practiceHistory).toEqual([]);
    expect(view.result.current.reviewStreakDays).toEqual([]);
  });

  it('retains a successful in-flight save if the following clear fails', async () => {
    seed();
    const view = await setup();
    const write = deferred<void>();
    storage.multiSet.mockImplementationOnce(async (entries: [string, string][]) => {
      await write.promise;
      entries.forEach(([key, value]) => storage.__store.set(key, value));
    }).mockRejectedValueOnce(new Error('clear failed'));
    let save: unknown;
    let clear: unknown;
    await act(async () => { save = view.result.current.savePhrase(newPhrase); });
    await act(async () => { clear = view.result.current.clearAllData().catch(() => undefined); });
    await act(async () => { write.resolve(); await Promise.all([save, clear]); });
    expect(storedPhrases()).toEqual([oldPhrase, newPhrase]);
    expect(view.result.current.phrases).toEqual(storedPhrases());
    await act(async () => { await view.result.current.savePhrase(thirdPhrase); });
    expect(storedPhrases()).toEqual([oldPhrase, newPhrase, thirdPhrase]);
  });

  it('waits for initial hydration before applying a phrase save', async () => {
    seed();
    const read = deferred<[string, string | null][]>();
    storage.multiGet.mockImplementationOnce(() => read.promise);
    const view = await renderHook(() => useAppState(), { wrapper: AppStateProvider });
    let save: unknown;
    await act(async () => { save = view.result.current.savePhrase(newPhrase); });
    expect(view.result.current.hydrated).toBe(false);
    await act(async () => {
      read.resolve(Object.values(storageKeys).map((key) => [key, storage.__store.get(key) ?? null]));
      await save;
    });
    expect(view.result.current.hydrated).toBe(true);
    expect(view.result.current.phrases).toEqual([oldPhrase, newPhrase]);
    expect(storedPhrases()).toEqual(view.result.current.phrases);
  });

  it('does not let initial hydration cleanup overwrite a later reset identity', async () => {
    seed();
    storage.__store.delete(storageKeys.clientId);
    const read = deferred<[string, string | null][]>();
    storage.multiGet.mockImplementationOnce(() => read.promise);
    const view = await renderHook(() => useAppState(), { wrapper: AppStateProvider });
    let clear: unknown;
    await act(async () => { clear = view.result.current.clearAllData(); });
    await act(async () => {
      read.resolve(Object.values(storageKeys).map((key) => [key, storage.__store.get(key) ?? null]));
      await clear;
    });
    await waitFor(() => expect(storage.__store.get(storageKeys.clientId)).toBe(view.result.current.clientId));
    expect(storedPhrases()).toEqual([]);
    expect(view.result.current.phrases).toEqual([]);
  });

  it('does not resurrect a save finishing before a successful clear', async () => {
    seed();
    const view = await setup();
    const write = deferred<void>();
    storage.multiSet.mockImplementationOnce(async (entries: [string, string][]) => {
      await write.promise;
      entries.forEach(([key, value]) => storage.__store.set(key, value));
    });
    let save: unknown;
    let clear: unknown;
    await act(async () => { save = view.result.current.savePhrase(newPhrase); });
    await act(async () => { clear = view.result.current.clearAllData(); });
    await act(async () => { write.resolve(); await Promise.all([save, clear]); });
    expect(storedPhrases()).toEqual([]);
    expect(view.result.current.phrases).toEqual([]);
  });
});
