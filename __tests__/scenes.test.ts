import { sceneCategories, scenes } from '../src/data/scenes';

describe('Bolo scenario catalog', () => {
  it('contains the complete, categorized lesson catalog', () => {
    const categoryCounts = scenes.reduce<Record<string, number>>((counts, scene) => {
      counts[scene.category] = (counts[scene.category] ?? 0) + 1;
      return counts;
    }, {});

    expect(scenes).toHaveLength(21);
    expect(new Set(scenes.map((scene) => scene.id)).size).toBe(21);
    expect(sceneCategories).toEqual(['All', 'Food', 'Travel', 'Everyday', 'Health', 'Social', 'Work']);
    expect(categoryCounts).toEqual({
      Food: 3,
      Travel: 7,
      Social: 3,
      Everyday: 5,
      Health: 2,
      Work: 1,
    });
  });

  it('keeps every turn playable and unambiguous', () => {
    const beats = scenes.flatMap((scene) => scene.beats);

    expect(beats).toHaveLength(60);
    for (const beat of beats) {
      expect(beat.npc.trim()).not.toBe('');
      expect(beat.translation.trim()).not.toBe('');
      expect(beat.choices).toHaveLength(3);
      expect(beat.choices.filter((choice) => choice.correct)).toHaveLength(1);
      expect(new Set(beat.choices.map((choice) => choice.hi)).size).toBe(3);
    }
  });
});
