import type {
  ChatMessage,
  LearnerProfile,
  PhraseReview,
  PracticeDay,
  ReminderSettings,
  SavedPhrase,
  SceneProgress,
} from '@/state/app-state-types';

export const storageKeys = {
  phrases: 'bolo-phrases',
  goal: 'bolo-goal',
  practice: 'bolo-practice',
  streakDays: 'bolo-streak-days',
  clientId: 'bolo-client-id',
  aiConsent: 'bolo-ai-consent',
  chatHistory: 'bolo-chat-history',
  learnerProfile: 'bolo-learner-profile',
  sceneProgress: 'bolo-scene-progress',
  phraseReviews: 'bolo-phrase-reviews',
  practiceHistory: 'bolo-practice-history',
  reviewStreakDays: 'bolo-review-streak-days',
  reminder: 'bolo-practice-reminder',
} as const;

export const AI_CONSENT_VERSION = 6 as const;
export const MAX_CHAT_HISTORY_MESSAGES = 100;
export const MAX_CHAT_MESSAGE_CHARACTERS = 2_400;
export const MAX_DAILY_PRACTICE_SECONDS = 24 * 60 * 60;

const MAX_CHAT_MESSAGE_ID_CHARACTERS = 128;

export type AiConsentRecord = {
  version: typeof AI_CONSENT_VERSION;
  acceptedAt: string;
};

export type PracticeState = {
  date: string;
  chaiDone: boolean;
  liveDone: boolean;
  seconds: number;
};

export type PersistedState = {
  phrases: SavedPhrase[];
  goal: 5 | 10 | 15;
  practice: PracticeState;
  streakDays: string[];
  clientId: string;
  aiConsent: AiConsentRecord | null;
  chatHistory: ChatMessage[];
  learnerProfile: LearnerProfile;
  sceneProgress: Record<string, SceneProgress>;
  phraseReviews: Record<string, PhraseReview>;
  practiceHistory: PracticeDay[];
  reviewStreakDays: string[];
  reminder: ReminderSettings;
};

export const defaultLearnerProfile = (): LearnerProfile => ({
  completed: false,
  level: 'new',
  scriptPreference: 'both',
  primaryGoal: 'conversation',
  responseLanguage: 'en',
  microphoneTested: false,
});

export const defaultReminderSettings = (): ReminderSettings => ({
  enabled: false,
  hour: 19,
  minute: 0,
  notificationId: null,
});

export function dateKey(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function previousDate(key: string): string {
  const value = new Date(`${key}T12:00:00`);
  value.setDate(value.getDate() - 1);
  return dateKey(value);
}

export function emptyPractice(today = dateKey()): PracticeState {
  return { date: today, chaiDone: false, liveDone: false, seconds: 0 };
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validPhrase(value: unknown): value is SavedPhrase {
  if (!value || typeof value !== 'object') return false;
  const phrase = value as Partial<SavedPhrase>;
  return typeof phrase.hi === 'string' && typeof phrase.latin === 'string' && typeof phrase.en === 'string';
}

function normalizeChatMessage(value: unknown, truncateText: boolean): ChatMessage | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Partial<ChatMessage>;
  if (typeof message.id !== 'string' || typeof message.text !== 'string') return null;
  if (message.role !== 'you' && message.role !== 'mira') return null;
  if (message.language !== undefined && message.language !== 'en' && message.language !== 'hi') return null;

  const id = message.id.trim();
  const rawText = message.text.trim();
  if (!id || id.length > MAX_CHAT_MESSAGE_ID_CHARACTERS || !rawText) return null;
  if (!truncateText && rawText.length > MAX_CHAT_MESSAGE_CHARACTERS) return null;

  const text = truncateText ? rawText.slice(0, MAX_CHAT_MESSAGE_CHARACTERS) : rawText;
  return message.language === undefined
    ? { id, role: message.role, text }
    : { id, role: message.role, text, language: message.language };
}

function newestUniqueMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const newest: ChatMessage[] = [];
  for (let index = messages.length - 1; index >= 0 && newest.length < MAX_CHAT_HISTORY_MESSAGES; index -= 1) {
    const message = messages[index];
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    newest.push(message);
  }
  return newest.reverse();
}

