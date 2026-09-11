import { createLiveTranscriptStore } from '../src/lib/live-transcripts';
import { observeLivePlayback } from '../src/lib/live-playback';
import { waitForLiveIceGathering } from '../src/lib/live-ice';

describe('Live transcript display groups', () => {
  it('revises older rows without moving them behind overlapping speakers', () => {
    const store = createLiveTranscriptStore('test');
    const first = store.append('you', { delta: 'I', start_ms: 100, end_ms: 200 })!;
    store.append('asha', { delta: 'Yes?', start_ms: 150, end_ms: 400 });
    const update = store.append('you', { delta: ' speak Hindi', start_ms: 200, end_ms: 600 })!;
    expect(update.rows.map((row) => row.speaker)).toEqual(['you', 'asha']);
    expect(update.row.id).toBe(first.row.id);
    expect(update.row.text).toBe('I speak Hindi');
    expect(update.row.fragments).toHaveLength(2);
  });

  it('merges provisional groups when a late bridging fragment arrives', () => {
    const store = createLiveTranscriptStore('test');
    const first = store.append('you', { delta: 'First', start_ms: 0, end_ms: 100 })!;
    store.append('you', { delta: ' third', start_ms: 2000, end_ms: 2100 });
    const update = store.append('you', { delta: ' second', start_ms: 1000, end_ms: 1100 })!;
    expect(update.rows).toHaveLength(1);
    expect(update.row.id).toBe(first.row.id);
    expect(update.row.text).toBe('First second third');
  });

  it('retains repeated words, deduplicates events, and rejects invalid intervals', () => {
    const store = createLiveTranscriptStore('test');
    const fragment = { event_id: 'one', delta: ' very', start_ms: 0, end_ms: 100 };
    store.append('asha', fragment);
    expect(store.append('asha', fragment)).toBeNull();
    const update = store.append('asha', { ...fragment, event_id: 'two', start_ms: 100, end_ms: 200 })!;
    expect(update.row.text).toBe(' very very');
    expect(store.append('asha', { delta: 'bad', start_ms: -1, end_ms: 100 })).toBeNull();
    expect(store.append('asha', { delta: 'bad', start_ms: 100, end_ms: 1 })).toBeNull();
    expect(store.append('asha', { delta: 'bad', start_ms: NaN, end_ms: 1 })).toBeNull();
  });

  it('bounds retained groups during long sessions', () => {
    const store = createLiveTranscriptStore('test');
    let snapshot;
    for (let i = 0; i < 120; i++) snapshot = store.append('you', { delta: `word ${i}`, start_ms: i * 3000, end_ms: i * 3000 + 1 });
    expect(snapshot!.rows).toHaveLength(100);
    expect(snapshot!.rows[0]!.text).toBe('word 20');
  });
});

describe('Live media state', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it('waits for gathered ICE and cancels a pending gather', async () => {
    let state = 'gathering';
    const controller = new AbortController();
    let ready = false;
    const promise = waitForLiveIceGathering(() => state, controller.signal).then(() => { ready = true; });
    await jest.advanceTimersByTimeAsync(100);
    expect(ready).toBe(false);
    state = 'complete';
    await jest.advanceTimersByTimeAsync(50);
    await promise;
    expect(ready).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    const canceled = waitForLiveIceGathering(() => 'gathering', controller.signal).catch((error) => error);
    controller.abort();
    expect(await canceled).toEqual(expect.objectContaining({ message: 'The live voice connection was canceled.' }));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('derives output activity from received audio energy and stops polling on cleanup', async () => {
    const onChange = jest.fn();
    let level = 0;
    const getStats = jest.fn(async () => ({ forEach: (visit: (value: object) => void) => visit({ type: 'inbound-rtp', kind: 'audio', audioLevel: level }) }));
    const stop = observeLivePlayback(getStats, onChange);
    await jest.advanceTimersByTimeAsync(150);
    expect(onChange).not.toHaveBeenCalled();
    level = 0.1;
    await jest.advanceTimersByTimeAsync(150);
    expect(onChange).toHaveBeenLastCalledWith(true);
    level = 0;
    await jest.advanceTimersByTimeAsync(750);
    expect(onChange).toHaveBeenLastCalledWith(false);
    stop();
    const calls = getStats.mock.calls.length;
    await jest.advanceTimersByTimeAsync(1000);
    expect(getStats).toHaveBeenCalledTimes(calls);
    expect(jest.getTimerCount()).toBe(0);
  });
});
