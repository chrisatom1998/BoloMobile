import { sceneCategories, scenes } from '../src/data/scenes';
import { offlineHindiAudio } from '../src/data/offline-hindi-audio';

describe('Bolo scenario catalog', () => {
  it('contains the complete, categorized lesson catalog', () => {
    const categoryCounts = scenes.reduce<Record<string, number>>((counts, scene) => {
      counts[scene.category] = (counts[scene.category] ?? 0) + 1;
      return counts;
    }, {});

    expect(scenes).toHaveLength(30);
    expect(new Set(scenes.map((scene) => scene.id)).size).toBe(30);
    expect(sceneCategories).toEqual(['All', 'Food', 'Travel', 'Everyday', 'Health', 'Social', 'Work']);
    expect(categoryCounts).toEqual({
      Food: 5,
      Travel: 8,
      Social: 4,
      Everyday: 6,
      Health: 4,
      Work: 3,
    });
  });

  it('keeps every turn playable and unambiguous', () => {
    const beats = scenes.flatMap((scene) => scene.beats);

    expect(beats).toHaveLength(87);
    for (const beat of beats) {
      expect(beat.npc.trim()).not.toBe('');
      expect(beat.translation.trim()).not.toBe('');
      expect(beat.choices).toHaveLength(3);
      expect(beat.choices.filter((choice) => choice.correct)).toHaveLength(1);
      expect(new Set(beat.choices.map((choice) => choice.hi)).size).toBe(3);
    }
  });

  it('bundles offline audio for every playable Hindi line', () => {
    const spokenLines = scenes.flatMap((scene) => [
      ...scene.words,
      ...scene.beats.flatMap((beat) => [
        beat.npc,
        ...beat.choices.flatMap((choice) => [choice.hi, choice.reply]),
      ]),
    ]);

    for (const line of spokenLines) {
      expect(offlineHindiAudio[line]).toBeDefined();
    }
  });
});
