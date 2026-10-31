/**
 * Sync outbox: network follow-ups that failed while offline, queued on the
 * device and retried with backoff whenever the app is active and Bolo's API is
 * reachable again. Only "Report this reply" is queued.
 *
 * Entries never hold the client id (read at send time), SDP, or server error
 * bodies; `lastError` is one of this module's own user-facing strings. The
 * local entry id and local session association are never sent.
 *
 * A flush generation guards deletion and consent withdrawal: `clear()` bumps it
 * synchronously, aborts the request in flight, and blocks sending until the
 * queue is removed from storage, so a stale loop can never send a report that
 * was queued before the clear, under any client id.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { onNetworkAvailable } from '@/lib/network-signal';
import { createLocalId } from '@/lib/storage';
import { BoloApiError, reportGeneratedMessage, type ReportReason } from '@/services/bolo-api';

export const SYNC_OUTBOX_KEY = 'bolo-sync-outbox-v1';
/**
 * Set on disk before a clear removes the stored queue and removed after it. A start
 * that finds it finishes the removal first, so a withdrawal whose cleanup failed
 * cannot resurrect reports once consent is granted again.
 */
export const SYNC_OUTBOX_CLEARING_KEY = 'bolo-sync-outbox-clearing-v1';
export const MAX_OUTBOX_ATTEMPTS = 8;
export const MAX_OUTBOX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_OUTBOX_ENTRIES = 50;
export const OUTBOX_BASE_DELAY_MS = 2_000;
export const OUTBOX_MAX_DELAY_MS = 15 * 60 * 1000;

export const OUTBOX_WAITING_MESSAGE = 'Waiting for a connection.';
export const OUTBOX_REJECTED_MESSAGE = 'Bolo could not accept this report.';
export const OUTBOX_GAVE_UP_MESSAGE = 'Bolo stopped retrying after too many attempts.';

const REPORT_REASONS: readonly ReportReason[] = ['unsafe_or_inappropriate', 'incorrect_or_misleading'];
const MAX_REPORT_MESSAGE_CHARACTERS = 1_200;
const MAX_ID_CHARACTERS = 128;

export type OutboxOp = {
  kind: 'report_message';
  /** Local association with a saved Asha session, for Last session. Never sent. */
  sessionId?: string;
  payload: {
    message: string;
    reason: ReportReason;
    /** Local chat row id, so the Asha screen can show the queue state on the reply. Never sent. */
    messageId?: string;
  };
};

export type OutboxEntryState = 'pending' | 'in_flight' | 'failed';

export type OutboxEntry = OutboxOp & {
  /** Local UUID. Not sent: the report API has not confirmed it accepts an id. */
  id: string;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string;
  /** A server-enforced earliest retry (429 Retry-After); eager "network is back" flushes never move an entry before it. */
  retryNotBefore?: string;
  /** Only this module's own user-facing text, never a server message. */
  lastError?: string;
  state: OutboxEntryState;
};

type LocalStorage = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
};

export type SyncOutboxContext = { clientId: string | null; enabled: boolean };

export type SyncOutboxDeps = {
  storage: () => LocalStorage;
  /** Performs the network work for one entry with the client id read at that moment. */
  send: (entry: OutboxEntry, signal: AbortSignal, context: SyncOutboxContext) => Promise<void>;
  now?: () => number;
  random?: () => number;
};

export type SyncOutbox = {
  load(): Promise<OutboxEntry[]>;
  getEntries(): OutboxEntry[];
  subscribe(listener: () => void): () => void;
  /** Called once per entry the moment its report was delivered. */
  subscribeDelivered(listener: (entry: OutboxEntry) => void): () => void;
  setContext(context: SyncOutboxContext): void;
  /**
   * The current clear generation. Capture it before a report's first attempt
   * and pass it to `enqueue`, so a report whose attempt started before Delete
   * Bolo data or consent withdrawal can never be queued afterwards.
   */
  generation(): number;
  /**
   * Queues an operation and resolves once it is on disk. Rejects when it could
   * not be persisted, or when the queue was cleared (or is being cleared)
   * since `options.generation` was captured; nothing is kept in either case.
   * `options.retryAfterMs` is the Retry-After of the attempt that failed before
   * queueing: the first retry waits at least that long, eager flushes included.
   */
  enqueue(op: OutboxOp, options?: { generation?: number; retryAfterMs?: number }): Promise<OutboxEntry>;
  flush(): Promise<void>;
  retry(id: string): Promise<void>;
  discard(id: string): Promise<void>;
  /**
   * Drops every queued operation: synchronously forgets them, aborts the send
   * in flight, and blocks flushing until the stored queue is removed. Used by
   * consent withdrawal and Delete Bolo data. Rejects if removal fails; flushing
   * stays blocked until a later call succeeds.
   */
  clear(): Promise<void>;
  /** Subscribes to foreground, network, and timer triggers. Returns the unsubscribe. */
  start(): () => void;
};

