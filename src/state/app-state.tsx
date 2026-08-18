import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { showAppAlert } from '@/lib/app-alert';
import { duePhraseList, dueSavedPhrases, reviewIntervals } from '@/lib/learning';
import { clearObservability, observe } from '@/lib/observability';
import { cancelPracticeReminder } from '@/lib/practice-reminder';
import { updatePracticeWidget } from '@/lib/practice-widget';
import {
  appendChatHistory,
  calculateStreak,
  createAiConsentRecord,
  dateKey,
  defaultLearnerProfile,
  defaultPhraseReview,
  defaultReminderSettings,
  defaultSceneProgress,
  emptyPractice,
  MAX_DAILY_PRACTICE_SECONDS,
  sanitizeClientId,
  sanitizeAiConsent,
  sanitizeChatHistory,
  sanitizeGoal,
  sanitizeLearnerProfile,
  sanitizeMotionPreference,
  sanitizePhraseReviews,
  sanitizePhrases,
  sanitizePractice,
  sanitizePracticeHistory,
  sanitizeReminder,
  sanitizeSceneProgress,
  sanitizeStreakDays,
  storageEntries,
  storageKeys,
  type PersistedState,
} from '@/lib/storage';
import type { ChatMessage, LearnerProfile, MotionPreference, ReminderSettings, SavedPhrase } from '@/state/app-state-types';

type PersistedKey = keyof typeof storageKeys;

type SceneCompletion = {
  score: number;
  correct: number;
  total: number;
  weakPhrases: string[];
};

type AppStateSlices = Omit<PersistedState, 'aiConsent'> & {
  aiConsent: boolean;
  hydrated: boolean;
  streak: number;
  dailySteps: number;
  duePhrases: SavedPhrase[];
  reviewStreak: number;
};

type AppActions = {
  setGoal: (goal: 5 | 10 | 15) => void;
  completeOnboarding: (profile: Omit<LearnerProfile, 'completed'>, goal: 5 | 10 | 15) => void;
  updateLearnerProfile: (profile: Partial<Omit<LearnerProfile, 'completed'>>) => void;
  togglePhrase: (phrase: SavedPhrase) => void;
  removePhrase: (hi: string) => void;
  checkpointScene: (sceneId: string, nextBeatIndex: number) => void;
  markSceneComplete: (sceneId: string, seconds: number, result?: SceneCompletion) => void;
  reviewPhrase: (hi: string, remembered: boolean) => void;
  markLiveTurn: (seconds?: number) => void;
  addPracticeSeconds: (seconds: number) => void;
  appendChatMessages: (messages: ChatMessage[]) => void;
  clearChatHistory: () => void;
  setAiConsent: (consent: boolean) => Promise<boolean>;
  setReminder: (reminder: ReminderSettings) => void;
  setMotionPreference: (preference: MotionPreference) => void;
  clearAllData: () => Promise<void>;
};

type AppStateValue = AppStateSlices & AppActions;

const initialState: PersistedState = {
  phrases: [],
  goal: 10,
  practice: emptyPractice(),
  streakDays: [],
  clientId: 'loading-client',
  aiConsent: null,
  chatHistory: [],
  learnerProfile: defaultLearnerProfile(),
  sceneProgress: {},
  phraseReviews: {},
  practiceHistory: [],
  reviewStreakDays: [],
  reminder: defaultReminderSettings(),
  motionPreference: 'gentle',
};

const AppStateContext = createContext<AppStateSlices | null>(null);
const AppActionsContext = createContext<AppActions | null>(null);

function currentPractice(state: PersistedState) {
  return state.practice.date === dateKey() ? state.practice : emptyPractice();
}

function completedToday(practice: PersistedState['practice']) {
  return practice.chaiDone || practice.liveDone || practice.seconds > 0;
}

function withRecordedDay(days: string[], practice: PersistedState['practice']) {
  if (!completedToday(practice)) return days;
  return [...new Set([...days, practice.date])].sort().slice(-400);
}

function cappedPracticeSeconds(currentSeconds: number, requestedSeconds: number) {
  const current = Math.min(MAX_DAILY_PRACTICE_SECONDS, Math.max(0, Math.round(currentSeconds)));
  const increment = Number.isFinite(requestedSeconds) ? Math.max(0, Math.round(requestedSeconds)) : 0;
  const next = Math.min(MAX_DAILY_PRACTICE_SECONDS, current + increment);
  return { added: next - current, total: next };
}

