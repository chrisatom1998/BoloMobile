/**
 * Shared helpers for the non-multiple-choice lesson practice modes.
 *
 * The runtime picks a mode from three options — the original three-way multiple
 * choice, a word-order reconstruction, and a recall-then-reveal self-grade.
 * These helpers keep the tokenization and deterministic-shuffle rules in one
 * place so both the components and the tests agree on what the learner sees.
 */

/**
 * Split a target Hindi phrase into the tap-order tokens learners rebuild.
 *
 * Whitespace is the only separator; a token keeps any trailing Devanagari
 * danda, English punctuation, or ellipsis attached (so `हूँ।` stays whole and
 * `नाम` inside `मेरा नाम ... है।` shows up on its own). The result preserves
 * the source order.
 */
export function wordOrderTokens(phrase: string): string[] {
  return phrase
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * A word-order beat is only meaningful when the target sentence has at least
 * two whitespace tokens — placing a single tile into an empty tray is not a
 * practice. Callers use this to fall back to the multiple-choice renderer for
 * one-word targets like `नमस्ते।`.
 */
export function isWordOrderPracticeable(phrase: string): boolean {
  return wordOrderTokens(phrase).length >= 2;
}

/**
 * Fisher–Yates shuffle seeded by the target phrase so the same beat always
 * renders its tiles in the same order between sessions. Determinism keeps
 * resume, test snapshots, and analytics stable, and it protects the learner
 * from a "lucky" pre-solved arrangement by guaranteeing the tokens land in a
 * different order from the target when possible.
 */
export function deterministicallyShuffle<T>(items: readonly T[], seed: string): T[] {
  const array = [...items];
  if (array.length < 2) return array;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash ^ seed.charCodeAt(i)) * 16777619;
    hash >>>= 0;
  }
  const next = () => {
    // xorshift32 keeps the sequence stable across platforms.
    hash ^= hash << 13; hash >>>= 0;
    hash ^= hash >>> 17;
    hash ^= hash << 5; hash >>>= 0;
    return hash / 0xffffffff;
  };
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const swap = array[i]!;
    array[i] = array[j]!;
    array[j] = swap;
  }
  const identical = array.every((value, index) => value === items[index]);
  if (identical) {
    // Swap the first two so the learner never opens onto the pre-solved order.
    const swap = array[0]!;
    array[0] = array[1]!;
    array[1] = swap;
  }
  return array;
}
