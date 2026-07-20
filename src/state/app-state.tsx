import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { showAppAlert } from '@/lib/app-alert';
import { clearObservability } from '@/lib/observability';
import { updatePracticeWidget } from '@/lib/practice-widget';
import {
  appendChatHistory,
  calculateStreak,
  createAiConsentRecord,
  dateKey,
  defaultLearnerProfile,
  defaultReminderSettings,
  emptyPractice,
  MAX_DAILY_PRACTICE_SECONDS,
  sanitizeClientId,
  sanitizeAiConsent,
  sanitizeChatHistory,
  sanitizeGoal,
  sanitizeLearnerProfile,
  sanitizePhraseReviews,
  sanitizePhrases,
  sanitizePractice,
  sanitizePracticeHistory,
  sanitizeReminder,
  sanitizeSceneProgress,
  sanitizeStreakDays,
  storageKeys,
  type PersistedState,
} from '@/lib/storage';
import type { ChatMessage, LearnerProfile, ReminderSettings, SavedPhrase } from '@/state/app-state-types';

type PersistedKey = keyof typeof storageKeys;

type SceneCompletion = {
  score: number;
  correct: number;
  total: number;
  weakPhrases: string[];
};

type AppStateValue = Omit<PersistedState, 'aiConsent'> & {
  aiConsent: boolean;
  hydrated: boolean;
  streak: number;
  dailySteps: number;
  duePhrases: SavedPhrase[];
  reviewStreak: number;
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
  clearAllData: () => Promise<void>;
};

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
};

const AppStateContext = createContext<AppStateValue | null>(null);

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
  const entries: [string, string][] = keys.map((key) => {
    const value = state[key];
    return [storageKeys[key], typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)];
  });
  await AsyncStorage.multiSet(entries);
}

