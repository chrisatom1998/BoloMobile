import type { ChatMessage, MiraResponseLanguage, SavedPhrase } from '@/state/app-state-types';
import { observe } from '@/lib/observability';

const API_URL = 'https://api-v2.appdeploy.ai/app/74e39779183cf78fed';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_AI_AUDIO_BASE64_CHARACTERS = 8_000_000;
const MAX_TRANSCRIPT_CHARACTERS = 1_200;
const MAX_GENERATED_TEXT_CHARACTERS = 2_400;

export const MOBILE_LANGUAGE_MODE = 'english-unless-hindi-requested' as const;
export const OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1' as const;
export const AI_VOICE_TEXT_LIMIT = 240;
export type ReportReason = 'unsafe_or_inappropriate' | 'incorrect_or_misleading';

export type AiVoiceAudio = {
  audioBase64: string;
  mimeType: 'audio/mpeg';
};

type MobileChatResponse = {
  transcript: string;
  reply: string;
  language: 'en' | 'hi';
};

type VoiceCoachResponse = {
  transcript: string;
  feedback: string;
};

type RealtimeClientSecret = {
  value: string;
  expires_at: number;
};

type LiveTranslationResponse = {
  english: string;
};

type MobileChatInput = {
  text?: string;
  audioBase64?: string;
  mimeType?: string;
  messages: ChatMessage[];
  clientId: string;
  responseLanguage?: MiraResponseLanguage;
};

export class BoloApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'BoloApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function isMobileChatResponse(value: unknown): value is MobileChatResponse {
  return isRecord(value)
    && isBoundedText(value.transcript, MAX_TRANSCRIPT_CHARACTERS)
    && isBoundedText(value.reply, MAX_GENERATED_TEXT_CHARACTERS)
    && (value.language === 'en' || value.language === 'hi');
}

function isVoiceCoachResponse(value: unknown): value is VoiceCoachResponse {
  return isRecord(value)
    && isBoundedText(value.transcript, MAX_TRANSCRIPT_CHARACTERS)
    && isBoundedText(value.feedback, MAX_GENERATED_TEXT_CHARACTERS);
}

function isRealtimeClientSecret(value: unknown): value is RealtimeClientSecret {
  return isRecord(value)
    && typeof value.value === 'string'
    && value.value.startsWith('ek_')
    && typeof value.expires_at === 'number'
    && Number.isFinite(value.expires_at);
}

function isLiveTranslationResponse(value: unknown): value is LiveTranslationResponse {
  return isRecord(value)
    && typeof value.english === 'string'
    && value.english.length <= MAX_GENERATED_TEXT_CHARACTERS;
}

function isAiVoiceAudio(value: unknown): value is AiVoiceAudio {
  if (!isRecord(value) || value.mimeType !== 'audio/mpeg' || typeof value.audioBase64 !== 'string') return false;
  const base64 = value.audioBase64;
  return base64.length > 0
    && base64.length <= MAX_AI_AUDIO_BASE64_CHARACTERS
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64);
}

function isReportResponse(value: unknown): value is { reported: true } {
  return isRecord(value) && value.reported === true;
}

function isDeleteMobileDataResponse(value: unknown): value is { deleted: true } {
  return isRecord(value) && value.deleted === true;
}

async function post<T>(
  path: string,
  body: unknown,
  validate: (value: unknown) => value is T,
  signal?: AbortSignal,
): Promise<T> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    const message = isRecord(payload) && typeof payload.error === 'string' ? payload.error : undefined;
    if (!response.ok) throw new BoloApiError(message || 'Bolo could not complete that request.', response.status);
    if (!validate(payload)) throw new BoloApiError('Bolo returned an invalid response. Please try again.', response.status);
    observe('ai_request_succeeded', Date.now() - startedAt);
    return payload;
  } catch (error) {
    observe('ai_request_failed', Date.now() - startedAt);
    if (error instanceof BoloApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      if (signal?.aborted) throw new BoloApiError('The request was canceled.');
      throw new BoloApiError('The request timed out. Check your connection and try again.');
    }
    throw new BoloApiError('Bolo is unavailable right now. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export function buildMobileChatPayload(input: MobileChatInput) {
  const responseInstruction = input.responseLanguage === 'hi'
    ? 'Respond in Hindi using Devanagari script. '
    : input.responseLanguage === 'en'
      ? 'Respond in English. '
      : '';
  const text = input.text?.trim().slice(0, 500);
  return {
    text: text ? `${responseInstruction}${text}` : undefined,
    audioBase64: input.audioBase64,
    mimeType: input.mimeType,
    messages: input.messages.slice(-10).map(({ role, text }) => ({ role, text: text.slice(0, 600) })),
    clientId: input.clientId,
    languageMode: MOBILE_LANGUAGE_MODE,
  };
}

export function sendMobileChat(input: MobileChatInput, signal?: AbortSignal) {
  return post('/api/mobile-chat', buildMobileChatPayload(input), isMobileChatResponse, signal);
}

export function createRealtimeClientSecret(clientId: string, signal?: AbortSignal) {
  return post('/api/realtime-token', {
    clientId,
    model: OPENAI_REALTIME_MODEL,
    languageMode: MOBILE_LANGUAGE_MODE,
  }, isRealtimeClientSecret, signal);
}

export function translateHindiAudio(input: { audioBase64: string; mimeType: string }, signal?: AbortSignal) {
  return post('/api/live-caption-audio', {
    audioBase64: input.audioBase64,
    mimeType: input.mimeType,
  }, isLiveTranslationResponse, signal);
}

export function requestAiVoiceAudio(text: string, signal?: AbortSignal) {
  const boundedText = text.trim().slice(0, AI_VOICE_TEXT_LIMIT);
  if (!boundedText) return Promise.reject(new BoloApiError('There is no text to read aloud.'));
  return post('/api/phrase-audio', { text: boundedText }, isAiVoiceAudio, signal);
}

export function checkPronunciation(input: {
  audioBase64: string;
  clientId: string;
  mimeType: string;
  target: SavedPhrase;
  lessonTitle: string;
}, signal?: AbortSignal) {
  return post('/api/voice-coach', { ...input, includeAudio: false }, isVoiceCoachResponse, signal);
}

export function reportGeneratedMessage(input: { clientId: string; message: string; reason: ReportReason }, signal?: AbortSignal) {
  return post('/api/report-message', {
    clientId: input.clientId,
    message: input.message.trim().slice(0, 1200),
    reason: input.reason.trim().slice(0, 200),
  }, isReportResponse, signal);
}

export function deleteMobileData(clientId: string, signal?: AbortSignal) {
  return post('/api/delete-mobile-data', { clientId }, isDeleteMobileDataResponse, signal);
}
