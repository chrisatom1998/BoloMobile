import { knownDevanagariForRomanizedText, knownSavedPhrase } from '../src/lib/known-hindi-phrases';

describe('known Hindi phrase recovery', () => {
  it('reuses a complete lesson phrase selected by its English meaning', () => {
    expect(knownSavedPhrase('How are you?')).toEqual({
      hi: 'आप कैसे हैं?',
      latin: 'Aap kaise hain?',
      en: 'How are you?',
    });
  });

  it('recovers familiar Romanized Hindi words without asking the server for script conversion', () => {
    expect(knownDevanagariForRomanizedText('Kripya mujhe paani dijiye.')).toBe('कृपया मुझे पानी दीजिए.');
    expect(knownDevanagariForRomanizedText('Kripya dheere-dheere phir se bataaiye.')).toBe('कृपया धीरे-धीरे फिर से बताइए.');
    expect(knownDevanagariForRomanizedText('Kaise ho?')).toBe('कैसे हो?');
    expect(knownDevanagariForRomanizedText('Kya kar rahe ho?')).toBe('क्या कर रहे हो?');
  });

  it('does not mistake an ordinary English selection for Romanized Hindi', () => {
    expect(knownDevanagariForRomanizedText('This is a completely unrelated sentence.')).toBeNull();
  });

  it('defers mixed Romanized Hindi and English to full translation', () => {
    expect(knownDevanagariForRomanizedText('Kya kar rahe ho please')).toBeNull();
    expect(knownDevanagariForRomanizedText('Kya are you kar rahe ho?')).toBeNull();
    expect(knownDevanagariForRomanizedText('Main road par traffic hai')).toBeNull();
  });
});
