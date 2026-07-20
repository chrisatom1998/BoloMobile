import { createAudioPlayer, setAudioModeAsync, type AudioStatus } from 'expo-audio';

import { offlineHindiAudio } from '@/data/offline-hindi-audio';

const PLAYBACK_TIMEOUT_MS = 60_000;
const MAX_PLAYBACK_TIMEOUT_MS = 90_000;
const MIN_PLAYBACK_RATE = 0.1;

function normalizedPlaybackRate(playbackRate: number) {
  if (!Number.isFinite(playbackRate)) return 1;
  return Math.min(2, Math.max(MIN_PLAYBACK_RATE, playbackRate));
}

export function hasOfflineSpeech(text: string) {
  return offlineHindiAudio[text.trim()] !== undefined;
}

export async function playOfflineSpeech(text: string, signal: AbortSignal, playbackRate = 1) {
  const source = offlineHindiAudio[text.trim()];
  if (source === undefined) return false;
  if (signal.aborted) return true;
  const player = createAudioPlayer(source, { updateInterval: 100 });
  const rate = normalizedPlaybackRate(playbackRate);
  try {
    await setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: 'doNotMix',
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
    });
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
