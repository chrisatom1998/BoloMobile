import { BOUNDED_ID_LIMIT, rememberBoundedEntry, rememberBoundedId } from '../src/lib/bounded-set';

describe('bounded id set', () => {
  it('evicts the oldest ids once the limit is passed', () => {
    const items = new Set<string>();

    for (let index = 0; index < BOUNDED_ID_LIMIT + 6; index += 1) rememberBoundedId(items, `id-${index}`);

    expect(items.size).toBe(BOUNDED_ID_LIMIT);
    expect(items.has('id-0')).toBe(false);
    expect(items.has('id-5')).toBe(false);
    expect(items.has('id-6')).toBe(true);
    expect(items.has(`id-${BOUNDED_ID_LIMIT + 5}`)).toBe(true);
    expect([...items][0]).toBe('id-6');
  });

  it('keeps the original position of a re-remembered id so it is still evicted first', () => {
    const items = new Set<string>();
    for (let index = 0; index < BOUNDED_ID_LIMIT; index += 1) rememberBoundedId(items, `id-${index}`);

    rememberBoundedId(items, 'id-0');
    expect(items.size).toBe(BOUNDED_ID_LIMIT);

    rememberBoundedId(items, 'fresh');
    expect(items.has('id-0')).toBe(false);
    expect(items.has('fresh')).toBe(true);
  });

  it('ignores missing ids and honours a caller supplied limit', () => {
    const items = new Set<string>();

    rememberBoundedId(items, null);
    rememberBoundedId(items, '');
    expect(items.size).toBe(0);

    rememberBoundedId(items, 'a', 2);
    rememberBoundedId(items, 'b', 2);
    rememberBoundedId(items, 'c', 2);
    expect([...items]).toEqual(['b', 'c']);
  });
});

describe('bounded entry map', () => {
  it('evicts the oldest entries once the limit is passed', () => {
    const entries = new Map<string, number>();

    for (let index = 0; index < BOUNDED_ID_LIMIT + 6; index += 1) rememberBoundedEntry(entries, `key-${index}`, index);

    expect(entries.size).toBe(BOUNDED_ID_LIMIT);
    expect(entries.has('key-0')).toBe(false);
    expect(entries.has('key-5')).toBe(false);
    expect(entries.get('key-6')).toBe(6);
    expect(entries.get(`key-${BOUNDED_ID_LIMIT + 5}`)).toBe(BOUNDED_ID_LIMIT + 5);
    expect([...entries.keys()][0]).toBe('key-6');
  });

  it('refreshes a rewritten key so it survives the next eviction', () => {
    const entries = new Map<string, number>();
    for (let index = 0; index < BOUNDED_ID_LIMIT; index += 1) rememberBoundedEntry(entries, `key-${index}`, index);

    rememberBoundedEntry(entries, 'key-0', 100);
    expect(entries.size).toBe(BOUNDED_ID_LIMIT);
    expect(entries.get('key-0')).toBe(100);

    rememberBoundedEntry(entries, 'fresh', 1);
    expect(entries.get('key-0')).toBe(100);
    expect(entries.has('key-1')).toBe(false);
    expect(entries.get('fresh')).toBe(1);
  });

  it('honours a caller supplied limit', () => {
    const entries = new Map<string, string>();

    rememberBoundedEntry(entries, 'a', 'first', 2);
    rememberBoundedEntry(entries, 'b', 'second', 2);
    rememberBoundedEntry(entries, 'c', 'third', 2);

    expect([...entries.keys()]).toEqual(['b', 'c']);
  });
});
