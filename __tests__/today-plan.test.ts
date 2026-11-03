import { buildTodayPlan, completedLessonCount, completedLessonIds, isFirstRun } from '../src/lib/today-plan';
import { dateKey } from '../src/lib/storage';

const now = new Date(2026, 9, 31, 15, 0, 0);
const today = dateKey(now);
const practice = { date: today, liveDone: false };
const lessonDoneToday = [{ answers: 9, correct: 7, date: today, reviews: 4, seconds: 240 }];

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

  it('does not count lesson answers from a previous day', () => {
    const plan = buildTodayPlan({
      dueCount: 0, now, practice,
      practiceHistory: [{ answers: 9, correct: 7, date: '2026-10-30', reviews: 0, seconds: 240 }],
    });
    expect(plan.nextStep).toBe('lesson');
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

  it('needs a lesson completion as well as today’s lesson answers once scene progress is given', () => {
    // Seeded or odd data: history says a lesson was answered, but no lesson has ever been completed.
    const noCompletion = buildTodayPlan({ dueCount: 0, now, practice, practiceHistory: lessonDoneToday, sceneProgress: {} });
    expect(noCompletion.nextStep).toBe('lesson');
    expect(noCompletion.steps[1]!.status).toBe('current');

    const startedOnly = buildTodayPlan({ dueCount: 0, now, practice, practiceHistory: lessonDoneToday, sceneProgress: { 'plan-essentials-01': { completions: 0, lastBeatIndex: 3 } } });
    expect(startedOnly.nextStep).toBe('lesson');

    const completed = buildTodayPlan({ dueCount: 0, now, practice, practiceHistory: lessonDoneToday, sceneProgress: { 'plan-essentials-01': { completions: 1 } } });
    expect(completed.nextStep).toBe('asha');
    expect(completed.steps[1]!.status).toBe('done');
  });

  it('keeps the history-only rule when scene progress is omitted', () => {
    const plan = buildTodayPlan({ dueCount: 0, now, practice, practiceHistory: lessonDoneToday });
    expect(plan.nextStep).toBe('asha');
  });

  it('never marks the lesson done from a completion alone', () => {
    const plan = buildTodayPlan({ dueCount: 0, now, practice, sceneProgress: { 'plan-essentials-01': { completions: 1 } } });
    expect(plan.nextStep).toBe('lesson');
  });
});

describe('completedLessonIds', () => {
  const lessonIds = ['plan-essentials-01', 'plan-essentials-02', 'plan-essentials-03'];

  it('lists only the plan’s lessons with a completion, in plan order', () => {
    const sceneProgress = {
      'plan-essentials-03': { completions: 2 },
      'plan-essentials-01': { completions: 1 },
      'plan-essentials-02': { completions: 0, lastBeatIndex: 4 },
      'plan-connection-01': { completions: 1 },
    };
    expect(completedLessonIds(lessonIds, sceneProgress)).toEqual(['plan-essentials-01', 'plan-essentials-03']);
    expect(completedLessonCount(lessonIds, sceneProgress)).toBe(2);
  });

  it('counts nothing with no progress', () => {
    expect(completedLessonIds(lessonIds, {})).toEqual([]);
    expect(completedLessonCount(lessonIds, {})).toBe(0);
  });
});

describe('isFirstRun', () => {
  const untouched = { now, practice: { date: today, seconds: 0 }, streak: 0 };

  it('is true before any practice', () => {
    expect(isFirstRun(untouched)).toBe(true);
    expect(isFirstRun({ ...untouched, practiceHistory: [], sceneProgress: {} })).toBe(true);
    // Stale minutes from another day do not count as today's.
    expect(isFirstRun({ ...untouched, practice: { date: '2026-10-30', seconds: 0 } })).toBe(true);
    // Progress rows that were never started, and empty day lists, are still untouched.
    expect(isFirstRun({ ...untouched, reviewStreakDays: [], sceneProgress: { 'plan-essentials-01': { completions: 0, lastBeatIndex: 0 } }, streakDays: [] })).toBe(true);
    // A stale live or chai flag from another day with no recorded day does not count either.
    expect(isFirstRun({ ...untouched, practice: { chaiDone: false, date: '2026-10-30', liveDone: false, seconds: 0 } })).toBe(true);
  });

  it('ends with a streak, minutes today, minutes on any past day, or a lesson started or finished', () => {
    expect(isFirstRun({ ...untouched, streak: 1 })).toBe(false);
    expect(isFirstRun({ ...untouched, practice: { date: today, seconds: 30 } })).toBe(false);
    expect(isFirstRun({ ...untouched, practiceHistory: [{ answers: 0, correct: 0, date: '2026-10-01', reviews: 0, seconds: 60 }] })).toBe(false);
    expect(isFirstRun({ ...untouched, sceneProgress: { 'plan-essentials-01': { completions: 0, lastBeatIndex: 1 } } })).toBe(false);
    expect(isFirstRun({ ...untouched, sceneProgress: { 'plan-essentials-01': { completions: 1 } } })).toBe(false);
  });

  it('ends with any durable activity, even when it recorded no minutes', () => {
    // Onboarding writes only the goal and profile, so any history row means the learner practised.
    expect(isFirstRun({ ...untouched, practiceHistory: [{ answers: 0, correct: 0, date: today, reviews: 0, seconds: 0 }] })).toBe(false);
    expect(isFirstRun({ ...untouched, streakDays: ['2026-10-01'] })).toBe(false);
    expect(isFirstRun({ ...untouched, reviewStreakDays: ['2026-10-01'] })).toBe(false);
    expect(isFirstRun({ ...untouched, practice: { chaiDone: true, date: '2026-10-01', liveDone: false, seconds: 0 } })).toBe(false);
    expect(isFirstRun({ ...untouched, practice: { chaiDone: false, date: '2026-10-01', liveDone: true, seconds: 0 } })).toBe(false);
  });

  it('stays over for a returning learner whose streak expired after a zero-second live turn', () => {
    // markLiveTurn() can store liveDone with a zero-second history row and add the day to streakDays.
    // Once the streak lapses to 0, that day list and the flag are the only trace of the practice.
    const expired = {
      ...untouched,
      practice: { chaiDone: false, date: '2026-10-01', liveDone: true, seconds: 0 },
      practiceHistory: [{ answers: 0, correct: 0, date: '2026-10-01', reviews: 0, seconds: 0 }],
      streakDays: ['2026-10-01'],
    };
    expect(isFirstRun(expired)).toBe(false);
    expect(isFirstRun({ ...expired, practiceHistory: [] })).toBe(false);
    expect(isFirstRun({ ...expired, practiceHistory: [], streakDays: [] })).toBe(false);
  });
});
