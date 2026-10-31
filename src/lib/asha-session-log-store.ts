/**
 * AsyncStorage persistence for the Asha session log. Each session has its own
 * key plus a small index of ids, so a save during a call rewrites only the
 * active session. One serialized write queue coalesces transcript writes in the
 * style of `replaceLiveChatSnapshot`. Hydration happens once, repairs partial
 * writes, applies retention, and turns a record left `active` by a killed app
 * into `interrupted`; callers await it before a new call can start.
 *
 * A capture generation guards deletion: Delete Bolo data and the learner's
 * Clear bump it, so late rows, finalization, tool callbacks, and queued writes
 * from before the bump cannot recreate removed content.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { showAppAlert } from '@/lib/app-alert';
import {
  ASHA_SESSION_INDEX_KEY,
  ashaSessionIdForRow,
  ashaSessionIndexEntries,
  ashaSessionKey,
  ashaSessionLogEnabled,
  clearAshaSessionContent as clearRecordContent,
  connectAshaSession,
  createAshaSessionRecord,
  createTypedChatSessionRecord,
  finishAshaSession,
  isAshaSessionKey,
  isAshaSessionStorable,
  mergeAshaSessionRows,
  pruneAshaSessions,
  recordAshaSessionTool,
  recoverActiveAshaSession,
  sanitizeAshaSession,
  sanitizeAshaSessionIndex,
  sortAshaSessions,
  type AshaSessionEndReason,
  type AshaSessionEvent,
  type AshaSessionRecord,
  type AshaSnapshotRow,
} from '@/lib/asha-session-log';
import { observe } from '@/lib/observability';
import { createLocalId } from '@/lib/storage';
import type { AshaResponseLanguage, ChatMessage } from '@/state/app-state-types';

type LocalStorage = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
  multiGet?(keys: readonly string[]): Promise<readonly [string, string | null][]>;
  multiRemove?(keys: readonly string[]): Promise<void>;
};

// Lazy like observability: pure UI tests import the capture hooks without a native bridge.
function storage(): LocalStorage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@react-native-async-storage/async-storage') as { default: LocalStorage }).default;
}

async function allSessionKeys(): Promise<string[]> {
  const store = storage();
  const keys = typeof store.getAllKeys === 'function' ? await store.getAllKeys() : [];
  return keys.filter(isAshaSessionKey);
}

async function readMany(keys: string[]): Promise<[string, string | null][]> {
  const store = storage();
  if (typeof store.multiGet === 'function') return (await store.multiGet(keys)).map(([key, value]) => [key, value]);
  return Promise.all(keys.map(async (key): Promise<[string, string | null]> => [key, await store.getItem(key)]));
}

async function removeMany(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const store = storage();
  if (typeof store.multiRemove === 'function') {
    await store.multiRemove(keys);
    return;
  }
  for (const key of keys) await store.removeItem(key);
}

const EMPTY: AshaSessionRecord[] = [];
/** Stored sessions, oldest first. Includes the active session once it has a row. */
let sessions: AshaSessionRecord[] = EMPTY;
/** The active session before its first row; it has no key and no index entry yet. */
let pendingActive: AshaSessionRecord | null = null;
let activeId: string | null = null;
/**
 * Sessions inserted in memory whose first record write has not succeeded yet.
 * They are neither indexed nor counted toward eviction until it does, so a
 * failed insertion can never cost an older durable session.
 */
const unpublished = new Set<string>();
let hydration: Promise<void> | null = null;
let hydrated = false;
let generation = 0;
let writeTail: Promise<void> = Promise.resolve();
const queuedRecordWrites = new Set<string>();
let indexWriteQueued = false;
let writeFailureReported = false;
let pendingOps: { generation: number; run: () => void }[] = [];
let liveCallEnder: ((reason: AshaSessionEndReason) => void) | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function replaceSessions(next: AshaSessionRecord[]) {
  if (next === sessions) return;
  sessions = next.length ? next : EMPTY;
  notify();
}

/** The sessions that are durable: on disk with an index entry (or about to get one). */
function publishedSessions() {
  return unpublished.size ? sessions.filter((session) => !unpublished.has(session.id)) : sessions;
}

function reportWriteFailure(error: unknown) {
  console.warn('Bolo could not save the Asha session log.', error);
  observe('runtime_error');
  if (writeFailureReported) return;
  writeFailureReported = true;
  showAppAlert('Could not save on this device', 'Bolo could not save this Asha session on the device. The conversation stays on screen until you leave. Check available storage.');
}

