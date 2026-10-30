import { requireOptionalNativeModule } from 'expo';
import * as ExpoAudio from 'expo-audio';

type BoloAudioSessionModule = {
  activateVoiceChat(): Promise<string>;
  restoreDefaultMode(): Promise<void>;
};

const session = requireOptionalNativeModule<BoloAudioSessionModule>('BoloAudioSession');

/**
 * Puts the iOS audio session in PlayAndRecord + voiceChat and makes it active.
 * Resolves with a short description of the session for the preview debug line.
 * Builds without the native module can only activate the session, not set voiceChat.
 */
export async function activateVoiceChatSession(): Promise<string> {
  if (session) return session.activateVoiceChat();
  if (typeof ExpoAudio.setIsAudioActiveAsync === 'function') {
    await ExpoAudio.setIsAudioActiveAsync(true);
    return 'active (no voiceChat module)';
  }
  return 'native session module missing';
}

/** Drops the voiceChat mode once the live call ends so later recording is not stuck in it. */
export async function restoreDefaultAudioSessionMode(): Promise<void> {
  await session?.restoreDefaultMode();
}
