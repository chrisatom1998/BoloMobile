const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clampStoredPracticeOnce,
  MAX_MIGRATED_DAILY_PRACTICE_SECONDS,
  PRACTICE_CLAMP_MIGRATION_KEY,
} from '../src/lib/practice-clamp-migration';
import { storageKeys } from '../src/lib/storage';

const setItem = AsyncStorage.setItem as jest.Mock;

const NINE_HUNDRED_ELEVEN_MINUTES = 911 * 60;
const THIRTY_MINUTES = 30 * 60;

describe('one-time practice clamp migration', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('clamps stored days above four hours down to four hours and leaves smaller days alone', async () => {
    mockStore.set(storageKeys.practiceHistory, JSON.stringify([
      { date: '2026-10-29', seconds: NINE_HUNDRED_ELEVEN_MINUTES, correct: 3, answers: 4, reviews: 1 },
      { date: '2026-10-30', seconds: THIRTY_MINUTES, correct: 1, answers: 1, reviews: 0 },
    ]));
    mockStore.set(storageKeys.practice, JSON.stringify({ date: '2026-10-31', chaiDone: true, liveDone: false, seconds: NINE_HUNDRED_ELEVEN_MINUTES }));

    await expect(clampStoredPracticeOnce()).resolves.toBe(true);

    expect(MAX_MIGRATED_DAILY_PRACTICE_SECONDS).toBe(240 * 60);
    expect(JSON.parse(mockStore.get(storageKeys.practiceHistory) ?? 'null')).toEqual([
      { date: '2026-10-29', seconds: MAX_MIGRATED_DAILY_PRACTICE_SECONDS, correct: 3, answers: 4, reviews: 1 },
      { date: '2026-10-30', seconds: THIRTY_MINUTES, correct: 1, answers: 1, reviews: 0 },
    ]);
    expect(JSON.parse(mockStore.get(storageKeys.practice) ?? 'null')).toEqual({ date: '2026-10-31', chaiDone: true, liveDone: false, seconds: MAX_MIGRATED_DAILY_PRACTICE_SECONDS });
    expect(mockStore.get(PRACTICE_CLAMP_MIGRATION_KEY)).toBeTruthy();
  });

  it('records the flag without rewriting data that is already within the cap', async () => {
    const history = JSON.stringify([{ date: '2026-10-30', seconds: THIRTY_MINUTES, correct: 1, answers: 1, reviews: 0 }]);
    mockStore.set(storageKeys.practiceHistory, history);

    await expect(clampStoredPracticeOnce()).resolves.toBe(true);

    expect(mockStore.get(storageKeys.practiceHistory)).toBe(history);
    expect(mockStore.has(storageKeys.practice)).toBe(false);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith(PRACTICE_CLAMP_MIGRATION_KEY, expect.any(String));
  });

  it('runs only once: a later oversized day is not touched after the flag is set', async () => {
    mockStore.set(storageKeys.practiceHistory, JSON.stringify([{ date: '2026-10-29', seconds: NINE_HUNDRED_ELEVEN_MINUTES }]));
    await clampStoredPracticeOnce();
    setItem.mockClear();

    const later = JSON.stringify([{ date: '2026-11-02', seconds: NINE_HUNDRED_ELEVEN_MINUTES }]);
    mockStore.set(storageKeys.practiceHistory, later);

    await expect(clampStoredPracticeOnce()).resolves.toBe(false);

    expect(mockStore.get(storageKeys.practiceHistory)).toBe(later);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('leaves unreadable values alone and still marks the migration done', async () => {
    mockStore.set(storageKeys.practiceHistory, '{bad json');
    mockStore.set(storageKeys.practice, '"not an object"');

    await expect(clampStoredPracticeOnce()).resolves.toBe(true);

    expect(mockStore.get(storageKeys.practiceHistory)).toBe('{bad json');
    expect(mockStore.get(storageKeys.practice)).toBe('"not an object"');
    expect(mockStore.get(PRACTICE_CLAMP_MIGRATION_KEY)).toBeTruthy();
  });

  it('does not set the flag when storage fails, so the next launch retries', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(clampStoredPracticeOnce()).resolves.toBe(false);

    expect(mockStore.has(PRACTICE_CLAMP_MIGRATION_KEY)).toBe(false);
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });
});
