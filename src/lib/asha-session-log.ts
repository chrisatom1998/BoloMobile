/**
 * On-device log of Asha live voice sessions. Pure data and reducers; the
 * encrypted persistence side lives in `asha-session-log-store.ts`.
 *
 * Records hold metadata, the final transcript rows, and what a session changed
 * through tools. No audio is ever stored. Stored sessions are ordered by start
 * time, oldest first, and at most one record is `active` at a time. A record is
 * only worth storing once it has a transcript row; empty attempts are dropped.
 */
import { LIVE_MODES, type LiveMode } from '@/services/bolo-api';
import { MAX_CHAT_MESSAGE_CHARACTERS } from '@/lib/storage';
import type { AshaResponseLanguage } from '@/state/app-state-types';

/** Set this to false to stop writing the session log and hide the Last session screen. */
export const ashaSessionLogEnabled = true;

/** One stored value per session, so a save never rewrites every session. */
export const ASHA_SESSION_KEY_PREFIX = 'bolo-asha-session-v1:';
/** Ids and start times only; it changes on insertion, eviction, expiry, or deletion. */
export const ASHA_SESSION_INDEX_KEY = 'bolo-asha-session-index-v1';
/** The latest session shown on Last session plus up to two hidden crash-recovery records. */
export const MAX_ASHA_SESSIONS = 3;
export const ASHA_SESSION_RETENTION_DAYS = 30;
export const MAX_ASHA_SESSION_ROWS = 200;
export const MAX_ASHA_SESSION_BYTES = 256 * 1024;
export const MAX_ASHA_SESSION_TOOL_ENTRIES = 20;

const MAX_ID_CHARACTERS = 128;
const MAX_SERVER_SESSION_ID_CHARACTERS = 256;
const MAX_LESSON_ID_CHARACTERS = 120;
const MAX_PHRASE_CHARACTERS = 500;
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;
const MAX_INDEX_ENTRIES = 50;

export const ASHA_SESSION_END_REASONS = [
  'user_ended',
  'backgrounded',
  'connection_lost',
  'start_failed',
  'data_deleted',
  'config_changed',
  'app_terminated',
] as const;
export type AshaSessionEndReason = (typeof ASHA_SESSION_END_REASONS)[number];
export type AshaSessionState = 'active' | 'ended' | 'interrupted';

export type AshaSessionTranscriptRow = {
  id: string;
  speaker: 'you' | 'asha';
  /** Final text only; streaming fragments are not stored. */
  text: string;
  startMs: number;
  endMs: number;
};

export type AshaSessionRecord = {
  schema: 1;
  id: string;
  serverSessionId?: string;
  startedAt: string;
  connectedAt?: string;
  endedAt?: string;
  /** Set by the learner's explicit Clear; distinguishes a cleared record from no saved session. */
  contentClearedAt?: string;
  state: AshaSessionState;
  endReason?: AshaSessionEndReason;
  responseLanguage: AshaResponseLanguage;
  mode?: LiveMode;
  lessonId?: string;
  rows: AshaSessionTranscriptRow[];
  learnerTurns: number;
  /** Devanagari text of phrases Asha saved through the confirmed-save tool. */
  savedPhrases: string[];
  lessonsPracticed: string[];
};

/** The small index value: which sessions exist and how they order. */
export type AshaSessionIndexEntry = { id: string; startedAt: string };

export type AshaSessionStartInput = {
  id: string;
  startedAt: string;
  responseLanguage: AshaResponseLanguage;
  mode?: LiveMode;
  lessonId?: string;
};

export type AshaSnapshotRow = Pick<AshaSessionTranscriptRow, 'id' | 'speaker' | 'text' | 'startMs' | 'endMs'>;

/** Lifecycle events a live voice session reports so the log can follow it. */
export type AshaSessionEvent =
  | { type: 'starting'; mode?: LiveMode; lessonId?: string }
  | { type: 'ready'; serverSessionId?: string }
  | { type: 'ended'; reason: AshaSessionEndReason };

export function ashaSessionKey(id: string) {
  return `${ASHA_SESSION_KEY_PREFIX}${id}`;
}

export function isAshaSessionKey(key: string) {
  return key.startsWith(ASHA_SESSION_KEY_PREFIX) && key.length > ASHA_SESSION_KEY_PREFIX.length;
}

/** Only a session the learner ended on purpose counts as completed; everything else was cut short. */
export function ashaSessionStateFor(endReason: AshaSessionEndReason): Exclude<AshaSessionState, 'active'> {
  return endReason === 'user_ended' ? 'ended' : 'interrupted';
}

export function isAshaSessionEndReason(value: unknown): value is AshaSessionEndReason {
  return typeof value === 'string' && (ASHA_SESSION_END_REASONS as readonly string[]).includes(value);
}

