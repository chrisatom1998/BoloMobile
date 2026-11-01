import { knownSavedPhrase } from '../src/lib/known-hindi-phrases';

describe('known Hindi phrase recovery', () => {
  it('reuses a complete lesson phrase selected by its English meaning', () => {
    expect(knownSavedPhrase('How are you?')).toEqual({
      hi: 'आप कैसे हैं?',
      latin: 'Aap kaise hain?',
      en: 'How are you?',
    });
  });
});
