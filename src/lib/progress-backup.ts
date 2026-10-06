import {
  sanitizeGoal,
  sanitizeLearnerProfile,
  sanitizeMotionPreference,
  sanitizePhraseReviews,
  sanitizePhrases,
  sanitizePractice,
  sanitizePracticeHistory,
  sanitizeReminder,
  sanitizeSceneProgress,
  sanitizeStreakDays,
  type PersistedState,
} from '@/lib/storage';
import type { ReminderSettings } from '@/state/app-state-types';

export const PROGRESS_BACKUP_FORMAT = 'bolo-progress-backup' as const;
export const PROGRESS_BACKUP_VERSION = 1 as const;
export const MAX_PROGRESS_BACKUP_BYTES = 2 * 1024 * 1024;

/** Learning progress that a backup may restore. Reminders carry no OS notification id. */
export type RestorableProgressKey =
  | 'phrases'
  | 'goal'
  | 'practice'
  | 'streakDays'
  | 'learnerProfile'
  | 'sceneProgress'
  | 'phraseReviews'
  | 'practiceHistory'
  | 'reviewStreakDays'
  | 'motionPreference';

export const restorableProgressKeys: readonly RestorableProgressKey[] = [
  'phrases',
  'goal',
  'practice',
  'streakDays',
  'learnerProfile',
  'sceneProgress',
  'phraseReviews',
  'practiceHistory',
  'reviewStreakDays',
  'motionPreference',
];

export type BackupReminder = Omit<ReminderSettings, 'notificationId'>;

export type RestorableProgress = Pick<PersistedState, RestorableProgressKey>;

export type ProgressBackupData = RestorableProgress & { reminder: BackupReminder };

export type ProgressBackup = {
  format: typeof PROGRESS_BACKUP_FORMAT;
  version: typeof PROGRESS_BACKUP_VERSION;
  exportedAt: string;
  data: ProgressBackupData;
};

export type ProgressBackupSource = RestorableProgress & { reminder: ReminderSettings };

export type ProgressBackupParseResult =
  | { ok: true; backup: ProgressBackup }
  | { ok: false; error: string };

const INVALID_FILE = 'This file is not a Bolo progress backup, or it is damaged. Choose a file created with Export progress.';

/**
 * Build a backup containing only learning progress. The random app identifier,
 * AI consent record, chat history, and diagnostics are never copied, and the
 * reminder loses its device-specific notification id.
 */
export function createProgressBackup(source: ProgressBackupSource, now = new Date()): ProgressBackup {
  return {
    format: PROGRESS_BACKUP_FORMAT,
    version: PROGRESS_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      phrases: source.phrases,
      goal: source.goal,
      practice: source.practice,
      streakDays: source.streakDays,
      learnerProfile: source.learnerProfile,
      sceneProgress: source.sceneProgress,
      phraseReviews: source.phraseReviews,
      practiceHistory: source.practiceHistory,
      reviewStreakDays: source.reviewStreakDays,
      motionPreference: source.motionPreference,
      reminder: {
        enabled: source.reminder.enabled,
        hour: source.reminder.hour,
        minute: source.reminder.minute,
      },
    },
  };
}

export function serializeProgressBackup(source: ProgressBackupSource, now = new Date()): string {
  return JSON.stringify(createProgressBackup(source, now), null, 2);
}

export function progressBackupFileName(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `bolo-progress-${year}-${month}-${day}.json`;
}

/** UTF-8 byte length, stopping early once the limit is exceeded. */
export function exceedsBackupSize(text: string, limit = MAX_PROGRESS_BACKUP_BYTES): boolean {
  if (text.length > limit) return true;
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
    if (bytes > limit) return true;
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const fieldShapes: Record<RestorableProgressKey | 'reminder', 'array' | 'object' | 'number' | 'string'> = {
  phrases: 'array',
  goal: 'number',
  practice: 'object',
  streakDays: 'array',
  learnerProfile: 'object',
  sceneProgress: 'object',
  phraseReviews: 'object',
  practiceHistory: 'array',
  reviewStreakDays: 'array',
  motionPreference: 'string',
  reminder: 'object',
};

function hasShape(value: unknown, shape: (typeof fieldShapes)[keyof typeof fieldShapes]) {
  if (shape === 'array') return Array.isArray(value);
  if (shape === 'object') return isPlainObject(value);
  if (shape === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === 'string';
}

/**
 * Sanitize every field with the same rules used for on-device storage so a
 * restored backup can never hold a value Bolo would not have saved itself.
 */
function sanitizeBackupData(raw: Record<string, unknown>): ProgressBackupData {
  const encode = (value: unknown) => JSON.stringify(value);
  const phrases = sanitizePhrases(encode(raw.phrases));
  const savedPhrases = new Set(phrases.map((phrase) => phrase.hi));
  // A review without its saved phrase would be an orphan the app never shows.
  const phraseReviews = Object.fromEntries(
    Object.entries(sanitizePhraseReviews(encode(raw.phraseReviews))).filter(([hi]) => savedPhrases.has(hi)),
  );
  const reminder = sanitizeReminder(encode(raw.reminder));
  return {
    phrases,
    goal: sanitizeGoal(String(raw.goal)),
    practice: sanitizePractice(encode(raw.practice)),
    streakDays: sanitizeStreakDays(encode(raw.streakDays)),
    learnerProfile: sanitizeLearnerProfile(encode(raw.learnerProfile)),
    sceneProgress: sanitizeSceneProgress(encode(raw.sceneProgress)),
    phraseReviews,
    practiceHistory: sanitizePracticeHistory(encode(raw.practiceHistory)),
    reviewStreakDays: sanitizeStreakDays(encode(raw.reviewStreakDays)),
    motionPreference: sanitizeMotionPreference(raw.motionPreference as string),
    reminder: { enabled: reminder.enabled, hour: reminder.hour, minute: reminder.minute },
  };
}

/** Parse and strictly validate backup file contents. Never throws. */
export function parseProgressBackup(text: string): ProgressBackupParseResult {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: INVALID_FILE };
  if (exceedsBackupSize(text)) {
    return { ok: false, error: 'This backup file is larger than 2 MB, so Bolo did not open it. Choose a file created with Export progress.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: INVALID_FILE };
  }
  if (!isPlainObject(parsed) || parsed.format !== PROGRESS_BACKUP_FORMAT) return { ok: false, error: INVALID_FILE };
  if (parsed.version !== PROGRESS_BACKUP_VERSION) {
    return {
      ok: false,
      error: typeof parsed.version === 'number' && parsed.version > PROGRESS_BACKUP_VERSION
        ? 'This backup was made by a newer version of Bolo. Update Bolo and try again.'
        : INVALID_FILE,
    };
  }
  if (typeof parsed.exportedAt !== 'string' || !Number.isFinite(Date.parse(parsed.exportedAt))) return { ok: false, error: INVALID_FILE };
  const data = parsed.data;
  if (!isPlainObject(data)) return { ok: false, error: INVALID_FILE };
  for (const [key, shape] of Object.entries(fieldShapes)) {
    if (!hasShape(data[key], shape)) return { ok: false, error: INVALID_FILE };
  }
  return {
    ok: true,
    backup: {
      format: PROGRESS_BACKUP_FORMAT,
      version: PROGRESS_BACKUP_VERSION,
      exportedAt: new Date(parsed.exportedAt).toISOString(),
      data: sanitizeBackupData(data),
    },
  };
}
