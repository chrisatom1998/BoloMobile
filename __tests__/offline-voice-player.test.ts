type MockAudioStatus = {
  didJustFinish?: boolean;
  error?: string;
};

const mockPlayer = {
  addListener: jest.fn(),
  pause: jest.fn(),
  play: jest.fn(),
  release: jest.fn(),
  setPlaybackRate: jest.fn(),
};

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

jest.mock('@/data/offline-hindi-audio', () => ({
  offlineHindiAudio: { 'saved phrase': 42 },
}));

import { playOfflineSpeech } from '../src/lib/offline-voice-player';

describe('offline voice playback speed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let listener: ((status: MockAudioStatus) => void) | undefined;
    mockPlayer.addListener.mockImplementation((_event: string, update: (status: MockAudioStatus) => void) => {
      listener = update;
      return { remove: jest.fn() };
    });
    mockPlayer.play.mockImplementation(() => listener?.({ didJustFinish: true }));
  });

  it('applies one tenth playback speed to bundled phrase audio', async () => {
    await expect(playOfflineSpeech('saved phrase', new AbortController().signal, 0.1)).resolves.toBe(true);

    expect(mockPlayer.setPlaybackRate).toHaveBeenCalledWith(0.1);
  });

  it('caps the slow-playback watchdog at ninety seconds', async () => {
    mockPlayer.play.mockImplementation(() => undefined);
    const timeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const controller = new AbortController();
    const playback = playOfflineSpeech('saved phrase', controller.signal, 0.1);
    for (let index = 0; index < 8 && mockPlayer.play.mock.calls.length === 0; index += 1) await Promise.resolve();

    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 90_000);
    controller.abort();
    await expect(playback).resolves.toBe(true);
    timeoutSpy.mockRestore();
  });
});
