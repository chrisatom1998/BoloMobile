import type { ChatMessage, SavedPhrase } from '@/state/app-state-types';

export const storageKeys = {
  phrases: 'bolo-phrases',
  goal: 'bolo-goal',
  practice: 'bolo-practice',
  streakDays: 'bolo-streak-days',
  clientId: 'bolo-client-id',
  aiConsent: 'bolo-ai-consent',
  chatHistory: 'bolo-chat-history',
} as const;

export const AI_CONSENT_VERSION = 5 as const;
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
};

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
