import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      __store: store,
      getAllKeys: jest.fn(async () => [...store.keys()]),
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null])),
      multiRemove: jest.fn(async (keys: string[]) => {
        keys.forEach((key) => store.delete(key));
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
jest.mock('@/lib/observability', () => ({ observe: jest.fn() }));

import { ASHA_SESSION_INDEX_KEY, ashaSessionKey, MAX_ASHA_SESSIONS, type AshaSessionIndexEntry, type AshaSessionRecord } from '../src/lib/asha-session-log';
import * as sharedStore from '../src/lib/asha-session-log-store';
import { showAppAlert } from '../src/lib/app-alert';
import { observe } from '../src/lib/observability';

type Store = typeof import('../src/lib/asha-session-log-store');

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
  getAllKeys: jest.Mock;
  getItem: jest.Mock;
  multiGet: jest.Mock;
  multiRemove: jest.Mock;
  removeItem: jest.Mock;
  setItem: jest.Mock;
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flush() {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

function storedRecord(id: string): AshaSessionRecord | null {
  const raw = asyncStorage.__store.get(ashaSessionKey(id));
  return raw ? (JSON.parse(raw) as AshaSessionRecord) : null;
}

function storedIndex(): AshaSessionIndexEntry[] {
  return JSON.parse(asyncStorage.__store.get(ASHA_SESSION_INDEX_KEY) ?? '[]') as AshaSessionIndexEntry[];
}

function sessionKeys() {
  return [...asyncStorage.__store.keys()].filter((key) => key.startsWith('bolo-asha-session-v1:')).sort();
}

function seed(record: AshaSessionRecord, indexed = true) {
  asyncStorage.__store.set(ashaSessionKey(record.id), JSON.stringify(record));
  if (indexed) {
    const entries = storedIndex().filter((entry) => entry.id !== record.id);
    asyncStorage.__store.set(ASHA_SESSION_INDEX_KEY, JSON.stringify([...entries, { id: record.id, startedAt: record.startedAt }]));
  }
}

const row = (id: string, speaker: 'you' | 'asha', text: string, startMs = 0) => ({ id, speaker, text, startMs, endMs: startMs + 400 });

const endedRecord: AshaSessionRecord = {
  schema: 1,
  id: 'done',
  startedAt: '2026-10-30T09:00:00.000Z',
  connectedAt: '2026-10-30T09:00:02.000Z',
  endedAt: '2026-10-30T09:05:00.000Z',
  state: 'ended',
  endReason: 'user_ended',
  responseLanguage: 'en',
  rows: [row('live-a-0', 'you', 'Namaste')],
  learnerTurns: 1,
  savedPhrases: ['नमस्ते'],
  lessonsPracticed: ['chai'],
};

const activeRecord: AshaSessionRecord = {
  ...endedRecord,
  id: 'crashed',
  startedAt: '2026-10-31T09:00:00.000Z',
  connectedAt: '2026-10-31T09:00:02.000Z',
  endedAt: undefined,
  endReason: undefined,
  state: 'active',
  rows: [row('live-b-0', 'you', 'Namaste', 0)],
  savedPhrases: [],
  lessonsPracticed: [],
};

function loadStore(): Store {
  let store!: Store;
  jest.isolateModules(() => {
    store = require('../src/lib/asha-session-log-store') as Store;
  });
  return store;
}

async function runSession(store: Store, id: string, startedAt: string, rows = [row(`live-${id}-0`, 'you', 'Hello')]) {
  store.logAshaSessionEvent({ type: 'starting' }, 'en', { id, at: startedAt });
  store.logAshaSessionEvent({ type: 'ready' }, 'en', { at: startedAt });
  store.logAshaSessionSnapshot(rows);
  store.logAshaSessionEvent({ type: 'ended', reason: 'user_ended' }, 'en', { at: startedAt });
  await flush();
}

describe('Asha session log store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asyncStorage.__store.clear();
    jest.useRealTimers();
  });

  describe('hydration and recovery', () => {
    it('reads the index and per-session keys once, marks a record left active as interrupted, and persists that before resolving', async () => {
      seed(endedRecord);
      seed(activeRecord);
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      await store.ensureAshaSessionLogLoaded();
      expect(asyncStorage.getItem).toHaveBeenCalledTimes(1);
      expect(store.getAshaSessions().map((session) => [session.id, session.state])).toEqual([['done', 'ended'], ['crashed', 'interrupted']]);
      // The recovery write finished before the promise resolved: no waitFor needed.
      expect(storedRecord('crashed')).toMatchObject({ state: 'interrupted', endReason: 'app_terminated', endedAt: '2026-10-31T09:00:02.400Z' });
      expect(storedRecord('done')).toEqual(endedRecord);
      expect(asyncStorage.setItem).toHaveBeenCalledTimes(1);
    });

    it('adopts an orphan record written before its index entry, removes invalid and expired keys, and repairs the index', async () => {
      seed(endedRecord, false);
      asyncStorage.__store.set(ashaSessionKey('broken'), '{"schema":1');
      asyncStorage.__store.set(ashaSessionKey('wrong-id'), JSON.stringify({ ...endedRecord, id: 'other' }));
      seed({ ...endedRecord, id: 'stale', startedAt: '2026-01-01T10:00:00.000Z' });
      asyncStorage.__store.set(ASHA_SESSION_INDEX_KEY, JSON.stringify([...storedIndex(), { id: 'missing', startedAt: '2026-10-29T10:00:00.000Z' }]));
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      expect(store.getAshaSessions().map((session) => session.id)).toEqual(['done']);
      expect(sessionKeys()).toEqual([ashaSessionKey('done')]);
      expect(storedIndex()).toEqual([{ id: 'done', startedAt: endedRecord.startedAt }]);
    });

    it('leaves the index alone when it already matches storage', async () => {
      seed(endedRecord);
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      expect(asyncStorage.setItem).not.toHaveBeenCalled();
      expect(asyncStorage.multiRemove).not.toHaveBeenCalled();
    });

    it('opens with an empty log when storage cannot be read', async () => {
      const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      asyncStorage.getItem.mockRejectedValueOnce(new Error('disk gone'));
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      expect(store.getAshaSessions()).toEqual([]);
      expect(observe).toHaveBeenCalledWith('runtime_error');
      expect(showAppAlert).not.toHaveBeenCalled();
      warning.mockRestore();
    });

    it('applies a session that starts before hydration only after the crashed record is recovered, so the new one is never app_terminated', async () => {
      seed(activeRecord);
      const read = deferred<string | null>();
      asyncStorage.getItem.mockImplementationOnce(() => read.promise);
      const store = loadStore();
      store.logAshaSessionEvent({ type: 'starting' }, 'en', { id: 'fresh', at: '2026-10-31T10:00:00.000Z' });
      store.logAshaSessionSnapshot([row('live-c-0', 'asha', 'Welcome back')]);
      await flush();
      expect(store.getAshaSessions()).toEqual([]);
      read.resolve(JSON.stringify([{ id: 'crashed', startedAt: activeRecord.startedAt }]));
      await store.ensureAshaSessionLogLoaded();
      await flush();
      expect(store.getAshaSessions().map((session) => [session.id, session.state, session.endReason])).toEqual([
        ['crashed', 'interrupted', 'app_terminated'],
        ['fresh', 'active', undefined],
      ]);
      expect(storedRecord('crashed')?.state).toBe('interrupted');
      expect(storedRecord('fresh')?.rows).toEqual([row('live-c-0', 'asha', 'Welcome back')]);
    });
  });

  describe('capture during a call', () => {
    it('stores nothing for an attempt that never produced a transcript row, including ready-then-dropped', async () => {
      seed(endedRecord);
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      store.logAshaSessionEvent({ type: 'starting', mode: 'beginner' }, 'hi', { id: 'empty', at: '2026-10-31T10:00:00.000Z' });
      store.logAshaSessionEvent({ type: 'ended', reason: 'start_failed' }, 'hi');
      store.logAshaSessionEvent({ type: 'starting' }, 'hi', { id: 'dropped', at: '2026-10-31T10:01:00.000Z' });
      store.logAshaSessionEvent({ type: 'ready', serverSessionId: 'srv-2' }, 'hi');
      store.logAshaSessionEvent({ type: 'ended', reason: 'connection_lost' }, 'hi');
      await flush();
      expect(store.getAshaSessions().map((session) => session.id)).toEqual(['done']);
      expect(asyncStorage.setItem).not.toHaveBeenCalled();
      expect(sessionKeys()).toEqual([ashaSessionKey('done')]);
      expect(storedIndex().map((entry) => entry.id)).toEqual(['done']);
    });

    it('writes the record on its first row, then its index entry, and afterwards only the active session key', async () => {
      seed(endedRecord);
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      asyncStorage.setItem.mockClear();
      const startedAt = '2026-10-31T10:00:00.000Z';
      store.logAshaSessionEvent({ type: 'starting', mode: 'beginner', lessonId: 'chai' }, 'hi', { id: 'session-1', at: startedAt });
      store.logAshaSessionEvent({ type: 'ready', serverSessionId: 'srv-1' }, 'hi', { at: '2026-10-31T10:00:02.000Z' });
      await flush();
      expect(asyncStorage.setItem).not.toHaveBeenCalled();
      store.logAshaSessionSnapshot([row('live-0', 'you', 'Namaste')]);
      await flush();
      expect(asyncStorage.setItem.mock.calls.map(([key]) => key)).toEqual([ashaSessionKey('session-1'), ASHA_SESSION_INDEX_KEY]);
      expect(storedIndex().map((entry) => entry.id)).toEqual(['done', 'session-1']);
      asyncStorage.setItem.mockClear();
      store.logAshaSessionSnapshot([row('live-0', 'you', 'Namaste ji'), row('live-1', 'asha', 'Namaste!', 500)]);
      store.logAshaSessionTool({ savedPhrase: 'नमस्ते' });
      await flush();
      store.logAshaSessionEvent({ type: 'ended', reason: 'connection_lost' }, 'hi', { at: '2026-10-31T10:03:00.000Z' });
      await flush();
      expect(new Set(asyncStorage.setItem.mock.calls.map(([key]) => key))).toEqual(new Set([ashaSessionKey('session-1')]));
      expect(storedRecord('done')).toEqual(endedRecord);
      expect(storedRecord('session-1')).toMatchObject({
        id: 'session-1',
        state: 'interrupted',
        endReason: 'connection_lost',
        endedAt: '2026-10-31T10:03:00.000Z',
        startedAt,
        connectedAt: '2026-10-31T10:00:02.000Z',
        serverSessionId: 'srv-1',
        mode: 'beginner',
        lessonId: 'chai',
        responseLanguage: 'hi',
        rows: [row('live-0', 'you', 'Namaste ji'), row('live-1', 'asha', 'Namaste!', 500)],
        savedPhrases: ['नमस्ते'],
      });
    });

    it('queues at most one follow-up write per record while a write is in flight', async () => {
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      const firstWrite = deferred<void>();
      asyncStorage.setItem.mockImplementationOnce(() => firstWrite.promise);
      store.logAshaSessionEvent({ type: 'starting' }, 'en', { id: 'session-1', at: '2026-10-31T10:00:00.000Z' });
      store.logAshaSessionSnapshot([row('live-0', 'you', 'One')]);
      await flush();
      expect(asyncStorage.setItem).toHaveBeenCalledTimes(1);
      store.logAshaSessionSnapshot([row('live-0', 'you', 'One two')]);
      store.logAshaSessionSnapshot([row('live-0', 'you', 'One two three')]);
      store.logAshaSessionTool({ lessonId: 'chai' });
      await flush();
      expect(asyncStorage.setItem).toHaveBeenCalledTimes(1);
      firstWrite.resolve();
      await flush();
      // One coalesced record write holding the newest state (queued while the first was in flight),
      // then the index entry, which publishes only after that first write succeeded.
      expect(asyncStorage.setItem.mock.calls.map(([key]) => key)).toEqual([ashaSessionKey('session-1'), ashaSessionKey('session-1'), ASHA_SESSION_INDEX_KEY]);
      expect(storedRecord('session-1')).toMatchObject({ rows: [row('live-0', 'you', 'One two three')], lessonsPracticed: ['chai'] });
    });

    it('generates a session id and timestamps when the caller gives none', async () => {
      const store = loadStore();
      store.logAshaSessionEvent({ type: 'starting' }, 'en');
      store.logAshaSessionSnapshot([row('live-0', 'you', 'Hi')]);
      await store.ensureAshaSessionLogLoaded();
      await flush();
      const [record] = store.getAshaSessions();
      expect(record?.id).toMatch(/^[A-Za-z0-9-]{8,64}$/u);
      expect(Number.isFinite(Date.parse(record?.startedAt ?? ''))).toBe(true);
      expect(store.findAshaSessionIdForRow('live-0')).toBe(record?.id);
      expect(store.findAshaSessionIdForRow('asha-1')).toBeUndefined();
    });

    it('keeps the newest three stored sessions, evicting the oldest key, while empty attempts never evict anything', async () => {
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      for (let index = 0; index < MAX_ASHA_SESSIONS; index += 1) {
        await runSession(store, `s-${index}`, `2026-10-31T1${index}:00:00.000Z`);
      }
      expect(sessionKeys()).toEqual([ashaSessionKey('s-0'), ashaSessionKey('s-1'), ashaSessionKey('s-2')]);
      // Connecting, failing to start, and dropping right after ready leave the three stored sessions alone.
      store.logAshaSessionEvent({ type: 'starting' }, 'en', { id: 'empty', at: '2026-10-31T13:00:00.000Z' });
      store.logAshaSessionEvent({ type: 'ready' }, 'en');
      store.logAshaSessionEvent({ type: 'ended', reason: 'backgrounded' }, 'en');
      await flush();
      expect(sessionKeys()).toEqual([ashaSessionKey('s-0'), ashaSessionKey('s-1'), ashaSessionKey('s-2')]);
      await runSession(store, 's-3', '2026-10-31T14:00:00.000Z');
      expect(store.getAshaSessions().map((session) => session.id)).toEqual(['s-1', 's-2', 's-3']);
      expect(sessionKeys()).toEqual([ashaSessionKey('s-1'), ashaSessionKey('s-2'), ashaSessionKey('s-3')]);
      expect(storedIndex().map((entry) => entry.id)).toEqual(['s-1', 's-2', 's-3']);
    });

    it('reports a failed write once, keeps the in-memory log, and recovers on the next success', async () => {
      const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      // Only the record is written on the first row; its index entry waits for a successful write.
      asyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
      store.logAshaSessionEvent({ type: 'starting' }, 'en', { id: 'session-1', at: '2026-10-31T10:00:00.000Z' });
      store.logAshaSessionSnapshot([row('live-0', 'asha', 'Hello')]);
      await flush();
      expect(asyncStorage.setItem).toHaveBeenCalledTimes(1);
      expect(showAppAlert).toHaveBeenCalledTimes(1);
      expect(showAppAlert).toHaveBeenCalledWith('Could not save on this device', expect.stringMatching(/Asha session/u));
      expect(observe).toHaveBeenCalledWith('runtime_error');
      expect(store.getAshaSessions()[0]?.rows).toHaveLength(1);
      store.logAshaSessionSnapshot([row('live-0', 'asha', 'Hello again')]);
      await flush();
      expect(storedRecord('session-1')?.rows[0]?.text).toBe('Hello again');
      asyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
      store.logAshaSessionSnapshot([row('live-0', 'asha', 'Third')]);
      await flush();
      expect(showAppAlert).toHaveBeenCalledTimes(2);
      warning.mockRestore();
    });
  });

  describe('typed chat saved before a new conversation', () => {
    const typed = [
      { id: 'you-1793441040000', role: 'you' as const, text: 'How do I say thank you?' },
      { id: 'asha-1793441044000', role: 'asha' as const, text: 'धन्यवाद (dhanyavaad).' },
    ];

    it('stores the chat as a completed session, publishes it, and keeps it newest in the log', async () => {
      seed(endedRecord);
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      store.logTypedChatSession(typed, 'hi', { id: 'typed-1', at: '2026-10-31T10:05:00.000Z' });
      expect(store.getAshaSessions().map((session) => session.id)).toEqual(['done', 'typed-1']);
      await flush();
      expect(storedRecord('typed-1')).toMatchObject({ state: 'ended', endReason: 'new_conversation', responseLanguage: 'hi', learnerTurns: 1 });
      expect(storedRecord('typed-1')!.rows.map((row) => row.text)).toEqual(['How do I say thank you?', 'धन्यवाद (dhanyavaad).']);
      expect(storedIndex().map((entry) => entry.id)).toEqual(['done', 'typed-1']);
      expect(store.findAshaSessionIdForRow('asha-1793441044000')).toBe('typed-1');
    });

    it('does not save a transcript twice: rows a stored voice session holds are skipped, and nothing saves an empty chat', async () => {
      seed(endedRecord);
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      store.logTypedChatSession([{ id: 'live-a-0', role: 'you', text: 'Namaste' }], 'en', { id: 'dup' });
      store.logTypedChatSession([], 'en', { id: 'empty' });
      await flush();
      expect(store.getAshaSessions().map((session) => session.id)).toEqual(['done']);
      expect(sessionKeys()).toEqual([ashaSessionKey('done')]);
      // Only the typed rows that are new reach the saved session.
      store.logTypedChatSession([{ id: 'live-a-0', role: 'you', text: 'Namaste' }, ...typed], 'en', { id: 'partial', at: '2026-10-31T10:05:00.000Z' });
      await flush();
      expect(storedRecord('partial')!.rows.map((row) => row.id)).toEqual(typed.map((message) => message.id));
    });

    it('waits for hydration, and evicts the oldest durable session once the typed chat is written', async () => {
      const olderRecords = Array.from({ length: MAX_ASHA_SESSIONS }, (_, index) => ({ ...endedRecord, id: `old-${index}`, startedAt: `2026-10-2${index + 1}T09:00:00.000Z` }));
      olderRecords.forEach((record) => seed(record));
      const store = loadStore();
      store.logTypedChatSession(typed, 'en', { id: 'typed-2', at: '2026-10-31T10:05:00.000Z' });
      await store.ensureAshaSessionLogLoaded();
      await flush();
      expect(store.getAshaSessions().map((session) => session.id)).toEqual(['old-1', 'old-2', 'typed-2']);
      expect(sessionKeys()).toEqual([ashaSessionKey('old-1'), ashaSessionKey('old-2'), ashaSessionKey('typed-2')].sort());
    });
  });

  describe('retention', () => {
    const olderRecords = Array.from({ length: MAX_ASHA_SESSIONS }, (_, index) => ({ ...endedRecord, id: `old-${index}`, startedAt: `2026-10-2${index + 1}T09:00:00.000Z` }));

    it('keeps the index and every older session when the first write of a new session fails, and publishes once a later write succeeds', async () => {
      olderRecords.forEach((record) => seed(record));
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      asyncStorage.setItem.mockClear();
      asyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
      store.logAshaSessionEvent({ type: 'starting' }, 'en', { id: 'fresh', at: '2026-10-31T10:00:00.000Z' });
      store.logAshaSessionSnapshot([row('live-0', 'you', 'Namaste')]);
      await flush();
      // Nothing durable changed: no index publication, no eviction, no removal.
      expect(asyncStorage.setItem.mock.calls.map(([key]) => key)).toEqual([ashaSessionKey('fresh')]);
      expect(asyncStorage.multiRemove).not.toHaveBeenCalled();
      expect(storedIndex().map((entry) => entry.id)).toEqual(['old-0', 'old-1', 'old-2']);
      expect(sessionKeys()).toEqual(olderRecords.map((record) => ashaSessionKey(record.id)).sort());
      expect(showAppAlert).toHaveBeenCalledWith('Could not save on this device', expect.any(String));
      // The learner still sees the live session, and the older sessions are all still there.
      expect(store.getAshaSessions().map((session) => session.id)).toEqual(['old-0', 'old-1', 'old-2', 'fresh']);

      // The next row's write succeeds: now the record is published and the oldest session evicted.
      store.logAshaSessionSnapshot([row('live-0', 'you', 'Namaste'), row('live-1', 'asha', 'Namaste!', 500)]);
      await flush();
      expect(storedIndex().map((entry) => entry.id)).toEqual(['old-1', 'old-2', 'fresh']);
      expect(sessionKeys()).toEqual([ashaSessionKey('fresh'), ashaSessionKey('old-1'), ashaSessionKey('old-2')]);
      expect(store.getAshaSessions().map((session) => session.id)).toEqual(['old-1', 'old-2', 'fresh']);
      expect(storedRecord('fresh')?.rows).toHaveLength(2);
    });

    it('expires sessions past the retention window when the app returns to the foreground, not only at hydration', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-10-31T12:00:00.000Z'));
      let change!: (state: 'active' | 'background') => void;
      const remove = jest.fn();
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, handler) => { change = handler as typeof change; return { remove }; });
      seed(endedRecord);
      seed({ ...endedRecord, id: 'recent', startedAt: '2026-10-31T09:00:00.000Z' });
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      const stop = store.startAshaSessionRetention();
      expect(store.getAshaSessions().map((session) => session.id)).toEqual(['done', 'recent']);
      // A month later the app comes back to the foreground; `done` (Oct 30) is now out of the window, `recent` (Oct 31) is not.
      jest.setSystemTime(new Date('2026-11-29T12:00:00.000Z'));
      change('background');
      change('active');
      await flush();
      expect(store.getAshaSessions().map((session) => session.id)).toEqual(['recent']);
      expect(sessionKeys()).toEqual([ashaSessionKey('recent')]);
      expect(storedIndex().map((entry) => entry.id)).toEqual(['recent']);
      stop();
      expect(remove).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('explicit Clear chat', () => {
    it('removes rows and tool content from every saved session, keeps metadata, persists each record, and leaves the index alone', async () => {
      seed(endedRecord);
      seed({ ...endedRecord, id: 'older', startedAt: '2026-10-29T09:00:00.000Z' });
      const store = loadStore();
      const listener = jest.fn();
      store.subscribeAshaSessionLog(listener);
      await store.ensureAshaSessionLogLoaded();
      asyncStorage.setItem.mockClear();
      await store.clearAshaSessionContent();
      for (const session of store.getAshaSessions()) {
        expect(session).toMatchObject({ rows: [], savedPhrases: [], lessonsPracticed: [], state: 'ended', endReason: 'user_ended', learnerTurns: 1 });
        expect(session.contentClearedAt).toEqual(expect.any(String));
        expect(storedRecord(session.id)).toEqual(session);
      }
      expect(asyncStorage.setItem.mock.calls.map(([key]) => key).sort()).toEqual([ashaSessionKey('done'), ashaSessionKey('older')].sort());
      expect(storedIndex().map((entry) => entry.id).sort()).toEqual(['done', 'older']);
      expect(asyncStorage.setItem).not.toHaveBeenCalledWith(ASHA_SESSION_INDEX_KEY, expect.anything());
      expect(listener).toHaveBeenCalled();
    });

    it('rejects when the cleared records cannot be written, and a write queued before the clear cannot restore content', async () => {
      const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      await runSession(store, 'session-1', '2026-10-31T10:00:00.000Z');
      // A record write still in flight from the call must not land after the clear.
      const slowWrite = deferred<void>();
      asyncStorage.setItem.mockImplementationOnce(async (key: string, value: string) => {
        await slowWrite.promise;
        asyncStorage.__store.set(key, value);
      });
      store.logAshaSessionEvent({ type: 'starting' }, 'en', { id: 'session-2', at: '2026-10-31T11:00:00.000Z' });
      store.logAshaSessionSnapshot([row('live-2-0', 'you', 'Secret')]);
      await flush();
      store.logAshaSessionEvent({ type: 'ended', reason: 'user_ended' }, 'en');
      const clearing = store.clearAshaSessionContent();
      slowWrite.resolve();
      await clearing;
      expect(storedRecord('session-1')?.rows).toEqual([]);
      expect(storedRecord('session-2')?.rows).toEqual([]);
      expect(store.getAshaSessions().every((session) => session.rows.length === 0)).toBe(true);

      asyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
      await runSession(store, 'session-3', '2026-10-31T12:00:00.000Z');
      asyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
      await expect(store.clearAshaSessionContent()).rejects.toThrow('disk full');
      warning.mockRestore();
    });
  });

  describe('Delete Bolo data', () => {
    it('forgets every session synchronously, then removes the index and all per-session keys including orphans', async () => {
      seed(endedRecord);
      seed({ ...endedRecord, id: 'orphan', startedAt: '2026-10-31T08:00:00.000Z' }, false);
      asyncStorage.__store.set('bolo-chat-history', '[]');
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      const deletion = store.deleteAllAshaSessions();
      expect(store.getAshaSessions()).toEqual([]);
      await deletion;
      expect(sessionKeys()).toEqual([]);
      expect(asyncStorage.__store.has(ASHA_SESSION_INDEX_KEY)).toBe(false);
      expect(asyncStorage.__store.get('bolo-chat-history')).toBe('[]');
      await store.ensureAshaSessionLogLoaded();
      expect(store.getAshaSessions()).toEqual([]);
    });

    it('discards the in-progress session and anything that arrives after the deletion', async () => {
      const store = loadStore();
      await store.ensureAshaSessionLogLoaded();
      const slowWrite = deferred<void>();
      store.logAshaSessionEvent({ type: 'starting' }, 'en', { id: 'live-now', at: '2026-10-31T10:00:00.000Z' });
      store.logAshaSessionSnapshot([row('live-0', 'you', 'Namaste')]);
      await flush();
      expect(storedRecord('live-now')).not.toBeNull();
      asyncStorage.setItem.mockImplementationOnce(async (key: string, value: string) => {
        await slowWrite.promise;
        asyncStorage.__store.set(key, value);
      });
      store.logAshaSessionSnapshot([row('live-0', 'you', 'Namaste ji')]);
      await flush();
      // Delete while that write is pending; then the call ends and late rows arrive.
      const ender = jest.fn();
      const unregister = store.registerLiveCallEnder(ender);
      store.endLiveCallForDataDeletion();
      expect(ender).toHaveBeenCalledWith('data_deleted');
      const deletion = store.deleteAllAshaSessions();
      store.logAshaSessionEvent({ type: 'ended', reason: 'data_deleted' }, 'en');
      store.logAshaSessionSnapshot([row('live-1', 'asha', 'Late reply')]);
      store.logAshaSessionTool({ savedPhrase: 'देर' });
      store.logAshaSessionEvent({ type: 'ended', reason: 'connection_lost' }, 'en');
      slowWrite.resolve();
      await deletion;
      await flush();
      expect(store.getAshaSessions()).toEqual([]);
      expect(sessionKeys()).toEqual([]);
      expect(asyncStorage.__store.has(ASHA_SESSION_INDEX_KEY)).toBe(false);
      unregister();
      store.endLiveCallForDataDeletion();
      expect(ender).toHaveBeenCalledTimes(1);
      // A later session is logged normally.
      await runSession(store, 'after', '2026-10-31T11:00:00.000Z');
      expect(sessionKeys()).toEqual([ashaSessionKey('after')]);
    });

    it('drops session events queued before hydration finished when the data is deleted meanwhile', async () => {
      seed(activeRecord);
      const read = deferred<string | null>();
      asyncStorage.getItem.mockImplementationOnce(() => read.promise);
      const store = loadStore();
      store.logAshaSessionEvent({ type: 'starting' }, 'en', { id: 'queued', at: '2026-10-31T10:00:00.000Z' });
      store.logAshaSessionSnapshot([row('live-q-0', 'you', 'Queued')]);
      const deletion = store.deleteAllAshaSessions();
      read.resolve(JSON.stringify([{ id: 'crashed', startedAt: activeRecord.startedAt }]));
      await deletion;
      await store.ensureAshaSessionLogLoaded();
      await flush();
      expect(store.getAshaSessions()).toEqual([]);
      expect(sessionKeys()).toEqual([]);
    });
  });

  it('exposes the hydrated log to React', async () => {
    seed(endedRecord);
    // The module copy that shares the test renderer's React, unlike the isolated copies above.
    const store = sharedStore;
    const { result } = await renderHook(() => store.useAshaSessionLog());
    await waitFor(() => expect(result.current).toHaveLength(1));
    await act(async () => {
      store.logAshaSessionEvent({ type: 'starting' }, 'en', { id: 'session-2', at: '2026-10-31T10:00:00.000Z' });
      store.logAshaSessionSnapshot([row('live-0', 'you', 'Hi')]);
      await flush();
    });
    expect(result.current.map((session) => session.id)).toEqual(['done', 'session-2']);
  });

  it('re-applies retention when a screen reads the already hydrated log', async () => {
    const store = sharedStore;
    expect(store.getAshaSessions().map((session) => session.id)).toEqual(['done', 'session-2']);
    jest.useFakeTimers();
    // Well past the window for both records; hydration ran long ago, so only the screen's refresh can expire them.
    jest.setSystemTime(new Date('2026-12-15T12:00:00.000Z'));
    const { result } = await renderHook(() => store.useAshaSessionLog());
    await waitFor(() => expect(result.current).toEqual([]));
    await act(async () => {
      await flush();
    });
    expect(sessionKeys()).toEqual([]);
    expect(storedIndex()).toEqual([]);
    jest.useRealTimers();
  });
});
