import { displayHindiTranscript } from '../src/lib/learner-phrase-display';
import { phraseCardLines, phraseCardListenLabel } from '../src/lib/phrase-card-lines';

const phrase = { devanagari: 'आप कैसे हैं?', romanized: 'Aap kaise hain?', english: 'How are you?' };

describe('phraseCardLines', () => {
  it('shows Devanagari, one romanization and English for "both"', () => {
    expect(phraseCardLines({ ...phrase, scriptPreference: 'both' })).toEqual({
      devanagari: 'आप कैसे हैं?',
      romanized: 'Aap kaise hain?',
      english: 'How are you?',
      primary: 'devanagari',
    });
  });

  it('drops the romanization for "devanagari"', () => {
    const lines = phraseCardLines({ ...phrase, scriptPreference: 'devanagari' });
    expect(lines).toEqual({ devanagari: 'आप कैसे हैं?', english: 'How are you?', primary: 'devanagari' });
    expect(lines.romanized).toBeUndefined();
  });

  it('never emits Devanagari for "latin" and makes the romanization primary', () => {
    const lines = phraseCardLines({ ...phrase, scriptPreference: 'latin' });
    expect(lines).toEqual({ romanized: 'Aap kaise hain?', english: 'How are you?', primary: 'romanized' });
    expect(JSON.stringify(lines)).not.toMatch(/[ऀ-ॿ]/u);
  });

  it('derives a romanization from Devanagari with the existing helpers', () => {
    const derived = phraseCardLines({ devanagari: 'कृपया पानी दीजिए।', scriptPreference: 'both' }).romanized;
    expect(derived).toBe(displayHindiTranscript('कृपया पानी दीजिए।'));
    expect(derived).toMatch(/^Kripya paani /u);
    expect(phraseCardLines({ devanagari: 'नमस्ते', scriptPreference: 'latin' })).toEqual({ romanized: 'Namaste', primary: 'romanized' });
  });

  it('normalizes only authoritative lesson phrases and keeps the learner spelling otherwise', () => {
    // Known lesson phrase: Bolo's spelling for kripya wins (see learner-phrase-display tests).
    expect(phraseCardLines({ devanagari: 'चीनी कम, कृपया।', romanized: 'Cheeni kam, kripayaa.', scriptPreference: 'both' }).romanized).toBe('Cheeni kam, kripya.');
    // Unknown phrase: the learner's own spelling passes through untouched.
    expect(phraseCardLines({ devanagari: 'कृपया पानी दीजिए।', romanized: 'Kripayaa paanee dijiye.', scriptPreference: 'both' }).romanized).toBe('Kripayaa paanee dijiye.');
  });

  it('never invents Devanagari for romanized-only input, whatever the preference', () => {
    for (const scriptPreference of ['both', 'devanagari', 'latin'] as const) {
      expect(phraseCardLines({ romanized: 'Chai peena hai', english: 'I want to drink chai', scriptPreference })).toEqual({
        romanized: 'Chai peena hai',
        english: 'I want to drink chai',
        primary: 'romanized',
      });
    }
  });

  it('treats a Latin "Devanagari" field as the romanization instead of showing it twice', () => {
    expect(phraseCardLines({ devanagari: 'Namaste', romanized: 'Namaste', scriptPreference: 'both' })).toEqual({ romanized: 'Namaste', primary: 'romanized' });
    expect(phraseCardLines({ devanagari: 'Namaste', scriptPreference: 'both' })).toEqual({ romanized: 'Namaste', primary: 'romanized' });
  });

  it('never leaks Devanagari through the romanized field, even in "latin" mode', () => {
    for (const scriptPreference of ['both', 'devanagari', 'latin'] as const) {
      const mixed = phraseCardLines({ devanagari: 'चाय कम', romanized: 'chai कम', scriptPreference });
      expect(mixed.romanized === undefined || !/[\u0900-\u097f]/u.test(mixed.romanized)).toBe(true);
      expect(mixed.devanagari === undefined || scriptPreference !== 'latin').toBe(true);
    }
    expect(phraseCardLines({ devanagari: 'चाय कम', romanized: 'chai कम', scriptPreference: 'latin' })).toEqual({ romanized: 'Chai kam', primary: 'romanized' });
    expect(phraseCardLines({ devanagari: 'चाय कम', romanized: 'chai कम', scriptPreference: 'both' })).toEqual({ devanagari: 'चाय कम', romanized: 'Chai kam', primary: 'devanagari' });
  });

  it('romanizes a romanized-only mixed-script value without inventing a Devanagari line', () => {
    for (const scriptPreference of ['both', 'devanagari', 'latin'] as const) {
      expect(phraseCardLines({ romanized: 'chai कम', english: 'Less chai', scriptPreference })).toEqual({
        romanized: 'Chai kam',
        english: 'Less chai',
        primary: 'romanized',
      });
      expect(phraseCardLines({ romanized: 'नमस्ते', english: 'Hello', scriptPreference })).toEqual({
        romanized: 'Namaste',
        english: 'Hello',
        primary: 'romanized',
      });
    }
  });

  it('emits Latin letters only for loanword vowels and rare signs in "latin" mode', () => {
    expect(phraseCardLines({ devanagari: 'ऑटो वाले से पूछो।', english: 'Ask the auto driver.', scriptPreference: 'latin' })).toEqual({
      romanized: 'Oto vaale se poochho.',
      english: 'Ask the auto driver.',
      primary: 'romanized',
    });
    for (const sample of ['ऑटो', 'डॉक्टर', 'ऍप', 'ॐ शांति', 'अ॑ग्नि', 'क॰']) {
      const lines = phraseCardLines({ devanagari: sample, romanized: sample, scriptPreference: 'latin' });
      expect(JSON.stringify(lines)).not.toMatch(/[\u0900-\u097f]/u);
      expect(lines.romanized).toMatch(/[A-Za-z]/u);
    }
  });

  it('omits empty or whitespace-only lines', () => {
    expect(phraseCardLines({ devanagari: 'नमस्ते', romanized: '  ', english: '', scriptPreference: 'both' })).toEqual({
      devanagari: 'नमस्ते',
      romanized: 'Namaste',
      primary: 'devanagari',
    });
    expect(phraseCardLines({ devanagari: null, romanized: undefined, english: null, scriptPreference: 'both' })).toEqual({ primary: null });
  });
});

describe('phraseCardListenLabel', () => {
  it('prefers the English meaning, then the romanization', () => {
    expect(phraseCardListenLabel({ english: 'How are you?', romanized: 'Aap kaise hain?' })).toBe('Listen to How are you?');
    expect(phraseCardListenLabel({ romanized: 'Aap kaise hain?' })).toBe('Listen to Aap kaise hain?');
  });

  it('does not read out a concealed answer', () => {
    expect(phraseCardListenLabel({ romanized: 'Aap kaise hain?' }, true)).toBe('Listen to this phrase');
    expect(phraseCardListenLabel({}, false)).toBe('Listen to this phrase');
  });
});
