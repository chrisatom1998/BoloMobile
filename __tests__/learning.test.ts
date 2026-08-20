import { scenes } from '../src/data/scenes';
import {
  categoryMastery,
  dueSavedPhrases,
  isRetentionPhrase,
  learningAccuracy,
  maxWeakPhraseCards,
  milestoneProgress,
  recommendedScenes,
  retentionPhrases,
  weakPhraseCards,
  weeklyPractice,
} from '../src/lib/learning';
import { defaultLearnerProfile } from '../src/lib/storage';
import type { PhraseReview, SavedPhrase, SceneProgress } from '../src/state/app-state-types';

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

const catalogPhrases = scenes.flatMap((scene) => scene.beats.flatMap((beat) => beat.choices.map((choice) => choice.hi)));

function catalogPhrase(index: number) {
  return expectDefined(catalogPhrases[index]);
}

describe('weak scene phrases in the retention loop', () => {
  it('turns missed scene answers into review cards with their translations', () => {
    const missed = expectDefined(expectDefined(expectDefined(scenes[0]).beats[0]).choices.find((choice) => !choice.correct));
    const cards = weakPhraseCards({ chai: progress({ weakPhrases: [missed.hi, 'नहीं मिलेगा।'] }) });

    expect(cards).toEqual([{ hi: missed.hi, latin: missed.latin, en: missed.en }]);
  });

  it('lists the most recently practiced scene first and caps the queue', () => {
    const older = catalogPhrases.slice(0, maxWeakPhraseCards);
    const newest = catalogPhrase(maxWeakPhraseCards);
    const cards = weakPhraseCards({
      chai: progress({ weakPhrases: older, lastPracticedAt: '2026-07-18T10:00:00.000Z' }),
      restaurant: progress({ weakPhrases: [newest], lastPracticedAt: '2026-07-19T10:00:00.000Z' }),
    });

    expect(cards).toHaveLength(maxWeakPhraseCards);
    expect(expectDefined(cards[0]).hi).toBe(newest);
    expect(cards.map((card) => card.hi)).toEqual([...new Set(cards.map((card) => card.hi))]);
  });

  it('reviews missed scene answers for a learner who never saved a phrase', () => {
    const missed = catalogPhrase(1);
    const pool = retentionPhrases([], { chai: progress({ weakPhrases: [missed] }) });

    expect(dueSavedPhrases(pool, {})).toEqual([expect.objectContaining({ hi: missed })]);
  });

  it('keeps saved phrases first and never repeats one that was also missed', () => {
    const shared = catalogPhrase(0);
    const missedOnly = catalogPhrase(1);
    const saved: SavedPhrase[] = [{ hi: shared, latin: 'ek chai dijiye.', en: 'One tea, please.' }];
    const pool = retentionPhrases(saved, { chai: progress({ weakPhrases: [shared, missedOnly] }) });

    expect(pool.map((phrase) => phrase.hi)).toEqual([shared, missedOnly]);
    expect(expectDefined(pool[0]).en).toBe('One tea, please.');
  });

  it('recognizes saved and missed phrases as gradable, and nothing else', () => {
    const saved: SavedPhrase[] = [{ hi: 'नमस्ते', latin: 'namaste', en: 'Hello' }];
    const sceneProgress = { chai: progress({ weakPhrases: [catalogPhrase(1)] }) };

    expect(isRetentionPhrase('नमस्ते', saved, sceneProgress)).toBe(true);
    expect(isRetentionPhrase(catalogPhrase(1), saved, sceneProgress)).toBe(true);
    expect(isRetentionPhrase(catalogPhrase(2), saved, sceneProgress)).toBe(false);
  });
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