/**
 * Decides from the typed error kind, never from message text, whether an
 * entry waits for another try or fails for good.
 */
export function classifyOutboxError(error: unknown): 'transient' | 'permanent' {
  if (!(error instanceof BoloApiError)) return 'permanent';
  if (error.kind === 'network' || error.kind === 'timeout') return 'transient';
  if (error.kind === 'http' && error.status !== undefined && (error.status === 408 || error.status === 429 || error.status >= 500)) return 'transient';
  return 'permanent';
}

/** The server's earliest retry from a failed attempt, read from the typed error only, never from message text. */
export function outboxRetryAfterMs(error: unknown): number | undefined {
  return error instanceof BoloApiError && error.retryAfterMs && error.retryAfterMs > 0 ? error.retryAfterMs : undefined;
}

/** Exponential backoff from the base delay, capped, with full jitter so retries spread out. */
export function outboxBackoffMs(attempts: number, random: () => number = Math.random): number {
  const cap = Math.min(OUTBOX_MAX_DELAY_MS, OUTBOX_BASE_DELAY_MS * 2 ** Math.max(0, Math.min(30, Math.round(attempts))));
  const jitter = Math.min(1, Math.max(0, random()));
  return Math.round(jitter * cap);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function boundedId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= MAX_ID_CHARACTERS ? value : undefined;
}

function sanitizeEntry(value: unknown, now: Date): OutboxEntry | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<OutboxEntry> & { payload?: Partial<OutboxOp['payload']> };
  if (entry.kind !== 'report_message') return null;
  if (typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > MAX_ID_CHARACTERS) return null;
  if (!isIsoDate(entry.createdAt)) return null;
  if (Date.parse(entry.createdAt) < now.getTime() - MAX_OUTBOX_AGE_MS) return null;
  const payload = entry.payload;
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.message !== 'string' || !payload.message.trim()) return null;
  if (!REPORT_REASONS.includes(payload.reason as ReportReason)) return null;
  const state: OutboxEntryState = entry.state === 'failed' ? 'failed' : 'pending';
  const lastError = [OUTBOX_WAITING_MESSAGE, OUTBOX_REJECTED_MESSAGE, OUTBOX_GAVE_UP_MESSAGE].find((text) => text === entry.lastError);
  const sessionId = boundedId(entry.sessionId);
  const messageId = boundedId(payload.messageId);
  const retryNotBefore = state === 'pending' && isIsoDate(entry.retryNotBefore) && Date.parse(entry.retryNotBefore) > now.getTime() ? entry.retryNotBefore : undefined;
  return {
    kind: 'report_message',
    ...(sessionId ? { sessionId } : {}),
    payload: {
      message: payload.message.trim().slice(0, MAX_REPORT_MESSAGE_CHARACTERS),
      reason: payload.reason as ReportReason,
      ...(messageId ? { messageId } : {}),
    },
    id: entry.id,
    createdAt: entry.createdAt,
    attempts: Number.isInteger(entry.attempts) ? Math.min(MAX_OUTBOX_ATTEMPTS, Math.max(0, entry.attempts as number)) : 0,
    nextAttemptAt: isIsoDate(entry.nextAttemptAt) ? entry.nextAttemptAt : entry.createdAt,
    ...(retryNotBefore ? { retryNotBefore } : {}),
    ...(lastError ? { lastError } : {}),
    state,
  };
}

export const OUTBOX_CLEARED_MESSAGE = 'This report was not saved because Bolo was removing queued reports.';

function isExpired(entry: OutboxEntry, at: number) {
  return at - Date.parse(entry.createdAt) > MAX_OUTBOX_AGE_MS;
}

/** The earliest moment an eager retry may run: now, unless the server asked for a longer wait. */
function earliestRetryAt(entry: OutboxEntry, at: number) {
  const notBefore = entry.retryNotBefore ? Date.parse(entry.retryNotBefore) : 0;
  return new Date(Math.max(at, notBefore)).toISOString();
}

