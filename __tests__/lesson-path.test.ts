import { getPlanProgress, inProgressLesson, orderedLessonPlans, selectNextLesson } from '../src/lib/lesson-path';

const progressDone = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, {
  bestAccuracy: 100, bestScore: 0, completions: 1, lastBeatIndex: 0,
  lastPracticedAt: '2026-10-30T12:00:00.000Z', totalAnswers: 1, totalCorrect: 1, weakPhrases: [],
}]));

const partway = (lastBeatIndex: number, lastPracticedAt: string) => ({
  bestAccuracy: 0, bestScore: 0, completions: 0, lastBeatIndex,
  lastPracticedAt, totalAnswers: lastBeatIndex, totalCorrect: lastBeatIndex, weakPhrases: [],
});

describe('getPlanProgress', () => {
  it('starts a fresh install at lesson 1 with nothing complete or partway', () => {
    expect(getPlanProgress('essentials', {})).toEqual({ completed: 0, inProgressIndex: -1, nextIndex: 0, total: 10 });
  });

  it('counts a finished lesson 1 as complete and points at lesson 2, not at lesson 1 in progress', () => {
    expect(getPlanProgress('essentials', progressDone(['plan-essentials-01']))).toEqual({ completed: 1, inProgressIndex: -1, nextIndex: 1, total: 10 });
  });

  it('reports the partway lesson with the same rule as inProgressLesson', () => {
    const sceneProgress = { ...progressDone(['plan-essentials-01']), 'plan-essentials-02': partway(3, '2026-10-30T13:00:00.000Z') };
    expect(getPlanProgress('essentials', sceneProgress)).toEqual({ completed: 1, inProgressIndex: 1, nextIndex: 1, total: 10 });
    expect(inProgressLesson(sceneProgress)).toMatchObject({ lessonId: 'plan-essentials-02', plan: { id: 'essentials' } });
  });

  it('prefers the most recently practiced partway lesson within the plan', () => {
    const sceneProgress = {
      'plan-essentials-03': partway(2, '2026-10-29T12:00:00.000Z'),
      'plan-essentials-05': partway(1, '2026-10-30T12:00:00.000Z'),
    };
    expect(getPlanProgress('essentials', sceneProgress).inProgressIndex).toBe(4);
  });

  it('ignores progress from other plans and from real-life scenes', () => {
    const sceneProgress = { ...progressDone(['chai', 'plan-connection-01']), 'plan-connection-02': partway(4, '2026-10-30T12:00:00.000Z') };
    expect(getPlanProgress('essentials', sceneProgress)).toEqual({ completed: 0, inProgressIndex: -1, nextIndex: 0, total: 10 });
    expect(getPlanProgress('connection', sceneProgress)).toEqual({ completed: 1, inProgressIndex: 1, nextIndex: 1, total: 10 });
  });

  it('marks a finished plan with no next lesson', () => {
    const essentials = orderedLessonPlans(null)[0]!;
    expect(getPlanProgress('essentials', progressDone(essentials.lessonIds))).toEqual({ completed: 10, inProgressIndex: -1, nextIndex: -1, total: 10 });
  });

  it('returns empty counts for an unknown plan', () => {
    expect(getPlanProgress('missing', {})).toEqual({ completed: 0, inProgressIndex: -1, nextIndex: -1, total: 0 });
  });
});

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
