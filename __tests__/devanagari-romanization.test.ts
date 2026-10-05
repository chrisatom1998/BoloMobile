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

it('romanizes candra loanword vowels instead of leaking raw Devanagari', () => {
  expect(romanizeDevanagari('डॉक्टर')).toBe('Doktar');
  expect(romanizeDevanagari('ऑफ़िस')).toBe('Ofis');
  expect(romanizeDevanagari('कॉफ़ी')).toBe('Kofee');
  expect(romanizeDevanagari('स्टॉप')).toBe('Stop');
  for (const word of ['बॅंक', 'ऍक्शन', 'डॉक्टर के ऑफ़िस में कॉफ़ी']) {
    expect(romanizeDevanagari(word)).not.toMatch(/[\u0900-\u097F]/u);
  }
});
