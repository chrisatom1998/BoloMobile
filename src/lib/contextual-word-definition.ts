export const MAX_WORD_DEFINITION_SOURCE_CHARACTERS = 6_000;

const HINDI_WORD = /[\u0900-\u0963\u0971-\u097f]+/gu;
const HINDI_PHRASE = /[\u0900-\u0963\u0971-\u097f]+(?:[\s\u0964\u0965,;:!?'"’\-–…]+[\u0900-\u0963\u0971-\u097f]+)*[\u0964\u0965]?/gu;

/** The selectable tray deliberately contains Devanagari only, never English words. */
export function hindiWordTokens(text: string) {
  const seen = new Set<string>();
  return (text.match(HINDI_WORD) ?? []).filter((word) => {
    if (seen.has(word)) return false;
    seen.add(word);
    return true;
  });
}

/**
 * Asha's visible transcript can be Romanized. Keep its original Devanagari
 * phrase for analysis so English prose never becomes a selectable token.
 */
export function hindiSourcePhrase(text: string) {
  const trimmed = text.trim();
  if (hindiWordTokens(trimmed).length && /^[\p{Script=Devanagari}\p{N}\p{P}\p{Z}\s]+$/u.test(trimmed)) return trimmed;
  return (trimmed.match(HINDI_PHRASE) ?? [])
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .join(' · ');
}

export function buildContextualWordDefinitionPrompt({ word }: { phrase: string; word: string }) {
  const selectedWord = word.trim().slice(0, 100);
  // The complete source is sent in context messages. Keep the instruction below
  // mobile-chat's 500-character limit so the selected word is never cut off.
  return [
    'Explain this selected Hindi word using the full source phrase in the preceding messages.',
    'Reply only with concise English in at most two short sentences. No labels, Markdown, quotes, or Hindi script.',
    `Selected Hindi word: ${JSON.stringify(selectedWord)}`,
    'Give its meaning and useful grammar or politeness in this phrase.',
  ].join(' ');
}
