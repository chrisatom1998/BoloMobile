jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
}));

import { setAudioModeAsync } from 'expo-audio';

import { noteLiveAudioEvent } from '@/lib/live-diagnostics';

import {
  ASHA_VOICE_PROFILE,
  getVoiceSessionStatus,
  isRealtimeVoiceSessionActive,
  reactivateRealtimeVoiceSession,
  resetVoiceAudioMode,
  setVoiceAudioMode,
} from '../src/lib/voice';
import { activateVoiceChatSession, restoreDefaultAudioSessionMode } from '../src/lib/voice-session';

jest.mock('@/lib/voice-session', () => ({ activateVoiceChatSession: jest.fn(), restoreDefaultAudioSessionMode: jest.fn() }));
jest.mock('@/lib/live-diagnostics', () => ({ noteLiveAudioEvent: jest.fn() }));

const setAudioModeMock = setAudioModeAsync as jest.MockedFunction<typeof setAudioModeAsync>;
const activateMock = jest.mocked(activateVoiceChatSession);
const restoreMock = jest.mocked(restoreDefaultAudioSessionMode);
const noteAudioEventMock = jest.mocked(noteLiveAudioEvent);

describe('Asha voice service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activateMock.mockResolvedValue('PlayAndRecord/VoiceChat active');
    restoreMock.mockResolvedValue(undefined);
  });

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
      [{ allowsRecording: false, playsInSilentMode: true }],
    ]);
  });

  it('stamps every audio-mode transition, flagging one applied under a live call', async () => {
    await setVoiceAudioMode('realtime');
    await setVoiceAudioMode('realtimePlayback');
    await reactivateRealtimeVoiceSession();
    await setVoiceAudioMode('playback');

    expect(noteAudioEventMock.mock.calls.map(([label]) => label)).toEqual([
      'mode:realtime',
      'activate PlayAndRecord/VoiceChat',
      'mode:realtimePlayback',
      'activate PlayAndRecord/VoiceChat',
      'reactivate',
      'activate PlayAndRecord/VoiceChat',
      'mode:playback (under live call)',
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

  it('activates voiceChat after every live-call route change and releases it when the call ends', async () => {
    await setVoiceAudioMode('realtime');
    await setVoiceAudioMode('realtimePlayback');
    expect(activateMock).toHaveBeenCalledTimes(2);
    expect(activateMock.mock.invocationCallOrder[0]).toBeGreaterThan(setAudioModeMock.mock.invocationCallOrder[0]!);
    expect(getVoiceSessionStatus()).toBe('PlayAndRecord/VoiceChat active');
    await reactivateRealtimeVoiceSession();
    expect(activateMock).toHaveBeenCalledTimes(3);
    await resetVoiceAudioMode();
    expect(restoreMock).toHaveBeenCalledTimes(1);
    expect(restoreMock.mock.invocationCallOrder[0]).toBeLessThan(setAudioModeMock.mock.invocationCallOrder[1]!);
    await reactivateRealtimeVoiceSession();
    expect(activateMock).toHaveBeenCalledTimes(3);
  });

  it('never activates voiceChat for playback or recording', async () => {
    await setVoiceAudioMode('playback');
    await setVoiceAudioMode('recording');
    expect(activateMock).not.toHaveBeenCalled();
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it('records an activation failure instead of aborting the call', async () => {
    activateMock.mockRejectedValueOnce(new Error('cannot activate while inactive'));
    await expect(setVoiceAudioMode('realtime')).resolves.toBeUndefined();
    expect(isRealtimeVoiceSessionActive()).toBe(true);
    expect(getVoiceSessionStatus()).toBe('failed: cannot activate while inactive');
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
