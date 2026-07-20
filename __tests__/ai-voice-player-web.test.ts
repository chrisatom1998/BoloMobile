import * as webAiVoicePlayer from '../src/lib/ai-voice-player.web';
import type { AiVoiceAudio } from '../src/services/bolo-api';

class MockWebAudio {
  currentTime = 0;
  load = jest.fn();
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = jest.fn();
  playStarts: number[] = [];
  playbackRate = 1;
  preload = '';
  removeAttribute = jest.fn();

  play = jest.fn(async () => {
    this.playStarts.push(this.currentTime);
    this.currentTime = 1;
    this.onended?.();
  });
}

const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
let players: MockWebAudio[] = [];
let audioConstructor: jest.Mock;

describe('AI voice web replay', () => {
  beforeEach(() => {
    webAiVoicePlayer.clearAiVoicePlaybackCache();
    players = [];
    audioConstructor = jest.fn(() => {
      const player = new MockWebAudio();
      players.push(player);
      return player;
    });
    Object.defineProperty(globalThis, 'Audio', {
      configurable: true,
      value: audioConstructor,
      writable: true,
    });
  });

  afterEach(() => {
    webAiVoicePlayer.clearAiVoicePlaybackCache();
  });

  afterAll(() => {
    if (originalAudio) Object.defineProperty(globalThis, 'Audio', originalAudio);
    else Reflect.deleteProperty(globalThis, 'Audio');
  });

  it('replays the same prepared browser audio element from the beginning', async () => {
    const audio: AiVoiceAudio = { audioBase64: 'd2ViLXJlcGxheQ==', mimeType: 'audio/mpeg' };

    await webAiVoicePlayer.playAiVoiceAudio(audio, new AbortController().signal);
    await webAiVoicePlayer.playAiVoiceAudio(audio, new AbortController().signal);

    expect(audioConstructor).toHaveBeenCalledTimes(1);
    expect(players).toHaveLength(1);
    expect(players[0].preload).toBe('auto');
    expect(players[0].playStarts).toEqual([0, 0]);
    expect(players[0].play).toHaveBeenCalledTimes(2);
    expect(players[0].removeAttribute).not.toHaveBeenCalled();

    webAiVoicePlayer.clearAiVoicePlaybackCache();
    expect(players[0].removeAttribute).toHaveBeenCalledWith('src');
    expect(players[0].load).toHaveBeenCalledTimes(1);
  });

  it('applies one tenth playback speed', async () => {
    const audio: AiVoiceAudio = { audioBase64: 'c2xvdy13ZWI=', mimeType: 'audio/mpeg' };

    await webAiVoicePlayer.playAiVoiceAudio(audio, new AbortController().signal, 0.1);

    expect(players[0].playbackRate).toBe(0.1);
  });
});
