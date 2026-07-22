import { createAudioPlayer, type AudioStatus } from 'expo-audio';

import { offlineHindiAudio } from '@/data/offline-hindi-audio';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { setVoiceAudioMode } from '@/lib/voice';

const PLAYBACK_TIMEOUT_MS = 60_000;
const MAX_PLAYBACK_TIMEOUT_MS = 90_000;
const MIN_PLAYBACK_RATE = 0.1;

let lessonTextIndex: { devanagari: Map<string, string>; romanized: Map<string, string> } | null = null;

function normalizedPlaybackRate(playbackRate: number) {
  if (!Number.isFinite(playbackRate)) return 1;
  return Math.min(2, Math.max(MIN_PLAYBACK_RATE, playbackRate));
}

function normalizeLessonText(text: string) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[।॥.,!?;:…'"“”‘’`()\[\]{}—–-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeRomanizedLessonText(text: string) {
  return normalizeLessonText(text)
    .replace(/[āáàâä]/gu, 'a')
    .replace(/[īíìîï]/gu, 'i')
    .replace(/[ūúùûü]/gu, 'u')
    .replace(/aa/gu, 'a')
    .replace(/ee/gu, 'i')
    .replace(/oo/gu, 'u')
    .replace(/w/gu, 'v');
}

function getLessonTextIndex() {
  if (lessonTextIndex) return lessonTextIndex;
  const devanagari = new Map<string, string>();
  const romanized = new Map<string, string>();
  for (const lessonText of Object.keys(offlineHindiAudio)) {
    const devanagariKey = normalizeLessonText(lessonText);
    const romanizedKey = normalizeRomanizedLessonText(romanizeDevanagari(lessonText));
    if (devanagariKey && !devanagari.has(devanagariKey)) devanagari.set(devanagariKey, lessonText);
    if (romanizedKey && !romanized.has(romanizedKey)) romanized.set(romanizedKey, lessonText);
  }
  lessonTextIndex = { devanagari, romanized };
  return lessonTextIndex;
}

/** Resolves a displayed Romanized lesson phrase back to its bundled Hindi clip. */
export function canonicalLessonAudioText(text: string) {
  const normalized = normalizeLessonText(text);
  if (!normalized) return null;
  const index = getLessonTextIndex();
  return index.devanagari.get(normalized)
    ?? index.romanized.get(normalizeRomanizedLessonText(text))
    ?? null;
}

export function hasOfflineSpeech(text: string) {
  const lessonText = canonicalLessonAudioText(text);
  return lessonText !== null && offlineHindiAudio[lessonText] !== undefined;
}

export async function playOfflineSpeech(text: string, signal: AbortSignal, playbackRate = 1) {
  const lessonText = canonicalLessonAudioText(text);
  const source = lessonText ? offlineHindiAudio[lessonText] : undefined;
  if (source === undefined) return false;
  if (signal.aborted) return true;
  const player = createAudioPlayer(source, { updateInterval: 100 });
  const rate = normalizedPlaybackRate(playbackRate);
  try {
    await setVoiceAudioMode('playback');
    player.setPlaybackRate?.(rate);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let subscription: { remove(): void } | null = null;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        signal.removeEventListener('abort', cancel);
        subscription?.remove();
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => finish();
      const update = (status: AudioStatus) => {
        if (status.error) finish(new Error(`Offline lesson audio failed: ${status.error}`));
        else if (status.didJustFinish) finish();
      };
      subscription = player.addListener('playbackStatusUpdate', update);
      signal.addEventListener('abort', cancel, { once: true });
      timeout = setTimeout(
        () => finish(new Error('Offline lesson audio timed out. Please try again.')),
        Math.min(MAX_PLAYBACK_TIMEOUT_MS, PLAYBACK_TIMEOUT_MS / rate),
      );
      if (signal.aborted) cancel();
      else player.play();
    });
    return true;
  } finally {
    try { player.pause(); } catch { /* The player may already be invalid. */ }
    try { player.release(); } catch { /* Release is best-effort. */ }
  }
}
