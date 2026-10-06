import Constants from 'expo-constants';

import type { AshaResponseLanguage, ChatMessage, SavedPhrase } from '@/state/app-state-types';
import { displayHindiTranscript, learnerPhraseLatin } from '@/lib/learner-phrase-display';
import { buildContextualWordDefinitionPrompt, hindiSourcePhrase, hindiWordTokens, MAX_WORD_DEFINITION_SOURCE_CHARACTERS } from '@/lib/contextual-word-definition';
import { HINDI_SPEECH_LANGUAGE, HINDI_SPEECH_LOCALE } from '@/lib/hindi-pronunciation';
import { knownSavedPhrase } from '@/lib/known-hindi-phrases';
import { observe } from '@/lib/observability';

const FALLBACK_API_URL = 'https://api-v2.appdeploy.ai/app/74e39779183cf78fed';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_AI_AUDIO_BASE64_CHARACTERS = 8_000_000;
const MAX_TRANSCRIPT_CHARACTERS = 1_200;
const MAX_GENERATED_TEXT_CHARACTERS = 2_400;
const MAX_MOBILE_CHAT_TEXT_CHARACTERS = 500;

export const MOBILE_LANGUAGE_MODE = 'english-unless-hindi-requested' as const;
export const OPENAI_LIVE_MODEL = 'gpt-live-1' as const;
export const AI_VOICE_TEXT_LIMIT = 240;
export type ReportReason = 'unsafe_or_inappropriate' | 'incorrect_or_misleading';

function configuredApiUrl() {
  const configured = Constants.expoConfig?.extra?.boloApiUrl;
  if (typeof configured !== 'string') return FALLBACK_API_URL;
  const trimmed = configured.trim().replace(/\/$/u, '');
  return trimmed.startsWith('https://') ? trimmed : FALLBACK_API_URL;
}

export function getBoloApiUrl() {
  return configuredApiUrl();
}

export function getBoloLiveApiUrl() {
  const value = Constants.expoConfig?.extra?.boloLiveApiUrl;
  if (typeof value === 'string' && value.trim()) {
    try {
      const url = new URL(value.trim());
      if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) {
        return value.trim().replace(/\/+$/u, '');
      }
    } catch { /* Surface the same actionable configuration message. */ }
  }
  throw new BoloApiError('Live voice is not configured in this build. Add a trusted GPT-Live server URL to enable it.');
}

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
  understood?: boolean;
};

export const LIVE_MODES = ['hindi-immersion', 'hindi-english-help', 'beginner', 'conversation', 'lesson'] as const;
export type LiveMode = (typeof LIVE_MODES)[number];
export type LiveVocabularyItem = { devanagari: string; romanization?: string; meaning?: string };
/** Mirrors the trusted live server's validated `context` body field and its limits. */
export type LiveCallContext = {
  learnerLevel?: string;
  lessonId?: string;
  lessonTitle?: string;
  learningObjective?: string;
  recentContext?: string[];
  relevantVocabulary?: LiveVocabularyItem[];
};

export type LiveCallInput = {
  clientId: string;
  offerSdp: string;
  responseLanguage: AshaResponseLanguage;
  history?: { role: 'you' | 'asha'; text: string }[];
  mode?: LiveMode;
  context?: LiveCallContext;
  /** Declares that this client executes Bolo function tools on the data channel. */
  clientTools?: boolean;
};

export type LiveCallResponse = { answerSdp: string; sessionId: string };

type MobileChatInput = {
  text?: string;
  audioBase64?: string;
  mimeType?: string;
  messages: ChatMessage[];
  clientId: string;
  responseLanguage?: AshaResponseLanguage;
};

