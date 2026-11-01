/**
 * Which quiet state a screen should show. Screens pass the signals they
 * already have: stored progress, a failed read, or an Asha session error.
 */

export type StoragePhase = 'loading' | 'ready' | 'error';

export type ContentPhase = 'loading' | 'error' | 'empty' | 'ready';

export type AshaPhase = 'mic-denied' | 'offline' | 'unavailable' | 'connecting' | 'ready';

export function asAshaPhase(phase: ContentPhase | AshaPhase | null): AshaPhase | null {
  switch (phase) {
    case 'mic-denied':
    case 'offline':
    case 'unavailable':
    case 'connecting':
    case 'ready':
      return phase;
    case 'loading':
    case 'error':
    case 'empty':
    case null:
      return null;
    default: {
      const unreachable: never = phase;
      return unreachable;
    }
  }
}

export function asContentPhase(phase: ContentPhase | AshaPhase | null): ContentPhase | null {
  switch (phase) {
    case 'loading':
    case 'error':
    case 'empty':
    case 'ready':
      return phase;
    case 'mic-denied':
    case 'offline':
    case 'unavailable':
    case 'connecting':
    case null:
      return null;
    default: {
      const unreachable: never = phase;
      return unreachable;
    }
  }
}

export type PreviewScreen = 'today' | 'phrases' | 'asha' | 'lesson-plans' | 'progress';

export type SceneProgressSnapshot = {
  completions?: number;
  lastBeatIndex?: number;
};

export type FreshLearnerInput = {
  phrases: readonly unknown[];
  streak: number;
  reviewStreak?: number;
  practiceSeconds: number;
  practiceHistory?: readonly { seconds: number; reviews: number }[];
  sceneProgress?: Record<string, SceneProgressSnapshot | undefined>;
};

const contentPhases = ['loading', 'error', 'empty', 'ready'] as const;
const ashaPhases = ['mic-denied', 'offline', 'unavailable', 'connecting', 'ready'] as const;

export function storagePhaseFromState(state: { storagePhase?: StoragePhase; hydrated?: boolean }): StoragePhase {
  if (state.storagePhase === 'loading' || state.storagePhase === 'error' || state.storagePhase === 'ready') return state.storagePhase;
  if (state.hydrated === false) return 'loading';
  return 'ready';
}

/** A learner who has not practiced, saved a phrase, or started a lesson. */
export function isFreshLearner(input: FreshLearnerInput) {
  if (input.phrases.length > 0) return false;
  if (input.streak > 0 || (input.reviewStreak ?? 0) > 0) return false;
  if (input.practiceSeconds > 0) return false;
  if ((input.practiceHistory ?? []).some((day) => day.seconds > 0 || day.reviews > 0)) return false;
  return !Object.values(input.sceneProgress ?? {}).some((item) => (item?.completions ?? 0) > 0 || (item?.lastBeatIndex ?? 0) > 0);
}

export function selectTodayState(input: { storagePhase: StoragePhase; fresh: boolean }): ContentPhase {
  if (input.storagePhase === 'loading') return 'loading';
  if (input.storagePhase === 'error') return 'error';
  if (input.fresh) return 'empty';
  return 'ready';
}

export function selectPhrasesState(input: { storagePhase: StoragePhase; savedCount: number }): ContentPhase {
  if (input.storagePhase === 'loading') return 'loading';
  if (input.storagePhase === 'error') return 'error';
  if (input.savedCount === 0) return 'empty';
  return 'ready';
}

export function selectLessonPlansState(input: { storagePhase: StoragePhase; planCount: number }): ContentPhase {
  if (input.storagePhase === 'loading') return 'loading';
  if (input.storagePhase === 'error') return 'error';
  if (input.planCount === 0) return 'empty';
  return 'ready';
}

export function selectProgressState(input: { storagePhase: StoragePhase; hasActivity: boolean }): ContentPhase {
  if (input.storagePhase === 'loading') return 'loading';
  if (input.storagePhase === 'error') return 'error';
  if (!input.hasActivity) return 'empty';
  return 'ready';
}

/**
 * Asha's blocking states, in the order a learner can act on them.
 * A denied microphone wins over a network failure, and a failure wins over
 * the connecting spinner that preceded it.
 */
export function selectAshaState(input: {
  micDenied: boolean;
  offline: boolean;
  unavailable: boolean;
  connecting: boolean;
}): AshaPhase {
  if (input.micDenied) return 'mic-denied';
  if (input.offline) return 'offline';
  if (input.unavailable) return 'unavailable';
  if (input.connecting) return 'connecting';
  return 'ready';
}

export function previewPhaseFor(screen: PreviewScreen, requestedScreen: string | null, requestedPhase: string | null): ContentPhase | AshaPhase | null {
  if (!requestedScreen || requestedScreen !== screen || !requestedPhase) return null;
  if (screen === 'asha') {
    return isPhase(requestedPhase, ashaPhases) ? requestedPhase : null;
  }
  return isPhase(requestedPhase, contentPhases) ? requestedPhase : null;
}

function isPhase<T extends string>(value: string, allowed: readonly T[]): value is T {
  return allowed.some((phase) => phase === value);
}
