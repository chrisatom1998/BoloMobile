import { requireOptionalNativeModule } from 'expo';
import * as ExpoAudio from 'expo-audio';

type BoloAudioSessionModule = {
  activateVoiceChat(): Promise<string>;
  restoreDefaultMode(): Promise<void>;
};

const session = requireOptionalNativeModule<BoloAudioSessionModule>('BoloAudioSession');

/**
 * We activate AVAudioSession ourselves, so WebRTC's RTCAudioSession never hears about it
 * and may keep its audio unit stopped. This tells it, so it (re)starts mic capture.
 * Returns a short tag for the debug line. Loaded lazily: offline voice also uses this file,
 * and react-native-webrtc throws on import when its native module is missing.
 */
function notifyWebRtcSessionActivated(): string {
  try {
    const { RTCAudioSession } = require('react-native-webrtc') as typeof import('react-native-webrtc');
    if (typeof RTCAudioSession?.audioSessionDidActivate !== 'function') return 'rtc:none';
    RTCAudioSession.audioSessionDidActivate();
    return 'rtc:ok';
  } catch {
    return 'rtc:err';
  }
}

/**
 * Puts the iOS audio session in PlayAndRecord + voiceChat and makes it active.
 * Resolves with a short description of the session for the preview debug line.
 * Builds without the native module can only activate the session, not set voiceChat.
 */
export async function activateVoiceChatSession(): Promise<string> {
  if (session) {
    const status = await session.activateVoiceChat();
    return `${status} ${notifyWebRtcSessionActivated()}`;
  }
  if (typeof ExpoAudio.setIsAudioActiveAsync === 'function') {
    await ExpoAudio.setIsAudioActiveAsync(true);
    return `active (no voiceChat module) ${notifyWebRtcSessionActivated()}`;
  }
  return 'native session module missing';
}

/** Drops the voiceChat mode once the live call ends so later recording is not stuck in it. */
export async function restoreDefaultAudioSessionMode(): Promise<void> {
  await session?.restoreDefaultMode();
}
