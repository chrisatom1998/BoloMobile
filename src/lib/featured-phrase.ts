import { getScene } from '@/data/scenes';
import { selectNextLesson } from '@/lib/lesson-path';
import type { LearnerProfile, SavedPhrase, SceneProgress } from '@/state/app-state-types';

export const featuredPhraseFallback: SavedPhrase = {
  en: 'Less sugar, please.',
  hi: 'चीनी कम, कृपया।',
  latin: 'Cheeni kam, kripya.',
};

type FeaturedProfile = Pick<LearnerProfile, 'level' | 'primaryGoal'> | null | undefined;

/** The phrase Asha features: the first due saved phrase, else the line in today's lesson, else the cafe fallback. */
export function selectFeaturedPhrase(
  duePhrases: readonly SavedPhrase[],
  sceneProgress: Record<string, SceneProgress>,
  profile: FeaturedProfile,
): SavedPhrase {
  const due = duePhrases[0];
  if (due) return { en: due.en, hi: due.hi, latin: due.latin };

  const { lessonId } = selectNextLesson(sceneProgress, profile);
  const lesson = getScene(lessonId);
  if (!lesson || lesson.beats.length === 0) return featuredPhraseFallback;
  const beatIndex = Math.min(lesson.beats.length - 1, Math.max(0, sceneProgress[lessonId]?.lastBeatIndex ?? 0));
  const choice = lesson.beats[beatIndex]?.choices.find((item) => item.correct);
  if (!choice) return featuredPhraseFallback;
  return { en: choice.en, hi: choice.hi, latin: choice.latin };
}
