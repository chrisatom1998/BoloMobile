import { setAudioModeAsync } from 'expo-audio';

import type { VoiceAudioMode } from '@/lib/voice-profile';
import { activateVoiceChatSession, restoreDefaultAudioSessionMode } from '@/lib/voice-session';

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
let audioModeTail: Promise<void> = Promise.resolve();
let voiceSessionStatus = '';

function isRealtimeMode(mode: VoiceAudioMode) {
  return mode === 'realtime' || mode === 'realtimePlayback';
}

/**
 * expo-audio only picks a category; it never activates the session or sets voiceChat.
 * Without both, iOS can hand WebRTC a silent microphone. A failure here is recorded
 * rather than thrown so a scene that is not yet active cannot abort the call.
 */
async function assertVoiceChatSession() {
  try {
    voiceSessionStatus = await activateVoiceChatSession();
  } catch (cause) {
    voiceSessionStatus = `failed: ${cause instanceof Error ? cause.message.slice(0, 60) : 'unknown'}`;
  }
}

export function setVoiceAudioMode(mode: VoiceAudioMode) {
  // Native audio transitions can finish out of order. Serialize setup, teardown,
  // and a subsequent connection so an old setup cannot re-enable a closed call.
  const transition = audioModeTail.then(async () => {
    const realtime = isRealtimeMode(mode);
    if (!realtime && isRealtimeMode(currentVoiceAudioMode)) {
      await restoreDefaultAudioSessionMode().catch(() => undefined);
    }
    await setAudioModeAsync(VOICE_AUDIO_MODES[mode]);
    // expo-audio just rewrote the category; take the session back for the call.
    if (realtime) await assertVoiceChatSession();
    currentVoiceAudioMode = mode;
  });
  // Propagate this transition's error to its caller while allowing later resets.
  audioModeTail = transition.catch(() => undefined);
  return transition;
}

export function resetVoiceAudioMode() {
  return setVoiceAudioMode('idle');
}

/**
 * Re-activates the live call's audio session. Call it when the scene becomes active
 * or just before the microphone opens: another player's deferred deactivate, or a
 * scene that was not yet active when the call started, can leave the session off.
 */
export function reactivateRealtimeVoiceSession() {
  const transition = audioModeTail.then(async () => {
    if (isRealtimeMode(currentVoiceAudioMode)) await assertVoiceChatSession();
  });
  audioModeTail = transition.catch(() => undefined);
  return transition;
}

/** What the native audio session reported on the last live-call activation, for diagnostics. */
export function getVoiceSessionStatus() {
  return voiceSessionStatus;
}

/** The last audio mode expo-audio accepted, for preview-build diagnostics. */
export function getVoiceAudioMode(): VoiceAudioMode {
  return currentVoiceAudioMode;
}

/** Whether a still-mounted live WebRTC call owns the iOS audio session. */
export function isRealtimeVoiceSessionActive() {
  return isRealtimeMode(currentVoiceAudioMode);
}
