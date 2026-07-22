import ashaVoiceProfile from '@/data/voice-profile.json';

type AshaVoiceProfile = {
  readonly id: 'asha';
  readonly displayName: 'Asha';
  readonly provider: 'openai';
  readonly voice: 'marin';
  readonly generatedSpeechModel: 'gpt-4o-mini-tts';
};

/**
 * The one public voice identity used everywhere learners hear Asha. The
 * generator reads this same JSON profile, so offline lessons cannot drift.
 */
export const ASHA_VOICE_PROFILE = ashaVoiceProfile as AshaVoiceProfile;

export type VoiceAudioMode = 'idle' | 'playback' | 'recording' | 'realtime' | 'realtimePlayback';