export function appendChatHistory(current: ChatMessage[], additions: ChatMessage[]): ChatMessage[] {
  if (additions.length === 0) return current;
  const normalized = additions.map((message) => normalizeChatMessage(message, true));
  if (normalized.some((message) => message === null)) return current;

  const ids = normalized.map((message) => message!.id);
  if (new Set(ids).size !== ids.length) return current;
  return newestUniqueMessages([...current, ...(normalized as ChatMessage[])]);
}

export function sanitizePhrases(value: string | null): SavedPhrase[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  return parsed.filter(validPhrase).filter((phrase) => {
    if (!phrase.hi.trim() || seen.has(phrase.hi)) return false;
    seen.add(phrase.hi);
    return true;
  }).slice(0, 100);
}

export function sanitizeChatHistory(value: string | null): ChatMessage[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  const messages = parsed
    .map((message) => normalizeChatMessage(message, false))
    .filter((message): message is ChatMessage => message !== null);
  return newestUniqueMessages(messages);
}

export function sanitizePractice(value: string | null, today = dateKey()): PracticeState {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object') return emptyPractice(today);
  const practice = parsed as Partial<PracticeState>;
  if (practice.date !== today) return emptyPractice(today);
  const parsedSeconds = Number(practice.seconds);
  const seconds = Number.isFinite(parsedSeconds)
    ? Math.min(MAX_DAILY_PRACTICE_SECONDS, Math.max(0, Math.round(parsedSeconds)))
    : 0;
  return {
    date: today,
    chaiDone: practice.chaiDone === true,
    liveDone: practice.liveDone === true,
    seconds,
  };
}

export function sanitizeStreakDays(value: string | null): string[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter((day): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)))]
    .sort()
    .slice(-400);
}

export function sanitizeLearnerProfile(value: string | null): LearnerProfile {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object') return defaultLearnerProfile();
  const profile = parsed as Partial<LearnerProfile>;
  return {
    completed: profile.completed === true,
    level: profile.level === 'beginner' || profile.level === 'intermediate' ? profile.level : 'new',
    scriptPreference: profile.scriptPreference === 'devanagari' || profile.scriptPreference === 'latin' ? profile.scriptPreference : 'both',
    primaryGoal: profile.primaryGoal === 'travel' || profile.primaryGoal === 'family' || profile.primaryGoal === 'work' ? profile.primaryGoal : 'conversation',
    responseLanguage: profile.responseLanguage === 'hi' ? 'hi' : 'en',
    microphoneTested: profile.microphoneTested === true,
  };
}

function sanitizeSceneProgressEntry(value: unknown): SceneProgress | null {
  if (!value || typeof value !== 'object') return null;
  const progress = value as Partial<SceneProgress>;
  const integer = (input: unknown, maximum: number) => Number.isInteger(input) ? Math.min(maximum, Math.max(0, input as number)) : 0;
  return {
    completions: integer(progress.completions, 10_000),
    bestScore: integer(progress.bestScore, 100_000),
    bestAccuracy: integer(progress.bestAccuracy, 100),
    totalCorrect: integer(progress.totalCorrect, 1_000_000),
    totalAnswers: integer(progress.totalAnswers, 1_000_000),
    lastPracticedAt: progress.lastPracticedAt === null || isIsoDate(progress.lastPracticedAt) ? progress.lastPracticedAt ?? null : null,
    lastBeatIndex: integer(progress.lastBeatIndex, 100),
    weakPhrases: Array.isArray(progress.weakPhrases)
      ? [...new Set(progress.weakPhrases.filter((phrase): phrase is string => typeof phrase === 'string' && phrase.trim().length > 0))].slice(0, 50)
      : [],
  };
}

export function sanitizeSceneProgress(value: string | null): Record<string, SceneProgress> {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).flatMap(([sceneId, entry]) => {
    if (!/^[a-z0-9-]{1,64}$/.test(sceneId)) return [];
    const progress = sanitizeSceneProgressEntry(entry);
    return progress ? [[sceneId, progress]] : [];
  }).slice(0, 200));
}

