import {
  MAX_STRUCTURED_REPLY_BYTES,
  sanitizeStructuredReply,
  structuredHindiSource,
  structuredReplyText,
  structuredSaveCandidates,
} from '../src/lib/structured-reply';

const valid = {
  version: 1,
  intro: 'Less sugar in your tea? Ask the waiter politely:',
  phrases: [{ devanagari: 'चाय में चीनी कम डालिए।', romanized: 'chaay mein cheeni kam daaliye.', english: 'Please put less sugar in the tea.' }],
  corrections: [{ youSaid: { devanagari: 'डालो', romanized: 'daalo' }, say: { devanagari: 'डालिए', romanized: 'daaliye', english: 'please put' }, note: 'daalo is for friends.' }],
  outro: 'Want to try ordering?',
};

describe('sanitizeStructuredReply', () => {
  it('accepts a valid block and trims it', () => {
    expect(sanitizeStructuredReply({ ...valid, intro: `  ${valid.intro}  `, extra: 'ignored' })).toEqual(valid);
  });

  it('ignores unknown fields and null optionals', () => {
    expect(sanitizeStructuredReply({ version: 1, intro: 'Hi', phrases: null, corrections: null, outro: null, mood: 'calm' })).toEqual({ version: 1, intro: 'Hi' });
    expect(sanitizeStructuredReply({ version: 1, corrections: [{ youSaid: { romanized: 'daalo', devanagari: null }, say: { devanagari: 'डालिए', romanized: 'daaliye', english: null }, note: null }] }))
      .toEqual({ version: 1, corrections: [{ youSaid: { romanized: 'daalo' }, say: { devanagari: 'डालिए', romanized: 'daaliye' } }] });
  });

  it('drops the whole block for the wrong version, wrong scripts, or empty content', () => {
    expect(sanitizeStructuredReply(undefined)).toBeUndefined();
    expect(sanitizeStructuredReply('text')).toBeUndefined();
    expect(sanitizeStructuredReply({ ...valid, version: 2 })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1 })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, phrases: [] })).toBeUndefined();
    // Devanagari in the romanized line, Latin in the Devanagari line, missing English.
    expect(sanitizeStructuredReply({ version: 1, phrases: [{ devanagari: 'चाय', romanized: 'chaay चाय', english: 'tea' }] })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, phrases: [{ devanagari: 'chaay', romanized: 'chaay', english: 'tea' }] })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, phrases: [{ devanagari: 'चाय', romanized: 'chaay', english: '' }] })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, phrases: [{ devanagari: 'चाय', romanized: 'chaay', english: 'चाय' }] })).toBeUndefined();
    // A correction needs at least one "you said" script.
    expect(sanitizeStructuredReply({ version: 1, corrections: [{ youSaid: {}, say: { devanagari: 'डालिए', romanized: 'daaliye' } }] })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, corrections: [{ youSaid: { romanized: 'daalo' }, say: { devanagari: 'डालिए' } }] })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, intro: 42 })).toBeUndefined();
    // Devanagari in English prose would leak script into Latin mode, so the block is dropped.
    expect(sanitizeStructuredReply({ version: 1, intro: 'Say नमस्ते' })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, outro: 'फिर मिलेंगे' })).toBeUndefined();
    expect(sanitizeStructuredReply({
      version: 1,
      corrections: [{ youSaid: { romanized: 'daalo' }, say: { devanagari: 'डालिए', romanized: 'daaliye' }, note: 'Use डालिए.' }],
    })).toBeUndefined();
  });

  it('treats empty optional strings like null so a phrase block still renders', () => {
    expect(sanitizeStructuredReply({
      version: 1,
      intro: '',
      outro: '',
      phrases: [{ devanagari: 'चाय', romanized: 'chaay', english: 'tea' }],
      corrections: [{ youSaid: { devanagari: '', romanized: 'daalo' }, say: { devanagari: 'डालिए', romanized: 'daaliye', english: '' }, note: '' }],
    })).toEqual({
      version: 1,
      phrases: [{ devanagari: 'चाय', romanized: 'chaay', english: 'tea' }],
      corrections: [{ youSaid: { romanized: 'daalo' }, say: { devanagari: 'डालिए', romanized: 'daaliye' } }],
    });
  });

  it('drops oversized blocks instead of failing', () => {
    const phrases = Array.from({ length: 9 }, (_, index) => ({ devanagari: `चाय ${index}`, romanized: `chaay ${index}`, english: `tea ${index}` }));
    expect(sanitizeStructuredReply({ version: 1, phrases })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, intro: 'x'.repeat(601) })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, phrases: [{ devanagari: 'चाय', romanized: 'c'.repeat(301), english: 'tea' }] })).toBeUndefined();
    const heavy = { version: 1, phrases: Array.from({ length: 8 }, () => ({ devanagari: 'चाय '.repeat(70), romanized: 'chaay '.repeat(45), english: 'tea '.repeat(70) })) };
    expect(JSON.stringify(heavy).length).toBeGreaterThan(MAX_STRUCTURED_REPLY_BYTES);
    expect(sanitizeStructuredReply(heavy)).toBeUndefined();
  });
});

describe('structured helpers', () => {
  it('lists taught phrases then corrected forms as save candidates without duplicates', () => {
    const structured = sanitizeStructuredReply(valid)!;
    expect(structuredSaveCandidates(structured)).toEqual([
      valid.phrases[0],
      { devanagari: 'डालिए', romanized: 'daaliye', english: 'please put' },
    ]);
    expect(structuredSaveCandidates({ version: 1, phrases: [valid.phrases[0]!, valid.phrases[0]!] })).toHaveLength(1);
    expect(structuredHindiSource(structured)).toBe('चाय में चीनी कम डालिए। · डालिए');
  });

  it('renders a readable string per script preference', () => {
    const structured = sanitizeStructuredReply(valid)!;
    expect(structuredReplyText(structured, 'latin')).not.toMatch(/[ऀ-ॿ]/u);
    expect(structuredReplyText(structured, 'latin')).toContain('chaay mein cheeni kam daaliye. — Please put less sugar in the tea.');
    expect(structuredReplyText(structured, 'devanagari')).not.toContain('(chaay');
    expect(structuredReplyText(structured, 'both')).toContain('चाय में चीनी कम डालिए। (chaay mein cheeni kam daaliye.)');
    expect(structuredReplyText(structured, 'both')).toContain('You said डालो (daalo). Say डालिए (daaliye) — please put. daalo is for friends.');
  });
});
