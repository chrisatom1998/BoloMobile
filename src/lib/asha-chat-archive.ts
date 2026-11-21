/**
 * Chat history for Asha: past chats the learner can reopen. Pure data and
 * helpers; the encrypted persistence side lives in `asha-chat-archive-store.ts`.
 *
 * The Asha screen shows one current chat (`chatHistory` in app state). When a
 * new chat or a new voice call starts, that chat used to be wiped. It is now
 * archived here first: typed turns and voice-call transcript rows together,
 * exactly as they appeared on screen. No audio is ever stored.
 */
import { MAX_CHAT_HISTORY_MESSAGES, sanitizeChatHistory } from '@/lib/storage';
import type { ChatMessage } from '@/state/app-state-types';

/** One stored value per past chat, so saving one never rewrites the others. */
export const ASHA_CHAT_KEY_PREFIX = 'bolo-asha-chat-v1:';
/** The newest past chats are kept; saving another one drops the oldest. */
export const MAX_ASHA_CHATS = 30;

const MAX_ID_CHARACTERS = 128;
const MAX_TITLE_CHARACTERS = 80;

export type AshaChatRecord = {
  schema: 1;
  /** The id of the chat's first message, so archiving the same chat twice replaces it. */
  id: string;
  startedAt: string;
  /** When the last message in the chat was written. Chats are listed newest first by this. */
  updatedAt: string;
  messages: ChatMessage[];
};

export function ashaChatKey(id: string) {
  return `${ASHA_CHAT_KEY_PREFIX}${id}`;
}

export function isAshaChatKey(key: string) {
  return key.startsWith(ASHA_CHAT_KEY_PREFIX) && key.length > ASHA_CHAT_KEY_PREFIX.length;
}

export function ashaChatIdFromKey(key: string) {
  return key.slice(ASHA_CHAT_KEY_PREFIX.length);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/**
 * Chat messages carry no timestamp field, but every id the app mints embeds
 * `Date.now()` (`you-<ms>`, `asha-<ms>`, `live-<ms>-…`). Returns that time, or
 * null for an id in another shape.
 */
export function chatMessageTime(id: string): number | null {
  const match = /^(?:you|asha|live)-(\d{12,14})(?:-|$)/u.exec(id);
  if (!match) return null;
  const time = Number(match[1]);
  return Number.isFinite(time) && time > 0 ? time : null;
}

/** True for a transcript row captured from a live voice call. */
export function isVoiceChatMessage(message: Pick<ChatMessage, 'id'>) {
  return message.id.startsWith('live-');
}

/**
 * Builds the record for a chat that is leaving the screen, or null when there
 * is nothing to keep. `now` stands in for messages whose id carries no time.
 */
export function createAshaChatRecord(messages: readonly ChatMessage[], now = new Date()): AshaChatRecord | null {
  // The same validation as a stored chat: bounded text, unique ids, newest 100.
  const sanitized = sanitizeChatHistory(JSON.stringify(messages));
  const first = sanitized[0];
  const last = sanitized.at(-1);
  if (!first || !last || first.id.length > MAX_ID_CHARACTERS) return null;
  const fallback = now.getTime();
  const startedMs = chatMessageTime(first.id) ?? fallback;
  const updatedMs = Math.max(startedMs, chatMessageTime(last.id) ?? fallback);
  return {
    schema: 1,
    id: first.id,
    startedAt: new Date(startedMs).toISOString(),
    updatedAt: new Date(updatedMs).toISOString(),
    messages: sanitized,
  };
}

/** Newest first, by the last message's time. */
export function sortAshaChats(chats: AshaChatRecord[]): AshaChatRecord[] {
  return [...chats].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

/** Applies the cap: only the newest chats stay. */
export function pruneAshaChats(chats: AshaChatRecord[]): AshaChatRecord[] {
  return sortAshaChats(chats).slice(0, MAX_ASHA_CHATS);
}

function oneLine(text: string, limit: number) {
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
}

/** What the learner first said, or Asha's first line when the learner never spoke. */
export function ashaChatTitle(chat: AshaChatRecord): string {
  const source = chat.messages.find((message) => message.role === 'you') ?? chat.messages[0];
  return source ? oneLine(source.text, MAX_TITLE_CHARACTERS) : 'Chat with Asha';
}

/** Asha's latest line, shown under the title. Null when it would repeat the title. */
export function ashaChatPreview(chat: AshaChatRecord): string | null {
  const reply = [...chat.messages].reverse().find((message) => message.role === 'asha');
  if (!reply) return null;
  const preview = oneLine(reply.text, 120);
  return preview === ashaChatTitle(chat) ? null : preview;
}

export function ashaChatHasVoice(chat: AshaChatRecord) {
  return chat.messages.some(isVoiceChatMessage);
}

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Validates one stored chat. Malformed or empty records become null instead of throwing. */
export function sanitizeAshaChat(raw: string | null): AshaChatRecord | null {
  const value = parse(raw);
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<AshaChatRecord>;
  if (record.schema !== 1) return null;
  if (typeof record.id !== 'string' || !record.id.trim() || record.id.length > MAX_ID_CHARACTERS) return null;
  if (!isIsoDate(record.startedAt) || !isIsoDate(record.updatedAt)) return null;
  if (!Array.isArray(record.messages) || record.messages.length > MAX_CHAT_HISTORY_MESSAGES) return null;
  const messages = sanitizeChatHistory(JSON.stringify(record.messages));
  // A dropped message means the value was edited or damaged; do not show a partial chat.
  if (messages.length === 0 || messages.length !== record.messages.length) return null;
  return { schema: 1, id: record.id, startedAt: record.startedAt, updatedAt: record.updatedAt, messages };
}
