import { displayHindiTranscript, legacyTranscriptDisplay } from '../src/lib/learner-phrase-display';

const DEVANAGARI = /[ऀ-ॿ]/u;

/**
 * Asha chat used to render every bubble through `displayHindiTranscript`, which
 * always romanizes. A reply that contained Hindi then showed no Devanagari,
 * whatever the learner's script preference was.
 */
describe('missing Devanagari in Asha chat', () => {
  const reply = 'You can say नमस्ते?! to the host.';

  it('reproduces the old chat path: Devanagari is stripped and only the romanization remains', () => {
    const oldChatDisplay = displayHindiTranscript(reply);
    // The whole-string romanizer also treats "?!" as a sentence boundary, so the English after it is recapitalized.
    expect(oldChatDisplay).toBe('You can say namaste?! To the host.');
    expect(oldChatDisplay).not.toMatch(DEVANAGARI);
  });

  it('keeps Devanagari for both and devanagari, and romanizes once for latin', () => {
    expect(legacyTranscriptDisplay(reply, { scriptPreference: 'both' }).displayText).toBe('You can say नमस्ते (namaste)?! to the host.');
    expect(legacyTranscriptDisplay(reply, { scriptPreference: 'devanagari' }).displayText).toBe('You can say नमस्ते?! to the host.');
    const latin = legacyTranscriptDisplay(reply, { scriptPreference: 'latin' }).displayText;
    expect(latin).toBe('You can say namaste?! to the host.');
    expect(latin).not.toMatch(DEVANAGARI);
  });

  it('leaves unknown Romanized input, English prose, and punctuation unchanged', () => {
    const unknown = 'Kripayaa paanee dijiye.';
    const prose = 'Less sugar, please — really!';
    for (const scriptPreference of ['both', 'devanagari', 'latin'] as const) {
      expect(legacyTranscriptDisplay(unknown, { normalizeKnown: true, scriptPreference }).displayText).toBe(unknown);
      expect(legacyTranscriptDisplay(prose, { normalizeKnown: true, scriptPreference }).displayText).toBe(prose);
    }
    expect(legacyTranscriptDisplay('नमस्ते?!', { scriptPreference: 'devanagari' }).displayText).toBe('नमस्ते?!');
    expect(legacyTranscriptDisplay('नमस्ते?!', { scriptPreference: 'both' }).displayText).toBe('नमस्ते (Namaste)?!');
  });
});
