import { setAudioModeAsync } from 'expo-audio';

import { noteLiveAudioEvent } from '@/lib/live-diagnostics';
import type { VoiceAudioMode } from '@/lib/voice-profile';
import { activateVoiceChatSession, releaseAudioSessionBeforeCall, restoreDefaultAudioSessionMode } from '@/lib/voice-session';

export { ASHA_VOICE_PROFILE, type VoiceAudioMode } from '@/lib/voice-profile';
export { drainAudioSessionEvents, readAudioSessionState } from '@/lib/voice-session';

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
async function assertVoiceChatSession(options?: { notifyWebRtc?: boolean }) {
  try {
    voiceSessionStatus = await activateVoiceChatSession(options);
  } catch (cause) {
    voiceSessionStatus = `failed: ${cause instanceof Error ? cause.message.slice(0, 60) : 'unknown'}`;
  }
  noteLiveAudioEvent(`activate ${voiceSessionStatus.split(' ')[0] ?? ''}`);
}

export function setVoiceAudioMode(mode: VoiceAudioMode) {
  // Native audio transitions can finish out of order. Serialize setup, teardown,
  // and a subsequent connection so an old setup cannot re-enable a closed call.
  const transition = audioModeTail.then(async () => {
    const realtime = isRealtimeMode(mode);
    // Preview builds: a non-realtime mode applied under a live call is the prime suspect
    // for a microphone that goes silent while packets keep flowing. Stamp every transition.
    noteLiveAudioEvent(`mode:${mode}${isRealtimeMode(currentVoiceAudioMode) && !realtime ? ' (under live call)' : ''}`);
    if (!realtime && isRealtimeMode(currentVoiceAudioMode)) {
      await restoreDefaultAudioSessionMode().catch(() => undefined);
    }
    // realtime and realtimePlayback configure the same session. expo-audio's setCategory
    // resets the mode to default, so repeating it under a running WebRTC audio unit
    // knocks voiceChat off and can leave the microphone delivering silence.
    if (realtime && isRealtimeMode(currentVoiceAudioMode)) {
      await assertVoiceChatSession();
      currentVoiceAudioMode = mode;
      return;
    }
    // A fresh call starts from an inactive session, as it does after a typed reply has played.
    if (realtime) noteLiveAudioEvent(`release ${await releaseAudioSessionBeforeCall()}`);
    await setAudioModeAsync(VOICE_AUDIO_MODES[mode]);
    // expo-audio just rewrote the category; take the session back for the call.
    // This transition is before the peer exists, so do not tell WebRTC yet.
    if (realtime) await assertVoiceChatSession({ notifyWebRtc: false });
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
    noteLiveAudioEvent('reactivate');
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

let realtimeVoiceOwner: (() => void) | null = null;

/**
 * A live call that may outlive its screen (the floating Asha bubble) registers how to end
 * itself, so another surface that needs the microphone can hand-off cleanly instead of
 * silently switching the shared session out from under a call that still looks connected.
 * Returns an unregister function that only clears this owner.
 */
export function registerRealtimeVoiceOwner(end: () => void) {
  realtimeVoiceOwner = end;
  return () => {
    if (realtimeVoiceOwner === end) realtimeVoiceOwner = null;
  };
}

/** Ends the live call that owns the audio session, if any, before another surface records. */
export function endRealtimeVoiceSession() {
  const end = realtimeVoiceOwner;
  realtimeVoiceOwner = null;
  if (!end) return;
  noteLiveAudioEvent('ended by another recorder');
  end();
}