/** A record earns its storage key with its first transcript row and keeps it after an explicit Clear. */
export function isAshaSessionStorable(record: AshaSessionRecord) {
  return record.rows.length > 0 || record.contentClearedAt !== undefined;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function byteLength(record: AshaSessionRecord) {
  return new TextEncoder().encode(JSON.stringify(record)).byteLength;
}

function lastCaptionMs(rows: AshaSessionTranscriptRow[]) {
  return rows.length ? Math.max(...rows.map((row) => row.endMs)) : null;
}

function endedAtFromCaptions(record: AshaSessionRecord) {
  const captionMs = lastCaptionMs(record.rows);
  if (captionMs === null) return undefined;
  return new Date(Date.parse(record.connectedAt ?? record.startedAt) + captionMs).toISOString();
}

function withLearnerTurns(record: AshaSessionRecord): AshaSessionRecord {
  return { ...record, learnerTurns: record.rows.filter((row) => row.speaker === 'you').length };
}

function sanitizeSnapshotRow(row: AshaSnapshotRow): AshaSessionTranscriptRow | null {
  const text = row.text.trim().slice(0, MAX_CHAT_MESSAGE_CHARACTERS);
  if (!text) return null;
  return {
    id: row.id,
    speaker: row.speaker,
    text,
    startMs: Math.max(0, Math.round(row.startMs)),
    endMs: Math.max(0, Math.round(row.endMs)),
  };
}

/** Drops the oldest rows until the record fits the row and byte caps. */
function withinCaps(record: AshaSessionRecord): AshaSessionRecord {
  let current = { ...record, rows: record.rows.slice(-MAX_ASHA_SESSION_ROWS) };
  while (current.rows.length > 0 && byteLength(current) > MAX_ASHA_SESSION_BYTES) {
    const dropCount = Math.max(1, Math.ceil(current.rows.length / 10));
    current = { ...current, rows: current.rows.slice(dropCount) };
  }
  return withLearnerTurns(current);
}

/** The sequence number in a live transcript row id (`live-…-<n>`), or null for other ids. */
function rowSequence(id: string): number | null {
  const match = /-(\d+)$/u.exec(id);
  return match ? Number(match[1]) : null;
}

export function createAshaSessionRecord(input: AshaSessionStartInput): AshaSessionRecord {
  return {
    schema: 1,
    id: input.id,
    startedAt: input.startedAt,
    state: 'active',
    responseLanguage: input.responseLanguage,
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.lessonId ? { lessonId: input.lessonId } : {}),
    rows: [],
    learnerTurns: 0,
    savedPhrases: [],
    lessonsPracticed: [],
  };
}

export function connectAshaSession(record: AshaSessionRecord, input: { connectedAt: string; serverSessionId?: string }): AshaSessionRecord {
  if (record.state !== 'active') return record;
  return {
    ...record,
    connectedAt: input.connectedAt,
    ...(input.serverSessionId ? { serverSessionId: input.serverSessionId.slice(0, MAX_SERVER_SESSION_ID_CHARACTERS) } : {}),
  };
}

/**
 * Merges a transcript snapshot into the active record by row id. The snapshot
 * is a sliding window of the newest 100 rows, so rows that slid out of it stay,
 * rows it still carries are revised in place, and new rows are appended. Rows
 * the live store merged into an earlier row (absent from the window although
 * newer than its first row) are removed so text never appears twice.
 */
export function mergeAshaSessionRows(record: AshaSessionRecord, snapshot: AshaSnapshotRow[]): AshaSessionRecord {
  if (record.state !== 'active') return record;
  const incoming = new Map<string, AshaSessionTranscriptRow>();
  for (const raw of snapshot) {
    const row = sanitizeSnapshotRow(raw);
    if (row) incoming.set(row.id, row);
  }
  const snapshotIds = new Set(snapshot.map((row) => row.id));
  const sequences = [...snapshotIds].map(rowSequence);
  const windowStart = sequences.length && sequences.every((value) => value !== null) ? Math.min(...(sequences as number[])) : null;
  const retained = record.rows.filter((row) => {
    if (snapshotIds.has(row.id)) return incoming.has(row.id);
    if (windowStart === null) return true;
    const sequence = rowSequence(row.id);
    return sequence === null || sequence < windowStart;
  });
  const revised = retained.map((row) => incoming.get(row.id) ?? row);
  const known = new Set(revised.map((row) => row.id));
  const added = [...incoming.values()].filter((row) => !known.has(row.id));
  let rows = [...revised, ...added];
  if (rows.every((row) => rowSequence(row.id) !== null)) {
    rows = [...rows].sort((left, right) => rowSequence(left.id)! - rowSequence(right.id)!);
  }
  const unchanged = rows.length === record.rows.length && rows.every((row, index) => {
    const previous = record.rows[index];
    return previous === row || (previous !== undefined && previous.id === row.id && previous.text === row.text && previous.speaker === row.speaker && previous.startMs === row.startMs && previous.endMs === row.endMs);
  });
  if (unchanged) return record;
  return withinCaps({ ...record, rows });
}

