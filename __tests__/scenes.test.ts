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

  it('keeps every planned lesson focused on its titled phrase while varying supporting practice', () => {
    const plannedScenes = scenes.filter((scene) => scene.id.startsWith('plan-'));
    const activities = [
      { marker: 'Listen first', mode: 'choice' },
      { marker: 'Before revealing', mode: 'recallReveal' },
      { marker: 'Match the meaning', mode: 'choice' },
      { marker: 'Set the tone', mode: 'choice' },
      { marker: 'Piece it together', mode: 'wordOrder' },
      { marker: 'Whisper it', mode: 'choice' },
      { marker: 'Picture yourself', mode: 'choice' },
      { marker: 'Say the whole thought', mode: 'choice' },
      { marker: 'Rule out', mode: 'choice' },
      { marker: 'Lock it in', mode: 'choice' },
    ];

    for (const [sceneIndex, scene] of plannedScenes.entries()) {
      const lessonIndex = sceneIndex % 10;
      const prompts = scene.beats.map((beat) => beat.prompt);
      expect(new Set(prompts).size).toBe(scene.beats.length);
      for (const [turnIndex, beat] of scene.beats.entries()) {
        const activity = activities[(4 * lessonIndex + turnIndex) % activities.length]!;
        expect(beat.prompt).toContain(activity.marker);
        expect(beat.mode ?? 'choice').toBe(activity.mode);
      }

      const correctChoices = scene.beats.map((beat) => beat.choices.find((choice) => choice.correct)!);
      const practicePhrases = correctChoices.map((choice) => choice.hi);
      const titledPhrase = correctChoices[0]!.hi;
      expect(correctChoices[0]!.en).toBe(scene.subtitle);
      const expectedTitledTurns = scene.beats.flatMap((beat, turnIndex) => (
        turnIndex === 0
          || turnIndex === scene.beats.length - 1
          || beat.mode === 'recallReveal'
          || beat.mode === 'wordOrder'
          ? [turnIndex]
          : []
      ));
      const titledTurns = practicePhrases.flatMap((phrase, turnIndex) => phrase === titledPhrase ? [turnIndex] : []);
      expect(titledTurns).toEqual(expectedTitledTurns);
      for (const turnIndex of expectedTitledTurns) {
        expect(correctChoices[turnIndex]!.en).toBe(scene.subtitle);
      }
      expect(titledTurns.length).toBeGreaterThanOrEqual(3);
      expect(titledTurns.length).toBeLessThanOrEqual(4);
      expect(new Set(practicePhrases).size).toBeGreaterThanOrEqual(7);
      expect(new Set(practicePhrases).size).toBeLessThanOrEqual(8);
    }

    for (let planIndex = 0; planIndex < lessonPlans.length; planIndex += 1) {
      const planScenes = plannedScenes.slice(planIndex * 10, planIndex * 10 + 10);
      const titledPhrases = planScenes.map((scene) => {
        const { hi, latin, en } = scene.beats[0]!.choices.find((choice) => choice.correct)!;
        return { hi, latin, en };
      });
      for (const scene of planScenes) {
        for (const beat of scene.beats) {
          const target = beat.choices.find((choice) => choice.correct)!;
          const targetIndex = titledPhrases.findIndex((phrase) => phrase.hi === target.hi);
          expect(targetIndex).toBeGreaterThanOrEqual(0);
          expect(beat.choices.filter((choice) => !choice.correct)).toEqual([
            expect.objectContaining(titledPhrases[(targetIndex + 3) % titledPhrases.length]),
            expect.objectContaining(titledPhrases[(targetIndex + 7) % titledPhrases.length]),
          ]);
        }
      }
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
    expect(Object.keys(offlineHindiAudio).sort()).toEqual([...new Set(spokenLines)].sort());
  });
});
