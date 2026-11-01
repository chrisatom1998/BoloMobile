import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { knownHindiDisplayPhrase } from '@/lib/known-hindi-phrases';
import type { ScriptPreference } from '@/state/app-state-types';

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

/** Devanagari letters, marks and digits; danda and abbreviation sign are treated as punctuation. */
const HINDI_RUN = /[ऀ-ॣ०-९ॱ-ॿ]+(?:[ \t,;:'"’\-–…]+[ऀ-ॣ०-९ॱ-ॿ]+)*/gu;
const HINDI_WORD = /[ऀ-ॣ०-९ॱ-ॿ]+/gu;
const LATIN_WORD = /[A-Za-z]+/gu;
const DEVANAGARI_ANY = /[ऀ-ॿ]/u;
/** Common alternative spellings folded onto our romanizer's letters before comparing words. */
const LETTER_EQUIVALENTS: Record<string, string> = { w: 'v', z: 'j', f: 'p', q: 'k', c: 'k' };
/** Most a transliteration may differ from our romanization, as a share of the longer word. */
const MAX_SPELLING_DISTANCE = 0.4;
/** Sentence punctuation the model may put between a Hindi run and its transliteration. */
const PUNCTUATION_BEFORE_TRANSLITERATION = /^[।॥.!?,;:]*/u;

export type TranscriptSegment =
  | { kind: 'text'; text: string; sourceStart: number; sourceEnd: number }
  | {
    kind: 'hindi';
    devanagari: string;
    /** The single romanization shown for this run: the model's own when it supplied one, otherwise derived. */
    romanized: string;
    romanizedByModel: boolean;
    sourceStart: number;
    sourceEnd: number;
  };

export type TranscriptSpan = {
  text: string;
  script: 'latin' | 'devanagari';
  /** Index into `segments`. */
  segment: number;
};

export type LegacyTranscriptDisplay = {
  /** Original text minus the model's transliteration parentheticals; selection offsets map into it. */
  selectionSource: string;
  segments: TranscriptSegment[];
  /** Visible runs in reading order; Devanagari spans take the Tiro face and hi-IN. */
  spans: TranscriptSpan[];
  /** Concatenation of `spans` (what a selection's offsets refer to). */
  displayText: string;
  /** The 'latin' rendering: a screen reader gets one pronounceable romanization per Hindi run. */
  accessibleText: string;
  hasDevanagari: boolean;
};

function foldSpelling(word: string) {
  return [...word.toLowerCase()].map((letter) => LETTER_EQUIVALENTS[letter] ?? letter).join('');
}

function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_value, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** True when `candidate` reads as another spelling of our romanization, not an English word. */
function similarSpelling(expected: string, candidate: string) {
  const a = foldSpelling(expected);
  const b = foldSpelling(candidate);
  if (!a || !b) return false;
  return editDistance(a, b) / Math.max(a.length, b.length) <= MAX_SPELLING_DISTANCE;
}

/**
 * A parenthetical directly after a Hindi run (optionally after sentence
 * punctuation such as a danda) is treated as the model's own transliteration
 * only when it reads like one: Latin letters only, the same number of words,
 * and spelled close to our romanization. An English gloss such as "(less)" or
 * "(my name)" stays prose.
 */
function modelTransliteration(run: string, derived: string, following: string) {
  const punctuation = PUNCTUATION_BEFORE_TRANSLITERATION.exec(following)?.[0] ?? '';
  const match = /^(\s*)\(([^()]*)\)/u.exec(following.slice(punctuation.length));
  if (!match) return null;
  const inner = match[2] ?? '';
  if (!/[A-Za-z]/u.test(inner) || DEVANAGARI_ANY.test(inner)) return null;
  const hindiWords = run.match(HINDI_WORD) ?? [];
  const latinWords = inner.match(LATIN_WORD) ?? [];
  const derivedWords = derived.match(LATIN_WORD) ?? [];
  if (!hindiWords.length || latinWords.length !== hindiWords.length) return null;
  if (derivedWords.length === latinWords.length) {
    const matches = latinWords.filter((word, index) => similarSpelling(derivedWords[index]!, word)).length;
    // Short glosses must match word for word; one stray word in a long phrase is tolerated.
    const needed = latinWords.length <= 3 ? latinWords.length : Math.ceil(latinWords.length * 0.8);
    if (matches < needed) return null;
  } else if (!similarSpelling(derivedWords.join(''), latinWords.join(''))) {
    return null;
  }
  return { consumed: punctuation.length + match[0].length, punctuation, romanized: inner.trim() };
}

function atSentenceStart(preceding: string) {
  return /(?:^|[.!?।॥\n]\s*)$/u.test(preceding);
}

/** Derived romanization with inline casing: capitalized only at a sentence start or for a proper name. */
function derivedRomanization(run: string, preceding: string, normalizeKnown: boolean) {
  const romanized = displayHindiTranscript(run, normalizeKnown);
  if (atSentenceStart(preceding)) return romanized;
  // "x " keeps the romanizer from treating the run as a sentence start, so a
  // proper name (Asha) stays capitalized while ordinary words stay lowercase.
  const inline = romanizeDevanagari(`x ${run}`).slice(2);
  if (/^[A-Z]/u.test(inline)) return romanized;
  return romanized.charAt(0).toLowerCase() + romanized.slice(1);
}

/** Splits a legacy transcript string into prose and Hindi runs, folding in the model's transliterations. */
export function segmentTranscript(text: string, normalizeKnown = true): { segments: TranscriptSegment[]; selectionSource: string } {
  if (!DEVANAGARI_ANY.test(text)) {
    return { segments: [{ kind: 'text', text, sourceStart: 0, sourceEnd: text.length }], selectionSource: text };
  }
  const segments: TranscriptSegment[] = [];
  let selectionSource = '';
  let cursor = 0;
  const pushText = (value: string) => {
    if (!value) return;
    segments.push({ kind: 'text', text: value, sourceStart: selectionSource.length, sourceEnd: selectionSource.length + value.length });
    selectionSource += value;
  };
  HINDI_RUN.lastIndex = 0;
  for (const match of text.matchAll(HINDI_RUN)) {
    const run = match[0];
    const index = match.index;
    pushText(text.slice(cursor, index));
    const preceding = text.slice(0, index);
    const derived = derivedRomanization(run, preceding, normalizeKnown);
    const following = text.slice(index + run.length);
    const model = modelTransliteration(run, derived, following);
    segments.push({
      kind: 'hindi',
      devanagari: run,
      romanized: model?.romanized ?? derived,
      romanizedByModel: Boolean(model),
      sourceStart: selectionSource.length,
      sourceEnd: selectionSource.length + run.length,
    });
    selectionSource += run;
    // Punctuation between the run and its transliteration stays in the prose.
    if (model?.punctuation) pushText(model.punctuation);
    cursor = index + run.length + (model?.consumed ?? 0);
  }
  pushText(text.slice(cursor));
  return { segments, selectionSource };
}

function latinizeProse(value: string) {
  return value.replace(/[।॥॰]/gu, '.');
}

/**
 * Renders a legacy string per the learner's script preference. 'both' shows each
 * Hindi run in Devanagari followed by exactly one romanization in parentheses;
 * 'devanagari' shows the script alone; 'latin' shows only the romanization and
 * never a Devanagari character.
 */
export function legacyTranscriptDisplay(text: string, options: { normalizeKnown?: boolean; scriptPreference: ScriptPreference }): LegacyTranscriptDisplay {
  const normalizeKnown = options.normalizeKnown ?? true;
  const { segments, selectionSource } = segmentTranscript(text, normalizeKnown);
  const hasDevanagari = segments.some((segment) => segment.kind === 'hindi');
  if (!hasDevanagari) {
    const displayText = displayHindiTranscript(text, normalizeKnown);
    return {
      selectionSource: canonicalTranscriptSource(text, normalizeKnown),
      segments,
      spans: [{ text: displayText, script: 'latin', segment: 0 }],
      displayText,
      accessibleText: displayText,
      hasDevanagari: false,
    };
  }
  const render = (scriptPreference: ScriptPreference) => {
    const spans: TranscriptSpan[] = [];
    segments.forEach((segment, index) => {
      if (segment.kind === 'text') {
        spans.push({ text: scriptPreference === 'latin' ? latinizeProse(segment.text) : segment.text, script: 'latin', segment: index });
        return;
      }
      if (scriptPreference === 'latin') {
        spans.push({ text: segment.romanized, script: 'latin', segment: index });
        return;
      }
      spans.push({ text: segment.devanagari, script: 'devanagari', segment: index });
      if (scriptPreference === 'both') spans.push({ text: ` (${segment.romanized})`, script: 'latin', segment: index });
    });
    return spans;
  };
  const spans = render(options.scriptPreference);
  return {
    selectionSource,
    segments,
    spans,
    displayText: spans.map((span) => span.text).join(''),
    accessibleText: render('latin').map((span) => span.text).join(''),
    hasDevanagari: true,
  };
}
