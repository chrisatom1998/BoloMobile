import { playAiVoiceAudio } from '@/lib/ai-voice-player';
import { splitAiVoiceText } from '@/lib/speech-text';
import { requestAiVoiceAudio, type AiVoiceAudio } from '@/services/bolo-api';

const AI_VOICE_CACHE_LIMIT = 24;
const aiVoiceCache = new Map<string, AiVoiceAudio>();
const pendingAudioPreloads = new Map<string, Promise<AiVoiceAudio>>();
let activeSpeechController: AbortController | null = null;

function rememberAudio(text: string, audio: AiVoiceAudio) {
  aiVoiceCache.delete(text);
  aiVoiceCache.set(text, audio);
  while (aiVoiceCache.size > AI_VOICE_CACHE_LIMIT) {
    const oldest = aiVoiceCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    aiVoiceCache.delete(oldest);
  }
}

function startAudioPreload(text: string) {
  const existing = pendingAudioPreloads.get(text);
  if (existing) return existing;
  const pending = requestAiVoiceAudio(text)
    .then((audio) => {
      rememberAudio(text, audio);
      return audio;
    })
    .finally(() => {
      if (pendingAudioPreloads.get(text) === pending) pendingAudioPreloads.delete(text);
    });
  pendingAudioPreloads.set(text, pending);
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

export async function preloadSpeech(text: string) {
  for (const rawChunk of splitAiVoiceText(text)) {
    const chunk = rawChunk.trim();
    if (!chunk || aiVoiceCache.has(chunk)) continue;
    try {
      await startAudioPreload(chunk);
    } catch {
      // Warm-up is best-effort; an explicit Listen action will retry and surface failures.
      return;
    }
  }
}

export async function speakText(text: string, signal?: AbortSignal) {
  const chunks = splitAiVoiceText(text);
  stopSpeaking();
  if (!chunks.length || signal?.aborted) return;

  const controller = new AbortController();
  activeSpeechController = controller;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });

  try {
    for (const rawChunk of chunks) {
      if (controller.signal.aborted) return;
      const chunk = rawChunk.trim();
      if (!chunk) continue;
      let audio = aiVoiceCache.get(chunk);
      if (!audio) {
        const pending = pendingAudioPreloads.get(chunk);
        if (pending) {
          try {
            audio = await waitForPreload(pending, controller.signal) ?? undefined;
          } catch {
            if (controller.signal.aborted) return;
          }
        }
        if (!audio) {
          audio = await requestAiVoiceAudio(chunk, controller.signal);
          rememberAudio(chunk, audio);
        }
      }
      if (controller.signal.aborted) return;
      await playAiVoiceAudio(audio, controller.signal);
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    if (activeSpeechController === controller) activeSpeechController = null;
  }
}

export function stopSpeaking() {
  activeSpeechController?.abort();
  activeSpeechController = null;
}
