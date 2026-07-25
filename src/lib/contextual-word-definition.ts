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
  return (text.match(HINDI_PHRASE) ?? [])
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .join(' · ')
    .slice(0, 500);
}

export function buildContextualWordDefinitionPrompt({ phrase, word }: { phrase: string; word: string }) {
  const sourcePhrase = hindiSourcePhrase(phrase) || phrase.trim().slice(0, 500);
  const selectedWord = word.trim().slice(0, 100);
  return [
    'Explain this selected Hindi word for a learner in the context of its quoted source phrase.',
    'Reply only with concise English in no more than two short sentences. Do not use labels, Markdown, quotation marks, or Hindi script.',
    `Source Hindi phrase: ${JSON.stringify(sourcePhrase)}`,
    `Selected Hindi word: ${JSON.stringify(selectedWord)}`,
    'Explain the natural meaning and any useful grammar or politeness nuance in this phrase, not a generic dictionary entry.',
  ].join(' ').slice(0, 1_200);
}