/** Runs a storage step after everything already queued, keeping the queue alive on failure. */
function enqueueWrite(step: () => Promise<void>): Promise<void> {
  const result = writeTail.then(step);
  writeTail = result.then(() => undefined, () => undefined);
  return result;
}

// A slow device can receive many captions during one storage write. Queue at
// most one follow-up write per record, reading the newest record when it begins.
function scheduleRecordWrite(id: string) {
  if (queuedRecordWrites.has(id)) return;
  queuedRecordWrites.add(id);
  const scheduled = generation;
  void enqueueWrite(async () => {
    queuedRecordWrites.delete(id);
    const record = sessions.find((session) => session.id === id);
    // Deleted or cleared since this was queued: the deletion wrote what it wanted.
    if (!record || scheduled !== generation) return;
    await storage().setItem(ashaSessionKey(id), JSON.stringify(record));
    writeFailureReported = false;
    // The first durable write of a new session: publish its index entry, then make room.
    if (scheduled === generation && unpublished.delete(id)) {
      scheduleIndexWrite();
      enforceRetention();
    }
  }).catch(reportWriteFailure);
}

function scheduleIndexWrite() {
  if (indexWriteQueued) return;
  indexWriteQueued = true;
  const scheduled = generation;
  void enqueueWrite(async () => {
    indexWriteQueued = false;
    if (scheduled !== generation) return;
    await storage().setItem(ASHA_SESSION_INDEX_KEY, JSON.stringify(ashaSessionIndexEntries(publishedSessions())));
    writeFailureReported = false;
  }).catch(reportWriteFailure);
}

function scheduleRemoval(ids: string[]) {
  if (!ids.length) return;
  void enqueueWrite(() => removeMany(ids.map(ashaSessionKey))).catch(reportWriteFailure);
}

/** Drops durable sessions past the retention limits, removes their keys, and republishes the index. */
function enforceRetention(now = new Date()) {
  const published = publishedSessions();
  const kept = pruneAshaSessions(published, now);
  const keptIds = new Set(kept.map((session) => session.id));
  const evicted = new Set(published.filter((session) => !keptIds.has(session.id)).map((session) => session.id));
  if (!evicted.size) return false;
  replaceSessions(sessions.filter((session) => !evicted.has(session.id)));
  scheduleRemoval([...evicted]);
  scheduleIndexWrite();
  return true;
}

function updateStoredRecord(id: string, update: (record: AshaSessionRecord) => AshaSessionRecord | null) {
  const index = sessions.findIndex((session) => session.id === id);
  if (index < 0) return;
  const current = sessions[index]!;
  const next = update(current);
  if (next === current) return;
  if (next) {
    replaceSessions(sessions.map((session, position) => (position === index ? next : session)));
    scheduleRecordWrite(id);
    return;
  }
  replaceSessions(sessions.filter((session) => session.id !== id));
  unpublished.delete(id);
  scheduleRemoval([id]);
  scheduleIndexWrite();
}

/** Applies an update to the active session, wherever it currently lives. */
function updateActive(update: (record: AshaSessionRecord) => AshaSessionRecord | null) {
  if (pendingActive) {
    const next = update(pendingActive);
    if (next === pendingActive) return;
    if (!next) {
      pendingActive = null;
      activeId = null;
      return;
    }
    if (!isAshaSessionStorable(next)) {
      pendingActive = next;
      return;
    }
    // First transcript row: write the record. Its index entry and any eviction of an
    // older session wait until that write has succeeded (see scheduleRecordWrite).
    pendingActive = null;
    unpublished.add(next.id);
    replaceSessions(sortAshaSessions([...sessions, next]));
    scheduleRecordWrite(next.id);
    return;
  }
  if (!activeId) return;
  const id = activeId;
  updateStoredRecord(id, update);
}

function apply(run: () => void) {
  if (hydrated) {
    run();
    return;
  }
  pendingOps.push({ generation, run });
  void ensureAshaSessionLogLoaded();
}

