jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
}));

import { setAudioModeAsync } from 'expo-audio';

import { ASHA_VOICE_PROFILE, isRealtimeVoiceSessionActive, resetVoiceAudioMode, setVoiceAudioMode } from '../src/lib/voice';

const setAudioModeMock = setAudioModeAsync as jest.MockedFunction<typeof setAudioModeAsync>;

describe('Asha voice service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the configured Asha generated-speech voice profile', () => {
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
    expect(isRealtimeVoiceSessionActive()).toBe(false);
    await setVoiceAudioMode('recording');
    expect(isRealtimeVoiceSessionActive()).toBe(false);
    await setVoiceAudioMode('realtime');
    expect(isRealtimeVoiceSessionActive()).toBe(true);
    await setVoiceAudioMode('realtimePlayback');
    expect(isRealtimeVoiceSessionActive()).toBe(true);
    await resetVoiceAudioMode();
    expect(isRealtimeVoiceSessionActive()).toBe(false);

    expect(setAudioModeMock.mock.calls).toEqual([
      [{ allowsRecording: false, interruptionMode: 'doNotMix', playsInSilentMode: true, shouldRouteThroughEarpiece: false }],
      [{ allowsRecording: true, playsInSilentMode: true }],
      [{ allowsRecording: true, interruptionMode: 'doNotMix', playsInSilentMode: true, shouldRouteThroughEarpiece: false }],
      [{ allowsRecording: true, interruptionMode: 'doNotMix', playsInSilentMode: true, shouldRouteThroughEarpiece: false }],
      [{ allowsRecording: false, playsInSilentMode: true }],
    ]);
  });

  it('orders a delayed native setup before teardown and the next connection', async () => {
    const nativeResolvers: (() => void)[] = [];
    setAudioModeMock.mockImplementation(() => new Promise<void>((resolve) => nativeResolvers.push(resolve)));
    const first = setVoiceAudioMode('realtime');
    const teardown = resetVoiceAudioMode();
    const next = setVoiceAudioMode('realtime');
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(setAudioModeMock).toHaveBeenCalledTimes(1);
    nativeResolvers[0]!();
    await first;
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(setAudioModeMock).toHaveBeenCalledTimes(2);
    expect(setAudioModeMock.mock.calls[1]![0]).toEqual({ allowsRecording: false, playsInSilentMode: true });
    nativeResolvers[1]!();
    await teardown;
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(setAudioModeMock).toHaveBeenCalledTimes(3);
    nativeResolvers[2]!();
    await next;
    expect(isRealtimeVoiceSessionActive()).toBe(true);
    setAudioModeMock.mockResolvedValue(undefined);
    await resetVoiceAudioMode();
  });

  it('continues queued teardown after a native setup fails', async () => {
    setAudioModeMock.mockRejectedValueOnce(new Error('native audio failure')).mockResolvedValue(undefined);
    const first = setVoiceAudioMode('realtime').catch((error: unknown) => error);
    const teardown = resetVoiceAudioMode();
    expect(await first).toEqual(expect.objectContaining({ message: 'native audio failure' }));
    await teardown;
    expect(isRealtimeVoiceSessionActive()).toBe(false);
    expect(setAudioModeMock).toHaveBeenCalledTimes(2);
  });

});
