import { displayHindiTranscript, type LegacyTranscriptDisplay } from '@/lib/learner-phrase-display';
import { knownHindiDisplayPhrase } from '@/lib/known-hindi-phrases';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';

const DEVANAGARI_CHARACTER = /[\u0900-\u097f]/u;

type SourceSegment = {
  displayText: string;
  sourceEnd: number;
  sourceStart: number;
};

function nextSourceSegment(sourceText: string, start: number): SourceSegment {
  const firstCodePoint = sourceText.codePointAt(start);
  if (firstCodePoint === undefined) return { displayText: '', sourceEnd: start, sourceStart: start };

  const firstCharacter = String.fromCodePoint(firstCodePoint);
  if (!DEVANAGARI_CHARACTER.test(firstCharacter)) {
    const sourceEnd = start + firstCharacter.length;
    return { displayText: firstCharacter, sourceEnd, sourceStart: start };
  }

  let sourceEnd = start + firstCharacter.length;
  while (sourceEnd < sourceText.length) {
    const codePoint = sourceText.codePointAt(sourceEnd);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    if (!DEVANAGARI_CHARACTER.test(character)) break;
    sourceEnd += character.length;
  }
  const source = sourceText.slice(start, sourceEnd);
  return { displayText: romanizeDevanagari(source), sourceEnd, sourceStart: start };
}

/**
 * Maps a selection made in the learner-facing Romanized transcript back to
 * its original source text. A partly selected Hindi word expands to the whole
 * source word, which avoids saving a broken Devanagari syllable.
 */
export function sourceTextForDisplayedSelection(input: {
  displayText: string;
  end: number;
  sourceText: string;
  start: number;
}) {
  const { displayText, sourceText } = input;
  const start = Math.max(0, Math.min(input.start, displayText.length));
  const end = Math.max(start, Math.min(input.end, displayText.length));
  if (end <= start) return '';
  if (sourceText === displayText) return displayText.slice(start, end).trim();

  const known = knownHindiDisplayPhrase(sourceText);
  if (known && displayText === displayHindiTranscript(sourceText)) {
    const originalSource = /[\u0900-\u097f]/u.test(sourceText) ? sourceText : known.hi;
    if (start === 0 && end === displayText.length) return originalSource.trim();
    const sourceWords = Array.from(originalSource.matchAll(/[\u0900-\u0963\u0971-\u097f]+/gu));
    const displayWords = Array.from(displayText.matchAll(/[A-Za-z]+/gu));
    if (sourceWords.length === displayWords.length) {
      const selected = displayWords.flatMap((word, index) => start < word.index + word[0].length && end > word.index ? [index] : []);
      if (selected.length) {
        const firstIndex = selected[0]!;
        const lastIndex = selected[selected.length - 1]!;
        const first = sourceWords[firstIndex]!;
        const last = sourceWords[lastIndex]!;
        // Include selected punctuation from the original source, never the dictionary.
        const sourceStart = start < displayWords[firstIndex]!.index ? (sourceWords[firstIndex - 1] ? sourceWords[firstIndex - 1]!.index + sourceWords[firstIndex - 1]![0].length : 0) : first.index;
        const sourceEnd = end > displayWords[lastIndex]!.index + displayWords[lastIndex]![0].length ? (sourceWords[lastIndex + 1]?.index ?? originalSource.length) : last.index + last[0].length;
        return originalSource.slice(sourceStart, sourceEnd).trim();
      }
    }
  }

  let displayOffset = 0;
  let sourceOffset = 0;
  let selectedSourceStart: number | undefined;
  let selectedSourceEnd: number | undefined;

  while (sourceOffset < sourceText.length) {
    const segment = nextSourceSegment(sourceText, sourceOffset);
    const displayEnd = displayOffset + segment.displayText.length;
    if (start < displayEnd && end > displayOffset) {
      selectedSourceStart = selectedSourceStart === undefined ? segment.sourceStart : selectedSourceStart;
      selectedSourceEnd = segment.sourceEnd;
    }
    displayOffset = displayEnd;
    sourceOffset = segment.sourceEnd;
  }

  if (selectedSourceStart === undefined || selectedSourceEnd === undefined) return displayText.slice(start, end).trim();
  return sourceText.slice(selectedSourceStart, selectedSourceEnd).trim();
}

