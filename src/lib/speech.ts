import { playAiVoiceAudio } from '@/lib/ai-voice-player';
import { rememberBoundedEntry } from '@/lib/bounded-set';
import { canonicalLessonAudioText, hasOfflineSpeech, playOfflineSpeech } from '@/lib/offline-voice-player';
import { splitAiVoiceText } from '@/lib/speech-text';
import { requestAiVoiceAudio, type AiVoiceAudio } from '@/services/bolo-api';
import type { AshaResponseLanguage } from '@/state/app-state-types';
import { isRealtimeVoiceSessionActive, type VoiceAudioMode } from '@/lib/voice';

const AI_VOICE_CACHE_LIMIT = 24;
const GENERATED_SPEECH_ATTEMPTS = 2;
const aiVoiceCache = new Map<string, AiVoiceAudio>();
const pendingAudioPreloads = new Map<string, Promise<AiVoiceAudio>>();
let activeSpeechController: AbortController | null = null;
let activeSpeechRun: Promise<void> | null = null;

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
        /^\d/u.test(tokens[index] ?? '')
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
  for (const [index, token] of tokens.entries()) {
    const language = resolved[index] ?? defaultLanguage;
    const previous = segments.at(-1);
    if (previous?.language === language) previous.text += token;
    else segments.push({ text: token, language });
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
  rememberBoundedEntry(aiVoiceCache, key, audio, AI_VOICE_CACHE_LIMIT);
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

async function loadSpeechAudio(chunk: SpeechChunk, signal: AbortSignal) {
  const key = audioCacheKey(chunk.text, chunk.language);
  const cached = aiVoiceCache.get(key);
  if (cached) return cached;

  const pending = pendingAudioPreloads.get(key);
  if (pending) {
    try {
      const audio = await waitForPreload(pending, signal);
      if (audio) return audio;
    } catch {
      if (signal.aborted) return undefined;
      // A failed best-effort warm-up should not prevent the explicit playback
      // request below from recovering the learner's spoken reply.
    }
  }
  if (signal.aborted) return undefined;

  const audio = await requestSpeechAudio(chunk.text, signal, chunk.language);
  rememberAudio(key, audio);
  return audio;
}

type PreparedSpeechAudio =
  | { audio: AiVoiceAudio; error?: never }
  | { audio?: never; error: unknown };

function prepareSpeechAudio(chunk: SpeechChunk, signal: AbortSignal): Promise<PreparedSpeechAudio> {
  return loadSpeechAudio(chunk, signal).then(
    (audio) => audio ? { audio } : { error: new Error('Speech was canceled.') },
    (error: unknown) => ({ error }),
  );
}

async function playGeneratedSpeech(
  chunk: SpeechChunk,
  prepared: Promise<PreparedSpeechAudio> | undefined,
  signal: AbortSignal,
  playbackRate: number,
  audioMode: VoiceAudioMode,
  normalizeGeneratedChatReply: boolean,
) {
  let result = prepared ? await prepared : await prepareSpeechAudio(chunk, signal);
  for (let attempt = 0; attempt < GENERATED_SPEECH_ATTEMPTS; attempt += 1) {
    if (signal.aborted) return;
    if (!result.audio) {
      if (attempt + 1 >= GENERATED_SPEECH_ATTEMPTS) throw result.error;
      result = await prepareSpeechAudio(chunk, signal);
      continue;
    }
    try {
      const audio = result.audio;
      if (playbackRate === 1 && audioMode === 'playback') {
        if (normalizeGeneratedChatReply) await playAiVoiceAudio(audio, signal, 1, audioMode, true);
        else await playAiVoiceAudio(audio, signal);
      } else if (normalizeGeneratedChatReply) {
        await playAiVoiceAudio(audio, signal, playbackRate, audioMode, true);
      } else {
        await playAiVoiceAudio(audio, signal, playbackRate, audioMode);
      }
      return;
    } catch (error) {
      if (signal.aborted) return;
      // A native player can report an error after the clip has already become
      // audible. Retrying at this point repeats the beginning of a response
      // (for example, "You can say") instead of recovering silently.
      throw error;
    }
  }
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

export async function speakText(
  text: string,
  signal?: AbortSignal,
  playbackRate = 1,
  requestedLanguage?: AshaResponseLanguage,
  audioMode: VoiceAudioMode = 'playback',
  normalizeGeneratedChatReply = false,
) {
  // A normal Listen action can arrive from a still-mounted non-Live tab while
  // the Realtime call owns iOS's PlayAndRecord session. In that case, retain
  // the call session rather than tearing it down for standalone playback.
  const effectiveAudioMode = audioMode === 'playback' && isRealtimeVoiceSessionActive()
    ? 'realtimePlayback'
    : audioMode;
  const chunks = splitSpeechByLanguage(text, requestedLanguage);
  void stopSpeaking();
  if (!chunks.length || signal?.aborted) return;

  const controller = new AbortController();
  activeSpeechController = controller;
  // `stopSpeaking` resolves once this run has finished unwinding, so callers can
  // await it before handing the audio session to another player.
  let markRunSettled = () => {};
  const run = new Promise<void>((resolve) => { markRunSettled = resolve; });
  activeSpeechRun = run;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    const preparedAudio = new Map<number, Promise<PreparedSpeechAudio>>();
    const prepareChunk = (index: number) => {
      const chunk = chunks[index];
      if (!chunk || hasOfflineSpeech(chunk.text) || preparedAudio.has(index)) return;
      preparedAudio.set(index, prepareSpeechAudio(chunk, controller.signal));
    };
    // Keep at most the current and next generated clips in flight. This lets a
    // Hindi phrase load while the preceding English coaching text is speaking,
    // without sending an unbounded burst of TTS requests for a long response.
    prepareChunk(0);
    prepareChunk(1);

    for (const [index, { text: chunk, language }] of chunks.entries()) {
      if (controller.signal.aborted) return;
      prepareChunk(index + 1);
      if (hasOfflineSpeech(chunk)) {
        await playOfflineSpeech(chunk, controller.signal, playbackRate, effectiveAudioMode);
        continue;
      }
      await playGeneratedSpeech(
        { text: chunk, language },
        preparedAudio.get(index),
        controller.signal,
        playbackRate,
        effectiveAudioMode,
        normalizeGeneratedChatReply,
      );
      preparedAudio.delete(index);
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    if (activeSpeechController === controller) activeSpeechController = null;
    if (activeSpeechRun === run) activeSpeechRun = null;
    markRunSettled();
  }
}

export { hasOfflineSpeech } from '@/lib/offline-voice-player';

/**
 * Cancels the active speech run. Cancellation itself is synchronous; when a run
 * is still unwinding this returns a promise that resolves once that run has
 * released its player, so an awaiting caller can safely take over the audio
 * session. Teardown is bounded by the player's own abort and timeout handling,
 * and the returned promise never rejects.
 */
export function stopSpeaking(): Promise<void> | undefined {
  activeSpeechController?.abort();
  activeSpeechController = null;
  const pendingRun = activeSpeechRun;
  activeSpeechRun = null;
  return pendingRun ?? undefined;
}
