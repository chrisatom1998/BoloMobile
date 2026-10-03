import { romanizeDevanagari } from '../src/lib/devanagari-romanization';
import { scenes } from '../src/data/scenes';

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

  it('handles catalog loanwords that use candra vowels without mixed scripts', () => {
    expect(romanizeDevanagari('आपका स्टॉप आगे आएगा।')).toBe('Aapka stop aage aayega.');
    expect(romanizeDevanagari('कृपया यह फ़ॉर्म भरिए।')).toBe('Kripya yah form bharie.');
    expect(romanizeDevanagari('ऑफ़िस में ऑर्डर दीजिए।')).toBe('Office men order deejie.');
  });

  it('keeps every trusted catalog Latin display free of Devanagari', () => {
    const catalogLabels = scenes.flatMap((scene) => scene.beats.flatMap((beat) => [
      romanizeDevanagari(beat.npc),
      ...beat.choices.map((choice) => choice.latin),
    ]));
    const replies = scenes.flatMap((scene) => scene.beats.flatMap((beat) => (
      beat.choices.map((choice) => romanizeDevanagari(choice.reply))
    )));

    expect(catalogLabels).toHaveLength(4_408);
    expect([...catalogLabels, ...replies].filter((text) => /[\u0900-\u097F]/u.test(text))).toEqual([]);
  });
});

it('uses the same common spellings in source chat, saved phrases and word meanings', () => {
  expect(romanizeDevanagari('कृपया पानी')).toBe('Kripya paani');
  expect(romanizeDevanagari('My name is Kripaya.')).toBe('My name is Kripaya.');
});
