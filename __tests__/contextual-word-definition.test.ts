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

it('preserves every pure Hindi sentence and its punctuation, including text beyond 500 characters', () => {
  const phrase = `नमस्ते! मैं ठीक हूँ। आप कैसे हैं? ${'आज हम अभ्यास करेंगे। '.repeat(30)}धन्यवाद!`;
  expect(hindiSourcePhrase(phrase)).toBe(phrase);
  expect(hindiWordTokens(hindiSourcePhrase(phrase))).toContain('धन्यवाद');
});

it('keeps the selected word in the instruction within the service input limit', () => {
  const prompt = buildContextualWordDefinitionPrompt({ phrase: 'बहुत '.repeat(300), word: 'धन्यवाद' });
  expect(prompt.length).toBeLessThanOrEqual(500);
  expect(prompt).toContain('Selected Hindi word: "धन्यवाद"');
});
