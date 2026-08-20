import { scenes, type Scene, type SceneCategory } from '@/data/scenes';
import { dateKey, previousDate } from '@/lib/storage';
import type { LearnerProfile, PhraseReview, PracticeDay, SavedPhrase, SceneProgress } from '@/state/app-state-types';

const goalCategories: Record<LearnerProfile['primaryGoal'], SceneCategory[]> = {
  conversation: ['Everyday', 'Social', 'Food'],
  travel: ['Travel', 'Food', 'Health'],
  family: ['Social', 'Everyday', 'Health'],
  work: ['Work', 'Everyday', 'Social'],
};

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

/** Scene answers a learner missed are only reviewable when the catalog still holds their translations. */
const scenePhrases = new Map<string, SavedPhrase>();
for (const scene of scenes) {
  for (const beat of scene.beats) {
    for (const choice of beat.choices) {
      if (!scenePhrases.has(choice.hi)) scenePhrases.set(choice.hi, { hi: choice.hi, latin: choice.latin, en: choice.en });
    }
  }
}

/** Keeps the retention queue reviewable in one sitting when a learner has missed answers across many scenes. */
export const maxWeakPhraseCards = 20;

function practicedTime(progress: SceneProgress) {
  const parsed = Date.parse(progress.lastPracticedAt ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Review cards for the answers a learner missed, most recently practiced scene first. */
export function weakPhraseCards(progress: Record<string, SceneProgress>, limit = maxWeakPhraseCards): SavedPhrase[] {
  const cards = new Map<string, SavedPhrase>();
  for (const scene of Object.values(progress).sort((a, b) => practicedTime(b) - practicedTime(a))) {
    for (const hi of scene.weakPhrases) {
      const card = scenePhrases.get(hi);
      if (!card || cards.has(hi)) continue;
      cards.set(hi, card);
      if (cards.size >= limit) return [...cards.values()];
    }
  }
  return [...cards.values()];
}

/**
 * The full retention pool: phrases the learner saved plus the ones they got wrong in a scene, so
 * review still has cards for learners who never tapped save. Saved phrases stay first so their
 * schedule keeps priority when mastery ties.
 */
export function retentionPhrases(
  phrases: SavedPhrase[],
  progress: Record<string, SceneProgress>,
  limit = maxWeakPhraseCards,
): SavedPhrase[] {
  const saved = new Set(phrases.map((phrase) => phrase.hi));
  return [...phrases, ...weakPhraseCards(progress, limit).filter((card) => !saved.has(card.hi))];
}

/** Grading and review history stay available for any phrase the retention loop can show. */
export function isRetentionPhrase(hi: string, phrases: SavedPhrase[], progress: Record<string, SceneProgress>) {
  return phrases.some((phrase) => phrase.hi === hi)
    || Object.values(progress).some((scene) => scene.weakPhrases.includes(hi));
}

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
