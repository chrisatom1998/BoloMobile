import type { VoiceAudioMode } from '@/lib/voice-profile';

export { ASHA_VOICE_PROFILE, type VoiceAudioMode } from '@/lib/voice-profile';

// Browsers do not expose Expo's native audio-session routing. The playback
// implementations retain their own element lifecycle, while callers can use
// the same cross-platform voice-service API.
export async function setVoiceAudioMode(_mode: VoiceAudioMode) {
  void _mode;
}

export function resetVoiceAudioMode() {
  return setVoiceAudioMode('idle');
}

export function getVoiceAudioMode(): VoiceAudioMode {
  return 'idle';
}

export async function reactivateRealtimeVoiceSession() {}

export function getVoiceSessionStatus() {
  return '';
}

export async function readAudioSessionState() {
  return 'n/a';
}

export async function drainAudioSessionEvents(): Promise<string[]> {
  return [];
}

export function isRealtimeVoiceSessionActive() {
  return false;
}

let realtimeVoiceOwner: (() => void) | null = null;

export function registerRealtimeVoiceOwner(end: () => void) {
  realtimeVoiceOwner = end;
  return () => {
    if (realtimeVoiceOwner === end) realtimeVoiceOwner = null;
  };
}

export function endRealtimeVoiceSession() {
  const end = realtimeVoiceOwner;
  realtimeVoiceOwner = null;
  end?.();
}
