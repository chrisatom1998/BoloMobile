import { lessonPlans, type LessonPlan } from '@/data/lesson-plans';
import { getScene, scenes, type Scene, type SceneCategory } from '@/data/scenes';
import { dateKey, previousDate } from '@/lib/storage';
import type { LearnerProfile, PhraseReview, PracticeDay, SavedPhrase, SceneProgress } from '@/state/app-state-types';

const goalCategories: Record<LearnerProfile['primaryGoal'], SceneCategory[]> = {
  conversation: ['Everyday', 'Social', 'Food'],
  travel: ['Travel', 'Food', 'Health'],
  family: ['Social', 'Everyday', 'Health'],
  work: ['Work', 'Everyday', 'Social'],
};

const goalPathKickers: Record<LearnerProfile['primaryGoal'], string> = {
  conversation: 'YOUR CONVERSATION PATH',
  family: 'YOUR FAMILY PATH',
  travel: 'YOUR TRAVEL PATH',
  work: 'YOUR WORK PATH',
};

const goalPreviewCopy: Record<LearnerProfile['primaryGoal'], { foundation: string; direct: string }> = {
  conversation: {
    foundation: "We'll start with greetings, then everyday conversation.",
    direct: 'Jump into richer everyday conversation.',
  },
  family: {
    foundation: "We'll start with greetings, then talk with family and friends.",
    direct: 'Jump into spending time together.',
  },
  travel: {
    foundation: "We'll start with greetings, then get you moving around town.",
    direct: 'Jump into Get around town.',
  },
  work: {
    foundation: "We'll start with greetings, then workplace Hindi.",
    direct: 'Jump into Work with clarity.',
  },
};

/** The two plans every newer learner starts from, in the order they are taught. */
const foundationPlanIds = ['essentials', 'connection'];

export type LessonSelection = {
  action: 'Continue' | 'Start lesson' | 'Review lesson';
  kicker: 'CONTINUE LESSON' | 'NEXT LESSON' | 'REVIEW LESSON';
  pathKicker: string;
  lessonId: string;
  plan: LessonPlan;
  title: string;
  why: string;
};

export function planPreviewCopy(profile: LearnerProfile) {
  const copy = goalPreviewCopy[profile.primaryGoal];
  return profile.level === 'intermediate' ? copy.direct : copy.foundation;
}

function planIsIncomplete(plan: LessonPlan, progress: Record<string, SceneProgress>) {
  return plan.lessonIds.some((lessonId) => (progress[lessonId]?.completions ?? 0) === 0);
}

function planIsStarted(plan: LessonPlan, progress: Record<string, SceneProgress>) {
  return plan.lessonIds.some((lessonId) => (progress[lessonId]?.completions ?? 0) > 0 || (progress[lessonId]?.lastBeatIndex ?? 0) > 0);
}

/**
 * Plans in the order this learner should meet them: foundations first for newer learners,
 * then the plans that serve their goal (strongest category first), then everything else.
 * Intermediate learners skip Starter plans they have never opened.
 */
function goalAwarePlans(profile: LearnerProfile, progress: Record<string, SceneProgress>) {
  const preferred = goalCategories[profile.primaryGoal];
  const foundations = profile.level === 'intermediate'
    ? []
    : lessonPlans.filter((plan) => foundationPlanIds.includes(plan.id));
  const rest = lessonPlans.filter((plan) => !foundations.includes(plan)
    && (profile.level !== 'intermediate' || plan.level !== 'Starter' || planIsStarted(plan, progress)));
  const goalPlans = preferred.flatMap((category) => rest.filter((plan) => plan.category === category));
  return [...foundations, ...goalPlans, ...rest.filter((plan) => !goalPlans.includes(plan))];
}

/**
 * The single lesson Today offers and onboarding previews. A lesson left mid-practice always
 * wins so recalibrating a plan never yanks a learner out of the turn they were on.
 */
export function selectNextLesson(profile: LearnerProfile, progress: Record<string, SceneProgress>): LessonSelection {
  const catalog = lessonPlans.flatMap((plan) => plan.lessonIds.map((lessonId) => ({ lessonId, plan })));
  const resumed = catalog
    .filter(({ lessonId }) => (progress[lessonId]?.completions ?? 0) === 0 && (progress[lessonId]?.lastBeatIndex ?? 0) > 0)
    .reduce<(typeof catalog)[number] | undefined>((selected, candidate) => {
      if (!selected) return candidate;
      const candidateTime = Date.parse(progress[candidate.lessonId]?.lastPracticedAt ?? '');
      const selectedTime = Date.parse(progress[selected.lessonId]?.lastPracticedAt ?? '');
      const normalizedCandidateTime = Number.isNaN(candidateTime) ? 0 : candidateTime;
      const normalizedSelectedTime = Number.isNaN(selectedTime) ? 0 : selectedTime;
      return normalizedCandidateTime > normalizedSelectedTime ? candidate : selected;
    }, undefined);
  const incompletePlan = goalAwarePlans(profile, progress).find((plan) => planIsIncomplete(plan, progress))
    ?? lessonPlans.find((plan) => planIsIncomplete(plan, progress));
  const plan = resumed?.plan ?? incompletePlan ?? lessonPlans[lessonPlans.length - 1]!;
  const lessonId = resumed?.lessonId
    ?? plan.lessonIds.find((id) => (progress[id]?.completions ?? 0) === 0)
    ?? plan.lessonIds[0]!;
  const mode = resumed ? 'continue' : incompletePlan ? 'next' : 'review';

  return {
    action: mode === 'continue' ? 'Continue' : mode === 'next' ? 'Start lesson' : 'Review lesson',
    kicker: mode === 'continue' ? 'CONTINUE LESSON' : mode === 'next' ? 'NEXT LESSON' : 'REVIEW LESSON',
    pathKicker: goalPathKickers[profile.primaryGoal],
    lessonId,
    plan,
    title: getScene(lessonId)?.title ?? plan.title,
    why: planPreviewCopy(profile),
  };
}