function sanitizePhraseReviewEntry(value: unknown): PhraseReview | null {
  if (!value || typeof value !== 'object') return null;
  const review = value as Partial<PhraseReview>;
  const dueAt = isDateKey(review.dueAt) ? review.dueAt : dateKey();
  const mastery = Number.isInteger(review.mastery) ? Math.min(5, Math.max(0, review.mastery as number)) : 0;
  const intervalDays = Number.isInteger(review.intervalDays) ? Math.min(365, Math.max(0, review.intervalDays as number)) : 0;
  const correctReviews = Number.isInteger(review.correctReviews) ? Math.min(100_000, Math.max(0, review.correctReviews as number)) : 0;
  const totalReviews = Number.isInteger(review.totalReviews) ? Math.min(100_000, Math.max(correctReviews, review.totalReviews as number)) : correctReviews;
  return {
    mastery,
    intervalDays,
    dueAt,
    lastReviewedAt: review.lastReviewedAt === null || isIsoDate(review.lastReviewedAt) ? review.lastReviewedAt ?? null : null,
    correctReviews,
    totalReviews,
  };
}

export function sanitizePhraseReviews(value: string | null): Record<string, PhraseReview> {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).flatMap(([phrase, entry]) => {
    if (!phrase.trim() || phrase.length > 300) return [];
    const review = sanitizePhraseReviewEntry(entry);
    return review ? [[phrase, review]] : [];
  }).slice(0, 200));
}

export function sanitizePracticeHistory(value: string | null): PracticeDay[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  const days = new Map<string, PracticeDay>();
  for (const raw of parsed) {
    if (!raw || typeof raw !== 'object') continue;
    const day = raw as Partial<PracticeDay>;
    if (!isDateKey(day.date)) continue;
    const bounded = (input: unknown, maximum: number) => Number.isFinite(Number(input)) ? Math.min(maximum, Math.max(0, Math.round(Number(input)))) : 0;
    days.set(day.date, {
      date: day.date,
      seconds: bounded(day.seconds, MAX_DAILY_PRACTICE_SECONDS),
      correct: bounded(day.correct, 10_000),
      answers: bounded(day.answers, 10_000),
      reviews: bounded(day.reviews, 10_000),
    });
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-90);
}

export function sanitizeReminder(value: string | null): ReminderSettings {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object') return defaultReminderSettings();
  const reminder = parsed as Partial<ReminderSettings>;
  return {
    enabled: reminder.enabled === true,
    hour: Number.isInteger(reminder.hour) ? Math.min(23, Math.max(0, reminder.hour as number)) : 19,
    minute: Number.isInteger(reminder.minute) ? Math.min(59, Math.max(0, reminder.minute as number)) : 0,
    notificationId: typeof reminder.notificationId === 'string' && reminder.notificationId.length <= 200 ? reminder.notificationId : null,
  };
}

export function sanitizeGoal(value: string | null): 5 | 10 | 15 {
  const goal = Number(value);
  return goal === 5 || goal === 15 ? goal : 10;
}

export function sanitizeClientId(value: string | null): string {
  if (value && /^[A-Za-z0-9-]{8,64}$/.test(value)) return value;
  const generated = globalThis.crypto?.randomUUID?.() ?? `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return generated.slice(0, 64);
}

export function createAiConsentRecord(now = new Date()): AiConsentRecord {
  return { version: AI_CONSENT_VERSION, acceptedAt: now.toISOString() };
}

export function sanitizeAiConsent(value: string | null): AiConsentRecord | null {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object') return null;
  const consent = parsed as Partial<AiConsentRecord>;
  if (consent.version !== AI_CONSENT_VERSION || typeof consent.acceptedAt !== 'string') return null;
  if (!Number.isFinite(Date.parse(consent.acceptedAt))) return null;
  return { version: AI_CONSENT_VERSION, acceptedAt: consent.acceptedAt };
}

export function calculateStreak(days: string[], practicedToday: boolean, today = dateKey()): number {
  const completed = new Set(days);
  let cursor = practicedToday ? today : previousDate(today);
  let streak = 0;
  while (completed.has(cursor)) {
    streak += 1;
    cursor = previousDate(cursor);
  }
  return streak;
}
