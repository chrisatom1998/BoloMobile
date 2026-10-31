jest.mock('expo', () => {
  const session = {
    activateVoiceChat: jest.fn(async () => 'PlayAndRecord/VoiceChat active'),
    restoreDefaultMode: jest.fn(async () => undefined),
    readSessionState: jest.fn(),
    drainSessionEvents: jest.fn(),
  };
  return { requireOptionalNativeModule: () => session };
});
jest.mock('expo-audio', () => ({ setIsAudioActiveAsync: jest.fn(async () => undefined) }));
jest.mock('react-native-webrtc', () => ({
  RTCAudioSession: { audioSessionDidActivate: jest.fn(), audioSessionDidDeactivate: jest.fn() },
}));

import { setIsAudioActiveAsync } from 'expo-audio';
import { RTCAudioSession } from 'react-native-webrtc';

import { activateVoiceChatSession, releaseAudioSessionBeforeCall, restoreDefaultAudioSessionMode } from '../src/lib/voice-session.ios';

const didActivate = jest.mocked(RTCAudioSession.audioSessionDidActivate);
const didDeactivate = jest.mocked(RTCAudioSession.audioSessionDidDeactivate);

describe('WebRTC audio-session notifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tells WebRTC once per call that the session is active, and once that it ended', async () => {
    await expect(activateVoiceChatSession()).resolves.toBe('PlayAndRecord/VoiceChat active rtc:ok');
    // Reactivation during the same call (foreground, before unmute) must not stack activations.
    await expect(activateVoiceChatSession()).resolves.toBe('PlayAndRecord/VoiceChat active rtc:held');
    await restoreDefaultAudioSessionMode();
    await restoreDefaultAudioSessionMode();

    expect(didActivate).toHaveBeenCalledTimes(1);
    expect(didDeactivate).toHaveBeenCalledTimes(1);
  });

  it('starts fresh for the next call', async () => {
    await activateVoiceChatSession();
    await restoreDefaultAudioSessionMode();
    await activateVoiceChatSession();
    await restoreDefaultAudioSessionMode();

    expect(didActivate).toHaveBeenCalledTimes(2);
    expect(didDeactivate).toHaveBeenCalledTimes(2);
  });

  it('does not tell WebRTC a session ended that it never heard start', async () => {
    await restoreDefaultAudioSessionMode();
    expect(didDeactivate).not.toHaveBeenCalled();
  });

  it('does not spend the one activate on the session turned on before the peer exists', async () => {
    await expect(activateVoiceChatSession({ notifyWebRtc: false })).resolves.toBe('PlayAndRecord/VoiceChat active rtc:skip');
    await expect(activateVoiceChatSession()).resolves.toBe('PlayAndRecord/VoiceChat active rtc:ok');
    await expect(activateVoiceChatSession()).resolves.toBe('PlayAndRecord/VoiceChat active rtc:held');
    await restoreDefaultAudioSessionMode();

    expect(didActivate).toHaveBeenCalledTimes(1);
    expect(didDeactivate).toHaveBeenCalledTimes(1);
  });

  it('cycles the session off before a call but leaves expo-audio enabled for later playback', async () => {
    await expect(releaseAudioSessionBeforeCall()).resolves.toBe('ok');

    expect(jest.mocked(setIsAudioActiveAsync).mock.calls).toEqual([[false], [true]]);
  });

  it('turns expo-audio back on when re-enabling after the pre-call release rejects', async () => {
    jest.mocked(setIsAudioActiveAsync)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('session busy'))
      .mockRejectedValueOnce(new Error('session busy'));

    await expect(releaseAudioSessionBeforeCall()).resolves.toBe('ok, reenable failed: session busy');

    expect(jest.mocked(setIsAudioActiveAsync).mock.calls.at(-1)).toEqual([true]);
  });

  it('returns ok when the second re-enable attempt succeeds', async () => {
    const err = new Error('session busy');
    jest.mocked(setIsAudioActiveAsync)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(undefined);

    await expect(releaseAudioSessionBeforeCall()).resolves.toBe('ok');

    expect(jest.mocked(setIsAudioActiveAsync).mock.calls).toEqual([[false], [true], [true]]);
  });
});
