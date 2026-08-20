import { lessonPlans } from '../src/data/lesson-plans';
import { scenes } from '../src/data/scenes';
import { categoryMastery, dueSavedPhrases, learningAccuracy, milestoneProgress, recommendedScenes, selectNextLesson, weeklyPractice } from '../src/lib/learning';
import { defaultLearnerProfile } from '../src/lib/storage';
import type { LearnerProfile, PhraseReview, SavedPhrase, SceneProgress } from '../src/state/app-state-types';

function expectDefined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected the value to be defined.');
  return value;
}

const progress = (overrides: Partial<SceneProgress> = {}): SceneProgress => ({
  completions: 0,
  bestScore: 0,
  bestAccuracy: 0,
  totalCorrect: 0,
  totalAnswers: 0,
  lastPracticedAt: null,
  lastBeatIndex: 0,
  weakPhrases: [],
  ...overrides,
});

const learner = (overrides: Partial<LearnerProfile> = {}): LearnerProfile => ({
  ...defaultLearnerProfile(),
  completed: true,
  ...overrides,
});

describe('adaptive learning', () => {
  it('prioritizes a resumable scene before unstarted goal-aligned scenes', () => {
    const profile = { ...defaultLearnerProfile(), completed: true, primaryGoal: 'travel' as const };
    const result = recommendedScenes(profile, { restaurant: progress({ lastBeatIndex: 1 }) });
    expect(expectDefined(result[0]).id).toBe('restaurant');
    expect(result.slice(1).every((scene) => scene.category === 'Travel')).toBe(true);
  });

  it('selects at most five due phrases with weaker mastery first', () => {
    const phrases: SavedPhrase[] = Array.from({ length: 7 }, (_, index) => ({ hi: `हिन्दी ${index}`, latin: `hindi ${index}`, en: `Phrase ${index}` }));
    const reviews = Object.fromEntries(phrases.map((phrase, index): [string, PhraseReview] => [phrase.hi, {
      mastery: 6 - index,
      intervalDays: 1,
      dueAt: index === 0 ? '2999-01-01' : '2000-01-01',
      lastReviewedAt: null,
      correctReviews: 0,
      totalReviews: 0,
    }]));
    const result = dueSavedPhrases(phrases, reviews);
    expect(result).toHaveLength(5);
    expect(result.map((phrase) => phrase.hi)).toEqual(['हिन्दी 6', 'हिन्दी 5', 'हिन्दी 4', 'हिन्दी 3', 'हिन्दी 2']);
  });

  it('builds a seven-day practice series with zero-filled gaps', () => {
    const result = weeklyPractice([{ date: '2026-07-18', seconds: 300, correct: 2, answers: 3, reviews: 1 }], '2026-07-19');
    expect(result).toHaveLength(7);
    expect(result.at(-2)?.seconds).toBe(300);
    expect(result.at(-1)?.seconds).toBe(0);
  });

  it('derives category mastery, cumulative accuracy, and can-do milestones', () => {
    const sceneProgress = {
      chai: progress({ completions: 1, totalCorrect: 2, totalAnswers: 2 }),
      restaurant: progress({ completions: 1, totalCorrect: 1, totalAnswers: 2 }),
    };
    const foodTotal = scenes.filter((scene) => scene.category === 'Food').length;
    expect(categoryMastery(sceneProgress).find((item) => item.category === 'Food')).toMatchObject({
      completed: 2,
      total: foodTotal,
      percent: Math.round(2 / foodTotal * 100),
    });
    expect(learningAccuracy(sceneProgress)).toBe(75);
    expect(milestoneProgress(sceneProgress).find((item) => item.id === 'order-food')?.achieved).toBe(true);
  });
});

describe('next lesson selection', () => {
  it('starts a new learner on the first foundation lesson', () => {
    const result = selectNextLesson(learner(), {});
    expect(result).toMatchObject({
      action: 'Start lesson',
      kicker: 'NEXT LESSON',
      pathKicker: 'YOUR CONVERSATION PATH',
      lessonId: 'plan-essentials-01',
      title: 'A warm hello',
    });
    expect(result.plan.id).toBe('essentials');
  });

  it('keeps a traveller new to Hindi on the foundations before the travel plans', () => {
    const result = selectNextLesson(learner({ primaryGoal: 'travel' }), {});
    expect(result.plan.id).toBe('essentials');
    expect(result.lessonId).toBe('plan-essentials-01');
    expect(result.why).toBe("We'll start with greetings, then get you moving around town.");
  });

  it('sends an intermediate traveller straight to the travel plan', () => {
    const result = selectNextLesson(learner({ level: 'intermediate', primaryGoal: 'travel' }), {});
    expect(result).toMatchObject({
      action: 'Start lesson',
      lessonId: 'plan-getting-around-01',
      pathKicker: 'YOUR TRAVEL PATH',
      why: 'Jump into Get around town.',
    });
    expect(result.plan.id).toBe('getting-around');
  });

  it('resumes an unfinished lesson instead of jumping to the goal plan', () => {
    const result = selectNextLesson(
      learner({ level: 'intermediate', primaryGoal: 'travel' }),
      { 'plan-essentials-03': progress({ lastBeatIndex: 2, lastPracticedAt: '2026-07-20T12:00:00.000Z' }) },
    );
    expect(result).toMatchObject({
      action: 'Continue',
      kicker: 'CONTINUE LESSON',
      lessonId: 'plan-essentials-03',
      title: 'Ask how someone is',
      why: "We'll pick up where you left off in this lesson.",
    });
    expect(result.plan.id).toBe('essentials');
  });

  it('offers a review once every planned lesson is complete', () => {
    const everyLessonComplete = Object.fromEntries(
      lessonPlans.flatMap((plan) => plan.lessonIds.map((lessonId) => [lessonId, progress({ completions: 1 })])),
    );
    const result = selectNextLesson(learner(), everyLessonComplete);
    expect(result).toMatchObject({
      action: 'Review lesson',
      kicker: 'REVIEW LESSON',
      why: "You've finished every lesson. Review one to keep it fresh.",
    });
    expect(result.plan.id).toBe(expectDefined(lessonPlans.at(-1)).id);
    expect(result.lessonId).toBe(expectDefined(lessonPlans.at(-1)).lessonIds[0]);
  });
});
