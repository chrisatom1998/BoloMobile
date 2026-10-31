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

type TodayPlanInput = {
  dueCount: number;
  practice: Pick<PersistedState['practice'], 'date' | 'liveDone'>;
  practiceHistory?: PersistedState['practiceHistory'];
  reviewStreakDays?: PersistedState['reviewStreakDays'];
  sceneProgress?: PersistedState['sceneProgress'];
  now?: Date;
};

const stepOrder: TodayStepKey[] = ['review', 'lesson', 'asha'];

function lessonFinishedToday({ practiceHistory = [], sceneProgress = {} }: TodayPlanInput, today: string) {
  // Review answers also count toward `answers`, so only the remainder came from lessons.
  const history = practiceHistory.find((day) => day.date === today);
  if (history && history.answers - history.reviews > 0) return true;
  return Object.values(sceneProgress).some((progress) => {
    if (progress.completions <= 0 || progress.lastBeatIndex !== 0 || !progress.lastPracticedAt) return false;
    const practicedAt = new Date(progress.lastPracticedAt);
    return !Number.isNaN(practicedAt.getTime()) && dateKey(practicedAt) === today;
  });
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
