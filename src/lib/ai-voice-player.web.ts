import type { AiVoiceAudio } from '@/services/bolo-api';

const PLAYBACK_TIMEOUT_MS = 90_000;
const PREPARED_AUDIO_CACHE_LIMIT = 4;

type PreparedAudio = {
  audio: AiVoiceAudio;
  hasStarted: boolean;
  inUse: number;
  player: HTMLAudioElement;
};

const preparedAudioCache = new Map<AiVoiceAudio, PreparedAudio>();

function disposePreparedAudio(prepared: PreparedAudio) {
  if (preparedAudioCache.get(prepared.audio) === prepared) {
    preparedAudioCache.delete(prepared.audio);
  }
  prepared.player.pause();
  prepared.player.removeAttribute('src');
  prepared.player.load();
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
  const player = new Audio(`data:${audio.mimeType};base64,${audio.audioBase64}`);
  player.preload = 'auto';
  const prepared = { audio, hasStarted: false, inUse: 0, player };
  preparedAudioCache.set(audio, prepared);
  return prepared;
}

export function clearAiVoicePlaybackCache() {
  for (const prepared of [...preparedAudioCache.values()]) {
    disposePreparedAudio(prepared);
  }
}

export async function playAiVoiceAudio(audioData: AiVoiceAudio, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  const prepared = getPreparedAudio(audioData);
  prepared.inUse += 1;
  evictPreparedAudio();
  const { player } = prepared;

  try {
    if (prepared.hasStarted) player.currentTime = 0;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => finish(new Error('AI voice playback timed out. Please try again.')), PLAYBACK_TIMEOUT_MS);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener('abort', cancel);
        player.onended = null;
        player.onerror = null;
        try {
          player.pause();
        } catch {
          // The element may already be invalid after a decode error;
          // the promise must still settle so playback callers never hang.
        }
        if (error) reject(error);
        else resolve();
      };
      const cancel = () => finish();

      player.onended = () => finish();
      player.onerror = () => finish(new Error('AI voice playback failed. Please try again.'));
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
      else {
        prepared.hasStarted = true;
        void player.play().catch(() => finish(new Error('AI voice playback was blocked. Tap Listen to try again.')));
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
