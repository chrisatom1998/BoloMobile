import { scenes } from '../src/data/scenes';
import { categoryMastery, dueSavedPhrases, learningAccuracy, milestoneProgress, recommendedScenes, weeklyPractice } from '../src/lib/learning';
import { defaultLearnerProfile } from '../src/lib/storage';
import type { PhraseReview, SavedPhrase, SceneProgress } from '../src/state/app-state-types';

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

describe('adaptive learning', () => {
  it('prioritizes a resumable scene before unstarted goal-aligned scenes', () => {
    const profile = { ...defaultLearnerProfile(), completed: true, primaryGoal: 'travel' as const };
    const result = recommendedScenes(profile, { restaurant: progress({ lastBeatIndex: 1 }) });
    expect(result[0].id).toBe('restaurant');
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
