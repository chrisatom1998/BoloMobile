import {
  ASHA_SESSION_INDEX_KEY,
  ASHA_SESSION_KEY_PREFIX,
  ASHA_SESSION_RETENTION_DAYS,
  ashaSessionDurationMs,
  ashaSessionIdForRow,
  ashaSessionIndexEntries,
  ashaSessionKey,
  ashaSessionStateFor,
  clearAshaSessionContent,
  connectAshaSession,
  createAshaSessionRecord,
  finishAshaSession,
  isAshaSessionKey,
  isAshaSessionStorable,
  latestAshaSession,
  MAX_ASHA_SESSION_BYTES,
  MAX_ASHA_SESSION_ROWS,
  MAX_ASHA_SESSIONS,
  mergeAshaSessionRows,
  pruneAshaSessions,
  recordAshaSessionTool,
  recoverActiveAshaSession,
  sanitizeAshaSession,
  sanitizeAshaSessionIndex,
  type AshaSessionRecord,
} from '../src/lib/asha-session-log';
import { MAX_CHAT_MESSAGE_CHARACTERS } from '../src/lib/storage';

const startedAt = '2026-10-31T10:00:00.000Z';

function started(overrides: Partial<Parameters<typeof createAshaSessionRecord>[0]> = {}) {
  return createAshaSessionRecord({ id: 'session-1', startedAt, responseLanguage: 'en', mode: 'beginner', lessonId: 'chai', ...overrides });
}

function row(id: string, speaker: 'you' | 'asha', text: string, startMs = 0, endMs = startMs + 100) {
  return { id, speaker, text, startMs, endMs, fragments: [] };
}

/** Rows as the live transcript store emits them: ids `live-<n>`, newest 100 only. */
function window(count: number, from = 0, text = (index: number) => `turn ${index}`) {
  return Array.from({ length: count }, (_, offset) => {
    const index = from + offset;
    return row(`live-${index}`, index % 2 ? 'asha' : 'you', text(index), index * 1_000);
  });
}

