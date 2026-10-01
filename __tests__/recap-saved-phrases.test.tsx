import { act, renderHook, waitFor } from '@testing-library/react-native';

import { defaultPhraseReview, storageKeys } from '../src/lib/storage';
import { AppStateProvider, useAppState } from '../src/state/app-state';

jest.mock('@/lib/ai-voice-player', () => ({ clearAiVoicePlaybackCache: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  const storage = {
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
  };
  return { __esModule: true, default: storage };
});

jest.mock('../src/lib/app-alert', () => ({ showAppAlert: jest.fn() }));
jest.mock('../src/lib/observability', () => ({ clearObservability: jest.fn(async () => undefined), observe: jest.fn() }));

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
  multiSet: jest.Mock;
};
const { showAppAlert } = jest.requireMock('../src/lib/app-alert') as { showAppAlert: jest.Mock };


const phrase = { hi: 'मुझे चाय चाहिए।', latin: 'Mujhe chai chahiye.', en: 'I would like tea.' };
async function setup() {
  const view = await renderHook(() => useAppState(), { wrapper: AppStateProvider });
  await waitFor(() => expect(view.result.current.hydrated).toBe(true));
  return view;
}
describe('idempotent recap phrase saving', () => {
  beforeEach(() => { jest.clearAllMocks(); asyncStorage.__store.clear(); asyncStorage.__store.set(storageKeys.clientId, 'client-12345678'); });
  it('saves once under rapid repeated taps and queues it due without grading', async () => {
    const view = await setup();
    await act(async () => { view.result.current.savePhrase(phrase); view.result.current.savePhrase(phrase); });
    expect(view.result.current.phrases).toEqual([phrase]);
    expect(view.result.current.duePhrases).toEqual([phrase]);
    expect(view.result.current.phraseReviews[phrase.hi]).toEqual(defaultPhraseReview());
    await waitFor(() => expect(JSON.parse(asyncStorage.__store.get(storageKeys.phrases) ?? '[]')).toEqual([phrase]));
    await view.unmount();
    const restored = await setup(); expect(restored.result.current.duePhrases).toEqual([phrase]);
  });
  it('preserves an existing phrase and review schedule when saved again', async () => {
    const review = { ...defaultPhraseReview('2099-01-01'), mastery: 4, intervalDays: 30, correctReviews: 4, totalReviews: 5 };
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([phrase]));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify({ [phrase.hi]: review }));
    const view = await setup();
    await act(async () => view.result.current.savePhrase({ ...phrase, hi: `  ${phrase.hi}  `, en: 'different' }));
    expect(view.result.current.phrases).toEqual([phrase]);
    expect(view.result.current.phraseReviews[phrase.hi]).toEqual(review);
  });
  it('removes saved phrases and their review entries through existing deletion', async () => {
    const view = await setup(); await act(async () => view.result.current.savePhrase(phrase));
    await act(async () => view.result.current.removePhrase(phrase.hi));
    expect(view.result.current.phrases).toEqual([]); expect(view.result.current.phraseReviews).toEqual({});
    await act(async () => view.result.current.savePhrase(phrase));
    await act(async () => view.result.current.clearAllData());
    expect(view.result.current.phrases).toEqual([]); expect(view.result.current.phraseReviews).toEqual({});
  });
  it('preserves the 100 phrase cap, dropping orphan schedules', async () => {
    const phrases = Array.from({ length: 100 }, (_, i) => ({ hi: `नमस्ते ${i}`, latin: `Namaste ${i}`, en: `Hello ${i}` }));
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify(phrases));
    asyncStorage.__store.set(storageKeys.phraseReviews, JSON.stringify(Object.fromEntries(phrases.map(p => [p.hi, defaultPhraseReview()]))));
    const view = await setup(); await act(async () => view.result.current.savePhrase(phrase));
    expect(view.result.current.phrases).toHaveLength(100); expect(Object.keys(view.result.current.phraseReviews)).toHaveLength(100);
    expect(view.result.current.phraseReviews['नमस्ते 0']).toBeUndefined();
  });
  it('does not claim a save when persistence fails', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const view = await setup(); asyncStorage.multiSet.mockRejectedValueOnce(new Error('disk full'));
    await act(async () => view.result.current.savePhrase(phrase));
    await waitFor(() => expect(showAppAlert).toHaveBeenCalled());
    expect(view.result.current.phrases).toEqual([]); expect(view.result.current.phraseReviews).toEqual({});
    warning.mockRestore();
  });
});