export function recordAshaSessionTool(record: AshaSessionRecord, outcome: { savedPhrase?: string; lessonId?: string }): AshaSessionRecord {
  if (record.state !== 'active') return record;
  const savedPhrase = outcome.savedPhrase?.trim().slice(0, MAX_PHRASE_CHARACTERS);
  const lessonId = outcome.lessonId?.trim().slice(0, MAX_LESSON_ID_CHARACTERS);
  const savedPhrases = savedPhrase && !record.savedPhrases.includes(savedPhrase)
    ? [...record.savedPhrases, savedPhrase].slice(-MAX_ASHA_SESSION_TOOL_ENTRIES)
    : record.savedPhrases;
  const lessonsPracticed = lessonId && !record.lessonsPracticed.includes(lessonId)
    ? [...record.lessonsPracticed, lessonId].slice(-MAX_ASHA_SESSION_TOOL_ENTRIES)
    : record.lessonsPracticed;
  if (savedPhrases === record.savedPhrases && lessonsPracticed === record.lessonsPracticed) return record;
  return { ...record, savedPhrases, lessonsPracticed };
}

/**
 * Closes the active record, or returns null when there is nothing worth
 * keeping: an attempt without a transcript row (never connected, failed to
 * start, or dropped right after ready) is discarded rather than stored, and a
 * session ended by Delete Bolo data must never be written again.
 */
export function finishAshaSession(record: AshaSessionRecord, input: { endedAt: string; endReason: AshaSessionEndReason }): AshaSessionRecord | null {
  if (record.state !== 'active') return record;
  if (input.endReason === 'data_deleted' || !isAshaSessionStorable(record)) return null;
  return { ...record, state: ashaSessionStateFor(input.endReason), endReason: input.endReason, endedAt: input.endedAt };
}

/** Crash recovery: a record still active when the log is read was cut off by the OS. */
export function recoverActiveAshaSession(record: AshaSessionRecord): AshaSessionRecord | null {
  if (record.state !== 'active') return record;
  if (!isAshaSessionStorable(record)) return null;
  const endedAt = endedAtFromCaptions(record);
  return { ...record, state: 'interrupted', endReason: 'app_terminated', ...(endedAt ? { endedAt } : {}) };
}

/** The learner's explicit Clear: learner text and tool content go, minimal metadata stays. */
export function clearAshaSessionContent(record: AshaSessionRecord, clearedAt: string): AshaSessionRecord {
  if (record.rows.length === 0 && record.savedPhrases.length === 0 && record.lessonsPracticed.length === 0 && record.contentClearedAt) return record;
  return { ...record, rows: [], savedPhrases: [], lessonsPracticed: [], contentClearedAt: clearedAt };
}

export function sortAshaSessions<T extends { startedAt: string }>(sessions: T[]): T[] {
  return [...sessions].sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
}

/** Applies the retention limits: nothing older than the window, then only the newest sessions. */
export function pruneAshaSessions<T extends { startedAt: string }>(sessions: T[], now = new Date()): T[] {
  const cutoff = now.getTime() - ASHA_SESSION_RETENTION_DAYS * 86_400_000;
  return sortAshaSessions(sessions).filter((session) => Date.parse(session.startedAt) >= cutoff).slice(-MAX_ASHA_SESSIONS);
}

/** The record Last session shows: the most recent by start time. Older records stay hidden. */
export function latestAshaSession(sessions: AshaSessionRecord[]): AshaSessionRecord | null {
  return sortAshaSessions(sessions).at(-1) ?? null;
}

/** The session whose transcript holds this live row, for associating a report locally. */
export function ashaSessionIdForRow(sessions: AshaSessionRecord[], rowId: string): string | undefined {
  return sessions.find((session) => session.rows.some((row) => row.id === rowId))?.id;
}

/** Milliseconds the learner spent in the session, or null when nothing can be measured. */
export function ashaSessionDurationMs(record: AshaSessionRecord): number | null {
  const started = Date.parse(record.startedAt);
  if (record.endedAt) {
    const elapsed = Date.parse(record.endedAt) - started;
    if (Number.isFinite(elapsed) && elapsed >= 0) return elapsed;
  }
  return lastCaptionMs(record.rows);
}

