import { AppState } from 'react-native';

import { onNetworkAvailable, signalNetworkAvailable } from '../src/lib/network-signal';
import {
  classifyOutboxError,
  createSyncOutbox,
  MAX_OUTBOX_AGE_MS,
  MAX_OUTBOX_ATTEMPTS,
  MAX_OUTBOX_ENTRIES,
  OUTBOX_CLEARED_MESSAGE,
  OUTBOX_GAVE_UP_MESSAGE,
  OUTBOX_MAX_DELAY_MS,
  OUTBOX_REJECTED_MESSAGE,
  OUTBOX_WAITING_MESSAGE,
  outboxBackoffMs,
  outboxRetryAfterMs,
  sanitizeOutbox,
  SYNC_OUTBOX_CLEARING_KEY,
  SYNC_OUTBOX_KEY,
  type OutboxEntry,
} from '../src/lib/sync-outbox';
import { BoloApiError } from '../src/services/bolo-api';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

async function flush() {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

function stored(storage: ReturnType<typeof memoryStorage>): OutboxEntry[] {
  return JSON.parse(storage.store.get(SYNC_OUTBOX_KEY) ?? '[]') as OutboxEntry[];
}

const networkError = () => new BoloApiError('Bolo is unavailable right now. Check your connection and try again.', { kind: 'network' });
const report = { kind: 'report_message' as const, sessionId: 'session-1', payload: { message: 'A reply', reason: 'incorrect_or_misleading' as const, messageId: 'asha-1' } };

function outbox(seed: OutboxEntry[] = [], overrides: Partial<Parameters<typeof createSyncOutbox>[0]> = {}) {
  const storage = memoryStorage();
  if (seed.length) storage.store.set(SYNC_OUTBOX_KEY, JSON.stringify(seed));
  const send = jest.fn(async (_entry: OutboxEntry, _signal: AbortSignal, _context: { clientId: string | null; enabled: boolean }): Promise<void> => undefined);
  const box = createSyncOutbox({ storage: () => storage, send, random: () => 1, ...overrides });
  box.setContext({ clientId: 'client-12345678', enabled: true });
  return { box, send, storage };
}

describe('outbox error classification', () => {
  it.each([
    ['a network failure', new BoloApiError('offline', { kind: 'network' }), 'transient'],
    ['a timeout', new BoloApiError('timed out', { kind: 'timeout' }), 'transient'],
    ['408', new BoloApiError('Request Timeout', { kind: 'http', status: 408 }), 'transient'],
    ['429', new BoloApiError('Too many requests', { kind: 'http', status: 429 }), 'transient'],
    ['503', new BoloApiError('Service unavailable', { kind: 'http', status: 503 }), 'transient'],
    ['400', new BoloApiError('Bad request', { kind: 'http', status: 400 }), 'permanent'],
    ['404', new BoloApiError('Not found', { kind: 'http', status: 404 }), 'permanent'],
    ['caller cancellation', new BoloApiError('The request was canceled.', { kind: 'aborted' }), 'permanent'],
    ['a missing Live URL', new BoloApiError('Live voice isn’t available right now. You can still type to Asha.', { kind: 'config' }), 'permanent'],
    ['a rejected live-call payload', new BoloApiError('Bolo could not start this live voice session.', { kind: 'invalid_payload' }), 'permanent'],
    ['an invalid 2xx response', new BoloApiError('Bolo returned an invalid response. Please try again.', { kind: 'invalid_payload', status: 200 }), 'permanent'],
    ['an offline-sounding message with another kind', new BoloApiError('Bolo is unavailable right now. Check your connection and try again.', { kind: 'http', status: 400 }), 'permanent'],
    ['an unknown error', new TypeError('boom'), 'permanent'],
  ])('treats %s as %s', (_name, error, expected) => {
    expect(classifyOutboxError(error)).toBe(expected);
  });
});

describe('outbox backoff', () => {
  it('doubles from two seconds with full jitter and caps at fifteen minutes', () => {
    expect([0, 1, 2, 3, 8, 12].map((attempts) => outboxBackoffMs(attempts, () => 1))).toEqual([2_000, 4_000, 8_000, 16_000, 512_000, OUTBOX_MAX_DELAY_MS]);
    expect(outboxBackoffMs(2, () => 0)).toBe(0);
    expect(outboxBackoffMs(2, () => 0.5)).toBe(4_000);
    expect(outboxBackoffMs(2, () => 7)).toBe(8_000);
  });
});

describe('outbox sanitizer', () => {
  const now = new Date('2026-10-31T12:00:00.000Z');
  const valid: OutboxEntry = { ...report, id: 'entry-1', createdAt: '2026-10-31T11:00:00.000Z', attempts: 2, nextAttemptAt: '2026-10-31T11:05:00.000Z', lastError: OUTBOX_WAITING_MESSAGE, state: 'pending' };

  it('returns pending entries, puts interrupted sends back in the queue, and drops the rest', () => {
    const entries = [
      valid,
      { ...valid, id: 'entry-2', state: 'in_flight' },
      { ...valid, id: 'entry-3', state: 'failed' },
      { ...valid, id: 'stale', createdAt: new Date(now.getTime() - MAX_OUTBOX_AGE_MS - 1).toISOString() },
      { ...valid, id: 'bad-kind', kind: 'upload_session' },
      { ...valid, id: 'bad-reason', payload: { ...valid.payload, reason: 'spam' } },
      { ...valid, id: 'bad-message', payload: { ...valid.payload, message: '' } },
      { ...valid, id: '' },
      { ...valid, id: 'leaky', clientId: 'client-12345678', sessionId: 7, payload: { ...valid.payload, clientId: 'client-12345678', messageId: '' } },
      'nonsense',
    ];
    const sanitized = sanitizeOutbox(JSON.stringify(entries), now);
    expect(sanitized.map((entry) => [entry.id, entry.state])).toEqual([['entry-1', 'pending'], ['entry-2', 'pending'], ['entry-3', 'failed'], ['leaky', 'pending']]);
    expect(sanitized[0]).toEqual(valid);
    expect(sanitized[3]).not.toHaveProperty('sessionId');
    expect(sanitized[3]!.payload).not.toHaveProperty('messageId');
    expect(JSON.stringify(sanitized)).not.toContain('client-12345678');
    expect(sanitizeOutbox(null, now)).toEqual([]);
    expect(sanitizeOutbox('[', now)).toEqual([]);
  });

  it('keeps only the newest entries', () => {
    const many = Array.from({ length: MAX_OUTBOX_ENTRIES + 5 }, (_, index) => ({ ...valid, id: `entry-${index}` }));
    const sanitized = sanitizeOutbox(JSON.stringify(many), now);
    expect(sanitized).toHaveLength(MAX_OUTBOX_ENTRIES);
    expect(sanitized[0]!.id).toBe('entry-5');
  });
});

describe('sync outbox', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-31T12:00:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('persists a queued report, sends entries first-in first-out, and removes them after success', async () => {
    const { box, send, storage } = outbox();
    let finishFirst!: () => void;
    send.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }));
    const first = await box.enqueue(report);
    const second = await box.enqueue({ ...report, payload: { ...report.payload, message: 'Another reply', messageId: 'asha-2' } });
    expect(first).toMatchObject({ state: 'pending', attempts: 0, kind: 'report_message', sessionId: 'session-1' });
    expect(stored(storage).map((entry) => entry.id)).toEqual([first.id, second.id]);
    await flush();
    finishFirst();
    await flush();
    expect(send.mock.calls.map(([entry]) => entry.id)).toEqual([first.id, second.id]);
    expect(send.mock.calls[0]?.[2]).toEqual({ clientId: 'client-12345678', enabled: true });
    expect(box.getEntries()).toEqual([]);
    expect(stored(storage)).toEqual([]);
  });

  it('never stores the client id or a server error body', async () => {
    const { box, send, storage } = outbox();
    send.mockRejectedValueOnce(new BoloApiError('Internal detail: table users is locked', { kind: 'http', status: 503 }));
    await box.enqueue(report);
    await flush();
    const serialized = storage.store.get(SYNC_OUTBOX_KEY) ?? '';
    expect(serialized).not.toContain('client-12345678');
    expect(serialized).not.toContain('table users');
    expect(box.getEntries()[0]).toMatchObject({ state: 'pending', attempts: 1, lastError: OUTBOX_WAITING_MESSAGE });
  });

  it('retries transient failures on the backoff schedule in the foreground and gives up after the attempt cap', async () => {
    const { box, send } = outbox();
    send.mockRejectedValue(networkError());
    const stop = box.start();
    await box.enqueue(report);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(box.getEntries()[0]).toMatchObject({ attempts: 1, nextAttemptAt: '2026-10-31T12:00:02.000Z' });
    jest.advanceTimersByTime(1_999);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(box.getEntries()[0]).toMatchObject({ attempts: 2, nextAttemptAt: '2026-10-31T12:00:06.000Z' });
    for (let attempt = 2; attempt < MAX_OUTBOX_ATTEMPTS; attempt += 1) {
      jest.advanceTimersByTime(OUTBOX_MAX_DELAY_MS);
      await flush();
    }
    expect(send).toHaveBeenCalledTimes(MAX_OUTBOX_ATTEMPTS);
    expect(box.getEntries()[0]).toMatchObject({ state: 'failed', attempts: MAX_OUTBOX_ATTEMPTS, lastError: OUTBOX_GAVE_UP_MESSAGE });
    jest.advanceTimersByTime(OUTBOX_MAX_DELAY_MS);
    await flush();
    expect(send).toHaveBeenCalledTimes(MAX_OUTBOX_ATTEMPTS);
    stop();
  });

  it('waits at least Retry-After on a 429 before the next attempt', async () => {
    const { box, send } = outbox();
    send.mockRejectedValueOnce(new BoloApiError('Slow down', { kind: 'http', status: 429, retryAfterMs: 60_000 }));
    await box.enqueue(report);
    await flush();
    expect(box.getEntries()[0]).toMatchObject({ state: 'pending', attempts: 1, nextAttemptAt: '2026-10-31T12:01:00.000Z', retryNotBefore: '2026-10-31T12:01:00.000Z' });
  });

  it('keeps a Retry-After cooldown through foreground and network-back signals, and clears it after the next attempt', async () => {
    let change!: (state: 'active' | 'background') => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, handler) => { change = handler as typeof change; return { remove: jest.fn() }; });
    const { box, send, storage } = outbox();
    send.mockRejectedValueOnce(new BoloApiError('Slow down', { kind: 'http', status: 429, retryAfterMs: 60 * 60 * 1000 }));
    send.mockRejectedValueOnce(networkError());
    const stop = box.start();
    const limited = await box.enqueue(report);
    const ordinary = await box.enqueue({ ...report, payload: { ...report.payload, message: 'Another reply', messageId: 'asha-2' } });
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    // Neither an unrelated successful request nor a foreground event retries the rate-limited report early;
    // the ordinary network failure is pulled forward to now and delivered.
    signalNetworkAvailable();
    await flush();
    change('background');
    change('active');
    await flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[2]?.[0].id).toBe(ordinary.id);
    expect(box.getEntries().map((entry) => entry.id)).toEqual([limited.id]);
    expect(box.getEntries()[0]).toMatchObject({ attempts: 1, nextAttemptAt: '2026-10-31T13:00:00.000Z' });
    expect(stored(storage)[0]).toMatchObject({ retryNotBefore: '2026-10-31T13:00:00.000Z' });
    jest.setSystemTime(new Date('2026-10-31T13:00:00.000Z'));
    jest.advanceTimersByTime(60 * 60 * 1000);
    await flush();
    expect(send).toHaveBeenCalledTimes(4);
    expect(box.getEntries().some((entry) => entry.retryNotBefore)).toBe(false);
    stop();
  });

  it('honors the Retry-After of the first attempt that queued the report, across eager flushes and a restart', async () => {
    let change!: (state: 'active' | 'background') => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, handler) => { change = handler as typeof change; return { remove: jest.fn() }; });
    const { box, send, storage } = outbox();
    const stop = box.start();
    // The Asha screen's own attempt got a 429 with a one-hour Retry-After before it queued the report.
    const limited = await box.enqueue(report, { retryAfterMs: 60 * 60 * 1000 });
    await flush();
    expect(send).not.toHaveBeenCalled();
    expect(limited).toMatchObject({ attempts: 0, nextAttemptAt: '2026-10-31T13:00:00.000Z', retryNotBefore: '2026-10-31T13:00:00.000Z' });
    expect(stored(storage)[0]).toMatchObject({ nextAttemptAt: '2026-10-31T13:00:00.000Z', retryNotBefore: '2026-10-31T13:00:00.000Z' });
    // Neither a successful Bolo request nor a foreground event retries it early.
    signalNetworkAvailable();
    await flush();
    change('background');
    change('active');
    await flush();
    expect(send).not.toHaveBeenCalled();
    stop();
    // The cooldown survives a restart, and the report goes out once it has passed.
    const restarted = outbox([], { storage: () => storage });
    await restarted.box.load();
    await flush();
    expect(restarted.send).not.toHaveBeenCalled();
    jest.setSystemTime(new Date('2026-10-31T13:00:00.000Z'));
    await restarted.box.flush();
    expect(restarted.send).toHaveBeenCalledTimes(1);
    expect(restarted.send.mock.calls[0]?.[0].id).toBe(limited.id);
    expect(restarted.box.getEntries()).toEqual([]);
  });

  it('reads Retry-After only from the typed API error', () => {
    expect(outboxRetryAfterMs(new BoloApiError('Slow down', { kind: 'http', status: 429, retryAfterMs: 60_000 }))).toBe(60_000);
    expect(outboxRetryAfterMs(new BoloApiError('Slow down', { kind: 'http', status: 429 }))).toBeUndefined();
    expect(outboxRetryAfterMs(Object.assign(new Error('Slow down'), { retryAfterMs: 60_000 }))).toBeUndefined();
  });

  it('fails an entry past the age cap before sending it, even when it was loaded earlier', async () => {
    const aging: OutboxEntry = { ...report, id: 'aging', createdAt: new Date(Date.now() - MAX_OUTBOX_AGE_MS + 60_000).toISOString(), attempts: 1, nextAttemptAt: new Date(Date.now() + 86_400_000).toISOString(), state: 'pending' };
    const { box, send, storage } = outbox([aging]);
    await box.load();
    jest.setSystemTime(new Date(Date.now() + 86_400_000));
    await box.flush();
    expect(send).not.toHaveBeenCalled();
    expect(box.getEntries()[0]).toMatchObject({ id: 'aging', state: 'failed', lastError: OUTBOX_GAVE_UP_MESSAGE });
    expect(stored(storage)[0]).toMatchObject({ state: 'failed' });
  });

  it('puts an entry back to pending when the app backgrounds while it is being marked in flight', async () => {
    let change!: (state: 'active' | 'background') => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, handler) => { change = handler as typeof change; return { remove: jest.fn() }; });
    const { box, send, storage } = outbox();
    const stop = box.start();
    let finishMark!: () => void;
    // Only the write that marks the entry in flight is held open.
    storage.setItem.mockImplementation((key: string, value: string) => new Promise<void>((resolve) => {
      const done = () => {
        storage.store.set(key, value);
        resolve();
      };
      if (value.includes('in_flight') && !finishMark) finishMark = done;
      else done();
    }));
    const queued = await box.enqueue(report);
    await flush();
    expect(stored(storage)[0]).toMatchObject({ id: queued.id, state: 'pending' });
    expect(finishMark).toBeDefined();
    change('background');
    finishMark();
    await flush();
    expect(send).not.toHaveBeenCalled();
    expect(box.getEntries()[0]).toMatchObject({ id: queued.id, state: 'pending' });
    expect(stored(storage)[0]).toMatchObject({ state: 'pending' });
    change('active');
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(box.getEntries()).toEqual([]);
    stop();
  });

  it('rejects enqueue when the queue could not be written, keeping nothing in memory', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { box, send, storage } = outbox();
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(box.enqueue(report)).rejects.toThrow('disk full');
    await flush();
    expect(box.getEntries()).toEqual([]);
    expect(stored(storage)).toEqual([]);
    expect(send).not.toHaveBeenCalled();
    // The serialized writer still works afterwards.
    await box.enqueue(report);
    expect(stored(storage)).toHaveLength(1);
    warning.mockRestore();
  });

  it('reports delivery explicitly, not when an entry is discarded or cleared', async () => {
    const { box, send } = outbox();
    const delivered = jest.fn();
    const unsubscribe = box.subscribeDelivered(delivered);
    send.mockRejectedValueOnce(new BoloApiError('Bad request', { kind: 'http', status: 400 }));
    const failing = await box.enqueue(report);
    await flush();
    await box.discard(failing.id);
    await box.enqueue({ ...report, payload: { ...report.payload, messageId: 'asha-2' } });
    await box.clear();
    expect(delivered).not.toHaveBeenCalled();
    const sent = await box.enqueue({ ...report, payload: { ...report.payload, messageId: 'asha-3' } });
    await flush();
    expect(delivered).toHaveBeenCalledTimes(1);
    expect(delivered.mock.calls[0]?.[0]).toMatchObject({ id: sent.id, payload: { messageId: 'asha-3' } });
    unsubscribe();
    await box.enqueue(report);
    await flush();
    expect(delivered).toHaveBeenCalledTimes(1);
  });

  it('marks a permanent failure as failed without retrying', async () => {
    const { box, send } = outbox();
    send.mockRejectedValueOnce(new BoloApiError('Bad request', { kind: 'http', status: 400 }));
    await box.enqueue(report);
    await flush();
    expect(box.getEntries()[0]).toMatchObject({ state: 'failed', attempts: 1, lastError: OUTBOX_REJECTED_MESSAGE });
    await box.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('gives up on an entry that crosses the age cap while its attempt fails', async () => {
    const old: OutboxEntry = { ...report, id: 'old', createdAt: new Date(Date.now() - MAX_OUTBOX_AGE_MS + 60_000).toISOString(), attempts: 1, nextAttemptAt: new Date(Date.now()).toISOString(), state: 'pending' };
    const { box, send } = outbox([old]);
    await box.load();
    send.mockImplementation(async () => {
      jest.setSystemTime(new Date(Date.now() + 120_000));
      throw new BoloApiError('Service unavailable', { kind: 'http', status: 503 });
    });
    await box.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(box.getEntries()[0]).toMatchObject({ state: 'failed', lastError: OUTBOX_GAVE_UP_MESSAGE });
  });

  it('runs one flush at a time and marks the entry in flight while sending', async () => {
    const { box, send, storage } = outbox();
    let finishSend!: () => void;
    send.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSend = resolve; }));
    await box.enqueue(report);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(stored(storage)[0]).toMatchObject({ state: 'in_flight' });
    const second = box.flush();
    const third = box.flush();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    finishSend();
    await Promise.all([second, third]);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(box.getEntries()).toEqual([]);
  });

  it('puts an entry left in flight by a killed app back in the queue at load', async () => {
    const { box, send } = outbox([{ ...report, id: 'interrupted', createdAt: new Date().toISOString(), attempts: 1, nextAttemptAt: new Date(Date.now() + 60_000).toISOString(), state: 'in_flight' }]);
    expect((await box.load())[0]).toMatchObject({ id: 'interrupted', state: 'pending' });
    jest.advanceTimersByTime(60_000);
    await box.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not send while consent is withdrawn and flushes once it returns', async () => {
    const { box, send } = outbox();
    box.setContext({ clientId: 'client-12345678', enabled: false });
    await box.enqueue(report);
    await flush();
    expect(send).not.toHaveBeenCalled();
    box.setContext({ clientId: 'client-12345678', enabled: true });
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('lets the learner retry or discard a failed entry', async () => {
    const { box, send } = outbox();
    send.mockRejectedValueOnce(new BoloApiError('Bad request', { kind: 'http', status: 400 })).mockRejectedValueOnce(new BoloApiError('Bad request', { kind: 'http', status: 400 }));
    const first = await box.enqueue(report);
    const second = await box.enqueue({ ...report, payload: { ...report.payload, messageId: 'asha-2' } });
    await flush();
    expect(box.getEntries().map((entry) => entry.state)).toEqual(['failed', 'failed']);
    await box.retry(first.id);
    await flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect(box.getEntries().map((entry) => entry.id)).toEqual([second.id]);
    await box.discard(second.id);
    expect(box.getEntries()).toEqual([]);
  });

  it('flushes when the app returns to the foreground or any Bolo request succeeds', async () => {
    let change!: (state: 'active' | 'background') => void;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, handler) => { change = handler as typeof change; return { remove }; });
    const { box, send } = outbox();
    send.mockRejectedValueOnce(networkError());
    const stop = box.start();
    await box.enqueue(report);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    change('background');
    jest.advanceTimersByTime(OUTBOX_MAX_DELAY_MS);
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    change('active');
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(box.getEntries()).toEqual([]);

    send.mockRejectedValueOnce(networkError());
    await box.enqueue(report);
    await flush();
    expect(send).toHaveBeenCalledTimes(3);
    signalNetworkAvailable();
    await flush();
    expect(send).toHaveBeenCalledTimes(4);
    expect(box.getEntries()).toEqual([]);
    stop();
    expect(remove).toHaveBeenCalled();
    await box.enqueue(report);
    signalNetworkAvailable();
    await flush();
    expect(send).toHaveBeenCalledTimes(5);
  });

  describe('clearing on deletion or consent withdrawal', () => {
    it('aborts the send in flight, forgets the queue before any await, and never sends the next report under a rotated client id', async () => {
      const { box, send, storage } = outbox();
      let settleFirst!: (error?: Error) => void;
      let firstSignal!: AbortSignal;
      send.mockImplementationOnce((_entry, signal) => new Promise<void>((resolve, reject) => {
        firstSignal = signal;
        settleFirst = (error) => (error ? reject(error) : resolve());
      }));
      const first = await box.enqueue(report);
      await box.enqueue({ ...report, payload: { ...report.payload, message: 'Second', messageId: 'asha-2' } });
      await flush();
      expect(send).toHaveBeenCalledTimes(1);
      expect(stored(storage)).toHaveLength(2);

      const clearing = box.clear();
      expect(box.getEntries()).toEqual([]);
      expect(firstSignal.aborted).toBe(true);
      // Delete Bolo data rotates the client id while the old request is still unsettled.
      box.setContext({ clientId: 'client-new-87654321', enabled: true });
      settleFirst(new BoloApiError('The request was canceled.', { kind: 'aborted' }));
      await clearing;
      await flush();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0].id).toBe(first.id);
      expect(box.getEntries()).toEqual([]);
      expect(storage.store.has(SYNC_OUTBOX_KEY)).toBe(false);
      // A late success for the aborted request cannot restore the entry either.
      await box.flush();
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('drops pending, in-flight, and failed reports on withdrawal, and re-granting consent sends none of them', async () => {
      const { box, send, storage } = outbox();
      let finishSend!: () => void;
      send
        .mockRejectedValueOnce(new BoloApiError('Bad request', { kind: 'http', status: 400 }))
        .mockImplementationOnce(() => new Promise<void>((resolve) => { finishSend = resolve; }));
      await box.enqueue({ ...report, payload: { ...report.payload, messageId: 'failed-one' } });
      await flush();
      await box.enqueue({ ...report, payload: { ...report.payload, messageId: 'in-flight' } });
      await flush();
      box.setContext({ clientId: 'client-12345678', enabled: false });
      await box.enqueue({ ...report, payload: { ...report.payload, messageId: 'pending-one' } });
      await flush();
      expect(box.getEntries().map((entry) => entry.state)).toEqual(['failed', 'in_flight', 'pending']);

      await box.clear();
      finishSend();
      await flush();
      expect(box.getEntries()).toEqual([]);
      expect(storage.store.has(SYNC_OUTBOX_KEY)).toBe(false);
      box.setContext({ clientId: 'client-12345678', enabled: true });
      await flush();
      jest.advanceTimersByTime(OUTBOX_MAX_DELAY_MS);
      await flush();
      expect(send).toHaveBeenCalledTimes(2);
      expect((await box.load())).toEqual([]);
    });

    it('keeps flushing and enqueueing blocked until a failed removal succeeds, then resumes', async () => {
      const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { box, send, storage } = outbox();
      send.mockRejectedValueOnce(networkError());
      await box.enqueue(report);
      await flush();
      storage.removeItem.mockRejectedValueOnce(new Error('disk busy'));
      await expect(box.clear()).rejects.toThrow('disk busy');
      await expect(box.enqueue(report)).rejects.toThrow(OUTBOX_CLEARED_MESSAGE);
      await flush();
      jest.advanceTimersByTime(OUTBOX_MAX_DELAY_MS);
      await flush();
      expect(send).toHaveBeenCalledTimes(1);
      expect(box.getEntries()).toEqual([]);
      await box.clear();
      expect(box.getEntries()).toEqual([]);
      await box.enqueue(report);
      await flush();
      expect(send).toHaveBeenCalledTimes(2);
      warning.mockRestore();
    });

    it('finishes a removal that failed before the app closed, sending nothing stored until it succeeds', async () => {
      const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { box, send, storage } = outbox();
      send.mockRejectedValueOnce(networkError());
      await box.enqueue(report);
      await flush();
      storage.removeItem.mockRejectedValueOnce(new Error('disk busy'));
      await expect(box.clear()).rejects.toThrow('disk busy');
      // The queue is still on disk while the consent withdrawal itself may have been saved.
      expect(stored(storage)).toHaveLength(1);
      expect(storage.store.has(SYNC_OUTBOX_CLEARING_KEY)).toBe(true);

      // Restart: the removal fails again, so nothing stored is loaded, sent, or added to.
      storage.removeItem.mockRejectedValueOnce(new Error('disk busy'));
      const first = outbox([], { storage: () => storage });
      await first.box.load();
      await flush();
      jest.advanceTimersByTime(OUTBOX_MAX_DELAY_MS);
      await flush();
      expect(first.send).not.toHaveBeenCalled();
      expect(first.box.getEntries()).toEqual([]);
      await expect(first.box.enqueue(report)).rejects.toThrow(OUTBOX_CLEARED_MESSAGE);
      expect(stored(storage)).toHaveLength(1);
      // Opening Settings again retries the removal; once it succeeds, only new reports send.
      await first.box.clear();
      expect(storage.store.has(SYNC_OUTBOX_KEY)).toBe(false);
      expect(storage.store.has(SYNC_OUTBOX_CLEARING_KEY)).toBe(false);
      await first.box.enqueue(report);
      await flush();
      expect(first.send).toHaveBeenCalledTimes(1);
      expect(first.send.mock.calls[0]?.[0].payload.message).toBe('A reply');

      // Restart with the removal still pending but storage working: it completes at load, before any send.
      storage.store.set(SYNC_OUTBOX_KEY, JSON.stringify([{ ...report, id: 'withdrawn', createdAt: new Date().toISOString(), attempts: 0, nextAttemptAt: new Date().toISOString(), state: 'pending' }]));
      storage.store.set(SYNC_OUTBOX_CLEARING_KEY, '1');
      const second = outbox([], { storage: () => storage });
      await second.box.load();
      await flush();
      expect(second.send).not.toHaveBeenCalled();
      expect(storage.store.has(SYNC_OUTBOX_KEY)).toBe(false);
      expect(storage.store.has(SYNC_OUTBOX_CLEARING_KEY)).toBe(false);
      await second.box.enqueue(report);
      await flush();
      expect(second.send).toHaveBeenCalledTimes(1);
      warning.mockRestore();
    });

    it('never recreates a report whose first attempt began before the clear, even when hydration resolves later', async () => {
      const storage = memoryStorage();
      let finishRead!: () => void;
      storage.getItem.mockImplementationOnce(() => new Promise<string | null>((resolve) => { finishRead = () => resolve(null); }));
      const send = jest.fn(async (): Promise<void> => undefined);
      const box = createSyncOutbox({ storage: () => storage, send, random: () => 1 });
      box.setContext({ clientId: 'client-12345678', enabled: true });
      // The report's first attempt captured this before it failed offline.
      const token = box.generation();
      const queued = box.enqueue(report, { generation: token });
      const clearing = box.clear();
      finishRead();
      await expect(queued).rejects.toThrow(OUTBOX_CLEARED_MESSAGE);
      await clearing;
      await flush();
      expect(box.getEntries()).toEqual([]);
      expect(storage.store.has(SYNC_OUTBOX_KEY)).toBe(false);
      expect(send).not.toHaveBeenCalled();
      // A failure that only settles after consent withdrawal cannot enqueue either.
      await expect(box.enqueue(report, { generation: token })).rejects.toThrow(OUTBOX_CLEARED_MESSAGE);
      expect(box.getEntries()).toEqual([]);
      // A report whose attempt began after the clear is queued normally.
      await box.enqueue(report, { generation: box.generation() });
      await flush();
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  it('notifies subscribers when entries change', async () => {
    const { box } = outbox();
    const listener = jest.fn();
    const unsubscribe = box.subscribe(listener);
    await box.enqueue(report);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    const calls = listener.mock.calls.length;
    await flush();
    expect(listener.mock.calls.length).toBe(calls);
    const noop = onNetworkAvailable(() => undefined);
    noop();
  });
});

describe('the app outbox send contract', () => {
  it('sends only the client id, message, and reason: no entry id, session id, or row id', async () => {
    jest.resetModules();
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: { getItem: jest.fn(async () => null), removeItem: jest.fn(async () => undefined), setItem: jest.fn(async () => undefined) },
    }));
    const reportMock = jest.fn(async () => ({ reported: true as const }));
    jest.doMock('@/services/bolo-api', () => ({ ...jest.requireActual('@/services/bolo-api'), reportGeneratedMessage: reportMock }));
    const { syncOutbox: appOutbox } = require('../src/lib/sync-outbox') as typeof import('../src/lib/sync-outbox');
    appOutbox.setContext({ clientId: 'client-12345678', enabled: true });
    await appOutbox.enqueue(report);
    await flush();
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock.mock.calls[0]).toEqual([{ clientId: 'client-12345678', message: 'A reply', reason: 'incorrect_or_misleading' }, expect.any(AbortSignal)]);
    jest.dontMock('@/services/bolo-api');
    jest.dontMock('@react-native-async-storage/async-storage');
  });
});