/** Validates stored entries. Anything left `in_flight` by a killed app goes back to `pending`. */
export function sanitizeOutbox(raw: string | null, now = new Date()): OutboxEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  return parsed.flatMap((value) => {
    const entry = sanitizeEntry(value, now);
    if (!entry || seen.has(entry.id)) return [];
    seen.add(entry.id);
    return [entry];
  }).slice(-MAX_OUTBOX_ENTRIES);
}

export function createSyncOutbox(deps: SyncOutboxDeps): SyncOutbox {
  const now = deps.now ?? (() => Date.now());
  const random = deps.random ?? Math.random;
  let entries: OutboxEntry[] = [];
  let context: SyncOutboxContext = { clientId: null, enabled: false };
  let hydration: Promise<void> | null = null;
  let writeTail: Promise<void> = Promise.resolve();
  let flushing: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let foreground = AppState.currentState !== 'background';
  let generation = 0;
  let inFlight: AbortController | null = null;
  let blockedUntilCleared = false;
  /** Entries published to subscribers but not yet on disk; the flush loop leaves them alone until they are. */
  const unsaved = new Set<string>();
  const listeners = new Set<() => void>();
  const deliveredListeners = new Set<(entry: OutboxEntry) => void>();

  const notify = () => listeners.forEach((listener) => listener());
  const notifyDelivered = (entry: OutboxEntry) => deliveredListeners.forEach((listener) => listener(entry));

  /** Serialized storage step; a failed step rejects its caller but keeps the writer usable. */
  const write = (step: () => Promise<void>) => {
    const result = writeTail.then(step);
    writeTail = result.then(() => undefined, () => undefined);
    return result;
  };

  /** Publishes `next` immediately and resolves once it is on disk; rejects if the write failed. */
  const commit = (next: OutboxEntry[]) => {
    entries = next;
    notify();
    return write(() => deps.storage().setItem(SYNC_OUTBOX_KEY, JSON.stringify(entries)));
  };

  /** `commit` for bookkeeping writes, where a storage failure is logged rather than surfaced. */
  const replace = (next: OutboxEntry[]) => commit(next).catch((error: unknown) => {
    console.warn('Bolo could not save queued work.', error);
  });

  /**
   * Removes the stored queue, marking the removal first so a restart in the middle
   * of it finishes the job. The marker's own removal failing is only logged: the
   * queue is gone, and a start that still finds the marker removes nothing real.
   */
  const removeStored = async () => {
    const storage = deps.storage();
    try {
      await storage.setItem(SYNC_OUTBOX_CLEARING_KEY, '1');
    } catch (error) {
      console.warn('Bolo could not mark queued work for removal.', error);
    }
    await storage.removeItem(SYNC_OUTBOX_KEY);
    await storage.removeItem(SYNC_OUTBOX_CLEARING_KEY).catch((error: unknown) => {
      console.warn('Bolo could not unmark queued work removal.', error);
    });
  };

  const load = () => {
    if (!hydration) {
      const started = generation;
      hydration = (async () => {
        let loaded: OutboxEntry[] = [];
        let clearing = false;
        try {
          const storage = deps.storage();
          clearing = (await storage.getItem(SYNC_OUTBOX_CLEARING_KEY)) !== null;
          // A removal that did not finish before the app closed: nothing stored may be used.
          if (!clearing) loaded = sanitizeOutbox(await storage.getItem(SYNC_OUTBOX_KEY), new Date(now()));
        } catch (error) {
          console.warn('Bolo could not read queued work.', error);
        }
        // Cleared while reading: the stored entries were just deleted.
        if (started !== generation) return;
        entries = loaded;
        notify();
        if (!clearing) return;
        blockedUntilCleared = true;
        await write(removeStored).then(() => {
          // A clear that began meanwhile owns the block from here.
          if (started === generation) blockedUntilCleared = false;
        }, (error: unknown) => {
          console.warn('Bolo could not remove queued work.', error);
        });
      })();
    }
    return hydration;
  };

  const canSend = () => context.enabled && Boolean(context.clientId) && foreground && !blockedUntilCleared;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const scheduleTimer = () => {
    clearTimer();
    if (!canSend()) return;
    const due = entries.filter((entry) => entry.state === 'pending').map((entry) => Date.parse(entry.nextAttemptAt));
    if (!due.length) return;
    const delay = Math.min(OUTBOX_MAX_DELAY_MS, Math.max(0, Math.min(...due) - now()));
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  };

  const settle = (entry: OutboxEntry, error: unknown): OutboxEntry => {
    // A previous Retry-After no longer applies once this attempt has run.
    const rest: OutboxEntry = { ...entry };
    delete rest.retryNotBefore;
    const attempts = entry.attempts + 1;
    if (classifyOutboxError(error) === 'permanent') return { ...rest, attempts, state: 'failed', lastError: OUTBOX_REJECTED_MESSAGE };
    if (attempts >= MAX_OUTBOX_ATTEMPTS || isExpired(entry, now())) return { ...rest, attempts, state: 'failed', lastError: OUTBOX_GAVE_UP_MESSAGE };
    // A 429 with Retry-After waits at least that long, even across eager flushes; otherwise the normal backoff applies.
    const retryAfterMs = error instanceof BoloApiError && error.retryAfterMs ? error.retryAfterMs : 0;
    const delay = Math.max(retryAfterMs, outboxBackoffMs(entry.attempts, random));
    return {
      ...rest,
      attempts,
      state: 'pending',
      lastError: OUTBOX_WAITING_MESSAGE,
      nextAttemptAt: new Date(now() + delay).toISOString(),
      ...(retryAfterMs > 0 ? { retryNotBefore: new Date(now() + retryAfterMs).toISOString() } : {}),
    };
  };

  /** Entries past the age cap fail before any send, however long the app kept them loaded. */
  const expirePending = () => {
    const at = now();
    const next = entries.map((entry) => (entry.state === 'pending' && isExpired(entry, at) ? { ...entry, state: 'failed' as const, lastError: OUTBOX_GAVE_UP_MESSAGE } : entry));
    return next.some((entry, index) => entry !== entries[index]) ? replace(next) : Promise.resolve();
  };

  // `eager` is for "the network is back" signals: pending entries retry now instead of waiting out their backoff.
  const flush = (eager = false): Promise<void> => {
    if (flushing) return flushing;
    const started = generation;
    const stale = () => started !== generation;
    flushing = (async () => {
      await load();
      if (stale()) return;
      if (eager && canSend()) {
        const at = now();
        const due = entries.map((entry) => {
          if (entry.state !== 'pending' || Date.parse(entry.nextAttemptAt) <= at) return entry;
          const retryAt = earliestRetryAt(entry, at);
          return retryAt === entry.nextAttemptAt ? entry : { ...entry, nextAttemptAt: retryAt };
        });
        if (due.some((entry, index) => entry !== entries[index])) await replace(due);
        if (stale()) return;
      }
      // One entry at a time, oldest first; each is marked in flight before its request.
      for (;;) {
        if (stale() || !canSend()) break;
        await expirePending();
        if (stale() || !canSend()) break;
        const next = entries.find((entry) => entry.state === 'pending' && !unsaved.has(entry.id) && Date.parse(entry.nextAttemptAt) <= now());
        if (!next) break;
        const marked: OutboxEntry = { ...next, state: 'in_flight' };
        await replace(entries.map((entry) => (entry.id === next.id ? marked : entry)));
        // Re-check after the await, then read the client id and send with no await in between.
        if (stale() || !entries.some((entry) => entry.id === next.id)) break;
        if (!canSend()) {
          // Backgrounded or blocked during that write: the request never went out, so the
          // entry goes back to pending for the next foreground flush instead of staying stuck.
          await replace(entries.map((entry) => (entry.id === next.id && entry.state === 'in_flight' ? { ...entry, state: 'pending' } : entry)));
          break;
        }
        const controller = new AbortController();
        inFlight = controller;
        let outcome: OutboxEntry | null;
        try {
          await deps.send(marked, controller.signal, context);
          outcome = null;
        } catch (error) {
          outcome = settle(marked, error);
        } finally {
          if (inFlight === controller) inFlight = null;
        }
        // Cleared, discarded, or deleted while sending: discard this completion.
        if (stale() || !entries.some((entry) => entry.id === next.id)) continue;
        const persisted = replace(outcome ? entries.map((entry) => (entry.id === next.id ? outcome! : entry)) : entries.filter((entry) => entry.id !== next.id));
        if (!outcome) notifyDelivered(marked);
        await persisted;
      }
    })().finally(() => {
      flushing = null;
      scheduleTimer();
    });
    return flushing;
  };

  return {
    load: async () => {
      await load();
      return entries;
    },
    getEntries: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeDelivered(listener) {
      deliveredListeners.add(listener);
      return () => {
        deliveredListeners.delete(listener);
      };
    },
    setContext(next) {
      const becameSendable = !canSend();
      context = next;
      if (becameSendable && canSend()) void flush(true);
      else scheduleTimer();
    },
    generation: () => generation,
    async enqueue(op, options = {}) {
      const started = options.generation ?? generation;
      // Checked before and after every await: a clear that began since the report's
      // first attempt (or that is still removing the stored queue) must not be undone.
      const cleared = () => started !== generation || blockedUntilCleared;
      if (cleared()) throw new Error(OUTBOX_CLEARED_MESSAGE);
      await load();
      if (cleared()) throw new Error(OUTBOX_CLEARED_MESSAGE);
      const at = now();
      const createdAt = new Date(at).toISOString();
      // A 429 cooldown from the attempt that failed before queueing holds for the first retry as well.
      const retryAfterMs = options.retryAfterMs && options.retryAfterMs > 0 ? options.retryAfterMs : 0;
      const retryNotBefore = retryAfterMs ? new Date(at + retryAfterMs).toISOString() : undefined;
      const entry: OutboxEntry = {
        ...op,
        id: createLocalId(),
        createdAt,
        attempts: 0,
        nextAttemptAt: retryNotBefore ?? createdAt,
        ...(retryNotBefore ? { retryNotBefore } : {}),
        state: 'pending',
      };
      // Published now so every queued write serializes the same state, but kept out of
      // the flush loop until it is on disk: a report the learner is told failed to save
      // must never have been sent.
      unsaved.add(entry.id);
      try {
        await commit([...entries, entry].slice(-MAX_OUTBOX_ENTRIES));
      } catch (error) {
        console.warn('Bolo could not save queued work.', error);
        unsaved.delete(entry.id);
        if (entries.some((candidate) => candidate.id === entry.id)) {
          // Not on disk, so not saved: forget it rather than tell the learner it was kept.
          void replace(entries.filter((candidate) => candidate.id !== entry.id));
        }
        throw error;
      }
      unsaved.delete(entry.id);
      if (cleared()) throw new Error(OUTBOX_CLEARED_MESSAGE);
      void flush();
      return entry;
    },
    flush: () => flush(),
    async retry(id) {
      await load();
      const retryAt = new Date(now()).toISOString();
      await replace(entries.map((entry) => (entry.id === id && entry.state === 'failed' ? { ...entry, state: 'pending', attempts: 0, nextAttemptAt: retryAt, createdAt: retryAt, lastError: undefined } : entry)));
      void flush();
    },
    async discard(id) {
      await load();
      await replace(entries.filter((entry) => entry.id !== id));
    },
    clear() {
      // Everything synchronous happens before any await: no stale loop may send again.
      generation += 1;
      blockedUntilCleared = true;
      inFlight?.abort();
      inFlight = null;
      clearTimer();
      entries = [];
      // The stored queue is about to go; a later load must not bring it back.
      hydration = Promise.resolve();
      notify();
      return write(removeStored).then(() => {
        blockedUntilCleared = false;
        // A report queued during the removal waits for the next trigger otherwise.
        if (entries.length) void flush();
      }, (error: unknown) => {
        console.warn('Bolo could not remove queued work.', error);
        throw error;
      });
    },
    start() {
      foreground = AppState.currentState !== 'background';
      const subscription = AppState.addEventListener('change', (state) => {
        foreground = state !== 'background';
        if (foreground) void flush(true);
        else clearTimer();
      });
      const stopNetwork = onNetworkAvailable(() => {
        void flush(true);
      });
      void flush();
      return () => {
        subscription.remove();
        stopNetwork();
        clearTimer();
      };
    },
  };
}

function asyncStorage(): LocalStorage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@react-native-async-storage/async-storage') as { default: LocalStorage }).default;
}

/** The app's outbox. `AppStateProvider` supplies the client id and consent and starts it. */
export const syncOutbox: SyncOutbox = createSyncOutbox({
  storage: asyncStorage,
  // Exactly the existing report payload: no entry id, no session id.
  send: (entry, signal, current) => {
    if (!current.clientId) return Promise.reject(new BoloApiError('Bolo is not ready yet.', { kind: 'config' }));
    return reportGeneratedMessage({ clientId: current.clientId, message: entry.payload.message, reason: entry.payload.reason }, signal).then(() => undefined);
  },
});

/** Queued entries for screens; loads the outbox on first use. */
export function useSyncOutbox(): OutboxEntry[] {
  useEffect(() => {
    void syncOutbox.load();
  }, []);
  return useSyncExternalStore(syncOutbox.subscribe, syncOutbox.getEntries, syncOutbox.getEntries);
}
