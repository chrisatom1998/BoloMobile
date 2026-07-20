import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import type { AiVoiceAudio } from '@/services/bolo-api';

const PLAYBACK_TIMEOUT_MS = 90_000;
const MAX_PLAYBACK_TIMEOUT_MS = 120_000;
const MIN_PLAYBACK_RATE = 0.1;
const PREPARED_AUDIO_CACHE_LIMIT = 4;
const AI_VOICE_PLAYBACK_MODE = {
  allowsRecording: false,
  interruptionMode: 'doNotMix',
  playsInSilentMode: true,
  shouldRouteThroughEarpiece: false,
} as const;

type PreparedAudio = {
  audio: AiVoiceAudio;
  file: File;
  hasStarted: boolean;
  inUse: number;
  player: AudioPlayer;
};

const preparedAudioCache = new Map<AiVoiceAudio, PreparedAudio>();

function normalizedPlaybackRate(playbackRate: number) {
  if (!Number.isFinite(playbackRate)) return 1;
  return Math.min(2, Math.max(MIN_PLAYBACK_RATE, playbackRate));
}

function deletePreparedFile(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup must not replace a useful playback result or error.
  }
}

function disposePreparedAudio(prepared: PreparedAudio) {
  if (preparedAudioCache.get(prepared.audio) === prepared) {
    preparedAudioCache.delete(prepared.audio);
  }
  try {
    prepared.player.pause();
  } catch {
    // The native player may already be invalid after a decoder error.
  }
  try {
    prepared.player.release();
  } catch {
    // Release is best-effort because the cache entry is already unreachable.
  }
  deletePreparedFile(prepared.file);
}

function evictPreparedAudio() {
  while (preparedAudioCache.size > PREPARED_AUDIO_CACHE_LIMIT) {
    const candidate = [...preparedAudioCache.values()].find((prepared) => prepared.inUse === 0);
    if (!candidate) return;
    disposePreparedAudio(candidate);
  }
}

function getPreparedAudio(audio: AiVoiceAudio) {
  const cached = preparedAudioCache.get(audio);
  if (cached) {
    preparedAudioCache.delete(audio);
    preparedAudioCache.set(audio, cached);
    return cached;
  }

  const file = new File(Paths.cache, `bolo-ai-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  try {
    file.write(audio.audioBase64, { encoding: 'base64' });
    const player = createAudioPlayer(file.uri, { updateInterval: 100 });
    player.volume = 1;
    const prepared = { audio, file, hasStarted: false, inUse: 0, player };
    preparedAudioCache.set(audio, prepared);
    return prepared;
  } catch (error) {
    deletePreparedFile(file);
    throw error;
  }
}

export function clearAiVoicePlaybackCache() {
  for (const prepared of [...preparedAudioCache.values()]) {
    disposePreparedAudio(prepared);
  }
}

export async function playAiVoiceAudio(audio: AiVoiceAudio, signal: AbortSignal, playbackRate = 1): Promise<void> {
  if (signal.aborted) return;
  const prepared = getPreparedAudio(audio);
  const rate = normalizedPlaybackRate(playbackRate);
  prepared.inUse += 1;
  evictPreparedAudio();
  try {
    await Promise.all([
      setAudioModeAsync(AI_VOICE_PLAYBACK_MODE),
      prepared.hasStarted ? prepared.player.seekTo(0) : Promise.resolve(),
    ]);
    prepared.player.setPlaybackRate?.(rate);
    if (signal.aborted) return;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let subscription: { remove(): void } | null = null;
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        signal.removeEventListener('abort', cancel);
        subscription?.remove();
        try {
          prepared.player.pause();
        } catch {
          // The native player may already be invalid after a decoder error;
          // the promise must still settle so playback callers never hang.
        }
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => finish();
      const update = (status: AudioStatus) => {
        if (status.error) finish(new Error(`AI voice playback failed: ${status.error}`));
        else if (status.didJustFinish) finish();
      };

      subscription = prepared.player.addListener('playbackStatusUpdate', update);
      signal.addEventListener('abort', cancel, { once: true });
      timeout = setTimeout(
        () => finish(new Error('AI voice playback timed out. Please try again.')),
        Math.min(MAX_PLAYBACK_TIMEOUT_MS, PLAYBACK_TIMEOUT_MS / rate),
      );
      if (signal.aborted) cancel();
      else {
        prepared.hasStarted = true;
        try {
          prepared.player.play();
        } catch (error) {
          finish(error instanceof Error ? error : new Error('AI voice playback failed. Please try again.'));
        }
      }
    });
  } catch (error) {
    disposePreparedAudio(prepared);
    throw error;
  } finally {
    prepared.inUse = Math.max(0, prepared.inUse - 1);
    evictPreparedAudio();
  }
}
