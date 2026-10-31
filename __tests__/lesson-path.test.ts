import { orderedLessonPlans, selectNextLesson } from '../src/lib/lesson-path';

const progressDone = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, {
  bestAccuracy: 100, bestScore: 0, completions: 1, lastBeatIndex: 0,
  lastPracticedAt: '2026-10-30T12:00:00.000Z', totalAnswers: 1, totalCorrect: 1, weakPhrases: [],
}]));

describe('lesson path from onboarding answers', () => {
  it('starts someone new to Hindi with the basics, then their goal', () => {
    const ids = orderedLessonPlans({ level: 'new', primaryGoal: 'travel' }).map((plan) => plan.id);
    expect(ids.slice(0, 2)).toEqual(['essentials', 'getting-around']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('starts a beginner on the plan for their goal', () => {
    expect(orderedLessonPlans({ level: 'beginner', primaryGoal: 'work' })[0]!.id).toBe('work');
    expect(selectNextLesson({}, { level: 'intermediate', primaryGoal: 'family' })).toMatchObject({ mode: 'next', plan: { id: 'social-life' } });
  });

  it('moves on to the goal plan once the basics are done', () => {
    const essentials = orderedLessonPlans(null)[0]!;
    expect(essentials.id).toBe('essentials');
    const next = selectNextLesson(progressDone(essentials.lessonIds), { level: 'new', primaryGoal: 'family' });
    expect(next.plan.id).toBe('social-life');
    expect(next.lessonId).toBe(next.plan.lessonIds[0]);
  });
});
