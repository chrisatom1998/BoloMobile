import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { showAppAlert } from '@/lib/app-alert';
import {
  appendChatHistory,
  calculateStreak,
  createAiConsentRecord,
  dateKey,
  emptyPractice,
  sanitizeClientId,
  sanitizeAiConsent,
  sanitizeChatHistory,
  sanitizeGoal,
  sanitizePhrases,
  sanitizePractice,
  sanitizeStreakDays,
  storageKeys,
  type PersistedState,
} from '@/lib/storage';
import type { ChatMessage, SavedPhrase } from '@/state/app-state-types';

type PersistedKey = keyof typeof storageKeys;

type AppStateValue = Omit<PersistedState, 'aiConsent'> & {
  aiConsent: boolean;
  hydrated: boolean;
  streak: number;
  dailySteps: number;
  setGoal: (goal: 5 | 10 | 15) => void;
  togglePhrase: (phrase: SavedPhrase) => void;
  removePhrase: (hi: string) => void;
  markSceneComplete: (sceneId: string, seconds: number) => void;
  markLiveTurn: (seconds?: number) => void;
  addPracticeSeconds: (seconds: number) => void;
  appendChatMessages: (messages: ChatMessage[]) => void;
  clearChatHistory: () => void;
  setAiConsent: (consent: boolean) => Promise<boolean>;
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

  const togglePhrase = useCallback((phrase: SavedPhrase) => {
    commit((current) => {
      const exists = current.phrases.some((saved) => saved.hi === phrase.hi);
      const phrases = exists
        ? current.phrases.filter((saved) => saved.hi !== phrase.hi)
        : [...current.phrases, phrase].slice(-100);
      return { ...current, phrases };
    }, ['phrases']);
  }, [commit]);

  const removePhrase = useCallback((hi: string) => {
    commit((current) => ({ ...current, phrases: current.phrases.filter((phrase) => phrase.hi !== hi) }), ['phrases']);
  }, [commit]);

  const markSceneComplete = useCallback((sceneId: string, seconds: number) => {
    commit((current) => {
      const practice = {
        ...current.practice,
        chaiDone: current.practice.chaiDone || sceneId === 'chai',
        seconds: current.practice.seconds + Math.max(1, Math.round(seconds)),
      };
      return { ...current, practice, streakDays: withRecordedDay(current.streakDays, practice) };
    }, ['practice', 'streakDays']);
  }, [commit]);

  const markLiveTurn = useCallback((seconds = 0) => {
    commit((current) => {
      const practice = {
        ...current.practice,
        liveDone: true,
        seconds: current.practice.seconds + Math.max(0, Math.round(seconds)),
      };
      return { ...current, practice, streakDays: withRecordedDay(current.streakDays, practice) };
    }, ['practice', 'streakDays']);
  }, [commit]);

  const addPracticeSeconds = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    commit((current) => {
      const practice = { ...current.practice, seconds: current.practice.seconds + Math.round(seconds) };
      return { ...current, practice, streakDays: withRecordedDay(current.streakDays, practice) };
    }, ['practice', 'streakDays']);
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
    setState((current) => ({ ...current, aiConsent: nextConsent }));
    return true;
  }, [enqueuePersistence]);

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
    setGoal,
    togglePhrase,
    removePhrase,
    markSceneComplete,
    markLiveTurn,
    addPracticeSeconds,
    appendChatMessages,
    clearChatHistory,
    setAiConsent,
    clearAllData,
  }), [state, hydrated, setGoal, togglePhrase, removePhrase, markSceneComplete, markLiveTurn, addPracticeSeconds, appendChatMessages, clearChatHistory, setAiConsent, clearAllData]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used within AppStateProvider.');
  return value;
}
