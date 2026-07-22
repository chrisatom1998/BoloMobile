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
