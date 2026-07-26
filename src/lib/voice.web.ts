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

export function isRealtimeVoiceSessionActive() {
  return false;
}
