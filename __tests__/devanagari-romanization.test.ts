import { romanizeDevanagari } from '../src/lib/devanagari-romanization';

describe('Devanagari transcript romanization', () => {
  it('converts common Hindi phrases to learner-friendly Latin text', () => {
    expect(romanizeDevanagari('आप कैसे हैं?')).toBe('Aap kaise hain?');
    expect(romanizeDevanagari('धन्यवाद, आशा।')).toBe('Dhanyavaad, Asha.');
    expect(romanizeDevanagari('ज़रूर।')).toBe('Zaroor.');
  });

  it('preserves English and converts Devanagari inside a mixed reply', () => {
    expect(romanizeDevanagari('Say नमस्ते, then smile.')).toBe('Say namaste, then smile.');
  });

  it('converts Devanagari digits without changing Latin digits', () => {
    expect(romanizeDevanagari('कमरा १२A, floor 3')).toBe('Kamaraa 12A, floor 3');
  });
});

it('uses the same common spellings in source chat, saved phrases and word meanings', () => {
  expect(romanizeDevanagari('कृपया पानी')).toBe('Kripya paani');
  expect(romanizeDevanagari('My name is Kripaya.')).toBe('My name is Kripaya.');
});

describe('loanword vowels and rare signs', () => {
  it('romanizes loanword vowels and never lets Devanagari leak into the Latin output', () => {
    expect(romanizeDevanagari('ऑटो')).toBe('Oto');
    expect(romanizeDevanagari('डॉक्टर')).toBe('Doktar');
    expect(romanizeDevanagari('ऍप')).toBe('Ep');
    expect(romanizeDevanagari('कॅफ़े')).toBe('Kefe');
    expect(romanizeDevanagari('ॐ शांति')).toBe('Om shaanti');
    expect(romanizeDevanagari('ऑटो वाले से पूछो।')).toBe('Oto vaale se poochho.');
    // Rare signs and accents must not survive as raw script.
    expect(romanizeDevanagari('अ॑ग्नि')).toBe('Agni');
    for (const sample of ['ऑटो', 'डॉक्टर', 'ऍप', 'ॠषि', 'ऌ', 'ॡ', 'ॲप', 'ऎ', 'ऒ', 'कॆ', 'कॊ', 'कॄ', 'कॢ', 'कॣ', 'क॰', 'ॐ', 'अ॒', 'क॓', 'क॔']) {
      expect(romanizeDevanagari(sample)).not.toMatch(/[\u0900-\u097F]/u);
    }
  });

  it('keeps unknown Latin, English names and punctuation as typed', () => {
    expect(romanizeDevanagari('My name is Kripaya.')).toBe('My name is Kripaya.');
    expect(romanizeDevanagari('Chris, bolo "chai"!')).toBe('Chris, bolo "chai"!');
  });
});

describe('every consonant letter', () => {
  const ranges: Array<[number, number]> = [[0x0915, 0x0939], [0x0958, 0x095f], [0x0979, 0x0979], [0x097b, 0x097c], [0x097e, 0x097f]];
  const letters = ranges.flatMap(([start, end]) => Array.from({ length: end - start + 1 }, (_value, offset) => String.fromCodePoint(start + offset)));

  it.each(letters)('romanizes %s to Latin without dropping it', (letter) => {
    const latin = romanizeDevanagari(`${letter}ा`);
    // A dropped consonant leaves only the vowel sign's "aa".
    expect(latin.toLowerCase()).not.toMatch(/^a+$/u);
    expect(latin).toMatch(/[A-Za-z]/u);
    expect(latin).not.toMatch(/[\u0900-\u097F]/u);
  });
});
