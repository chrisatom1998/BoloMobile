import { sceneCategories, scenes } from '../src/data/scenes';
import { offlineHindiAudio } from '../src/data/offline-hindi-audio';
import { lessonPlans } from '../src/data/lesson-plans';

describe('Bolo scenario catalog', () => {
  it('contains the complete, categorized lesson catalog', () => {
    const categoryCounts = scenes.reduce<Record<string, number>>((counts, scene) => {
      counts[scene.category] = (counts[scene.category] ?? 0) + 1;
      return counts;
    }, {});

    expect(scenes).toHaveLength(130);
    expect(new Set(scenes.map((scene) => scene.id)).size).toBe(130);
    expect(sceneCategories).toEqual(['All', 'Food', 'Travel', 'Everyday', 'Health', 'Social', 'Work']);
    expect(categoryCounts).toEqual({
      Food: 15,
      Travel: 28,
      Social: 34,
      Everyday: 26,
      Health: 14,
      Work: 13,
    });
    expect(lessonPlans).toHaveLength(10);
    expect(lessonPlans.map((plan) => plan.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(lessonPlans.flatMap((plan) => plan.lessonIds)).toHaveLength(100);
    expect(scenes.filter((scene) => scene.id.startsWith('plan-'))).toHaveLength(100);
  });

  it('keeps every turn playable and unambiguous', () => {
    const beats = scenes.flatMap((scene) => scene.beats);

    expect(beats).toHaveLength(1087);
    expect(scenes.filter((scene) => scene.id.startsWith('plan-')).every((scene) => scene.beats.length === 10)).toBe(true);
    for (const beat of beats) {
      expect(beat.npc.trim()).not.toBe('');
      expect(beat.translation.trim()).not.toBe('');
      expect(beat.choices).toHaveLength(3);
      expect(beat.choices.filter((choice) => choice.correct)).toHaveLength(1);
      expect(new Set(beat.choices.map((choice) => choice.hi)).size).toBe(3);
    }
  });

  it('gives every planned lesson a distinct mix of guided-practice goals and phrases', () => {
    const plannedScenes = scenes.filter((scene) => scene.id.startsWith('plan-'));
    const goalMarkers = [
      'Listen for the sound',
      'Recall before you look',
      'Match the English idea',
      'Use a polite response',
      'Rebuild the phrase',
      'Say it softly to yourself',
      'Picture the moment',
    ];

    for (const scene of plannedScenes) {
      const prompts = scene.beats.map((beat) => beat.prompt);
      expect(new Set(prompts).size).toBe(scene.beats.length);
      for (const marker of goalMarkers) {
        expect(prompts.some((prompt) => prompt.includes(marker))).toBe(true);
      }
      const practicePhrases = scene.beats.map((beat) => beat.choices.find((choice) => choice.correct)?.hi);
      expect(new Set(practicePhrases).size).toBe(scene.beats.length);
    }

    expect(new Set(plannedScenes.flatMap((scene) => scene.beats.map((beat) => beat.prompt))).size).toBe(1000);
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
    expect(Object.keys(offlineHindiAudio).sort()).toEqual([...new Set(spokenLines)].sort());
  });
});
