import { useCallback, useEffect, useRef } from 'react';

import type { LiveSessionSetup } from '@/hooks/use-realtime-conversation';
import { showAppAlert } from '@/lib/app-alert';
import { buildLiveSessionContext, type LiveToolEnvironment, type LiveToolSnapshot } from '@/lib/live-tools';
import { dateKey } from '@/lib/storage';
import { prepareSavedPhraseFromText } from '@/services/bolo-api';
import { useAppState } from '@/state/app-state';
import type { SavedPhrase } from '@/state/app-state-types';

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

/** Asks the learner in the app before Asha saves a phrase. Resolves false if they decline or the session ends first. */
export function confirmPhraseSave(phrase: SavedPhrase, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (approved: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve(approved);
    };
    const onAbort = () => finish(false);
    signal.addEventListener('abort', onAbort);
    showAppAlert(
      'Save this phrase?',
      `${phrase.hi}\n${phrase.latin}\n${phrase.en}`,
      [
        { text: 'Not now', style: 'cancel', onPress: () => finish(false) },
        { text: 'Save', onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}

/** Builds the tool environment against the latest app state held in `stateRef`. */
export function createAshaToolEnvironment(stateRef: { readonly current: AppStateValue }): LiveToolEnvironment {
  return {
    getSnapshot: () => liveToolSnapshot(stateRef.current),
    // The same preparation path the transcript Save sheet uses: canonical
    // Devanagari is kept as-is, known lesson phrases resolve locally, and
    // anything else is prepared by the Bolo service.
    preparePhrase: ({ originalText, devanagari }, signal) => prepareSavedPhraseFromText({ clientId: stateRef.current.clientId, text: devanagari ?? originalText }, signal),
    confirmSave: confirmPhraseSave,
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
