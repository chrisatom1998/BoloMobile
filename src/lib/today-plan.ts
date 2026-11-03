import { dateKey, type PersistedState } from '@/lib/storage';

export type TodayStepKey = 'review' | 'lesson' | 'asha';
export type TodayStepStatus = 'done' | 'current' | 'upcoming';

export type TodayStep = {
  key: TodayStepKey;
  status: TodayStepStatus;
  /** The review step counts as done with nothing due; this tells the two apart. */
  skipped: boolean;
};

export type TodayPlan = {
  steps: TodayStep[];
  /** The first unfinished step, or null once all three are done. */
  nextStep: TodayStepKey | null;
};

/** The slice of scene progress Today reads; the full record is accepted too. */
type LessonProgress = Partial<Pick<PersistedState['sceneProgress'][string], 'completions' | 'lastBeatIndex'>>;
type LessonProgressMap = Record<string, LessonProgress | undefined>;

type TodayPlanInput = {
  dueCount: number;
  practice: Pick<PersistedState['practice'], 'date' | 'liveDone'>;
  practiceHistory?: PersistedState['practiceHistory'];
  reviewStreakDays?: PersistedState['reviewStreakDays'];
  /**
   * When given, the lesson step can only be done once a lesson has a completion, so it
   * never reads "Finished a lesson" beside a path showing 0 completed lessons.
   */
  sceneProgress?: LessonProgressMap;
  now?: Date;
};

const stepOrder: TodayStepKey[] = ['review', 'lesson', 'asha'];

/**
 * Which of a plan's lessons are complete. The one source for the Your path meta, its
 * VoiceOver label and the segment bar, so the three can never disagree.
 */
export function completedLessonIds(lessonIds: readonly string[], sceneProgress: LessonProgressMap) {
  return lessonIds.filter((id) => (sceneProgress[id]?.completions ?? 0) > 0);
}

/** Count form of `completedLessonIds`, for one plan. `learning.completedLessonCount` counts across every plan. */
export function completedLessonCount(lessonIds: readonly string[], sceneProgress: LessonProgressMap) {
  return completedLessonIds(lessonIds, sceneProgress).length;
}

function anyLessonCompleted(sceneProgress: LessonProgressMap) {
  return Object.values(sceneProgress).some((progress) => (progress?.completions ?? 0) > 0);
}

function lessonFinishedToday({ practiceHistory = [], sceneProgress }: TodayPlanInput, today: string) {
  // Review answers also count toward `answers`, so only the remainder came from lessons.
  // A completed scene left at beat 0 is not enough: reopening it, or Asha checkpointing
  // it, refreshes `lastPracticedAt` without recording a lesson finished today.
  const history = practiceHistory.find((day) => day.date === today);
  if (!history || history.answers - history.reviews <= 0) return false;
  // completeScene records both together, so with progress in hand a finished lesson must also show a completion.
  return sceneProgress === undefined || anyLessonCompleted(sceneProgress);
}

type FirstRunInput = {
  streak: number;
  practice: Pick<PersistedState['practice'], 'date' | 'seconds'> & Partial<Pick<PersistedState['practice'], 'chaiDone' | 'liveDone'>>;
  practiceHistory?: PersistedState['practiceHistory'];
  /** Every day with recorded practice, whether or not it still counts toward the streak. */
  streakDays?: PersistedState['streakDays'];
  reviewStreakDays?: PersistedState['reviewStreakDays'];
  sceneProgress?: LessonProgressMap;
  now?: Date;
};

/**
 * True until the learner has practised at all: no streak, no minutes today, no recorded
 * day, no history row, no live or chai turn, and no lesson started or finished. Derived
 * from stored progress only. Onboarding writes just the goal and profile, so any history
 * row or recorded day is real activity even when it logged zero seconds: a lapsed streak
 * must not turn a returning learner back into a first-timer.
 */
export function isFirstRun({ now, practice, practiceHistory = [], reviewStreakDays = [], sceneProgress = {}, streak, streakDays = [] }: FirstRunInput) {
  if (streak > 0) return false;
  if (practice.date === dateKey(now) && practice.seconds > 0) return false;
  if (practice.liveDone || practice.chaiDone) return false;
  if (practiceHistory.length > 0 || streakDays.length > 0 || reviewStreakDays.length > 0) return false;
  return !Object.values(sceneProgress).some((progress) => (progress?.completions ?? 0) > 0 || (progress?.lastBeatIndex ?? 0) > 0);
}

/**
 * Today's guided loop: recall what is due, learn the next lesson, then say it
 * aloud with Asha. Everything is derived from progress Bolo already stores, so
 * the plan resets itself at local midnight with no extra persistence.
 */
export function buildTodayPlan(input: TodayPlanInput): TodayPlan {
  const today = dateKey(input.now);
  const reviewedToday = (input.reviewStreakDays ?? []).includes(today);
  const done: Record<TodayStepKey, boolean> = {
    review: reviewedToday || input.dueCount === 0,
    lesson: lessonFinishedToday(input, today),
    asha: input.practice.date === today && input.practice.liveDone,
  };
  const nextStep = stepOrder.find((key) => !done[key]) ?? null;
  return {
    nextStep,
    steps: stepOrder.map((key) => ({
      key,
      skipped: key === 'review' && !reviewedToday && input.dueCount === 0,
      status: done[key] ? 'done' : key === nextStep ? 'current' : 'upcoming',
    })),
  };
}