async function hydrate() {
  const startedGeneration = generation;
  const current = () => generation === startedGeneration;
  let loaded: AshaSessionRecord[] = [];
  let indexedIds: string[] = [];
  const toRemove: string[] = [];
  try {
    const [indexRaw, orphanKeys] = await Promise.all([storage().getItem(ASHA_SESSION_INDEX_KEY), allSessionKeys()]);
    if (!current()) return;
    const entries = sanitizeAshaSessionIndex(indexRaw);
    indexedIds = entries.map((entry) => entry.id);
    // Orphans are records written before their index entry could be published; adopt the valid ones.
    const ids = [...new Set([...indexedIds, ...orphanKeys.map((key) => key.slice(ashaSessionKey('').length))])];
    const values = ids.length ? await readMany(ids.map(ashaSessionKey)) : [];
    if (!current()) return;
    for (const [key, value] of values) {
      const record = sanitizeAshaSession(value);
      const id = key.slice(ashaSessionKey('').length);
      if (record && record.id === id) loaded.push(record);
      else toRemove.push(id);
    }
  } catch (error) {
    console.warn('Bolo could not read the Asha session log.', error);
    observe('runtime_error');
    loaded = [];
  }
  if (!current()) return;
  const changed: string[] = [];
  const recovered = loaded.flatMap((record) => {
    const next = recoverActiveAshaSession(record);
    if (!next) {
      toRemove.push(record.id);
      return [];
    }
    if (next !== record) changed.push(next.id);
    return [next];
  });
  const kept = pruneAshaSessions(recovered, new Date());
  const keptIds = new Set(kept.map((session) => session.id));
  recovered.filter((session) => !keptIds.has(session.id)).forEach((session) => toRemove.push(session.id));
  replaceSessions(kept);
  const indexChanged = JSON.stringify(indexedIds) !== JSON.stringify(kept.map((session) => session.id));
  const writes: Promise<void>[] = [];
  for (const id of changed.filter((candidate) => keptIds.has(candidate))) {
    scheduleRecordWrite(id);
    writes.push(writeTail);
  }
  if (toRemove.length) {
    scheduleRemoval([...new Set(toRemove)]);
    writes.push(writeTail);
  }
  if (indexChanged) {
    scheduleIndexWrite();
    writes.push(writeTail);
  }
  // Recovery must be on disk before a new call can create another active record.
  await Promise.all(writes);
}

/** Reads and repairs the log once; resolves after recovery is persisted. Later calls resolve immediately. */
export function ensureAshaSessionLogLoaded(): Promise<void> {
  if (hydration) return hydration;
  hydration = hydrate().finally(() => {
    hydrated = true;
    const ops = pendingOps;
    pendingOps = [];
    ops.forEach((op) => {
      if (op.generation === generation) op.run();
    });
  });
  return hydration;
}

export function getAshaSessions(): AshaSessionRecord[] {
  return sessions;
}

export function subscribeAshaSessionLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current log for screens; triggers hydration on first use and re-applies retention on each open. */
export function useAshaSessionLog(): AshaSessionRecord[] {
  useEffect(() => {
    refreshAshaSessionRetention();
  }, []);
  return useSyncExternalStore(subscribeAshaSessionLog, getAshaSessions, getAshaSessions);
}

/**
 * Re-applies the 30-day / 3-session limits to the loaded log. Hydration prunes
 * once; a long-running app needs this again when it returns to the foreground
 * and when Last session opens, or an expired record stays visible.
 */
export function refreshAshaSessionRetention() {
  if (!ashaSessionLogEnabled) return;
  apply(() => {
    enforceRetention();
  });
}

/** Expires stored sessions whenever the app returns to the foreground. Returns the unsubscribe. */
export function startAshaSessionRetention(): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') refreshAshaSessionRetention();
  });
  return () => subscription.remove();
}

/** The stored session whose transcript holds this live row, for associating a report locally. */
export function findAshaSessionIdForRow(rowId: string): string | undefined {
  return ashaSessionIdForRow(sessions, rowId);
}

type SessionEventDetails = { id?: string; at?: string };

