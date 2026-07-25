// Realtime bookkeeping keeps several insertion-ordered caches of recent ids so a
// late duplicate event can still be recognized without growing without bound.
export const BOUNDED_ID_LIMIT = 24;

function trimOldestKeys(
  entries: { size: number; keys(): IterableIterator<string>; delete(key: string): boolean },
  limit: number,
) {
  while (entries.size > limit) {
    const oldest = entries.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/**
 * Records an id in an insertion-ordered bounded set. Re-adding a known id keeps
 * its original position so the oldest ids are still evicted first.
 */
export function rememberBoundedId(items: Set<string>, id: string | null, limit = BOUNDED_ID_LIMIT) {
  if (!id) return;
  items.add(id);
  trimOldestKeys(items, limit);
}

/**
 * Records a value in a bounded least-recently-used map, refreshing the position
 * of a key that is written again.
 */
export function rememberBoundedEntry<Value>(
  entries: Map<string, Value>,
  key: string,
  value: Value,
  limit = BOUNDED_ID_LIMIT,
) {
  entries.delete(key);
  entries.set(key, value);
  trimOldestKeys(entries, limit);
}
