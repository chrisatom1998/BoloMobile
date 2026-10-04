import { displayHindiTranscript } from '@/lib/learner-phrase-display';
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
