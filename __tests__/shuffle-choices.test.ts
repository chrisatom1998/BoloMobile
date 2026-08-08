import { shuffleChoices } from '../src/lib/shuffle-choices';

describe('shuffleChoices', () => {
  it('uses Fisher-Yates while retaining every item and its original source index', () => {
    const items = ['correct', 'wrong-one', 'wrong-two'] as const;
    const draws = [0.9, 0.1];
    const rng = jest.fn(() => draws.shift() ?? 0);

    const result = shuffleChoices(items, rng);

    expect(result).toEqual([
      { item: 'wrong-one', sourceIndex: 1 },
      { item: 'correct', sourceIndex: 0 },
      { item: 'wrong-two', sourceIndex: 2 },
    ]);
    expect(rng).toHaveBeenCalledTimes(items.length - 1);
    expect(items).toEqual(['correct', 'wrong-one', 'wrong-two']);
    expect(result.map(({ sourceIndex }) => sourceIndex).sort()).toEqual([0, 1, 2]);
  });

  it('handles empty and single-item choices without drawing random values', () => {
    const rng = jest.fn(() => 0.5);

    expect(shuffleChoices([], rng)).toEqual([]);
    expect(shuffleChoices(['only'], rng)).toEqual([{ item: 'only', sourceIndex: 0 }]);
    expect(rng).not.toHaveBeenCalled();
  });
});
