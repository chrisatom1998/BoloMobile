jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
}));

import { setAudioModeAsync } from 'expo-audio';

import { ASHA_VOICE_PROFILE, resetVoiceAudioMode, setVoiceAudioMode } from '../src/lib/voice';

const setAudioModeMock = setAudioModeAsync as jest.MockedFunction<typeof setAudioModeAsync>;

describe('Asha voice service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the same canonical Asha voice for generated and Realtime speech', () => {
    expect(ASHA_VOICE_PROFILE).toEqual({
      id: 'asha',
      displayName: 'Asha',
      provider: 'openai',
      voice: 'marin',
      generatedSpeechModel: 'gpt-4o-mini-tts',
    });
  });

  it('owns each native audio-session transition used by Asha surfaces', async () => {
    await setVoiceAudioMode('playback');
    await setVoiceAudioMode('recording');
    await setVoiceAudioMode('realtime');
    await resetVoiceAudioMode();

    expect(setAudioModeMock.mock.calls).toEqual([
      [{ allowsRecording: false, interruptionMode: 'doNotMix', playsInSilentMode: true, shouldRouteThroughEarpiece: false }],
      [{ allowsRecording: true, playsInSilentMode: true }],
      [{ allowsRecording: true, interruptionMode: 'doNotMix', playsInSilentMode: true, shouldRouteThroughEarpiece: false }],
      [{ allowsRecording: false, playsInSilentMode: true }],
    ]);
  });
});
