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

/** The unfinished lesson the learner was most recently partway through, if any. */
export function inProgressLesson(sceneProgress: Record<string, SceneProgress>): { lessonId: string; plan: LessonPlan } | undefined {
  return lessonPlans
    .flatMap((plan) => plan.lessonIds.map((lessonId) => ({ lessonId, plan })))
    .filter(({ lessonId }) => {
      const progress = sceneProgress[lessonId];
      return (progress?.completions ?? 0) === 0 && (progress?.lastBeatIndex ?? 0) > 0;
    })
    .reduce<{ lessonId: string; plan: LessonPlan } | undefined>((selected, candidate) => {
      if (!selected) return candidate;
      const candidateTime = Date.parse(sceneProgress[candidate.lessonId]?.lastPracticedAt ?? '');
      const selectedTime = Date.parse(sceneProgress[selected.lessonId]?.lastPracticedAt ?? '');
      const normalizedCandidateTime = Number.isNaN(candidateTime) ? 0 : candidateTime;
      const normalizedSelectedTime = Number.isNaN(selectedTime) ? 0 : selectedTime;
      return normalizedCandidateTime > normalizedSelectedTime ? candidate : selected;
    }, undefined);
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
