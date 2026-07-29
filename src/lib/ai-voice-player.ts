import { createAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

import { normalizeAiVoiceAudioFile } from '@/lib/ai-audio-normalizer';
import { setVoiceAudioMode, type VoiceAudioMode } from '@/lib/voice';
import type { AiVoiceAudio } from '@/services/bolo-api';

const PLAYBACK_TIMEOUT_MS = 90_000;
const MAX_PLAYBACK_TIMEOUT_MS = 120_000;
const MIN_PLAYBACK_RATE = 0.1;
const PREPARED_AUDIO_CACHE_LIMIT = 4;
type PreparedAudio = {
  audio: AiVoiceAudio;
  files: File[];
  hasStarted: boolean;
  inUse: number;
  keepAudioSessionActive: boolean;
  player: AudioPlayer;
  cached: boolean;
};

const preparedAudioCache = new Map<AiVoiceAudio, PreparedAudio>();

function normalizedPlaybackRate(playbackRate: number) {
  if (!Number.isFinite(playbackRate)) return 1;
  return Math.min(2, Math.max(MIN_PLAYBACK_RATE, playbackRate));
}

function deletePreparedFiles(files: readonly File[]) {
  for (const file of files) {
    try {
      if (file.exists) file.delete();
    } catch {
      // Cache cleanup must not replace a useful playback result or error.
    }
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
  deletePreparedFiles(prepared.files);
}

function evictPreparedAudio() {
  while (preparedAudioCache.size > PREPARED_AUDIO_CACHE_LIMIT) {
    const candidate = [...preparedAudioCache.values()].find((prepared) => prepared.inUse === 0);
    if (!candidate) return;
    disposePreparedAudio(candidate);
  }
}

async function createPreparedAudio(audio: AiVoiceAudio, keepAudioSessionActive: boolean) {
  const file = new File(Paths.cache, `bolo-ai-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
  const files = [file];
  try {
    file.write(audio.audioBase64, { encoding: 'base64' });
    let playbackFile = file;
    // Only canonical Asha replies inside a live WebRTC session are boosted.
    // AVAudioFile processes the downloaded MP3 without touching AVAudioSession.
    if (keepAudioSessionActive) {
      const normalizedUri = await normalizeAiVoiceAudioFile(file.uri);
      if (normalizedUri) {
        const normalizedFile = new File(normalizedUri);
        if (normalizedFile.exists) {
          files.push(normalizedFile);
          playbackFile = normalizedFile;
        }
      }
    }
    const player = createAudioPlayer(playbackFile.uri, {
      updateInterval: 100,
      // Only WebRTC's canonical reply needs to retain its shared iOS session.
      keepAudioSessionActive,
    });
    player.volume = 1;
    return { audio, cached: false, files, hasStarted: false, inUse: 0, keepAudioSessionActive, player };
  } catch (error) {
    deletePreparedFiles(files);
    throw error;
  }
}

async function getPreparedAudio(audio: AiVoiceAudio, keepAudioSessionActive: boolean) {
  const cached = preparedAudioCache.get(audio);
  if (cached) {
    if (cached.keepAudioSessionActive === keepAudioSessionActive) {
      preparedAudioCache.delete(audio);
      preparedAudioCache.set(audio, cached);
      return cached;
    }
    // A player configured for standalone playback cannot safely be reused for
    // an active WebRTC session (or vice versa). Never release a clip that is
    // currently playing; use a one-shot player until it becomes idle.
    if (cached.inUse > 0) return createPreparedAudio(audio, keepAudioSessionActive);
    disposePreparedAudio(cached);
  }

  const prepared = await createPreparedAudio(audio, keepAudioSessionActive);
  // A superseding speech request can prepare the same cached audio while the
  // first normalization is still running. Keep one cache owner and dispose the
  // duplicate rather than leaking its native player and temporary files.
  const raced = preparedAudioCache.get(audio);
  if (raced) {
    if (raced.keepAudioSessionActive === keepAudioSessionActive) {
      disposePreparedAudio(prepared);
      return raced;
    }
    if (raced.inUse > 0) return prepared;
    disposePreparedAudio(raced);
  }
  prepared.cached = true;
  preparedAudioCache.set(audio, prepared);
  return prepared;
}

export function clearAiVoicePlaybackCache() {
  for (const prepared of [...preparedAudioCache.values()]) {
    disposePreparedAudio(prepared);
  }
}

export async function playAiVoiceAudio(audio: AiVoiceAudio, signal: AbortSignal, playbackRate = 1, audioMode: VoiceAudioMode = 'playback'): Promise<void> {
  if (signal.aborted) return;
  const prepared = await getPreparedAudio(audio, audioMode === 'realtimePlayback');
  if (signal.aborted) {
    if (!prepared.cached) disposePreparedAudio(prepared);
    return;
  }
  const rate = normalizedPlaybackRate(playbackRate);
  prepared.inUse += 1;
  evictPreparedAudio();
  let disposed = false;
  try {
    await Promise.all([
      // The live WebRTC call already owns an active PlayAndRecord session.
      // Reapplying Expo's audio mode while the microphone track is stopped can
      // leave iOS's capture unit silent when the next turn enables that track.
      audioMode === 'realtimePlayback' ? Promise.resolve() : setVoiceAudioMode(audioMode),
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
    disposed = true;
    throw error;
  } finally {
    prepared.inUse = Math.max(0, prepared.inUse - 1);
    if (!prepared.cached && !disposed) disposePreparedAudio(prepared);
    evictPreparedAudio();
  }
}