describe('Asha session log records', () => {
  it('creates an active record with its setup and no rows, which is not yet worth storing', () => {
    const record = started();
    expect(record).toEqual({
      schema: 1,
      id: 'session-1',
      startedAt,
      state: 'active',
      responseLanguage: 'en',
      mode: 'beginner',
      lessonId: 'chai',
      rows: [],
      learnerTurns: 0,
      savedPhrases: [],
      lessonsPracticed: [],
    });
    expect(isAshaSessionStorable(record)).toBe(false);
    expect(isAshaSessionStorable(mergeAshaSessionRows(record, [row('live-0', 'you', 'Namaste')]))).toBe(true);
  });

  it('records the connection time and server session id on an active record only', () => {
    const connected = connectAshaSession(started(), { connectedAt: '2026-10-31T10:00:03.000Z', serverSessionId: 'srv-1' });
    expect(connected).toMatchObject({ connectedAt: '2026-10-31T10:00:03.000Z', serverSessionId: 'srv-1', state: 'active' });
    const ended = finishAshaSession(mergeAshaSessionRows(connected, [row('live-0', 'you', 'Hi')]), { endedAt: '2026-10-31T10:05:00.000Z', endReason: 'user_ended' })!;
    expect(connectAshaSession(ended, { connectedAt: '2026-10-31T12:00:00.000Z' })).toBe(ended);
  });

  it('stores final transcript text without fragments and counts learner turns', () => {
    const record = mergeAshaSessionRows(started(), [
      row('live-0', 'you', 'Namaste', 0, 400),
      row('live-1', 'asha', 'Namaste! Kaise ho?', 300, 1200),
      row('live-2', 'you', '   ', 1300),
      row('live-3', 'you', 'Theek hoon', 1400, 1900),
    ]);
    expect(record.rows).toEqual([
      { id: 'live-0', speaker: 'you', text: 'Namaste', startMs: 0, endMs: 400 },
      { id: 'live-1', speaker: 'asha', text: 'Namaste! Kaise ho?', startMs: 300, endMs: 1200 },
      { id: 'live-3', speaker: 'you', text: 'Theek hoon', startMs: 1400, endMs: 1900 },
    ]);
    expect(record.learnerTurns).toBe(2);
  });

  it('revises existing rows by id without duplicating them', () => {
    const first = mergeAshaSessionRows(started(), [row('live-0', 'you', 'I')]);
    const second = mergeAshaSessionRows(first, [row('live-0', 'you', 'I speak Hindi'), row('live-1', 'asha', 'Yes?')]);
    expect(second.rows.map((entry) => entry.text)).toEqual(['I speak Hindi', 'Yes?']);
    expect(mergeAshaSessionRows(second, [row('live-0', 'you', 'I speak Hindi'), row('live-1', 'asha', 'Yes?')])).toBe(second);
  });

  it('keeps early turns that slid out of the 100-row snapshot window across more than 100 rows', () => {
    let record = started();
    // Deliver 160 rows as the live store does: every snapshot is the newest 100 rows.
    for (let count = 1; count <= 160; count += 1) {
      record = mergeAshaSessionRows(record, window(Math.min(100, count), Math.max(0, count - 100)));
    }
    expect(record.rows).toHaveLength(160);
    expect(record.rows[0]).toMatchObject({ id: 'live-0', text: 'turn 0' });
    expect(record.rows.at(-1)).toMatchObject({ id: 'live-159', text: 'turn 159' });
    // A late revision inside the window updates in place; rows outside the window are untouched.
    const revised = mergeAshaSessionRows(record, window(100, 60, (index) => (index === 120 ? 'turn 120, revised' : `turn ${index}`)));
    expect(revised.rows).toHaveLength(160);
    expect(revised.rows.find((entry) => entry.id === 'live-120')?.text).toBe('turn 120, revised');
    expect(revised.rows.find((entry) => entry.id === 'live-5')?.text).toBe('turn 5');
    expect(new Set(revised.rows.map((entry) => entry.id)).size).toBe(160);
  });

  it('drops a row the live store merged into an earlier one so its text is not kept twice', () => {
    const record = mergeAshaSessionRows(started(), [row('live-0', 'asha', 'Hello', 0, 500), row('live-1', 'asha', 'there', 600, 900)]);
    const merged = mergeAshaSessionRows(record, [row('live-0', 'asha', 'Hello there', 0, 900)]);
    expect(merged.rows).toEqual([{ id: 'live-0', speaker: 'asha', text: 'Hello there', startMs: 0, endMs: 900 }]);
  });

  it('caps rows after merging and bounds each row text', () => {
    let record = started();
    for (let count = 1; count <= MAX_ASHA_SESSION_ROWS + 40; count += 1) {
      record = mergeAshaSessionRows(record, window(Math.min(100, count), Math.max(0, count - 100)));
    }
    expect(record.rows).toHaveLength(MAX_ASHA_SESSION_ROWS);
    expect(record.rows[0]!.id).toBe('live-40');
    const long = mergeAshaSessionRows(started(), [row('live-long', 'asha', 'x'.repeat(MAX_CHAT_MESSAGE_CHARACTERS + 50), 99_999)]);
    expect(long.rows[0]!.text).toHaveLength(MAX_CHAT_MESSAGE_CHARACTERS);
  });

  it('drops the oldest rows when a record would exceed the byte cap', () => {
    const rows = Array.from({ length: 150 }, (_, index) => row(`live-${index}`, 'asha', 'य'.repeat(1_000), index * 10));
    const record = mergeAshaSessionRows(started(), rows);
    expect(new TextEncoder().encode(JSON.stringify(record)).byteLength).toBeLessThanOrEqual(MAX_ASHA_SESSION_BYTES);
    expect(record.rows.at(-1)!.id).toBe('live-149');
    expect(record.rows.length).toBeLessThan(150);
  });

  it('ignores snapshots and tool outcomes once a record is finished', () => {
    const ended = finishAshaSession(mergeAshaSessionRows(started(), [row('live-0', 'you', 'Hi')]), { endedAt: '2026-10-31T10:05:00.000Z', endReason: 'user_ended' })!;
    expect(mergeAshaSessionRows(ended, [row('live-9', 'you', 'late')])).toBe(ended);
    expect(recordAshaSessionTool(ended, { savedPhrase: 'नमस्ते' })).toBe(ended);
    expect(finishAshaSession(ended, { endedAt: '2026-10-31T10:06:00.000Z', endReason: 'connection_lost' })).toBe(ended);
  });

  it('records unique saved phrases and practiced lessons from tools', () => {
    let record = recordAshaSessionTool(started(), { savedPhrase: 'नमस्ते' });
    record = recordAshaSessionTool(record, { savedPhrase: 'नमस्ते' });
    record = recordAshaSessionTool(record, { savedPhrase: 'धन्यवाद', lessonId: 'chai' });
    record = recordAshaSessionTool(record, { lessonId: 'chai' });
    expect(record).toMatchObject({ savedPhrases: ['नमस्ते', 'धन्यवाद'], lessonsPracticed: ['chai'] });
  });

  it.each([
    ['user_ended', 'ended'],
    ['config_changed', 'interrupted'],
    ['connection_lost', 'interrupted'],
    ['backgrounded', 'interrupted'],
    ['start_failed', 'interrupted'],
    ['app_terminated', 'interrupted'],
  ] as const)('finishes a session with rows that ended by %s as %s', (endReason, state) => {
    expect(ashaSessionStateFor(endReason)).toBe(state);
    const connected = mergeAshaSessionRows(connectAshaSession(started(), { connectedAt: '2026-10-31T10:00:02.000Z' }), [row('live-0', 'asha', 'Hello')]);
    const finished = finishAshaSession(connected, { endedAt: '2026-10-31T10:04:00.000Z', endReason });
    expect(finished).toMatchObject({ state, endReason, endedAt: '2026-10-31T10:04:00.000Z' });
  });

  it('discards empty attempts: connecting, failed start, and ready-then-dropped without a row', () => {
    const at = '2026-10-31T10:00:09.000Z';
    expect(finishAshaSession(started(), { endedAt: at, endReason: 'start_failed' })).toBeNull();
    expect(finishAshaSession(started(), { endedAt: at, endReason: 'user_ended' })).toBeNull();
    const ready = connectAshaSession(started(), { connectedAt: '2026-10-31T10:00:02.000Z', serverSessionId: 'srv-1' });
    expect(finishAshaSession(ready, { endedAt: at, endReason: 'connection_lost' })).toBeNull();
    expect(finishAshaSession(ready, { endedAt: at, endReason: 'backgrounded' })).toBeNull();
    expect(recoverActiveAshaSession(ready)).toBeNull();
  });

  it('never keeps a session that Delete Bolo data ended, even with rows', () => {
    const withRows = mergeAshaSessionRows(started(), [row('live-0', 'you', 'Namaste')]);
    expect(finishAshaSession(withRows, { endedAt: '2026-10-31T10:04:00.000Z', endReason: 'data_deleted' })).toBeNull();
  });

  it('marks a record left active by a killed app as interrupted at its last caption', () => {
    const withRows = mergeAshaSessionRows(started(), [row('live-0', 'you', 'Namaste', 0, 400), row('live-1', 'asha', 'Hello', 500, 2_500)]);
    const recovered = recoverActiveAshaSession(withRows)!;
    expect(recovered).toMatchObject({ state: 'interrupted', endReason: 'app_terminated', endedAt: '2026-10-31T10:00:02.500Z' });
    expect(recoverActiveAshaSession(recovered)).toBe(recovered);
  });

  it('clears learner text and tool content but keeps metadata, marking when it was cleared', () => {
    const connected = connectAshaSession(started(), { connectedAt: '2026-10-31T10:00:02.000Z' });
    const finished = finishAshaSession(recordAshaSessionTool(mergeAshaSessionRows(connected, [row('live-0', 'you', 'Namaste')]), { savedPhrase: 'नमस्ते', lessonId: 'chai' }), { endedAt: '2026-10-31T10:04:00.000Z', endReason: 'user_ended' })!;
    const cleared = clearAshaSessionContent(finished, '2026-10-31T11:00:00.000Z');
    expect(cleared).toEqual({
      ...finished,
      rows: [],
      savedPhrases: [],
      lessonsPracticed: [],
      contentClearedAt: '2026-10-31T11:00:00.000Z',
    });
    expect(cleared.learnerTurns).toBe(1);
    expect(isAshaSessionStorable(cleared)).toBe(true);
    expect(clearAshaSessionContent(cleared, '2026-10-31T12:00:00.000Z')).toBe(cleared);
  });

  it('keeps the newest sessions inside the retention window and shows only the latest', () => {
    const now = new Date('2026-10-31T12:00:00.000Z');
    const staleAt = new Date(now.getTime() - (ASHA_SESSION_RETENTION_DAYS + 1) * 86_400_000).toISOString();
    const make = (id: string, at: string) => finishAshaSession(mergeAshaSessionRows(connectAshaSession(started({ id, startedAt: at }), { connectedAt: at }), [row('live-0', 'you', 'Hi')]), { endedAt: at, endReason: 'user_ended' })!;
    const sessions: AshaSessionRecord[] = [make('stale', staleAt)];
    for (let index = 0; index < MAX_ASHA_SESSIONS + 1; index += 1) {
      sessions.push(make(`s-${index}`, new Date(now.getTime() - (MAX_ASHA_SESSIONS + 1 - index) * 60_000).toISOString()));
    }
    const pruned = pruneAshaSessions(sessions, now);
    expect(MAX_ASHA_SESSIONS).toBe(3);
    expect(pruned.map((session) => session.id)).toEqual(['s-1', 's-2', 's-3']);
    expect(latestAshaSession(pruned)?.id).toBe('s-3');
    // Ordering follows start time, not insertion order.
    expect(latestAshaSession([pruned[2]!, pruned[0]!, pruned[1]!])?.id).toBe('s-3');
    expect(latestAshaSession([])).toBeNull();
    expect(ashaSessionIndexEntries([pruned[2]!, pruned[0]!])).toEqual([{ id: 's-1', startedAt: pruned[0]!.startedAt }, { id: 's-3', startedAt: pruned[2]!.startedAt }]);
  });

  it('finds the session that holds a live row, for associating a report locally', () => {
    const first = mergeAshaSessionRows(started({ id: 'a' }), [row('live-1-0', 'asha', 'Hello')]);
    const second = mergeAshaSessionRows(started({ id: 'b', startedAt: '2026-10-31T11:00:00.000Z' }), [row('live-2-0', 'asha', 'Hi')]);
    expect(ashaSessionIdForRow([first, second], 'live-2-0')).toBe('b');
    expect(ashaSessionIdForRow([first, second], 'asha-123')).toBeUndefined();
  });

  it('reports a duration from the end time, the last caption, or nothing', () => {
    const connected = connectAshaSession(started(), { connectedAt: '2026-10-31T10:00:02.000Z' });
    expect(ashaSessionDurationMs(finishAshaSession(mergeAshaSessionRows(connected, [row('live-0', 'you', 'Hi')]), { endedAt: '2026-10-31T10:03:00.000Z', endReason: 'user_ended' })!)).toBe(180_000);
    expect(ashaSessionDurationMs(mergeAshaSessionRows(connected, [row('live-0', 'you', 'Hi', 100, 4_100)]))).toBe(4_100);
    expect(ashaSessionDurationMs(connected)).toBeNull();
  });

  it('names per-session keys under one prefix', () => {
    expect(ashaSessionKey('abc')).toBe(`${ASHA_SESSION_KEY_PREFIX}abc`);
    expect(isAshaSessionKey(ashaSessionKey('abc'))).toBe(true);
    expect(isAshaSessionKey(ASHA_SESSION_KEY_PREFIX)).toBe(false);
    expect(isAshaSessionKey(ASHA_SESSION_INDEX_KEY)).toBe(false);
  });
});

