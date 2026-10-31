import { requireOptionalNativeModule } from 'expo';
import * as ExpoAudio from 'expo-audio';

type BoloAudioSessionModule = {
  activateVoiceChat(): Promise<string>;
  restoreDefaultMode(): Promise<void>;
  readSessionState(): Promise<string>;
  drainSessionEvents(): Promise<string[]>;
};

const session = requireOptionalNativeModule<BoloAudioSessionModule>('BoloAudioSession');

type WebRtcAudioSession = typeof import('react-native-webrtc')['RTCAudioSession'];

/** Loaded lazily: offline voice also uses this file, and react-native-webrtc throws on import when its native module is missing. */
function webRtcAudioSession(): WebRtcAudioSession | null {
  try {
    const { RTCAudioSession } = require('react-native-webrtc') as typeof import('react-native-webrtc');
    return RTCAudioSession ?? null;
  } catch {
    return null;
  }
}

// WebRTC counts these notifications. One activate per call, matched by one deactivate at
// hang-up, so a stale activation can never leave the next call's audio unit marked active.
let webRtcToldActive = false;

/**
 * We activate AVAudioSession ourselves, so WebRTC's RTCAudioSession never hears about it
 * and may keep its audio unit stopped. This tells it once per call, so it starts mic capture.
 * Returns a short tag for the debug line.
 */
function notifyWebRtcSessionActivated(): string {
  if (webRtcToldActive) return 'rtc:held';
  const rtc = webRtcAudioSession();
  if (typeof rtc?.audioSessionDidActivate !== 'function') return 'rtc:none';
  try {
    rtc.audioSessionDidActivate();
    webRtcToldActive = true;
    return 'rtc:ok';
  } catch {
    return 'rtc:err';
  }
}

/** The matching half of notifyWebRtcSessionActivated, sent once when the live call ends. */
function notifyWebRtcSessionDeactivated() {
  if (!webRtcToldActive) return;
  webRtcToldActive = false;
  try {
    webRtcAudioSession()?.audioSessionDidDeactivate?.();
  } catch {
    // The call is over either way; the next activation starts a fresh count.
  }
}

/**
 * Puts the iOS audio session in PlayAndRecord + voiceChat and makes it active.
 * Resolves with a short description of the session for the preview debug line.
 * Builds without the native module can only activate the session, not set voiceChat.
 * notifyWebRtc is false for the activation before the peer exists: reporting that one
 * marks the session active before getUserMedia builds the audio unit.
 */
export async function activateVoiceChatSession(options?: { notifyWebRtc?: boolean }): Promise<string> {
  const reportToWebRtc = options?.notifyWebRtc !== false;
  if (session) {
    const status = await session.activateVoiceChat();
    return reportToWebRtc ? `${status} ${notifyWebRtcSessionActivated()}` : `${status} rtc:skip`;
  }
  if (typeof ExpoAudio.setIsAudioActiveAsync === 'function') {
    await ExpoAudio.setIsAudioActiveAsync(true);
    const tag = reportToWebRtc ? notifyWebRtcSessionActivated() : 'rtc:skip';
    return `active (no voiceChat module) ${tag}`;
  }
  return 'native session module missing';
}

/**
 * Turns the audio session off before a call configures it. A typed reply leaves it this way
 * (expo-audio deactivates after playback), and only then did Asha hear the first call; a session
 * still active from launch or an earlier call gave WebRTC a mic that sent silence.
 * expo-audio's inactive flag also blocks all later playback app-wide, so turn it straight back on:
 * the session still cycles off, and lesson audio and spoken replies keep working after the call.
 * A re-enable that still fails after one retry is part of the tag, so the debug line does not say ok.
 * Returns a short tag for the debug line.
 */
function audioActiveFailure(cause: unknown): string {
  return cause instanceof Error ? cause.message.slice(0, 40) : 'unknown';
}

export async function releaseAudioSessionBeforeCall(): Promise<string> {
  if (typeof ExpoAudio.setIsAudioActiveAsync !== 'function') return 'none';
  let releaseFailure: string | null = null;
  try {
    await ExpoAudio.setIsAudioActiveAsync(false);
  } catch (cause) {
    releaseFailure = audioActiveFailure(cause);
  }
  let reenableFailure: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await ExpoAudio.setIsAudioActiveAsync(true);
      reenableFailure = null;
      break;
    } catch (cause) {
      reenableFailure = audioActiveFailure(cause);
    }
  }
  const reenableTag = reenableFailure ? `reenable failed: ${reenableFailure}` : null;
  if (releaseFailure && reenableTag) return `failed: ${releaseFailure}, ${reenableTag}`;
  if (reenableTag) return `ok, ${reenableTag}`;
  if (releaseFailure) return `failed: ${releaseFailure}`;
  return 'ok';
}

/** The audio session right now (category/mode, input, app state, input mute), for the debug line. */
export async function readAudioSessionState(): Promise<string> {
  if (!session || typeof session.readSessionState !== 'function') return 'native session module missing';
  return session.readSessionState();
}

/** Route changes, interruptions and media resets since the last call, oldest first. */
export async function drainAudioSessionEvents(): Promise<string[]> {
  if (!session || typeof session.drainSessionEvents !== 'function') return [];
  return session.drainSessionEvents();
}

/** Drops the voiceChat mode once the live call ends so later recording is not stuck in it. */
export async function restoreDefaultAudioSessionMode(): Promise<void> {
  notifyWebRtcSessionDeactivated();
  await session?.restoreDefaultMode();
}
