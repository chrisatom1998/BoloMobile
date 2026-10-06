import { useCallback, useEffect, useRef } from 'react';

import type { LiveSessionSetup } from '@/hooks/use-realtime-conversation';
import { buildLiveSessionContext, type LiveToolEnvironment, type LiveToolSnapshot } from '@/lib/live-tools';
import { dateKey } from '@/lib/storage';
import { prepareSavedPhraseFromText } from '@/services/bolo-api';
import { useAppState } from '@/state/app-state';

type AppStateValue = ReturnType<typeof useAppState>;

export function liveToolSnapshot(state: AppStateValue): LiveToolSnapshot {
  const today = state.practice.date === dateKey();
  return {
    profile: state.learnerProfile,
    phrases: state.phrases,
    sceneProgress: state.sceneProgress,
    streak: state.streak,
    practiceSecondsToday: today ? state.practice.seconds : 0,
    liveDoneToday: today && state.practice.liveDone,
    duePhraseCount: state.duePhrases.length,
  };
}

/** Builds the tool environment against the latest app state held in `stateRef`. */
export function createAshaToolEnvironment(stateRef: { readonly current: AppStateValue }): LiveToolEnvironment {
  return {
    getSnapshot: () => liveToolSnapshot(stateRef.current),
    // The same preparation path the transcript Save sheet uses: canonical
    // Devanagari is kept as-is, known lesson phrases resolve locally, and
    // anything else is prepared by the Bolo service.
    preparePhrase: ({ originalText, devanagari }, signal) => prepareSavedPhraseFromText({ clientId: stateRef.current.clientId, text: devanagari ?? originalText }, signal),
    savePhrase: (phrase) => stateRef.current.togglePhrase(phrase),
    recordLessonPractice: (lessonId) => {
      const current = stateRef.current;
      // Mark the lesson as practiced without moving its resume point or
      // counting a scored completion, and record today's live practice.
      current.checkpointScene(lessonId, current.sceneProgress[lessonId]?.lastBeatIndex ?? 0);
      current.markLiveTurn();
    },
  };
}

/** Supplies Asha's live session mode, lesson context, and client tool environment. */
export function useAshaLiveSession() {
  const state = useAppState();
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });
  return useCallback((): LiveSessionSetup => ({
    ...buildLiveSessionContext(liveToolSnapshot(stateRef.current)),
    toolEnvironment: createAshaToolEnvironment(stateRef),
  }), []);
}
