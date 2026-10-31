import { lessonPlans, type LessonPlan } from '@/data/lesson-plans';
import type { LearnerProfile, SceneProgress } from '@/state/app-state-types';

type PathProfile = Pick<LearnerProfile, 'level' | 'primaryGoal'> | null | undefined;

/** The guided plan that matches each onboarding answer to "What matters most?". */
const goalPlanIds: Record<LearnerProfile['primaryGoal'], string> = {
  conversation: 'connection',
  travel: 'getting-around',
  family: 'social-life',
  work: 'work',
};

/**
 * The order a learner walks the guided plans in. Everyone still sees the plans numbered 01–10,
 * but onboarding decides where the path starts: someone new to Hindi begins with Start speaking
 * and then their goal's plan, while a beginner or intermediate learner begins with their goal's plan.
 */
export function orderedLessonPlans(profile: PathProfile): LessonPlan[] {
  const goalPlan = lessonPlans.find((plan) => plan.id === goalPlanIds[profile?.primaryGoal ?? 'conversation']);
  const essentials = lessonPlans.find((plan) => plan.id === 'essentials');
  const leading = (profile?.level === 'beginner' || profile?.level === 'intermediate')
    ? [goalPlan, essentials]
    : [essentials, goalPlan];
  const first = leading.filter((plan, index): plan is LessonPlan => Boolean(plan) && leading.indexOf(plan) === index);
  return [...first, ...lessonPlans.filter((plan) => !first.includes(plan))];
}

export type LessonSelection = {
  lessonId: string;
  mode: 'continue' | 'next' | 'review';
  plan: LessonPlan;
};

/** A lesson counts as complete once it has been finished at least once. */
function isCompleted(progress: SceneProgress | undefined) {
  return (progress?.completions ?? 0) > 0;
}

/** A lesson is partway through when it was started but never finished. */
function isPartway(progress: SceneProgress | undefined) {
  return !isCompleted(progress) && (progress?.lastBeatIndex ?? 0) > 0;
}

function practicedAt(progress: SceneProgress | undefined) {
  const time = Date.parse(progress?.lastPracticedAt ?? '');
  return Number.isNaN(time) ? 0 : time;
}

/** The most recently practiced partway lesson among `candidates`; the earlier candidate wins a tie. */
function mostRecentPartway<T extends { lessonId: string }>(candidates: T[], sceneProgress: Record<string, SceneProgress>): T | undefined {
  return candidates
    .filter(({ lessonId }) => isPartway(sceneProgress[lessonId]))
    .reduce<T | undefined>((selected, candidate) => {
      if (!selected) return candidate;
      return practicedAt(sceneProgress[candidate.lessonId]) > practicedAt(sceneProgress[selected.lessonId]) ? candidate : selected;
    }, undefined);
}

/** The unfinished lesson the learner was most recently partway through, if any. */
export function inProgressLesson(sceneProgress: Record<string, SceneProgress>): { lessonId: string; plan: LessonPlan } | undefined {
  return mostRecentPartway(lessonPlans.flatMap((plan) => plan.lessonIds.map((lessonId) => ({ lessonId, plan }))), sceneProgress);
}

export type PlanProgress = {
  /** Lessons in the plan. */
  total: number;
  /** Lessons finished at least once. */
  completed: number;
  /** Index of the lesson the learner is partway through in this plan (the most recently practiced one), or -1. */
  inProgressIndex: number;
  /** Index of the first lesson not yet finished, or -1 once every lesson is complete. */
  nextIndex: number;
};

/**
 * One set of counts for a plan, shared by Today, Progress and Lesson plans so they never disagree.
 * Uses the same completion and partway rules as `inProgressLesson` and `selectNextLesson`.
 */
export function getPlanProgress(planId: string, sceneProgress: Record<string, SceneProgress>): PlanProgress {
  const lessonIds = lessonPlans.find((plan) => plan.id === planId)?.lessonIds ?? [];
  const partway = mostRecentPartway(lessonIds.map((lessonId) => ({ lessonId })), sceneProgress);
  return {
    total: lessonIds.length,
    completed: lessonIds.filter((lessonId) => isCompleted(sceneProgress[lessonId])).length,
    inProgressIndex: partway ? lessonIds.indexOf(partway.lessonId) : -1,
    nextIndex: lessonIds.findIndex((lessonId) => !isCompleted(sceneProgress[lessonId])),
  };
}

/** The plan the learner is on now: the one they are partway through, else the first unfinished plan on their path. */
export function currentLessonPlan(sceneProgress: Record<string, SceneProgress>, profile: PathProfile): LessonPlan {
  const ordered = orderedLessonPlans(profile);
  return inProgressLesson(sceneProgress)?.plan
    ?? ordered.find((plan) => plan.lessonIds.some((lessonId) => (sceneProgress[lessonId]?.completions ?? 0) === 0))
    ?? ordered[ordered.length - 1]!;
}

/** One rule for "what lesson is next", shared by Today, Phrases, Progress and Lesson plans. */
export function selectNextLesson(sceneProgress: Record<string, SceneProgress>, profile: PathProfile): LessonSelection {
  const resumed = inProgressLesson(sceneProgress);
  const ordered = orderedLessonPlans(profile);
  const incompletePlan = ordered.find((plan) => plan.lessonIds.some((lessonId) => (sceneProgress[lessonId]?.completions ?? 0) === 0));
  const plan = resumed?.plan ?? incompletePlan ?? ordered[ordered.length - 1]!;
  const lessonId = resumed?.lessonId
    ?? plan.lessonIds.find((id) => (sceneProgress[id]?.completions ?? 0) === 0)
    ?? plan.lessonIds[0]!;
  return { lessonId, mode: resumed ? 'continue' : incompletePlan ? 'next' : 'review', plan };
}
