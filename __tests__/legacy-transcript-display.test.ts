import { romanizeDevanagari } from '../src/lib/devanagari-romanization';
import { canonicalTranscriptSource, displayHindiTranscript, legacyTranscriptDisplay, segmentTranscript } from '../src/lib/learner-phrase-display';
import { sourceTextForDisplayedSelection, sourceTextForLegacySelection } from '../src/lib/transcript-selection';

const DEVANAGARI = /[ऀ-ॿ]/u;
const duplicated = 'You can say: चाय में चीनी कम डालिए (chaay mein cheeni kam daaliye).';
const longDevanagariReply = 'आप कैसे हैं? धन्यवाद, आशा। ज़रूर। आप कैसे हैं? धन्यवाद, आशा। ज़रूर।';

describe('legacyTranscriptDisplay', () => {
  it('keeps the model transliteration as the only romanization for "both" and never adds a derived one', () => {
    const display = legacyTranscriptDisplay(duplicated, { scriptPreference: 'both' });
    expect(display.displayText).toBe(duplicated);
    expect(display.displayText.match(/daal/gu)).toHaveLength(1);
    expect(display.displayText).not.toContain('daalie');
    // Prose, the Hindi run, its single romanization, then the sentence's own full stop.
    expect(display.spans.map((span) => span.script)).toEqual(['latin', 'devanagari', 'latin', 'latin']);
    expect(display.spans[1]).toMatchObject({ text: 'चाय में चीनी कम डालिए', script: 'devanagari' });
    expect(display.accessibleText).toBe('You can say: chaay mein cheeni kam daaliye.');
    expect(display.selectionSource).toBe('You can say: चाय में चीनी कम डालिए.');
  });

  it('shows one romanization and zero Devanagari for "latin"', () => {
    const display = legacyTranscriptDisplay(duplicated, { scriptPreference: 'latin' });
    expect(display.displayText).toBe('You can say: chaay mein cheeni kam daaliye.');
    expect(display.displayText).not.toMatch(DEVANAGARI);
    expect(display.spans.every((span) => span.script === 'latin')).toBe(true);
  });

  it('shows Devanagari without the parenthetical for "devanagari"', () => {
    const display = legacyTranscriptDisplay(duplicated, { scriptPreference: 'devanagari' });
    expect(display.displayText).toBe('You can say: चाय में चीनी कम डालिए.');
    expect(display.displayText).not.toMatch(/[A-Za-z]{2,}\)/u);
  });

  it('derives exactly one romanization when the model gave none, including loanword vowels such as ऑ', () => {
    const text = 'Try मुझे ऑटो चाहिए at the stand.';
    expect(legacyTranscriptDisplay(text, { scriptPreference: 'both' }).displayText).toBe('Try मुझे ऑटो चाहिए (mujhe oto chaahie) at the stand.');
    const latin = legacyTranscriptDisplay(text, { scriptPreference: 'latin' }).displayText;
    expect(latin).toBe('Try mujhe oto chaahie at the stand.');
    expect(latin).not.toMatch(DEVANAGARI);
    expect(legacyTranscriptDisplay('ऑटो वाले से पूछो।', { scriptPreference: 'latin' }).displayText).toBe('Oto vaale se poochho.');
    expect(legacyTranscriptDisplay('ऑटो वाले से पूछो।', { scriptPreference: 'devanagari' }).displayText).toBe('ऑटो वाले से पूछो।');
  });

  it('treats an English gloss in parentheses as prose, not as the romanization', () => {
    expect(legacyTranscriptDisplay('The word कम (less) softens it.', { scriptPreference: 'both' }).displayText).toBe('The word कम (kam) (less) softens it.');
    expect(legacyTranscriptDisplay('The word कम (less) softens it.', { scriptPreference: 'latin' }).displayText).toBe('The word kam (less) softens it.');
    // Same word count but unrelated sounds: still a gloss.
    expect(legacyTranscriptDisplay('Say धन्यवाद (thank you) often.', { scriptPreference: 'latin' }).displayText).toBe('Say dhanyavaad (thank you) often.');
    // Alternative spellings of the same sounds are accepted as the model's transliteration.
    expect(legacyTranscriptDisplay('Say वह आया (woh aaya).', { scriptPreference: 'latin' }).displayText).toBe('Say woh aaya.');
  });

  it('keeps an English gloss whose words share the Hindi initials as prose', () => {
    expect(legacyTranscriptDisplay('मेरा नाम (my name)', { scriptPreference: 'latin' }).displayText).toBe('Meraa naam (my name)');
    expect(legacyTranscriptDisplay('मेरा नाम (my name)', { scriptPreference: 'devanagari' }).displayText).toBe('मेरा नाम (my name)');
    expect(legacyTranscriptDisplay('The word नाम (name) is useful.', { scriptPreference: 'latin' }).displayText).toBe('The word naam (name) is useful.');
  });

  it('recognizes a transliteration placed after a danda and keeps the danda', () => {
    const text = 'मुझे पानी चाहिए। (mujhe paani chaahiye.)';
    expect(legacyTranscriptDisplay(text, { scriptPreference: 'devanagari' }).displayText).toBe('मुझे पानी चाहिए।');
    const both = legacyTranscriptDisplay(text, { scriptPreference: 'both' }).displayText;
    expect(both.match(/paani/gu)).toHaveLength(1);
    expect(legacyTranscriptDisplay(text, { scriptPreference: 'latin' }).displayText).not.toMatch(DEVANAGARI);
  });

  it('matches the previous whole-string romanization for a Hindi-mode reply in "latin"', () => {
    const display = legacyTranscriptDisplay(longDevanagariReply, { normalizeKnown: true, scriptPreference: 'latin' });
    expect(display.displayText).toBe(romanizeDevanagari(longDevanagariReply));
    expect(display.displayText).toBe('Aap kaise hain? Dhanyavaad, Asha. Zaroor. Aap kaise hain? Dhanyavaad, Asha. Zaroor.');
    expect(display.displayText).not.toMatch(DEVANAGARI);
  });

  it('keeps inline casing natural and proper names capitalized', () => {
    expect(legacyTranscriptDisplay('My coach is आशा and she says नमस्ते.', { scriptPreference: 'latin' }).displayText).toBe('My coach is Asha and she says namaste.');
  });

  it('leaves Latin-only text on the existing normalization path', () => {
    const display = legacyTranscriptDisplay('Cheeni kam, kripayaa.', { scriptPreference: 'both' });
    expect(display.hasDevanagari).toBe(false);
    expect(display.displayText).toBe(displayHindiTranscript('Cheeni kam, kripayaa.'));
    expect(display.displayText).toBe('Cheeni kam, kripya.');
    expect(display.selectionSource).toBe(canonicalTranscriptSource('Cheeni kam, kripayaa.'));
    expect(legacyTranscriptDisplay('My friend Paanee is visiting.', { normalizeKnown: false, scriptPreference: 'latin' }).displayText).toBe('My friend Paanee is visiting.');
  });

  it('segments prose and Hindi runs with source offsets into the deduplicated source', () => {
    const { segments, selectionSource } = segmentTranscript(duplicated);
    expect(segments.map((segment) => segment.kind)).toEqual(['text', 'hindi', 'text']);
    const hindi = segments[1];
    if (hindi?.kind !== 'hindi') throw new Error('expected a Hindi run');
    expect(hindi.romanizedByModel).toBe(true);
    expect(selectionSource.slice(hindi.sourceStart, hindi.sourceEnd)).toBe('चाय में चीनी कम डालिए');
  });
});

