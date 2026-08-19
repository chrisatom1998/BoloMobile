import { deterministicallyShuffle, isWordOrderPracticeable, wordOrderTokens } from '../src/components/practice-mode';

describe('wordOrderTokens', () => {
  it('splits a phrase on whitespace and preserves trailing punctuation', () => {
    expect(wordOrderTokens('मैं ठीक हूँ।')).toEqual(['मैं', 'ठीक', 'हूँ।']);
    expect(wordOrderTokens('कृपया धीरे बोलिए।')).toEqual(['कृपया', 'धीरे', 'बोलिए।']);
    expect(wordOrderTokens('आप कैसे हैं?')).toEqual(['आप', 'कैसे', 'हैं?']);
  });

  it('drops empty tokens and normalizes runs of whitespace', () => {
    expect(wordOrderTokens('  मुझे   मदद  चाहिए। ')).toEqual(['मुझे', 'मदद', 'चाहिए।']);
  });

  it('treats ellipsis fragments as their own tokens', () => {
    expect(wordOrderTokens('मेरा नाम ... है।')).toEqual(['मेरा', 'नाम', '...', 'है।']);
  });
});

describe('isWordOrderPracticeable', () => {
  it('is true only when the phrase has at least two spoken tokens', () => {
    expect(isWordOrderPracticeable('नमस्ते।')).toBe(false);
    expect(isWordOrderPracticeable('मैं ठीक हूँ।')).toBe(true);
    expect(isWordOrderPracticeable('   ')).toBe(false);
  });
});

describe('deterministicallyShuffle', () => {
  it('always returns the same order for the same seed and inputs', () => {
    const source = ['a', 'b', 'c', 'd', 'e'];
    const first = deterministicallyShuffle(source, 'lesson-42');
    const second = deterministicallyShuffle(source, 'lesson-42');
    expect(first).toEqual(second);
  });

  it('varies the order across different seeds so no two beats share a shuffle', () => {
    const source = ['a', 'b', 'c', 'd', 'e'];
    const seedA = deterministicallyShuffle(source, 'seed-alpha');
    const seedB = deterministicallyShuffle(source, 'seed-beta');
    expect(seedA).not.toEqual(seedB);
  });

  it('never opens on the pre-solved arrangement when the inputs allow reshuffling', () => {
    const source = ['a', 'b', 'c', 'd'];
    const shuffled = deterministicallyShuffle(source, 'a-b-c-d');
    expect(shuffled).toHaveLength(source.length);
    expect(new Set(shuffled)).toEqual(new Set(source));
    expect(shuffled).not.toEqual(source);
  });

  it('preserves single-element arrays unchanged', () => {
    expect(deterministicallyShuffle(['x'], 'seed')).toEqual(['x']);
    expect(deterministicallyShuffle([], 'seed')).toEqual([]);
  });
});