function reportPersistenceFailure(error: unknown, message = 'Your last change was not saved and has been restored. Check available storage and try again.') {
  console.warn('Bolo could not save local progress.', error);
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
  const persistenceTailRef = useRef<Promise<void>>(Promise.resolve());
  const clearingAllDataRef = useRef(false);

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
        const clientId = sanitizeClientId(stored[storageKeys.clientId]);
        const next: PersistedState = {
          phrases: sanitizePhrases(stored[storageKeys.phrases]),
          goal: sanitizeGoal(stored[storageKeys.goal]),
          practice: sanitizePractice(stored[storageKeys.practice]),
          streakDays: sanitizeStreakDays(stored[storageKeys.streakDays]),
          clientId,
          aiConsent: sanitizeAiConsent(stored[storageKeys.aiConsent]),
          chatHistory: sanitizeChatHistory(stored[storageKeys.chatHistory]),
          learnerProfile: sanitizeLearnerProfile(stored[storageKeys.learnerProfile]),
          sceneProgress: sanitizeSceneProgress(stored[storageKeys.sceneProgress]),
          phraseReviews: sanitizePhraseReviews(stored[storageKeys.phraseReviews]),
          practiceHistory: sanitizePracticeHistory(stored[storageKeys.practiceHistory]),
          reviewStreakDays: sanitizeStreakDays(stored[storageKeys.reviewStreakDays]),
          reminder: sanitizeReminder(stored[storageKeys.reminder]),
        };
        if (active) {
          setState(next);
          setHydrated(true);
          if (clientId !== stored[storageKeys.clientId]) {
            void enqueuePersistence(() => AsyncStorage.setItem(storageKeys.clientId, clientId));
          }
          if (stored[storageKeys.aiConsent] && !next.aiConsent) {
            void enqueuePersistence(() => AsyncStorage.removeItem(storageKeys.aiConsent));
          }
        }
      } catch (error) {
        console.warn('Bolo could not load local progress.', error);
        if (active) {
          const fallback = { ...initialState, clientId: sanitizeClientId(null) };
          setState(fallback);
          setHydrated(true);
          showAppAlert('Could not load saved progress', 'Bolo opened with temporary defaults. Check available storage before making changes.');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [enqueuePersistence]);

  useEffect(() => {
    if (!hydrated) return;
    let midnightTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshDay = () => {
      setState((current) => {
        if (clearingAllDataRef.current) return current;
        const practice = currentPractice(current);
        if (practice.date === current.practice.date) return current;
        const next = { ...current, practice };
        void enqueuePersistence(() => persistState(next, ['practice'])).catch((error: unknown) => {
          reportPersistenceFailure(error, 'Bolo could not save today\'s practice reset. Check available storage and reopen the app.');
        });
        return next;
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
  }, [enqueuePersistence, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    updatePracticeWidget({
      streak: calculateStreak(state.streakDays, completedToday(state.practice)),
      dueReviews: state.phrases.filter((phrase) => (state.phraseReviews[phrase.hi]?.dueAt ?? dateKey()) <= dateKey()).length,
      minutesToday: Math.floor(state.practice.seconds / 60),
    });
  }, [hydrated, state.phraseReviews, state.phrases, state.practice, state.streakDays]);

  const commit = useCallback((updater: (current: PersistedState) => PersistedState, keys: PersistedKey[]) => {
    if (clearingAllDataRef.current) return;
    setState((current) => {
      if (clearingAllDataRef.current) return current;
      const previous = { ...current, practice: currentPractice(current) };
      const next = updater(previous);
      void enqueuePersistence(() => persistState(next, keys)).catch((error: unknown) => {
        reportPersistenceFailure(error);
        setState((latest) => restoreFailedPersistedState(latest, previous, next, keys));
      });
      return next;
    });
  }, [enqueuePersistence]);

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
      else phraseReviews[phrase.hi] = phraseReviews[phrase.hi] ?? {
        mastery: 0,
        intervalDays: 0,
        dueAt: dateKey(),
        lastReviewedAt: null,
        correctReviews: 0,
        totalReviews: 0,
      };
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
      const previous = current.sceneProgress[sceneId] ?? {
        completions: 0, bestScore: 0, bestAccuracy: 0, totalCorrect: 0, totalAnswers: 0,
        lastPracticedAt: null, lastBeatIndex: 0, weakPhrases: [],
      };
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
      const previous = current.sceneProgress[sceneId] ?? {
        completions: 0, bestScore: 0, bestAccuracy: 0, totalCorrect: 0, totalAnswers: 0,
        lastPracticedAt: null, lastBeatIndex: 0, weakPhrases: [],
      };
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
      const previous = current.phraseReviews[hi] ?? {
        mastery: 0, intervalDays: 0, dueAt: dateKey(), lastReviewedAt: null, correctReviews: 0, totalReviews: 0,
      };
      const mastery = remembered ? Math.min(5, previous.mastery + 1) : Math.max(0, previous.mastery - 1);
      const intervals = [0, 1, 3, 7, 14, 30];
      const intervalDays = remembered ? intervals[mastery] : 0;
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
    setState((current) => clearingAllDataRef.current ? current : { ...current, aiConsent: nextConsent });
    return true;
  }, [enqueuePersistence]);

  const setReminder = useCallback((reminder: ReminderSettings) => {
    commit((current) => ({ ...current, reminder }), ['reminder']);
  }, [commit]);

  const clearAllData = useCallback(async () => {
    if (clearingAllDataRef.current) return;
    clearingAllDataRef.current = true;
    const next: PersistedState = {
      ...initialState,
      practice: emptyPractice(),
      clientId: sanitizeClientId(null),
    };
    const entries = (Object.keys(storageKeys) as PersistedKey[]).map((key): [string, string] => {
      const value = next[key];
      return [storageKeys[key], typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value)];
    });
    try {
      await enqueuePersistence(() => AsyncStorage.multiSet(entries));
      await clearObservability();
      setState(next);
    } catch (error) {
      console.warn('Bolo could not clear local data.', error);
      throw new Error('Bolo could not clear local data. Your existing local data was left in place.');
    } finally {
      clearingAllDataRef.current = false;
    }
  }, [enqueuePersistence]);

  const value = useMemo<AppStateValue>(() => ({
    ...state,
    aiConsent: state.aiConsent !== null,
    hydrated,
    streak: calculateStreak(state.streakDays, completedToday(state.practice)),
    dailySteps: Number(state.practice.chaiDone) + Number(state.practice.liveDone),
    duePhrases: state.phrases.filter((phrase) => (state.phraseReviews[phrase.hi]?.dueAt ?? dateKey()) <= dateKey()).slice(0, 5),
    reviewStreak: calculateStreak(state.reviewStreakDays, state.reviewStreakDays.includes(dateKey())),
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
    clearAllData,
  }), [state, hydrated, setGoal, completeOnboarding, updateLearnerProfile, togglePhrase, removePhrase, checkpointScene, markSceneComplete, reviewPhrase, markLiveTurn, addPracticeSeconds, appendChatMessages, clearChatHistory, setAiConsent, setReminder, clearAllData]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used within AppStateProvider.');
  return value;
}