export function recommendedScenes(profile: LearnerProfile, progress: Record<string, SceneProgress>, limit = 3): Scene[] {
  const preferred = goalCategories[profile.primaryGoal];
  const levelRank = profile.level === 'intermediate'
    ? ['Intermediate', 'Beginner', 'Starter']
    : ['Starter', 'Beginner', 'Intermediate'];
  return [...scenes].sort((a, b) => {
    const aProgress = progress[a.id];
    const bProgress = progress[b.id];
    const aResume = Number((aProgress?.lastBeatIndex ?? 0) > 0);
    const bResume = Number((bProgress?.lastBeatIndex ?? 0) > 0);
    if (aResume !== bResume) return bResume - aResume;
    const aComplete = Number((aProgress?.completions ?? 0) > 0);
    const bComplete = Number((bProgress?.completions ?? 0) > 0);
    if (aComplete !== bComplete) return aComplete - bComplete;
    const aGoal = preferred.indexOf(a.category);
    const bGoal = preferred.indexOf(b.category);
    if (aGoal !== bGoal) return (aGoal < 0 ? 99 : aGoal) - (bGoal < 0 ? 99 : bGoal);
    return levelRank.indexOf(a.level) - levelRank.indexOf(b.level);
  }).slice(0, limit);
}

export const reviewIntervals = [0, 1, 3, 7, 14, 30];

export function duePhraseList(phrases: SavedPhrase[], reviews: Record<string, PhraseReview>, today = dateKey()) {
  return phrases.filter((phrase) => (reviews[phrase.hi]?.dueAt ?? today) <= today);
}

export function dueSavedPhrases(phrases: SavedPhrase[], reviews: Record<string, PhraseReview>, limit = 5) {
  return duePhraseList(phrases, reviews)
    .sort((a, b) => (reviews[a.hi]?.mastery ?? 0) - (reviews[b.hi]?.mastery ?? 0))
    .slice(0, limit);
}

export function weeklyPractice(history: PracticeDay[], today = dateKey()) {
  const byDate = new Map(history.map((day) => [day.date, day]));
  const result: PracticeDay[] = [];
  let cursor = today;
  for (let index = 0; index < 7; index += 1) {
    result.unshift(byDate.get(cursor) ?? { date: cursor, seconds: 0, correct: 0, answers: 0, reviews: 0 });
    cursor = previousDate(cursor);
  }
  return result;
}

export function categoryMastery(progress: Record<string, SceneProgress>) {
  return (['Food', 'Travel', 'Everyday', 'Health', 'Social', 'Work'] as SceneCategory[]).map((category) => {
    const categoryScenes = scenes.filter((scene) => scene.category === category);
    const completed = categoryScenes.filter((scene) => (progress[scene.id]?.completions ?? 0) > 0).length;
    return { category, completed, total: categoryScenes.length, percent: Math.round(completed / categoryScenes.length * 100) };
  });
}

export function learningAccuracy(progress: Record<string, SceneProgress>) {
  const totals = Object.values(progress).reduce((sum, item) => ({
    correct: sum.correct + item.totalCorrect,
    answers: sum.answers + item.totalAnswers,
  }), { correct: 0, answers: 0 });
  return totals.answers > 0 ? Math.round(totals.correct / totals.answers * 100) : 0;
}

export const milestones = [
  { id: 'order-food', title: 'Order food', sceneIds: ['chai', 'restaurant'] },
  { id: 'navigate-station', title: 'Navigate a station', sceneIds: ['rickshaw', 'train'] },
  { id: 'meet-people', title: 'Meet someone new', sceneIds: ['friend'] },
  { id: 'handle-a-problem', title: 'Handle a problem', sceneIds: ['lost'] },
] as const;

export function milestoneProgress(progress: Record<string, SceneProgress>) {
  return milestones.map((milestone) => {
    const completed = milestone.sceneIds.filter((id) => (progress[id]?.completions ?? 0) > 0).length;
    return { ...milestone, completed, achieved: completed === milestone.sceneIds.length };
  });
}