type SavedPhrasePreparationInput = {
  clientId: string;
  /** Original transcript text, when the learner selected Romanized display text. */
  sourceText?: string;
  /** Keep an already-visible Hindi transliteration instead of respelling it. */
  preserveRomanizedText?: boolean;
  text: string;
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

function isBoundedTextAllowingEmpty(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum;
}

function isMobileChatResponse(value: unknown): value is MobileChatResponse {
  return isRecord(value)
    && isBoundedTextAllowingEmpty(value.transcript, MAX_TRANSCRIPT_CHARACTERS)
    && isBoundedText(value.reply, MAX_GENERATED_TEXT_CHARACTERS)
    && (value.language === 'en' || value.language === 'hi');
}

function isVoiceCoachResponse(value: unknown): value is VoiceCoachResponse {
  return isRecord(value)
    && isBoundedTextAllowingEmpty(value.transcript, MAX_TRANSCRIPT_CHARACTERS)
    && (value.understood === undefined || typeof value.understood === 'boolean')
    // Silence is a normal retry only when the service explicitly says it did not understand.
    && (value.transcript.trim().length > 0 || value.understood === false)
    && isBoundedText(value.feedback, MAX_GENERATED_TEXT_CHARACTERS);
}

function isLiveCallResponse(value: unknown): value is LiveCallResponse {
  return isRecord(value)
    && isBoundedText(value.answerSdp, 64_000)
    && value.answerSdp.startsWith('v=0')
    && /(?:^|\r?\n)m=audio /u.test(value.answerSdp)
    && isBoundedText(value.sessionId, 256);
}

function isAiVoiceAudio(value: unknown): value is AiVoiceAudio {
  if (!isRecord(value) || value.mimeType !== 'audio/mpeg' || typeof value.audioBase64 !== 'string') return false;
  const base64 = value.audioBase64;
  return base64.length > 0
    && base64.length <= MAX_AI_AUDIO_BASE64_CHARACTERS
    && base64.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/u.test(base64.slice(0, 64));
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
  baseUrl = getBoloApiUrl(),
): Promise<T> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${baseUrl}${path}`, {
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
    // A caller-initiated cancel (screen unmount, replaying another phrase) is not
    // a failure; only timeouts, network errors, and bad responses count.
    if (!signal?.aborted) observe('ai_request_failed', Date.now() - startedAt);
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
    ? 'You are Asha, a calm Hindi conversation coach. Respond in natural Hindi written in Devanagari. Use standard Indian Hindi vocabulary and phrasing. Check factual claims and calculations before answering; compute prices and change carefully. '
    : input.responseLanguage === 'en'
      ? 'You are Asha, a calm Hindi conversation coach. Respond in English. Write every Hindi word or phrase in Devanagari so speech synthesis follows Hindi phonetics, and include a short Latin transliteration in parentheses only when it helps the learner. Check factual claims and calculations before answering; compute prices and change carefully. '
      : '';
  const text = input.text?.trim().slice(0, MAX_MOBILE_CHAT_TEXT_CHARACTERS);
  return {
    text: text ? `${responseInstruction}${text}` : undefined,
    audioBase64: input.audioBase64,
    mimeType: input.mimeType,
    // The deployed API still expects its legacy assistant discriminator.
    messages: input.messages.slice(-10).map(({ role, text }) => ({
      role: role === 'asha' ? 'mira' : role,
      text: text.slice(0, 600),
    })),
    clientId: input.clientId,
    languageMode: MOBILE_LANGUAGE_MODE,
    responseLanguage: input.responseLanguage,
  };
}

export function sendMobileChat(input: MobileChatInput, signal?: AbortSignal) {
  return post('/api/mobile-chat', buildMobileChatPayload(input), isMobileChatResponse, signal);
}

export async function getContextualWordDefinition(input: {
  clientId: string;
  phrase: string;
  word: string;
}, signal?: AbortSignal) {
  const phrase = hindiSourcePhrase(input.phrase);
  const word = input.word.trim();
  if (!phrase || !hindiWordTokens(phrase).includes(word)) {
    throw new BoloApiError('Choose a Hindi word from this phrase.');
  }
  if (phrase.length > MAX_WORD_DEFINITION_SOURCE_CHARACTERS) throw new BoloApiError('Choose a shorter Hindi excerpt for word meanings.');
  const sourceMessages: ChatMessage[] = [];
  for (let start = 0; start < phrase.length; start += 600) {
    sourceMessages.push({ id: `word-source-${start}`, role: 'you', text: phrase.slice(start, start + 600) });
  }
  const result = await sendMobileChat({
    clientId: input.clientId,
    messages: sourceMessages,
    text: buildContextualWordDefinitionPrompt({ phrase, word }),
  }, signal);
  const explanation = result.reply.trim();
  if (!isBoundedText(explanation, 600) || /[\u0900-\u097f]/u.test(explanation)) {
    throw new BoloApiError('Bolo could not explain that word. Please try again.');
  }
  return explanation;
}

function isHindiText(text: string) {
  return /[\u0904-\u0939\u0958-\u0961\u0972-\u097f]/u.test(text)
    && /^[\p{Script=Devanagari}\p{N}\p{P}\p{Z}\s]+$/u.test(text);
}

function isLatinText(text: string) {
  return /[A-Za-z]/u.test(text)
    && /^[\p{Script=Latin}\p{M}\p{N}\p{P}\p{S}\p{Z}\s]+$/u.test(text)
    && !/[\u0900-\u097f]/u.test(text);
}

function isSavedPhrase(value: unknown): value is SavedPhrase {
  return isRecord(value)
    && isBoundedText(value.hi, 500)
    && isBoundedText(value.latin, 500)
    && isBoundedText(value.en, 500)
    && isHindiText(value.hi)
    && isLatinText(value.latin)
    && isLatinText(value.en);
}

export async function prepareSavedPhraseFromText(input: SavedPhrasePreparationInput, signal?: AbortSignal): Promise<SavedPhrase> {
  const selectedText = input.text.trim();
  if (signal?.aborted) throw new BoloApiError('The request was canceled.');
  if (!selectedText) throw new BoloApiError('Select some transcript text first.');
  if (selectedText.length > 500) throw new BoloApiError('Select a shorter excerpt (up to 500 characters).');

  // Keep the entire retained Hindi selection, including punctuation and all
  // sentences. Extracting just the longest Hindi fragment loses selected words.
  const originalSource = input.sourceText?.trim() || '';
  const sourceHindi = isHindiText(originalSource) ? originalSource : isHindiText(selectedText) ? selectedText : '';
  if (sourceHindi.length > 500) throw new BoloApiError('Select a shorter excerpt (up to 500 characters).');
  const lessonPhrase = knownSavedPhrase(sourceHindi || selectedText);
  if (lessonPhrase) return sourceHindi
    ? { ...lessonPhrase, hi: sourceHindi, latin: displayHindiTranscript(sourceHindi) }
    : { ...lessonPhrase, latin: learnerPhraseLatin(lessonPhrase.hi, lessonPhrase.latin) };

  // Send the full selection in one request so the service can preserve its
  // context and every sentence without chat's Romanization filter.
  const result = await post(
    '/api/prepare-saved-phrase',
    { clientId: input.clientId, text: sourceHindi || selectedText },
    isSavedPhrase,
    signal,
  );
  if (signal?.aborted) throw new BoloApiError('The request was canceled.');
  const phrase = {
    hi: sourceHindi || result.hi.trim(),
    latin: input.preserveRomanizedText && isLatinText(selectedText)
      ? selectedText
      : sourceHindi ? displayHindiTranscript(sourceHindi) : learnerPhraseLatin(result.hi.trim(), result.latin.trim()),
    en: result.en.trim(),
  };
  if (!isSavedPhrase(phrase)) {
    throw new BoloApiError('Bolo could not fit all phrase details. Select a shorter excerpt or fill the details manually.');
  }
  return phrase;
}

const LIVE_CONTEXT_MAX_BYTES = 24_000;

function boundedLiveText(value: unknown, maximum: number) {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/gu, ' ').trim();
  let bounded = '';
  // Count UTF-16 units like the server, without splitting a surrogate pair.
  for (const character of text) {
    if (bounded.length + character.length > maximum) break;
    bounded += character;
  }
  return bounded.trim() || undefined;
}

/**
 * Bounds lesson context to the live server's limits so an oversized field is
 * trimmed or dropped instead of rejecting the whole voice session.
 */
export function sanitizeLiveCallContext(value: LiveCallContext | undefined): LiveCallContext | undefined {
  if (!isRecord(value)) return undefined;
  const context: LiveCallContext = {};
  const learnerLevel = boundedLiveText(value.learnerLevel, 100);
  const lessonId = boundedLiveText(value.lessonId, 120);
  const lessonTitle = boundedLiveText(value.lessonTitle, 200);
  const learningObjective = boundedLiveText(value.learningObjective, 400);
  if (learnerLevel) context.learnerLevel = learnerLevel;
  if (lessonId) context.lessonId = lessonId;
  if (lessonTitle) context.lessonTitle = lessonTitle;
  if (learningObjective) context.learningObjective = learningObjective;
  if (Array.isArray(value.recentContext)) {
    const recentContext = value.recentContext.map((item) => boundedLiveText(item, 500)).filter((item): item is string => Boolean(item)).slice(-8);
    if (recentContext.length) context.recentContext = recentContext;
  }
  if (Array.isArray(value.relevantVocabulary)) {
    const relevantVocabulary = value.relevantVocabulary.flatMap((item): LiveVocabularyItem[] => {
      if (!isRecord(item)) return [];
      const devanagari = boundedLiveText(item.devanagari, 100);
      if (!devanagari) return [];
      const romanization = boundedLiveText(item.romanization, 100);
      const meaning = boundedLiveText(item.meaning, 160);
      return [{ devanagari, ...(romanization ? { romanization } : {}), ...(meaning ? { meaning } : {}) }];
    }).slice(0, 30);
    if (relevantVocabulary.length) context.relevantVocabulary = relevantVocabulary;
  }
  const bytes = (candidate: LiveCallContext) => new TextEncoder().encode(JSON.stringify(candidate)).byteLength;
  if (bytes(context) > LIVE_CONTEXT_MAX_BYTES) delete context.recentContext;
  if (bytes(context) > LIVE_CONTEXT_MAX_BYTES) delete context.relevantVocabulary;
  return Object.keys(context).length ? context : undefined;
}

export async function createLiveCall(input: LiveCallInput, signal?: AbortSignal) {
  if (!/^[A-Za-z0-9-]{8,64}$/u.test(input.clientId)
    || !isBoundedText(input.offerSdp, 64_000)
    || !input.offerSdp.startsWith('v=0')
    || !/(?:^|\r?\n)m=audio /u.test(input.offerSdp)
    || !['en', 'hi'].includes(input.responseLanguage)
    || (input.history !== undefined && (!Array.isArray(input.history)
      || input.history.some((row) => !isRecord(row) || !['you', 'asha'].includes(row.role) || typeof row.text !== 'string')))
    || (input.mode !== undefined && !(LIVE_MODES as readonly string[]).includes(input.mode))
    || (input.clientTools !== undefined && typeof input.clientTools !== 'boolean')) {
    return Promise.reject(new BoloApiError('Bolo could not start this live voice session.'));
  }
  const context = sanitizeLiveCallContext(input.context);
  return post('/api/live-call', {
    clientId: input.clientId,
    offerSdp: input.offerSdp,
    responseLanguage: input.responseLanguage,
    history: input.history?.filter((row) => row.text.trim()).slice(-10).map(({ role, text }) => ({ role, text: text.trim().slice(0, 600) })),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(context ? { context } : {}),
    ...(input.clientTools === true ? { clientTools: true } : {}),
  }, isLiveCallResponse, signal, getBoloLiveApiUrl());
}

export function requestAiVoiceAudio(text: string, signal?: AbortSignal, language?: AshaResponseLanguage) {
  const boundedText = text.trim().slice(0, AI_VOICE_TEXT_LIMIT);
  if (!boundedText) return Promise.reject(new BoloApiError('There is no text to read aloud.'));
  return post('/api/phrase-audio', {
    text: boundedText,
    ...(language === HINDI_SPEECH_LANGUAGE ? { language: HINDI_SPEECH_LANGUAGE, locale: HINDI_SPEECH_LOCALE } : {}),
  }, isAiVoiceAudio, signal);
}

export async function checkPronunciation(input: {
  audioBase64: string;
  clientId: string;
  mimeType: string;
  target: SavedPhrase;
  lessonTitle: string;
}, signal?: AbortSignal) {
  const result = await post('/api/voice-coach', { ...input, includeAudio: false }, isVoiceCoachResponse, signal);
  return { ...result, outcome: result.transcript.trim() ? 'speech' as const : 'no-speech' as const };
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
