import { buildTodayPlan } from '../src/lib/today-plan';
import { dateKey } from '../src/lib/storage';

const now = new Date(2026, 9, 31, 15, 0, 0);
const today = dateKey(now);
const practice = { date: today, liveDone: false };

function statuses(plan: ReturnType<typeof buildTodayPlan>) {
  return plan.steps.map((step) => step.status);
}

describe('buildTodayPlan', () => {
  it('starts with review when phrases are due', () => {
    const plan = buildTodayPlan({ dueCount: 3, now, practice });
    expect(plan.nextStep).toBe('review');
    expect(statuses(plan)).toEqual(['current', 'upcoming', 'upcoming']);
    expect(plan.steps[0]!.skipped).toBe(false);
  });

  it('skips review when nothing is due and moves straight to the lesson', () => {
    const plan = buildTodayPlan({ dueCount: 0, now, practice });
    expect(plan.nextStep).toBe('lesson');
    expect(statuses(plan)).toEqual(['done', 'current', 'upcoming']);
    expect(plan.steps[0]!.skipped).toBe(true);
  });

  it('counts a review session today even when more phrases remain due', () => {
    const plan = buildTodayPlan({ dueCount: 8, now, practice, reviewStreakDays: ['2026-10-30', today] });
    expect(plan.nextStep).toBe('lesson');
    expect(plan.steps[0]).toEqual({ key: 'review', skipped: false, status: 'done' });
  });

  it('marks the lesson done from lesson answers recorded today, not review answers', () => {
    const reviewsOnly = buildTodayPlan({
      dueCount: 0, now, practice,
      practiceHistory: [{ answers: 4, correct: 3, date: today, reviews: 4, seconds: 0 }],
    });
    expect(reviewsOnly.nextStep).toBe('lesson');

    const withLesson = buildTodayPlan({
      dueCount: 0, now, practice,
      practiceHistory: [{ answers: 9, correct: 7, date: today, reviews: 4, seconds: 240 }],
    });
    expect(withLesson.nextStep).toBe('asha');
  });

  it('marks the lesson done from a scene completed earlier today', () => {
    const completedAt = new Date(2026, 9, 31, 9, 30).toISOString();
    const yesterday = new Date(2026, 9, 30, 21, 0).toISOString();
    const base = { completions: 1, bestScore: 0, bestAccuracy: 0, totalCorrect: 0, totalAnswers: 0, weakPhrases: [] };
    expect(buildTodayPlan({ dueCount: 0, now, practice, sceneProgress: { a: { ...base, lastBeatIndex: 0, lastPracticedAt: yesterday } } }).nextStep).toBe('lesson');
    expect(buildTodayPlan({ dueCount: 0, now, practice, sceneProgress: { a: { ...base, lastBeatIndex: 0, lastPracticedAt: completedAt } } }).nextStep).toBe('asha');
  });

  it('finishes the day once Asha has heard from the learner', () => {
    const plan = buildTodayPlan({
      dueCount: 0, now, practice: { date: today, liveDone: true },
      practiceHistory: [{ answers: 5, correct: 5, date: today, reviews: 0, seconds: 300 }],
    });
    expect(plan.nextStep).toBeNull();
    expect(statuses(plan)).toEqual(['done', 'done', 'done']);
  });

  it('ignores a stale live flag from a previous day', () => {
    const plan = buildTodayPlan({ dueCount: 0, now, practice: { date: '2026-10-30', liveDone: true } });
    expect(plan.steps[2]!.status).toBe('upcoming');
  });

  it('keeps the order even when a later step was done first', () => {
    const plan = buildTodayPlan({ dueCount: 2, now, practice: { date: today, liveDone: true } });
    expect(plan.nextStep).toBe('review');
    expect(statuses(plan)).toEqual(['current', 'upcoming', 'done']);
  });
});
