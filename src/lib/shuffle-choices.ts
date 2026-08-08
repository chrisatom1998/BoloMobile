export type ShuffleRng = () => number;

/**
 * Returns a shuffled copy while keeping each item's original array index.
 * Callers can display choices in a random order without losing the authored
 * index used for scoring and feedback.
 */
export type ShuffledChoice<T> = { sourceIndex: number; item: T };

export function shuffleChoices<T>(items: readonly T[], rng: ShuffleRng = Math.random): ShuffledChoice<T>[] {
  const result: ShuffledChoice<T>[] = items.map((item, sourceIndex) => ({ item, sourceIndex }));

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }

  return result;
}
