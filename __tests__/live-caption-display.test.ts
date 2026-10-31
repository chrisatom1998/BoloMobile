import { liveCaptionLines } from '../src/lib/live-caption-display';

describe('live caption script display', () => {
  const spoken = 'नमस्ते Chris, आप कैसे हैं?';

  it('shows Devanagari with one romanization beneath it for the default setting', () => {
    expect(liveCaptionLines(spoken, 'both')).toEqual({ devanagari: spoken, romanized: 'Namaste Chris, aap kaise hain?' });
  });

  it('shows the script alone for Devanagari-only learners', () => {
    expect(liveCaptionLines(spoken, 'devanagari')).toEqual({ devanagari: spoken });
  });

  it('never shows a Devanagari character for Latin-only learners', () => {
    const lines = liveCaptionLines(spoken, 'latin');
    expect(lines).toEqual({ romanized: 'Namaste Chris, aap kaise hain?' });
    expect(JSON.stringify(lines)).not.toMatch(/[ऀ-ॿ]/u);
  });

  it('keeps a line without Devanagari as spoken under every setting', () => {
    for (const scriptPreference of ['both', 'devanagari', 'latin'] as const) {
      expect(liveCaptionLines('Hello there.', scriptPreference)).toEqual({ romanized: 'Hello there.' });
    }
  });

  it('uses the same known-phrase spellings as the chat rows', () => {
    expect(liveCaptionLines('पानी, कृपया।', 'latin').romanized).toBe('Paani, kripya.');
  });

  it('returns nothing for blank text', () => {
    expect(liveCaptionLines('   ', 'both')).toEqual({});
  });
});