describe('sourceTextForLegacySelection', () => {
  it('maps a highlighted romanization in "both" back to the Devanagari words', () => {
    const display = legacyTranscriptDisplay(duplicated, { scriptPreference: 'both' });
    const start = display.displayText.indexOf('cheeni kam');
    expect(sourceTextForLegacySelection(display, { start, end: start + 'cheeni kam'.length })).toBe('चीनी कम');
    const whole = display.displayText.indexOf('(');
    expect(sourceTextForLegacySelection(display, { start: whole, end: display.displayText.indexOf(')') + 1 })).toBe('चाय में चीनी कम डालिए');
  });

  it('expands a partial Devanagari highlight to whole words and keeps prose one-to-one', () => {
    const display = legacyTranscriptDisplay(duplicated, { scriptPreference: 'devanagari' });
    const start = display.displayText.indexOf('चीनी') + 1;
    expect(sourceTextForLegacySelection(display, { start, end: start + 2 })).toBe('चीनी');
    expect(sourceTextForLegacySelection(display, { start: 0, end: 7 })).toBe('You can');
    expect(sourceTextForLegacySelection(display, { start: 4, end: display.displayText.length })).toBe('can say: चाय में चीनी कम डालिए.');
  });

  it('maps a "latin" sentence selection of a Hindi-mode reply to the original Devanagari sentence', () => {
    const display = legacyTranscriptDisplay(longDevanagariReply, { normalizeKnown: true, scriptPreference: 'latin' });
    expect(sourceTextForLegacySelection(display, { start: 0, end: 'Aap kaise hain?'.length })).toBe('आप कैसे हैं?');
    const second = display.displayText.indexOf('Dhanyavaad');
    expect(sourceTextForLegacySelection(display, { start: second, end: second + 'Dhanyavaad, Asha.'.length })).toBe('धन्यवाद, आशा।');
  });

  it('defers to the known-phrase mapping for Latin-only text', () => {
    const display = legacyTranscriptDisplay('Cheeni kam, kripayaa.', { scriptPreference: 'both' });
    const start = display.displayText.indexOf('kripya');
    expect(sourceTextForLegacySelection(display, { start, end: start + 6 })).toBe(sourceTextForDisplayedSelection({ displayText: display.displayText, end: start + 6, sourceText: display.selectionSource, start }));
    expect(sourceTextForLegacySelection(display, { start, end: start + 6 })).toBe('कृपया');
  });
});
