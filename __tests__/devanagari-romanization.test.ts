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
