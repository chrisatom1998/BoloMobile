import AsyncStorage from '@react-native-async-storage/async-storage';

import { storageKeys } from '@/lib/storage';

/** Set once stored practice totals have been clamped. Absent on installs that have not run the migration. */
export const PRACTICE_CLAMP_MIGRATION_KEY = 'bolo-practice-clamp-v1';

/**
 * Four hours. The timer once counted every foreground minute, idle or not, so
 * days above this were recorded on phones left open, not practised.
 */
export const MAX_MIGRATED_DAILY_PRACTICE_SECONDS = 240 * 60;

function parseJson(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/** Returns the entry with its `seconds` clamped, or null when nothing needed to change. */
function clampEntry(entry: unknown): Record<string, unknown> | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const seconds = (entry as { seconds?: unknown }).seconds;
  if (typeof seconds !== 'number' || !(seconds > MAX_MIGRATED_DAILY_PRACTICE_SECONDS)) return null;
  return { ...entry, seconds: MAX_MIGRATED_DAILY_PRACTICE_SECONDS };
}

function clampPractice(stored: string | null): string | null {
  const clamped = clampEntry(parseJson(stored));
  return clamped ? JSON.stringify(clamped) : null;
}

function clampPracticeHistory(stored: string | null): string | null {
  const parsed = parseJson(stored);
  if (!Array.isArray(parsed)) return null;
  let changed = false;
  const days = parsed.map((day) => {
    const clamped = clampEntry(day);
    if (clamped) changed = true;
    return clamped ?? day;
  });
  return changed ? JSON.stringify(days) : null;
}

/**
 * Clamps today's practice state and every stored practice day to four hours,
 * once per install. Runs before saved progress is read so hydration sees the
 * corrected totals. Resolves true when the migration ran on this launch. A
 * storage failure leaves the flag unset so the next launch tries again.
 */
export async function clampStoredPracticeOnce(): Promise<boolean> {
  try {
    if (await AsyncStorage.getItem(PRACTICE_CLAMP_MIGRATION_KEY) !== null) return false;
    const [practice, history] = await Promise.all([
      AsyncStorage.getItem(storageKeys.practice),
      AsyncStorage.getItem(storageKeys.practiceHistory),
    ]);
    const clampedPractice = clampPractice(practice);
    const clampedHistory = clampPracticeHistory(history);
    if (clampedPractice !== null) await AsyncStorage.setItem(storageKeys.practice, clampedPractice);
    if (clampedHistory !== null) await AsyncStorage.setItem(storageKeys.practiceHistory, clampedHistory);
    await AsyncStorage.setItem(PRACTICE_CLAMP_MIGRATION_KEY, '1');
    return true;
  } catch (error) {
    console.warn('Bolo could not clamp stored practice totals.', error);
    return false;
  }
}