describe('Asha session log sanitizers', () => {
  const valid: AshaSessionRecord = {
    schema: 1,
    id: 'session-1',
    serverSessionId: 'srv-1',
    startedAt: '2026-10-31T10:00:00.000Z',
    connectedAt: '2026-10-31T10:00:02.000Z',
    endedAt: '2026-10-31T10:04:00.000Z',
    state: 'ended',
    endReason: 'user_ended',
    responseLanguage: 'hi',
    mode: 'beginner',
    lessonId: 'chai',
    rows: [{ id: 'live-0', speaker: 'you', text: 'Namaste', startMs: 0, endMs: 400 }],
    learnerTurns: 1,
    savedPhrases: ['नमस्ते'],
    lessonsPracticed: ['chai'],
  };

  it('returns nothing for missing or unreadable storage', () => {
    expect(sanitizeAshaSession(null)).toBeNull();
    expect(sanitizeAshaSession('nope')).toBeNull();
    expect(sanitizeAshaSession('[]')).toBeNull();
  });

  it('round-trips a valid record, including a cleared one, and drops malformed ones', () => {
    expect(sanitizeAshaSession(JSON.stringify(valid))).toEqual(valid);
    const cleared = { ...valid, rows: [], savedPhrases: [], lessonsPracticed: [], contentClearedAt: '2026-10-31T11:00:00.000Z' };
    expect(sanitizeAshaSession(JSON.stringify(cleared))).toEqual(cleared);
    const malformed = [
      { ...valid, schema: 2 },
      { ...valid, id: '' },
      { ...valid, state: 'queued' },
      { ...valid, responseLanguage: 'fr' },
      { ...valid, startedAt: 'yesterday' },
      { ...valid, rows: [{ id: 'x', speaker: 'mira', text: 'Hi', startMs: 0, endMs: 1 }] },
      { ...valid, endReason: 'lost' },
      { ...valid, mode: 'karaoke' },
      { ...valid, contentClearedAt: 'later' },
    ];
    for (const record of malformed) expect(sanitizeAshaSession(JSON.stringify(record))).toBeNull();
  });

  it('bounds row text, tool lists, counters, and drops oversized records', () => {
    const noisy = {
      ...valid,
      rows: [{ id: 'live-0', speaker: 'asha', text: `  ${'x'.repeat(MAX_CHAT_MESSAGE_CHARACTERS + 10)}  `, startMs: -5, endMs: 10 }],
      learnerTurns: -3,
      savedPhrases: Array.from({ length: 60 }, (_, index) => `phrase ${index}`),
      lessonsPracticed: ['chai', 'chai', 7],
    };
    const record = sanitizeAshaSession(JSON.stringify(noisy))!;
    expect(record).toMatchObject({ learnerTurns: 0, lessonsPracticed: ['chai'] });
    expect(record.rows[0]).toMatchObject({ startMs: 0, endMs: 10 });
    expect(record.rows[0]!.text).toHaveLength(MAX_CHAT_MESSAGE_CHARACTERS);
    expect(record.savedPhrases.length).toBeLessThan(60);
    const oversized = {
      ...valid,
      rows: Array.from({ length: MAX_ASHA_SESSION_ROWS }, (_, index) => ({ id: `live-${index}`, speaker: 'asha', text: 'y'.repeat(MAX_CHAT_MESSAGE_CHARACTERS), startMs: index, endMs: index + 1 })),
    };
    expect(sanitizeAshaSession(JSON.stringify(oversized))).toBeNull();
  });

  it('validates the index, ordering entries by start time and dropping duplicates and junk', () => {
    const entries = [
      { id: 'b', startedAt: '2026-10-31T11:00:00.000Z' },
      { id: 'a', startedAt: '2026-10-31T10:00:00.000Z' },
      { id: 'a', startedAt: '2026-10-31T12:00:00.000Z' },
      { id: '', startedAt: '2026-10-31T10:00:00.000Z' },
      { id: 'c', startedAt: 'soon' },
      'junk',
    ];
    expect(sanitizeAshaSessionIndex(JSON.stringify(entries))).toEqual([
      { id: 'a', startedAt: '2026-10-31T10:00:00.000Z' },
      { id: 'b', startedAt: '2026-10-31T11:00:00.000Z' },
    ]);
    expect(sanitizeAshaSessionIndex(JSON.stringify({ entries: entries.slice(0, 1) }))).toEqual([entries[0]]);
    expect(sanitizeAshaSessionIndex(null)).toEqual([]);
    expect(sanitizeAshaSessionIndex('{')).toEqual([]);
  });
});