const HINDI_WORD_CHARACTER = /[ऀ-ॣ०-९ॱ-ॿ]/u;

function expandToHindiWords(devanagari: string, start: number, end: number) {
  let from = Math.max(0, Math.min(start, devanagari.length));
  let to = Math.max(from, Math.min(end, devanagari.length));
  while (from > 0 && HINDI_WORD_CHARACTER.test(devanagari[from - 1]!) && HINDI_WORD_CHARACTER.test(devanagari[from] ?? '')) from -= 1;
  while (to < devanagari.length && HINDI_WORD_CHARACTER.test(devanagari[to]!) && HINDI_WORD_CHARACTER.test(devanagari[to - 1] ?? '')) to += 1;
  return { from, to };
}

/** Maps a selection inside a romanized run back to the Devanagari words it covers, or the whole run. */
function hindiRangeForRomanizedSelection(devanagari: string, romanized: string, start: number, end: number) {
  const hindiWords = Array.from(devanagari.matchAll(/[ऀ-ॣ०-९ॱ-ॿ]+/gu));
  const latinWords = Array.from(romanized.matchAll(/[A-Za-z]+/gu));
  if (hindiWords.length !== latinWords.length || !hindiWords.length) return { from: 0, to: devanagari.length };
  const selected = latinWords.flatMap((word, index) => start < word.index + word[0].length && end > word.index ? [index] : []);
  if (!selected.length) return { from: 0, to: devanagari.length };
  const first = hindiWords[selected[0]!]!;
  const last = hindiWords[selected[selected.length - 1]!]!;
  return { from: first.index, to: last.index + last[0].length };
}

/**
 * Maps a selection made in a per-script legacy rendering (see
 * `legacyTranscriptDisplay`) back to the message's selection source. Prose maps
 * one-to-one; a selection touching a Hindi run (its Devanagari or its single
 * romanization) resolves to whole Devanagari words so a saved phrase never
 * holds a broken syllable.
 */
export function sourceTextForLegacySelection(display: LegacyTranscriptDisplay, input: { end: number; start: number }) {
  const { displayText, segments, selectionSource, spans } = display;
  const start = Math.max(0, Math.min(input.start, displayText.length));
  const end = Math.max(start, Math.min(input.end, displayText.length));
  if (end <= start) return '';
  if (!display.hasDevanagari) return sourceTextForDisplayedSelection({ displayText, end, sourceText: selectionSource, start });

  let offset = 0;
  let sourceStart: number | undefined;
  let sourceEnd: number | undefined;
  for (const span of spans) {
    const spanStart = offset;
    const spanEnd = offset + span.text.length;
    offset = spanEnd;
    if (start >= spanEnd || end <= spanStart) continue;
    const segment = segments[span.segment];
    if (!segment) continue;
    const localStart = Math.max(start, spanStart) - spanStart;
    const localEnd = Math.min(end, spanEnd) - spanStart;
    let range: { from: number; to: number };
    if (segment.kind === 'text') {
      range = { from: localStart, to: localEnd };
    } else if (span.script === 'devanagari') {
      range = expandToHindiWords(segment.devanagari, localStart, localEnd);
    } else {
      // The span is the romanization, possibly wrapped as " (…)".
      const prefix = span.text.indexOf(segment.romanized);
      const romanizedStart = prefix >= 0 ? prefix : 0;
      range = hindiRangeForRomanizedSelection(segment.devanagari, segment.romanized, localStart - romanizedStart, localEnd - romanizedStart);
    }
    const from = segment.sourceStart + range.from;
    const to = segment.sourceStart + range.to;
    sourceStart = sourceStart === undefined ? from : Math.min(sourceStart, from);
    sourceEnd = sourceEnd === undefined ? to : Math.max(sourceEnd, to);
  }
  if (sourceStart === undefined || sourceEnd === undefined || sourceEnd <= sourceStart) return displayText.slice(start, end).trim();
  return selectionSource.slice(sourceStart, sourceEnd).trim();
}
