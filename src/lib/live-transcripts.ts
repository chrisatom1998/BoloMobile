export type LiveTranscriptFragment = {
  delta: string;
  start_ms: number;
  end_ms: number;
  event_id?: string;
};
export type LiveTranscriptRow = {
  id: string;
  speaker: 'you' | 'asha';
  text: string;
  startMs: number;
  endMs: number;
  fragments: LiveTranscriptFragment[];
};

// A display grouping heuristic only. It never finishes a model turn, controls
// playback, or triggers a tool. Late fragments may expand or merge older rows.
const CAPTION_GROUP_GAP_MS = 1_200;
export function createLiveTranscriptStore(prefix: string) {
  const seen = new Set<string>();
  // Delivery order survives group merges without retaining evicted fragments.
  const arrivalOrder = new WeakMap<LiveTranscriptFragment, number>();
  let nextArrival = 0;
  let nextId = 0;
  let rows: LiveTranscriptRow[] = [];
  return {
    append(speaker: LiveTranscriptRow['speaker'], fragment: LiveTranscriptFragment) {
      if (!fragment.delta || !Number.isFinite(fragment.start_ms) || !Number.isFinite(fragment.end_ms)
        || fragment.start_ms < 0 || fragment.end_ms < fragment.start_ms) return null;
      const key = fragment.event_id ?? `${speaker}:${fragment.start_ms}:${fragment.end_ms}:${fragment.delta}`;
      if (seen.has(key)) return null;
      seen.add(key);
      if (seen.size > 8_000) seen.delete(seen.values().next().value!);
      const matching = rows.filter((row) => row.speaker === speaker && row.fragments.length < 200
        && fragment.start_ms <= row.endMs + CAPTION_GROUP_GAP_MS
        && fragment.end_ms >= row.startMs - CAPTION_GROUP_GAP_MS);
      const first = matching[0];
      const incoming = { ...fragment };
      arrivalOrder.set(incoming, nextArrival++);
      // Timestamps only group captions; Live deltas accumulate in delivery order.
      const fragments = [...matching.flatMap((row) => row.fragments), incoming]
        .sort((a, b) => arrivalOrder.get(a)! - arrivalOrder.get(b)!);
      const row: LiveTranscriptRow = {
        id: first?.id ?? `${prefix}-${nextId++}`,
        speaker,
        text: fragments.map((part) => part.delta).join(''),
        startMs: Math.min(...fragments.map((part) => part.start_ms)),
        endMs: Math.max(...fragments.map((part) => part.end_ms)),
        fragments,
      };
      // Existing row positions stay stable while overlapping speakers stream.
      rows = first
        ? rows.flatMap((existing) => existing.id === first.id ? [row] : matching.includes(existing) ? [] : [existing])
        : [...rows, row];
      rows = rows.slice(-100);
      return { row, rows: rows.map((entry) => ({ ...entry, fragments: entry.fragments.map((part) => ({ ...part })) })) };
    },
  };
}
