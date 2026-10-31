import { getScene } from '../src/data/scenes';
import { selectFeaturedPhrase } from '../src/lib/featured-phrase';
import { selectNextLesson } from '../src/lib/lesson-path';
import type { SceneProgress } from '../src/state/app-state-types';

const profile = { level: 'new' as const, primaryGoal: 'conversation' as const };

function progress(overrides: Partial<SceneProgress> = {}): SceneProgress {
  return {
    bestAccuracy: 0,
    bestScore: 0,
    completions: 0,
    lastBeatIndex: 0,
    lastPracticedAt: null,
    totalAnswers: 0,
    totalCorrect: 0,
    weakPhrases: [],
    ...overrides,
  };
}

function correctLine(lessonId: string, beatIndex: number) {
  const lesson = getScene(lessonId);
  const choice = lesson?.beats[beatIndex]?.choices.find((item) => item.correct);
  if (!lesson || !choice) throw new Error(`Missing correct line for ${lessonId} beat ${beatIndex}.`);
  return { en: choice.en, hi: choice.hi, latin: choice.latin };
}

describe('selectFeaturedPhrase', () => {
  it('prefers the first due phrase over the current lesson', () => {
    const due = { en: 'One tea, please.', hi: 'एक चाय दीजिए।', latin: 'Ek chai dijiye.' };
    expect(selectFeaturedPhrase([due], {}, profile)).toEqual(due);
  });

  it('uses the correct line of today’s lesson when nothing is due', () => {
    const { lessonId } = selectNextLesson({}, profile);
    expect(selectFeaturedPhrase([], {}, profile)).toEqual(correctLine(lessonId, 0));
  });

  it('follows the lesson beat the learner is on, and clamps a saved index past the end', () => {
    const { lessonId } = selectNextLesson({}, profile);
    const lesson = getScene(lessonId);
    if (!lesson) throw new Error('Expected today’s lesson.');
    expect(selectFeaturedPhrase([], { [lessonId]: progress({ lastBeatIndex: 2 }) }, profile)).toEqual(correctLine(lessonId, 2));
    expect(selectFeaturedPhrase([], { [lessonId]: progress({ lastBeatIndex: 99 }) }, profile)).toEqual(correctLine(lessonId, lesson.beats.length - 1));
  });
});
