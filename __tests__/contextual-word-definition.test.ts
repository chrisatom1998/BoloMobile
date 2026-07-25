import { buildContextualWordDefinitionPrompt, hindiSourcePhrase, hindiWordTokens } from '../src/lib/contextual-word-definition';

describe('contextual word definitions', () => {
  it('offers only unique Hindi words as selectable tokens', () => {
    expect(hindiWordTokens('You can say एक चाय दीजिए। (Ek chai dijiye.) and then धन्यवाद। एक')).toEqual([
      'एक',
      'चाय',
      'दीजिए',
      'धन्यवाद',
    ]);
  });

  it('keeps only the original Hindi source phrase for the tray and its romanization', () => {
    expect(hindiSourcePhrase('You can say एक चाय दीजिए। (Ek chai dijiye.)')).toBe('एक चाय दीजिए।');
  });

  it('bounds and quotes the phrase and selected Hindi word for an isolated explanation request', () => {
    const prompt = buildContextualWordDefinitionPrompt({
      phrase: `${'बहुत '.repeat(140)}लंबा`,
      word: 'लंबा',
    });

    expect(prompt).toContain('Reply only with concise English');
    expect(prompt).toContain('Selected Hindi word: "लंबा"');
    expect(prompt.length).toBeLessThanOrEqual(1_200);
  });
});
