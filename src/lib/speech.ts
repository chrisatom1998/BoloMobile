import { playAiVoiceAudio } from '@/lib/ai-voice-player';
import { canonicalLessonAudioText, hasOfflineSpeech, playOfflineSpeech } from '@/lib/offline-voice-player';
import { splitAiVoiceText } from '@/lib/speech-text';
import { requestAiVoiceAudio, type AiVoiceAudio } from '@/services/bolo-api';
import type { AshaResponseLanguage } from '@/state/app-state-types';

const AI_VOICE_CACHE_LIMIT = 24;
const aiVoiceCache = new Map<string, AiVoiceAudio>();
const pendingAudioPreloads = new Map<string, Promise<AiVoiceAudio>>();
let activeSpeechController: AbortController | null = null;

type SpeechChunk = {
  text: string;
  language?: 'hi';
};

const DEVANAGARI = /[\u0900-\u097f]/u;
const SPEECH_TOKENS = /[\u0900-\u097f]+|[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*|[^A-Za-z0-9\u0900-\u097f]+/gu;

function tokenLanguage(token: string) {
  if (DEVANAGARI.test(token)) return 'hi' as const;
  if (/[A-Za-z0-9]/u.test(token)) return 'en' as const;
  return undefined;
}

function nearbyScriptLanguage(languages: readonly ('en' | 'hi' | undefined)[], start: number, direction: -1 | 1) {
  for (let index = start; index >= 0 && index < languages.length; index += direction) {
    if (languages[index]) return languages[index];
  }
  return undefined;
}

/**
 * Keeps an English coaching explanation in its normal voice while sending each
 * embedded Hindi phrase to the Hindi voice path. Latin identifiers inside a
 * Hindi phrase (for example, "12A") stay with the surrounding Hindi words.
 */
export function splitSpeechByLanguage(text: string, requestedLanguage?: AshaResponseLanguage): SpeechChunk[] {
  const tokens = text.match(SPEECH_TOKENS) ?? [];
  const defaultLanguage = requestedLanguage === 'hi' ? 'hi' : 'en';
  const languages = tokens.map(tokenLanguage);
  const resolved = [...languages];
  for (let index = 0; index < resolved.length; index += 1) {
    const language = resolved[index];
    if (language === 'hi') continue;
    if (language === 'en') {
      const previous = nearbyScriptLanguage(languages, index - 1, -1);
      const next = nearbyScriptLanguage(languages, index + 1, 1);
      if (previous === 'hi' && next === 'hi') resolved[index] = 'hi';
      else if (
        /^\d/u.test(tokens[index])
        && ((previous === 'hi' && next !== 'en') || (next === 'hi' && previous !== 'en'))
      ) resolved[index] = 'hi';
      else resolved[index] = defaultLanguage;
    }
  }
  for (let index = 0; index < resolved.length; index += 1) {
    if (resolved[index]) continue;
    resolved[index] = nearbyScriptLanguage(resolved, index - 1, -1)
      ?? nearbyScriptLanguage(resolved, index + 1, 1)
      ?? defaultLanguage;
  }

  const segments: { text: string; language: 'en' | 'hi' }[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const language = resolved[index] ?? defaultLanguage;
    const previous = segments.at(-1);
    if (previous?.language === language) previous.text += tokens[index];
    else segments.push({ text: tokens[index], language });
  }

  return segments.flatMap((segment) => splitAiVoiceText(segment.text).flatMap((chunk) => {
    const lessonText = canonicalLessonAudioText(chunk);
    const spokenText = lessonText ?? chunk.trim();
    if (!spokenText) return [];
    return [{ text: spokenText, language: DEVANAGARI.test(spokenText) || segment.language === 'hi' ? 'hi' : undefined }];
  }));
}

function audioCacheKey(text: string, language?: AshaResponseLanguage) {
  return `${language ?? 'auto'}\u0000${text}`;
}

function requestSpeechAudio(text: string, signal?: AbortSignal, language?: 'hi') {
  return language === 'hi'
    ? requestAiVoiceAudio(text, signal, language)
    : requestAiVoiceAudio(text, signal);
}

function rememberAudio(key: string, audio: AiVoiceAudio) {
  aiVoiceCache.delete(key);
  aiVoiceCache.set(key, audio);
  while (aiVoiceCache.size > AI_VOICE_CACHE_LIMIT) {
    const oldest = aiVoiceCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    aiVoiceCache.delete(oldest);
  }
}

function startAudioPreload(text: string, language?: 'hi') {
  const key = audioCacheKey(text, language);
  const existing = pendingAudioPreloads.get(key);
  if (existing) return existing;
  const pending = requestSpeechAudio(text, undefined, language)
    .then((audio) => {
      rememberAudio(key, audio);
      return audio;
    })
    .finally(() => {
      if (pendingAudioPreloads.get(key) === pending) pendingAudioPreloads.delete(key);
    });
  pendingAudioPreloads.set(key, pending);
  return pending;
}

function waitForPreload(pending: Promise<AiVoiceAudio>, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve<AiVoiceAudio | null>(null);
  return new Promise<AiVoiceAudio | null>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(null);
    };
    signal.addEventListener('abort', abort, { once: true });
    pending.then((audio) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(audio);
    }, (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    if (signal.aborted) abort();
  });
}

export async function preloadSpeech(text: string, requestedLanguage?: AshaResponseLanguage) {
  for (const { text: chunk, language } of splitSpeechByLanguage(text, requestedLanguage)) {
    if (hasOfflineSpeech(chunk)) continue;
    const key = audioCacheKey(chunk, language);
    if (!chunk || aiVoiceCache.has(key)) continue;
    try {
      await startAudioPreload(chunk, language);
    } catch {
      // Warm-up is best-effort; an explicit Listen action will retry and surface failures.
      return;
    }
  }
}

export async function speakText(text: string, signal?: AbortSignal, playbackRate = 1, requestedLanguage?: AshaResponseLanguage) {
  const chunks = splitSpeechByLanguage(text, requestedLanguage);
  stopSpeaking();
  if (!chunks.length || signal?.aborted) return;

  const controller = new AbortController();
  activeSpeechController = controller;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    for (const { text: chunk, language } of chunks) {
      if (controller.signal.aborted) return;
      if (hasOfflineSpeech(chunk)) {
        await playOfflineSpeech(chunk, controller.signal, playbackRate);
        continue;
      }
      const key = audioCacheKey(chunk, language);
      let audio = aiVoiceCache.get(key);
      if (!audio) {
        const pending = pendingAudioPreloads.get(key);
        if (pending) {
          try {
            audio = await waitForPreload(pending, controller.signal) ?? undefined;
          } catch {
            if (controller.signal.aborted) return;
          }
        }
        if (!audio) {
          audio = await requestSpeechAudio(chunk, controller.signal, language);
          rememberAudio(key, audio);
        }
      }
      if (controller.signal.aborted) return;
      if (playbackRate === 1) await playAiVoiceAudio(audio, controller.signal);
      else await playAiVoiceAudio(audio, controller.signal, playbackRate);
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    if (activeSpeechController === controller) activeSpeechController = null;
  }
}

export { hasOfflineSpeech } from '@/lib/offline-voice-player';

export function stopSpeaking() {
  activeSpeechController?.abort();
  activeSpeechController = null;
}
