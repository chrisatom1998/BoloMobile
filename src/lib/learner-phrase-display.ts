import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { knownHindiDisplayPhrase } from '@/lib/known-hindi-phrases';

/** Normalize only complete authoritative phrases; retain unknown learner spelling. */
export function learnerPhraseLatin(hindi: string, latin: string) {
  const known = knownHindiDisplayPhrase(hindi);
  const latinMatch = knownHindiDisplayPhrase(latin);
  if (!known || !latinMatch || known.hi !== latinMatch.hi) return latin;
  return preferredWordsInOriginalText(latin, knownPhraseLatin(known.hi, known.latin));
}

function knownPhraseLatin(hindi: string, latin: string) {
  const sourceWords = hindi.match(/[\u0900-\u0963\u0971-\u097f]+/gu) ?? [];
  const latinWords = latin.match(/[A-Za-z]+/gu) ?? [];
  if (sourceWords.length !== latinWords.length) return latin;
  let index = 0;
  return latin.replace(/[A-Za-z]+/gu, (word) => {
    const sourceWord = sourceWords[index++];
    const spelling = sourceWord === 'पानी' ? 'paani' : sourceWord === 'कृपया' ? 'kripya' : undefined;
    if (!spelling) return word;
    return /^[A-Z]/u.test(word) ? spelling[0]!.toUpperCase() + spelling.slice(1) : spelling;
  });
}

/** No guessing or network calls: unknown Latin and English prose pass through. */
export function displayHindiTranscript(text: string, normalizeKnown = true) {
  const known = normalizeKnown || /[\u0900-\u097f]/u.test(text) ? knownHindiDisplayPhrase(text) : undefined;
  return known ? preferredWordsInOriginalText(text, knownPhraseLatin(known.hi, known.latin)) : /[\u0900-\u097f]/u.test(text) ? romanizeDevanagari(text) : text;
}

export function canonicalTranscriptSource(text: string, normalizeKnown = true) {
  if (/[\u0900-\u097f]/u.test(text)) return text;
  return (normalizeKnown ? knownHindiDisplayPhrase(text)?.hi : undefined) ?? text;
}

/** Keep visible spellings paired with canonical word identities for lookup. */
export function alignedHindiWordLabels(hindi: string, latin: string) {
  const sourceWords = hindi.match(/[\u0900-\u0963\u0971-\u097f]+/gu) ?? [];
  const latinWords = latin.match(/[A-Za-z]+/gu) ?? [];
  const labels = new Map<string, string>();
  if (sourceWords.length !== latinWords.length) return labels;
  sourceWords.forEach((word, index) => { if (!labels.has(word)) labels.set(word, latinWords[index]!); });
  return labels;
}


/** Replace aligned spellings, retaining the message's punctuation and spacing. */
function preferredWordsInOriginalText(text: string, preferred: string) {
  const sourceWord = /[\u0900-\u0963\u0971-\u097f]+|[A-Za-z]+/gu;
  const originalWords = text.match(sourceWord) ?? [];
  const preferredWords = preferred.match(/[A-Za-z]+/gu) ?? [];
  if (originalWords.length !== preferredWords.length) return romanizeDevanagari(text);
  let index = 0;
  return romanizeDevanagari(text.replace(sourceWord, () => preferredWords[index++]!));
}