function sanitizeRow(value: unknown): AshaSessionTranscriptRow | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<AshaSessionTranscriptRow>;
  if (typeof row.id !== 'string' || !row.id.trim() || row.id.length > MAX_ID_CHARACTERS) return null;
  if (row.speaker !== 'you' && row.speaker !== 'asha') return null;
  if (typeof row.text !== 'string' || !row.text.trim()) return null;
  const bounded = (input: unknown) => (Number.isFinite(Number(input)) ? Math.min(MAX_SESSION_MS, Math.max(0, Math.round(Number(input)))) : 0);
  return {
    id: row.id,
    speaker: row.speaker,
    text: row.text.trim().slice(0, MAX_CHAT_MESSAGE_CHARACTERS),
    startMs: bounded(row.startMs),
    endMs: bounded(row.endMs),
  };
}

function sanitizeStrings(value: unknown, maximumLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim().slice(0, maximumLength)))]
    .slice(-MAX_ASHA_SESSION_TOOL_ENTRIES);
}

function sanitizeRecord(value: unknown): AshaSessionRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<AshaSessionRecord>;
  if (record.schema !== 1) return null;
  if (typeof record.id !== 'string' || !record.id.trim() || record.id.length > MAX_ID_CHARACTERS) return null;
  if (!isIsoDate(record.startedAt)) return null;
  if (record.state !== 'active' && record.state !== 'ended' && record.state !== 'interrupted') return null;
  if (record.responseLanguage !== 'en' && record.responseLanguage !== 'hi') return null;
  if (record.endReason !== undefined && !isAshaSessionEndReason(record.endReason)) return null;
  if (record.mode !== undefined && !(LIVE_MODES as readonly string[]).includes(record.mode as string)) return null;
  if (record.connectedAt !== undefined && !isIsoDate(record.connectedAt)) return null;
  if (record.endedAt !== undefined && !isIsoDate(record.endedAt)) return null;
  if (record.contentClearedAt !== undefined && !isIsoDate(record.contentClearedAt)) return null;
  if (!Array.isArray(record.rows)) return null;
  const rows: AshaSessionTranscriptRow[] = [];
  for (const raw of record.rows) {
    const row = sanitizeRow(raw);
    if (!row) return null;
    rows.push(row);
  }
  const sanitized: AshaSessionRecord = {
    schema: 1,
    id: record.id,
    ...(typeof record.serverSessionId === 'string' && record.serverSessionId.trim() ? { serverSessionId: record.serverSessionId.slice(0, MAX_SERVER_SESSION_ID_CHARACTERS) } : {}),
    startedAt: record.startedAt,
    ...(record.connectedAt ? { connectedAt: record.connectedAt } : {}),
    ...(record.endedAt ? { endedAt: record.endedAt } : {}),
    ...(record.contentClearedAt ? { contentClearedAt: record.contentClearedAt } : {}),
    state: record.state,
    ...(record.endReason ? { endReason: record.endReason } : {}),
    responseLanguage: record.responseLanguage,
    ...(record.mode ? { mode: record.mode } : {}),
    ...(typeof record.lessonId === 'string' && record.lessonId.trim() ? { lessonId: record.lessonId.slice(0, MAX_LESSON_ID_CHARACTERS) } : {}),
    rows: rows.slice(-MAX_ASHA_SESSION_ROWS),
    learnerTurns: Number.isInteger(record.learnerTurns) ? Math.min(MAX_ASHA_SESSION_ROWS, Math.max(0, record.learnerTurns as number)) : 0,
    savedPhrases: sanitizeStrings(record.savedPhrases, MAX_PHRASE_CHARACTERS),
    lessonsPracticed: sanitizeStrings(record.lessonsPracticed, MAX_LESSON_ID_CHARACTERS),
  };
  if (byteLength(sanitized) > MAX_ASHA_SESSION_BYTES) return null;
  return sanitized;
}

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Validates one stored session value. Malformed or oversized records become null instead of throwing. */
export function sanitizeAshaSession(raw: string | null): AshaSessionRecord | null {
  return sanitizeRecord(parse(raw));
}

/** Validates the stored index: unique ids with parseable start times, ordered oldest first. */
export function sanitizeAshaSessionIndex(raw: string | null): AshaSessionIndexEntry[] {
  const parsed = parse(raw);
  const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray((parsed as { entries?: unknown }).entries) ? (parsed as { entries: unknown[] }).entries : [];
  const seen = new Set<string>();
  const entries = list.flatMap((value): AshaSessionIndexEntry[] => {
    if (!value || typeof value !== 'object') return [];
    const entry = value as Partial<AshaSessionIndexEntry>;
    if (typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > MAX_ID_CHARACTERS || !isIsoDate(entry.startedAt)) return [];
    if (seen.has(entry.id)) return [];
    seen.add(entry.id);
    return [{ id: entry.id, startedAt: entry.startedAt }];
  });
  return sortAshaSessions(entries).slice(-MAX_INDEX_ENTRIES);
}

export function ashaSessionIndexEntries(sessions: AshaSessionRecord[]): AshaSessionIndexEntry[] {
  return sortAshaSessions(sessions).map(({ id, startedAt }) => ({ id, startedAt }));
}