export function logAshaSessionEvent(event: AshaSessionEvent, responseLanguage: AshaResponseLanguage, details: SessionEventDetails = {}) {
  if (!ashaSessionLogEnabled) return;
  const at = details.at ?? new Date().toISOString();
  apply(() => {
    switch (event.type) {
      case 'starting': {
        // A record still active here was never finalized; treat it like a crash.
        updateActive(recoverActiveAshaSession);
        const record = createAshaSessionRecord({
          id: details.id ?? createLocalId(),
          startedAt: at,
          responseLanguage,
          ...(event.mode ? { mode: event.mode } : {}),
          ...(event.lessonId ? { lessonId: event.lessonId } : {}),
        });
        pendingActive = record;
        activeId = record.id;
        return;
      }
      case 'ready':
        updateActive((record) => connectAshaSession(record, { connectedAt: at, ...(event.serverSessionId ? { serverSessionId: event.serverSessionId } : {}) }));
        return;
      case 'ended':
        updateActive((record) => finishAshaSession(record, { endedAt: at, endReason: event.reason }));
        activeId = null;
        pendingActive = null;
        return;
      default:
        return;
    }
  });
}

export function logAshaSessionSnapshot(rows: AshaSnapshotRow[]) {
  if (!ashaSessionLogEnabled) return;
  apply(() => updateActive((record) => mergeAshaSessionRows(record, rows)));
}

/**
 * Saves the chat on screen as a finished session right before a new voice
 * conversation clears it, typed messages included. Rows a stored session already
 * holds (a voice call's own transcript) are skipped so nothing is saved twice,
 * and a chat with no new rows saves nothing.
 */
export function logTypedChatSession(messages: Pick<ChatMessage, 'id' | 'role' | 'text'>[], responseLanguage: AshaResponseLanguage, details: SessionEventDetails = {}) {
  if (!ashaSessionLogEnabled || !messages.length) return;
  const at = details.at ?? new Date().toISOString();
  apply(() => {
    const storedRowIds = sessions.flatMap((session) => session.rows.map((row) => row.id));
    const record = createTypedChatSessionRecord(messages, { id: details.id ?? createLocalId(), responseLanguage, now: at, storedRowIds });
    if (!record) return;
    // Already finished, so it joins the stored list directly; its index entry and
    // any eviction wait for the first durable write (see scheduleRecordWrite).
    unpublished.add(record.id);
    replaceSessions(sortAshaSessions([...sessions, record]));
    scheduleRecordWrite(record.id);
  });
}

export function logAshaSessionTool(outcome: { savedPhrase?: string; lessonId?: string }) {
  if (!ashaSessionLogEnabled) return;
  apply(() => updateActive((record) => recordAshaSessionTool(record, outcome)));
}

/**
 * The learner's explicit Clear chat: removes transcript rows and tool content
 * from every saved session while keeping minimal metadata, and persists each
 * cleared record. Rejects when the cleared records could not be written.
 */
export async function clearAshaSessionContent(): Promise<void> {
  await ensureAshaSessionLogLoaded();
  const clearedAt = new Date().toISOString();
  // Invalidate queued capture writes so nothing from before the clear lands afterwards.
  generation += 1;
  queuedRecordWrites.clear();
  indexWriteQueued = false;
  const cleared = sessions.map((session) => clearRecordContent(session, clearedAt));
  replaceSessions(cleared);
  await enqueueWrite(async () => {
    let published = false;
    for (const record of cleared) {
      if (!sessions.some((session) => session === record)) continue;
      await storage().setItem(ashaSessionKey(record.id), JSON.stringify(record));
      if (unpublished.delete(record.id)) published = true;
    }
    if (published) scheduleIndexWrite();
  });
}

/**
 * Delete Bolo data: forgets every session now, before any await, and then
 * removes the index and every per-session key (including orphans) behind the
 * pending writes. The session in progress is never written again.
 */
export function deleteAllAshaSessions(): Promise<void> {
  generation += 1;
  pendingOps = [];
  pendingActive = null;
  activeId = null;
  unpublished.clear();
  queuedRecordWrites.clear();
  indexWriteQueued = false;
  replaceSessions(EMPTY);
  // Nothing on disk is worth reading after this; a later load must not resurrect records.
  hydrated = true;
  hydration = Promise.resolve();
  return enqueueWrite(async () => {
    const keys = await allSessionKeys();
    await removeMany([ASHA_SESSION_INDEX_KEY, ...keys]);
  });
}

/** The host that owns the live voice hook registers how to end its call. */
export function registerLiveCallEnder(end: (reason: AshaSessionEndReason) => void): () => void {
  liveCallEnder = end;
  return () => {
    if (liveCallEnder === end) liveCallEnder = null;
  };
}

/** Ends any running live call because the learner is deleting Bolo data. */
export function endLiveCallForDataDeletion() {
  liveCallEnder?.('data_deleted');
}
