import { setAudioModeAsync } from 'expo-audio';

import type { VoiceAudioMode } from '@/lib/voice-profile';

export { ASHA_VOICE_PROFILE, type VoiceAudioMode } from '@/lib/voice-profile';

/**
 * Audio routing has to be app-wide: Expo configures the native audio session,
 * rather than a player-local setting. Keeping each intentional session state
 * here prevents one Asha surface from accidentally changing another's route.
 */
const VOICE_AUDIO_MODES = {
  idle: {
    allowsRecording: false,
    playsInSilentMode: true,
  },
  playback: {
    allowsRecording: false,
    interruptionMode: 'doNotMix',
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  },
  recording: {
    allowsRecording: true,
    playsInSilentMode: true,
  },
  realtime: {
    allowsRecording: true,
    interruptionMode: 'doNotMix',
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  },
  // Keep the WebRTC call's PlayAndRecord session alive while canonical TTS
  // speaks its text reply. Switching to standalone playback during the call
  // can leave the iOS player without an active output route.
  realtimePlayback: {
    allowsRecording: true,
    interruptionMode: 'doNotMix',
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  },
} as const;

let currentVoiceAudioMode: VoiceAudioMode = 'idle';

export async function setVoiceAudioMode(mode: VoiceAudioMode) {
  await setAudioModeAsync(VOICE_AUDIO_MODES[mode]);
  currentVoiceAudioMode = mode;
}

export function resetVoiceAudioMode() {
  return setVoiceAudioMode('idle');
}

/** Whether a still-mounted live WebRTC call owns the iOS audio session. */
export function isRealtimeVoiceSessionActive() {
  return currentVoiceAudioMode === 'realtime' || currentVoiceAudioMode === 'realtimePlayback';
}