function updatePracticeHistory(
  history: PersistedState['practiceHistory'],
  updates: Partial<Omit<PersistedState['practiceHistory'][number], 'date'>>,
) {
  const today = dateKey();
  const existing = history.find((day) => day.date === today) ?? { date: today, seconds: 0, correct: 0, answers: 0, reviews: 0 };
  const next = {
    ...existing,
    seconds: Math.min(24 * 60 * 60, existing.seconds + Math.max(0, Math.round(updates.seconds ?? 0))),
    correct: existing.correct + Math.max(0, Math.round(updates.correct ?? 0)),
    answers: existing.answers + Math.max(0, Math.round(updates.answers ?? 0)),
    reviews: existing.reviews + Math.max(0, Math.round(updates.reviews ?? 0)),
  };
  return [...history.filter((day) => day.date !== today), next].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
}

function addDays(key: string, days: number) {
  const value = new Date(`${key}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dateKey(value);
}

async function persistState(state: PersistedState, keys: PersistedKey[]) {
  await AsyncStorage.multiSet(storageEntries(state, keys));
}

function reportPersistenceFailure(error: unknown, message = 'Your last change was not saved and has been restored. Check available storage and try again.') {
  console.warn('Bolo could not save local progress.', error);
  observe('runtime_error');
  showAppAlert('Could not save on this device', message);
}

export function restoreFailedPersistedState(
  latest: PersistedState,
  previous: PersistedState,
  failed: PersistedState,
  keys: PersistedKey[],
) {
  const stillShowsFailedWrite = keys.every((key) => JSON.stringify(latest[key]) === JSON.stringify(failed[key]));
  if (!stillShowsFailedWrite) return latest;
  return {
    ...latest,
    ...Object.fromEntries(keys.map((key) => [key, previous[key]])),
  } as PersistedState;
}

export async function persistAiConsentChoice(aiConsent: boolean) {
  const nextConsent = aiConsent ? createAiConsentRecord() : null;
  await AsyncStorage.setItem(storageKeys.aiConsent, JSON.stringify(nextConsent));
  return nextConsent;
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<PersistedState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  // State updaters may run more than once in development. Keep persistence
  // outside React's state setter so a render retry cannot write twice.
  const stateRef = useRef<PersistedState>(initialState);
  const persistenceTailRef = useRef<Promise<void>>(Promise.resolve());
  const clearingAllDataRef = useRef(false);

  const replaceState = useCallback((next: PersistedState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const enqueuePersistence = useCallback(<T,>(operation: () => Promise<T>) => {
    const result = persistenceTailRef.current.then(operation);
    persistenceTailRef.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const pairs = await AsyncStorage.multiGet(Object.values(storageKeys));
        const stored = Object.fromEntries(pairs);
        const readStored = (key: string) => stored[key] ?? null;
        const clientId = sanitizeClientId(readStored(storageKeys.clientId));
        const next: PersistedState = {
          phrases: sanitizePhrases(readStored(storageKeys.phrases)),
          goal: sanitizeGoal(readStored(storageKeys.goal)),
          practice: sanitizePractice(readStored(storageKeys.practice)),
          streakDays: sanitizeStreakDays(readStored(storageKeys.streakDays)),
          clientId,
          aiConsent: sanitizeAiConsent(readStored(storageKeys.aiConsent)),
          chatHistory: sanitizeChatHistory(readStored(storageKeys.chatHistory)),
          learnerProfile: sanitizeLearnerProfile(readStored(storageKeys.learnerProfile)),
          sceneProgress: sanitizeSceneProgress(readStored(storageKeys.sceneProgress)),
          phraseReviews: sanitizePhraseReviews(readStored(storageKeys.phraseReviews)),
          practiceHistory: sanitizePracticeHistory(readStored(storageKeys.practiceHistory)),
          reviewStreakDays: sanitizeStreakDays(readStored(storageKeys.reviewStreakDays)),
          reminder: sanitizeReminder(readStored(storageKeys.reminder)),
          motionPreference: sanitizeMotionPreference(readStored(storageKeys.motionPreference)),
        };
        if (active) {
          replaceState(next);
          setHydrated(true);
          if (clientId !== readStored(storageKeys.clientId)) {
            void enqueuePersistence(() => AsyncStorage.setItem(storageKeys.clientId, clientId)).catch(reportPersistenceFailure);
          }
          if (readStored(storageKeys.aiConsent) && !next.aiConsent) {
            void enqueuePersistence(() => AsyncStorage.removeItem(storageKeys.aiConsent)).catch(reportPersistenceFailure);
          }
        }
      } catch (error) {
        console.warn('Bolo could not load local progress.', error);
        observe('runtime_error');
        if (active) {
          const fallback = { ...initialState, clientId: sanitizeClientId(null) };
          replaceState(fallback);
          setHydrated(true);
          showAppAlert('Could not load saved progress', 'Bolo opened with temporary defaults. Check available storage before making changes.');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [enqueuePersistence, replaceState]);

  useEffect(() => {
    if (!hydrated) return;
    let midnightTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshDay = () => {
      if (clearingAllDataRef.current) return;
      const current = stateRef.current;
      const practice = currentPractice(current);
      if (practice.date === current.practice.date) return;
      const next = { ...current, practice };
      replaceState(next);
      void enqueuePersistence(() => persistState(next, ['practice'])).catch((error: unknown) => {
        reportPersistenceFailure(error, 'Bolo could not save today\'s practice reset. Check available storage and reopen the app.');
      });
    };
    const scheduleMidnightRefresh = () => {
      const tomorrow = new Date();
      tomorrow.setHours(24, 0, 1, 0);
      midnightTimer = setTimeout(() => {
        refreshDay();
        scheduleMidnightRefresh();
      }, Math.max(1_000, tomorrow.getTime() - Date.now()));
    };
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshDay();
    });
    scheduleMidnightRefresh();
    return () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, [enqueuePersistence, hydrated, replaceState]);

  useEffect(() => {
    if (!hydrated) return;
    updatePracticeWidget({
      streak: calculateStreak(state.streakDays, completedToday(state.practice)),
      dueReviews: duePhraseList(state.phrases, state.phraseReviews).length,
      minutesToday: Math.floor(state.practice.seconds / 60),
    });
  }, [hydrated, state.phraseReviews, state.phrases, state.practice, state.streakDays]);

  const commit = useCallback((updater: (current: PersistedState) => PersistedState, keys: PersistedKey[]) => {
    if (clearingAllDataRef.current) return;
    const current = stateRef.current;
    const previous = { ...current, practice: currentPractice(current) };
    const next = updater(previous);
    replaceState(next);
    void enqueuePersistence(() => persistState(next, keys)).catch((error: unknown) => {
      reportPersistenceFailure(error);
      replaceState(restoreFailedPersistedState(stateRef.current, previous, next, keys));
    });
  }, [enqueuePersistence, replaceState]);

  const setGoal = useCallback((goal: 5 | 10 | 15) => {
    commit((current) => ({ ...current, goal }), ['goal']);
  }, [commit]);

  const completeOnboarding = useCallback((profile: Omit<LearnerProfile, 'completed'>, goal: 5 | 10 | 15) => {
    commit((current) => ({ ...current, goal, learnerProfile: { ...profile, completed: true } }), ['goal', 'learnerProfile']);
  }, [commit]);

  const updateLearnerProfile = useCallback((profile: Partial<Omit<LearnerProfile, 'completed'>>) => {
    commit((current) => ({ ...current, learnerProfile: { ...current.learnerProfile, ...profile } }), ['learnerProfile']);
  }, [commit]);

  const togglePhrase = useCallback((phrase: SavedPhrase) => {
    commit((current) => {
      const exists = current.phrases.some((saved) => saved.hi === phrase.hi);
      const phrases = exists
        ? current.phrases.filter((saved) => saved.hi !== phrase.hi)
        : [...current.phrases, phrase].slice(-100);
      const phraseReviews = { ...current.phraseReviews };
      if (exists) delete phraseReviews[phrase.hi];
      else phraseReviews[phrase.hi] = phraseReviews[phrase.hi] ?? defaultPhraseReview();
      // The 100-phrase cap can drop the oldest phrase; drop its review entry too
      // so orphans never accumulate in storage.
      const kept = new Set(phrases.map((saved) => saved.hi));
      for (const hi of Object.keys(phraseReviews)) {
        if (!kept.has(hi)) delete phraseReviews[hi];
      }
      return { ...current, phrases, phraseReviews };
    }, ['phrases', 'phraseReviews']);
  }, [commit]);

  const removePhrase = useCallback((hi: string) => {
    commit((current) => {
      const phraseReviews = { ...current.phraseReviews };
      delete phraseReviews[hi];
      return { ...current, phrases: current.phrases.filter((phrase) => phrase.hi !== hi), phraseReviews };
    }, ['phrases', 'phraseReviews']);
  }, [commit]);

  const checkpointScene = useCallback((sceneId: string, nextBeatIndex: number) => {
    commit((current) => {
      const previous = current.sceneProgress[sceneId] ?? defaultSceneProgress();
      return {
        ...current,
        sceneProgress: {
          ...current.sceneProgress,
          [sceneId]: { ...previous, lastBeatIndex: Math.max(0, Math.round(nextBeatIndex)), lastPracticedAt: new Date().toISOString() },
        },
      };
    }, ['sceneProgress']);
  }, [commit]);

  const markSceneComplete = useCallback((sceneId: string, seconds: number, result?: SceneCompletion) => {
    commit((current) => {
      const requestedSeconds = Number.isFinite(seconds) ? Math.max(1, Math.round(seconds)) : 1;
      const elapsed = cappedPracticeSeconds(current.practice.seconds, requestedSeconds);
      const practice = {
        ...current.practice,
        chaiDone: current.practice.chaiDone || sceneId === 'chai',
        seconds: elapsed.total,
      };
      const previous = current.sceneProgress[sceneId] ?? defaultSceneProgress();
      const correct = Math.max(0, Math.round(result?.correct ?? 0));
      const total = Math.max(correct, Math.round(result?.total ?? 0));
      const accuracy = total > 0 ? Math.round(correct / total * 100) : 0;
      const sceneProgress = {
        ...current.sceneProgress,
        [sceneId]: {
          completions: previous.completions + 1,
          bestScore: Math.max(previous.bestScore, Math.max(0, Math.round(result?.score ?? 0))),
          bestAccuracy: Math.max(previous.bestAccuracy, accuracy),
          totalCorrect: previous.totalCorrect + correct,
          totalAnswers: previous.totalAnswers + total,
          lastPracticedAt: new Date().toISOString(),
          lastBeatIndex: 0,
          weakPhrases: [...new Set([...(result?.weakPhrases ?? []), ...previous.weakPhrases])].slice(0, 50),
        },
      };
      const practiceHistory = updatePracticeHistory(current.practiceHistory, { seconds: elapsed.added, correct, answers: total });
      return { ...current, practice, practiceHistory, sceneProgress, streakDays: withRecordedDay(current.streakDays, practice) };
    }, ['practice', 'practiceHistory', 'sceneProgress', 'streakDays']);
  }, [commit]);

  const reviewPhrase = useCallback((hi: string, remembered: boolean) => {
    commit((current) => {
      if (!current.phrases.some((phrase) => phrase.hi === hi)) return current;
      const previous = current.phraseReviews[hi] ?? defaultPhraseReview();
      const mastery = remembered ? Math.min(5, previous.mastery + 1) : Math.max(0, previous.mastery - 1);
      const intervalDays = remembered ? reviewIntervals[mastery] ?? 0 : 0;
      const today = dateKey();
      const reviewStreakDays = [...new Set([...current.reviewStreakDays, today])].sort().slice(-400);
      return {
        ...current,
        phraseReviews: {
          ...current.phraseReviews,
          [hi]: {
            mastery,
            intervalDays,
            dueAt: addDays(today, intervalDays),
            lastReviewedAt: new Date().toISOString(),
            correctReviews: previous.correctReviews + Number(remembered),
            totalReviews: previous.totalReviews + 1,
          },
        },
        practiceHistory: updatePracticeHistory(current.practiceHistory, { correct: Number(remembered), answers: 1, reviews: 1 }),
        reviewStreakDays,
      };
    }, ['phraseReviews', 'practiceHistory', 'reviewStreakDays']);
  }, [commit]);

  const markLiveTurn = useCallback((seconds = 0) => {
    commit((current) => {
      const elapsed = cappedPracticeSeconds(current.practice.seconds, seconds);
      const practice = {
        ...current.practice,
        liveDone: true,
        seconds: elapsed.total,
      };
      return { ...current, practice, practiceHistory: updatePracticeHistory(current.practiceHistory, { seconds: elapsed.added }), streakDays: withRecordedDay(current.streakDays, practice) };
    }, ['practice', 'practiceHistory', 'streakDays']);
  }, [commit]);

  const addPracticeSeconds = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    commit((current) => {
      const elapsed = cappedPracticeSeconds(current.practice.seconds, seconds);
      const practice = { ...current.practice, seconds: elapsed.total };
      return { ...current, practice, practiceHistory: updatePracticeHistory(current.practiceHistory, { seconds: elapsed.added }), streakDays: withRecordedDay(current.streakDays, practice) };
    }, ['practice', 'practiceHistory', 'streakDays']);
  }, [commit]);

  const appendChatMessages = useCallback((messages: ChatMessage[]) => {
    if (messages.length === 0) return;
    commit((current) => {
      const chatHistory = appendChatHistory(current.chatHistory, messages);
      return chatHistory === current.chatHistory ? current : { ...current, chatHistory };
    }, ['chatHistory']);
  }, [commit]);

  const clearChatHistory = useCallback(() => {
    commit((current) => current.chatHistory.length === 0 ? current : { ...current, chatHistory: [] }, ['chatHistory']);
  }, [commit]);

  const setAiConsent = useCallback(async (aiConsent: boolean) => {
    if (clearingAllDataRef.current) return false;
    let nextConsent: PersistedState['aiConsent'];
    try {
      nextConsent = await enqueuePersistence(() => persistAiConsentChoice(aiConsent));
    } catch (error) {
      const action = aiConsent ? 'enable' : 'withdraw';
      reportPersistenceFailure(
        error,
        `Bolo could not ${action} AI consent because the privacy choice could not be saved. Your previous choice is still active.`,
      );
      return false;
    }
    if (!clearingAllDataRef.current) replaceState({ ...stateRef.current, aiConsent: nextConsent });
    return true;
  }, [enqueuePersistence, replaceState]);

  const setReminder = useCallback((reminder: ReminderSettings) => {
    commit((current) => ({ ...current, reminder }), ['reminder']);
  }, [commit]);

  const setMotionPreference = useCallback((motionPreference: MotionPreference) => {
    commit((current) => ({ ...current, motionPreference }), ['motionPreference']);
  }, [commit]);

  const clearAllData = useCallback(async () => {
    if (clearingAllDataRef.current) return;
    clearingAllDataRef.current = true;
    const next: PersistedState = {
      ...initialState,
      practice: emptyPractice(),
      clientId: sanitizeClientId(null),
    };
    const entries = storageEntries(next, Object.keys(storageKeys) as PersistedKey[]);
    try {
      // Cancel the scheduled daily reminder before wiping its notificationId,
      // otherwise the OS notification keeps firing with no way to turn it off.
      if (state.reminder.notificationId) await cancelPracticeReminder(state.reminder);
      await enqueuePersistence(() => AsyncStorage.multiSet(entries));
      const { clearAiVoicePlaybackCache } = await import('@/lib/ai-voice-player');
      clearAiVoicePlaybackCache();
      // Storage now holds the defaults; update in-memory state before anything
      // else can fail so the two never diverge.
      replaceState(next);
    } catch (error) {
      console.warn('Bolo could not clear local data.', error);
      observe('runtime_error');
      throw new Error('Bolo could not clear local data. Your existing local data was left in place.');
    } finally {
      clearingAllDataRef.current = false;
    }
    try {
      await clearObservability();
    } catch (error) {
      console.warn('Bolo could not clear stored diagnostics.', error);
    }
  }, [enqueuePersistence, replaceState, state.reminder]);

  const actions = useMemo<AppActions>(() => ({
    setGoal,
    completeOnboarding,
    updateLearnerProfile,
    togglePhrase,
    removePhrase,
    checkpointScene,
    markSceneComplete,
    reviewPhrase,
    markLiveTurn,
    addPracticeSeconds,
    appendChatMessages,
    clearChatHistory,
    setAiConsent,
    setReminder,
    setMotionPreference,
    clearAllData,
  }), [setGoal, completeOnboarding, updateLearnerProfile, togglePhrase, removePhrase, checkpointScene, markSceneComplete, reviewPhrase, markLiveTurn, addPracticeSeconds, appendChatMessages, clearChatHistory, setAiConsent, setReminder, setMotionPreference, clearAllData]);

  const value = useMemo<AppStateSlices>(() => ({
    ...state,
    aiConsent: state.aiConsent !== null,
    hydrated,
    streak: calculateStreak(state.streakDays, completedToday(state.practice)),
    dailySteps: Number(state.practice.chaiDone) + Number(state.practice.liveDone),
    duePhrases: dueSavedPhrases(state.phrases, state.phraseReviews, Infinity),
    reviewStreak: calculateStreak(state.reviewStreakDays, state.reviewStreakDays.includes(dateKey())),
  }), [state, hydrated]);

  return (
    <AppActionsContext.Provider value={actions}>
      <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
    </AppActionsContext.Provider>
  );
}

export function useAppStateValue() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppStateValue must be used within AppStateProvider.');
  return value;
}

export function useAppActions() {
  const actions = useContext(AppActionsContext);
  if (!actions) throw new Error('useAppActions must be used within AppStateProvider.');
  return actions;
}

export function useAppState(): AppStateValue {
  const value = useAppStateValue();
  const actions = useAppActions();
  return useMemo(() => ({ ...value, ...actions }), [value, actions]);
}
