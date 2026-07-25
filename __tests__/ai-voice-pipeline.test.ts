type MockAudioStatus = {
  didJustFinish?: boolean;
  error?: string;
};

type MockPlayer = {
  addListener: jest.Mock;
  pause: jest.Mock;
  play: jest.Mock;
  release: jest.Mock;
  seekTo: jest.Mock;
  setPlaybackRate: jest.Mock;
  volume: number;
};

type MockFile = {
  delete: jest.Mock;
  exists: boolean;
  uri: string;
  write: jest.Mock;
};

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => {
  const files: MockFile[] = [];
  const File = jest.fn().mockImplementation((_cache: string, name: string) => {
    const file: MockFile = {
      delete: jest.fn(),
      exists: true,
      uri: `file:///cache/${name}`,
      write: jest.fn(),
    };
    files.push(file);
    return file;
  });

  return {
    File,
    Paths: { cache: 'file:///cache/' },
    __mockFiles: files,
  };
});

import * as aiVoicePlayer from '../src/lib/ai-voice-player';
import { romanizeDevanagari } from '../src/lib/devanagari-romanization';
import { hasOfflineSpeech } from '../src/lib/offline-voice-player';
import { splitAiVoiceText } from '../src/lib/speech-text';
import { preloadSpeech, speakText, splitSpeechByLanguage, stopSpeaking } from '../src/lib/speech';
import * as boloApi from '../src/services/bolo-api';

const expoAudio = jest.requireMock('expo-audio') as {
  createAudioPlayer: jest.Mock;
  setAudioModeAsync: jest.Mock;
};
const expoFileSystem = jest.requireMock('expo-file-system') as {
  File: jest.Mock;
  __mockFiles: MockFile[];
};

function expectDefined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected the value to be defined.');
  return value;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (check()) return;
    await Promise.resolve();
  }
  throw new Error('The expected asynchronous state was not reached.');
}

function installPlayer() {
  let listener: ((status: MockAudioStatus) => void) | undefined;
  const subscription = { remove: jest.fn() };
  const player: MockPlayer = {
    addListener: jest.fn((_event: string, update: (status: MockAudioStatus) => void) => {
      listener = update;
      return subscription;
    }),
    pause: jest.fn(),
    play: jest.fn(),
    release: jest.fn(),
    seekTo: jest.fn(async () => undefined),
    setPlaybackRate: jest.fn(),
    volume: 0.25,
  };
  expoAudio.createAudioPlayer.mockReturnValue(player);

  return {
    emit(status: MockAudioStatus) {
      if (!listener) throw new Error('Playback listener was not installed.');
      listener(status);
    },
    player,
    subscription,
  };
}

describe('AI voice native playback', () => {
  beforeEach(() => {
    aiVoicePlayer.clearAiVoicePlaybackCache();
    jest.clearAllMocks();
    expoFileSystem.__mockFiles.length = 0;
    expoAudio.setAudioModeAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    aiVoicePlayer.clearAiVoicePlaybackCache();
  });

  it('keeps a completed native clip prepared until its cache is cleared', async () => {
    const native = installPlayer();
    native.player.play.mockImplementation(() => native.emit({ didJustFinish: true }));
    const controller = new AbortController();

    await expect(aiVoicePlayer.playAiVoiceAudio({
      audioBase64: 'SUQzBAAAAAA=',
      mimeType: 'audio/mpeg',
    }, controller.signal)).resolves.toBeUndefined();

    expect(expoAudio.setAudioModeAsync).toHaveBeenCalledWith({
      allowsRecording: false,
      interruptionMode: 'doNotMix',
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
    });
    expect(expoFileSystem.File).toHaveBeenCalledWith(
      'file:///cache/',
      expect.stringMatching(/^bolo-ai-voice-.+\.mp3$/),
    );
    const file = expectDefined(expoFileSystem.__mockFiles[0]);
    expect(file.write).toHaveBeenCalledWith('SUQzBAAAAAA=', { encoding: 'base64' });
    expect(expoAudio.createAudioPlayer).toHaveBeenCalledWith(file.uri, {
      updateInterval: 100,
      keepAudioSessionActive: true,
    });
    expect(native.player.volume).toBe(1);
    expect(native.player.play).toHaveBeenCalledTimes(1);
    expect(native.player.pause).toHaveBeenCalledTimes(1);
    expect(native.player.release).not.toHaveBeenCalled();
    expect(native.subscription.remove).toHaveBeenCalledTimes(1);
    expect(file.delete).not.toHaveBeenCalled();

    aiVoicePlayer.clearAiVoicePlaybackCache();
    expect(native.player.release).toHaveBeenCalledTimes(1);
    expect(file.delete).toHaveBeenCalledTimes(1);
  });

  it('replays a prepared native clip without rewriting or reloading it', async () => {
    const native = installPlayer();
    native.player.play.mockImplementation(() => native.emit({ didJustFinish: true }));
    const audio: boloApi.AiVoiceAudio = {
      audioBase64: 'cmVwbGF5LW1l',
      mimeType: 'audio/mpeg',
    };

    await aiVoicePlayer.playAiVoiceAudio(audio, new AbortController().signal);
    await aiVoicePlayer.playAiVoiceAudio(audio, new AbortController().signal);

    expect(expoFileSystem.File).toHaveBeenCalledTimes(1);
    expect(expectDefined(expoFileSystem.__mockFiles[0]).write).toHaveBeenCalledTimes(1);
    expect(expoAudio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(native.player.seekTo).toHaveBeenCalledTimes(1);
    expect(native.player.seekTo).toHaveBeenCalledWith(0);
    expect(native.player.play).toHaveBeenCalledTimes(2);
    expect(native.player.release).not.toHaveBeenCalled();
    expect(expectDefined(expoFileSystem.__mockFiles[0]).delete).not.toHaveBeenCalled();
  });

  it('applies playback rates down to one tenth speed', async () => {
    const native = installPlayer();
    native.player.play.mockImplementation(() => native.emit({ didJustFinish: true }));

    await aiVoicePlayer.playAiVoiceAudio({
      audioBase64: 'c2xvdy1wbGF5YmFjaw==',
      mimeType: 'audio/mpeg',
    }, new AbortController().signal, 0.1);

    expect(native.player.setPlaybackRate).toHaveBeenCalledWith(0.1);
  });

  it('preserves the active WebRTC audio session during canonical playback', async () => {
    const native = installPlayer();
    native.player.play.mockImplementation(() => native.emit({ didJustFinish: true }));

    await aiVoicePlayer.playAiVoiceAudio({
      audioBase64: 'cmVhbHRpbWUtcGxheWJhY2s=',
      mimeType: 'audio/mpeg',
    }, new AbortController().signal, 1, 'realtimePlayback');

    expect(expoAudio.setAudioModeAsync).not.toHaveBeenCalled();
    expect(native.player.play).toHaveBeenCalledTimes(1);
  });

  it('caps the slow-playback watchdog at two minutes', async () => {
    const native = installPlayer();
    const timeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const controller = new AbortController();
    const playback = aiVoicePlayer.playAiVoiceAudio({
      audioBase64: 'dGltZW91dA==',
      mimeType: 'audio/mpeg',
    }, controller.signal, 0.1);
    await waitFor(() => native.player.play.mock.calls.length === 1);

    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 120_000);
    controller.abort();
    await expect(playback).resolves.toBeUndefined();
    timeoutSpy.mockRestore();
  });

  it('evicts the least-recently-used prepared clip after four entries', async () => {
    const players: ReturnType<typeof installPlayer>[] = [];
    for (let index = 0; index < 5; index += 1) {
      const native = installPlayer();
      native.player.play.mockImplementation(() => native.emit({ didJustFinish: true }));
      players.push(native);
      await aiVoicePlayer.playAiVoiceAudio({
        audioBase64: `Y2xpcC0${index}=`,
        mimeType: 'audio/mpeg',
      }, new AbortController().signal);
    }

    expect(expoAudio.createAudioPlayer).toHaveBeenCalledTimes(5);
    expect(expectDefined(players[0]).player.release).toHaveBeenCalledTimes(1);
    expect(expectDefined(expoFileSystem.__mockFiles[0]).delete).toHaveBeenCalledTimes(1);
    expect(players.slice(1).every(({ player }) => player.release.mock.calls.length === 0)).toBe(true);
  });

  it('releases the player and deletes the cache file after a native playback error', async () => {
    const native = installPlayer();
    native.player.play.mockImplementation(() => native.emit({ error: 'decoder rejected the MP3' }));
    const controller = new AbortController();

    await expect(aiVoicePlayer.playAiVoiceAudio({
      audioBase64: 'SUQzBAAAAAA=',
      mimeType: 'audio/mpeg',
    }, controller.signal)).rejects.toThrow('AI voice playback failed: decoder rejected the MP3');

    expect(native.player.pause).toHaveBeenCalledTimes(2);
    expect(native.player.release).toHaveBeenCalledTimes(1);
    expect(native.subscription.remove).toHaveBeenCalledTimes(1);
    expect(expectDefined(expoFileSystem.__mockFiles[0]).delete).toHaveBeenCalledTimes(1);
  });

  it('still rejects when pausing an invalidated native player throws during error handling', async () => {
    const native = installPlayer();
    native.player.play.mockImplementation(() => native.emit({ error: 'decoder rejected the MP3' }));
    native.player.pause.mockImplementation(() => {
      throw new Error('the native player was already invalidated');
    });

    await expect(aiVoicePlayer.playAiVoiceAudio({
      audioBase64: 'SUQzBAAAAAA=',
      mimeType: 'audio/mpeg',
    }, new AbortController().signal)).rejects.toThrow('AI voice playback failed: decoder rejected the MP3');

    expect(native.player.release).toHaveBeenCalledTimes(1);
    expect(native.subscription.remove).toHaveBeenCalledTimes(1);
    expect(expectDefined(expoFileSystem.__mockFiles[0]).delete).toHaveBeenCalledTimes(1);
  });

  it('treats abort as cancellation while retaining the prepared clip for replay', async () => {
    const native = installPlayer();
    const controller = new AbortController();
    const playback = aiVoicePlayer.playAiVoiceAudio({
      audioBase64: 'SUQzBAAAAAA=',
      mimeType: 'audio/mpeg',
    }, controller.signal);
    await waitFor(() => native.player.play.mock.calls.length === 1);

    controller.abort();

    await expect(playback).resolves.toBeUndefined();
    expect(native.player.pause).toHaveBeenCalledTimes(1);
    expect(native.player.release).not.toHaveBeenCalled();
    expect(native.subscription.remove).toHaveBeenCalledTimes(1);
    expect(expectDefined(expoFileSystem.__mockFiles[0]).delete).not.toHaveBeenCalled();

    aiVoicePlayer.clearAiVoicePlaybackCache();
    expect(native.player.release).toHaveBeenCalledTimes(1);
    expect(expectDefined(expoFileSystem.__mockFiles[0]).delete).toHaveBeenCalledTimes(1);
  });
});

describe('AI voice speech orchestration', () => {
  beforeEach(async () => {
    await stopSpeaking();
    jest.restoreAllMocks();
  });

  afterEach(async () => {
    await stopSpeaking();
    jest.restoreAllMocks();
  });

  it('prefetches the next speech chunk while preserving playback order', async () => {
    const text = `${'A'.repeat(240)} ${'B'.repeat(60)}`;
    const chunks = splitAiVoiceText(text).map((chunk) => chunk.trim());
    expect(chunks).toHaveLength(2);

    const requestDeferred = chunks.map(() => deferred<boloApi.AiVoiceAudio>());
    const playbackDeferred = chunks.map(() => deferred<void>());
    const audio = chunks.map((_, index) => ({
      audioBase64: index === 0 ? 'Zmlyc3Q=' : 'c2Vjb25k',
      mimeType: 'audio/mpeg' as const,
    }));
    const requestSpy = jest.spyOn(boloApi, 'requestAiVoiceAudio').mockImplementation((chunk) => {
      const index = chunks.indexOf(chunk);
      if (index < 0) throw new Error(`Unexpected speech chunk: ${chunk}`);
      return expectDefined(requestDeferred[index]).promise;
    });
    const playbackSpy = jest.spyOn(aiVoicePlayer, 'playAiVoiceAudio').mockImplementation((value) => {
      const index = audio.findIndex((candidate) => candidate.audioBase64 === value.audioBase64);
      if (index < 0) throw new Error(`Unexpected audio chunk: ${value.audioBase64}`);
      return expectDefined(playbackDeferred[index]).promise;
    });

    const speech = speakText(text);
    await waitFor(() => requestSpy.mock.calls.length === 2);
    expect(playbackSpy).not.toHaveBeenCalled();

    expectDefined(requestDeferred[0]).resolve(expectDefined(audio[0]));
    await waitFor(() => playbackSpy.mock.calls.length === 1);
    expect(requestSpy).toHaveBeenCalledTimes(2);

    expectDefined(playbackDeferred[0]).resolve();
    await Promise.resolve();
    expect(playbackSpy).toHaveBeenCalledTimes(1);

    expectDefined(requestDeferred[1]).resolve(expectDefined(audio[1]));
    await waitFor(() => playbackSpy.mock.calls.length === 2);
    expectDefined(playbackDeferred[1]).resolve();
    await expect(speech).resolves.toBeUndefined();

    expect(requestSpy.mock.calls.map(([chunk]) => chunk)).toEqual(chunks);
    expect(expectDefined(requestSpy.mock.invocationCallOrder[0])).toBeLessThan(expectDefined(playbackSpy.mock.invocationCallOrder[0]));
    expect(expectDefined(requestSpy.mock.invocationCallOrder[1])).toBeLessThan(expectDefined(playbackSpy.mock.invocationCallOrder[0]));
    expect(expectDefined(requestSpy.mock.invocationCallOrder[1])).toBeLessThan(expectDefined(playbackSpy.mock.invocationCallOrder[1]));
  });

  it('retries a failed Hindi clip once and completes the rest of the reply', async () => {
    // Keep this generated-speech fixture outside the bundled lesson-audio
    // catalog: bundled clips exercise the native offline player instead.
    const text = 'You can say, मुझे थोड़ी मदद चाहिए। Then smile.';
    const chunks = splitSpeechByLanguage(text);
    expect(chunks).toEqual([
      { text: 'You can say,', language: undefined },
      { text: 'मुझे थोड़ी मदद चाहिए।', language: 'hi' },
      { text: 'Then smile.', language: undefined },
    ]);
    const audio = new Map(chunks.map(({ text: chunk }, index) => [chunk, {
      audioBase64: `Y2h1bmst${index}=`,
      mimeType: 'audio/mpeg' as const,
    }]));
    const hindiFailure = new Error('temporary Hindi synthesis failure');
    const requestSpy = jest.spyOn(boloApi, 'requestAiVoiceAudio').mockImplementation((chunk) => {
      if (chunk === 'मुझे थोड़ी मदद चाहिए।' && requestSpy.mock.calls.filter(([value]) => value === chunk).length === 1) {
        return Promise.reject(hindiFailure);
      }
      return Promise.resolve(audio.get(chunk)!);
    });
    const playbackSpy = jest.spyOn(aiVoicePlayer, 'playAiVoiceAudio').mockResolvedValue();

    await expect(speakText(text)).resolves.toBeUndefined();

    expect(requestSpy.mock.calls.filter(([chunk]) => chunk === 'मुझे थोड़ी मदद चाहिए।')).toHaveLength(2);
    expect(playbackSpy.mock.calls.map(([value]) => value.audioBase64)).toEqual([
      audio.get('You can say,')?.audioBase64,
      audio.get('मुझे थोड़ी मदद चाहिए।')?.audioBase64,
      audio.get('Then smile.')?.audioBase64,
    ]);
  });

  it('does not replay a coaching lead-in after its playback has started', async () => {
    const text = 'You can say this, मुझे आज पानी चाहिए।';
    const chunks = splitSpeechByLanguage(text);
    const audio = new Map(chunks.map(({ text: chunk }, index) => [chunk, {
      audioBase64: `cGxheWJhY2st${index}=`,
      mimeType: 'audio/mpeg' as const,
    }]));
    const playbackFailure = new Error('iOS reported a playback error after the clip started');
    const requestSpy = jest.spyOn(boloApi, 'requestAiVoiceAudio')
      .mockImplementation((chunk) => Promise.resolve(audio.get(chunk)!));
    const playbackSpy = jest.spyOn(aiVoicePlayer, 'playAiVoiceAudio').mockRejectedValue(playbackFailure);

    await expect(speakText(text)).rejects.toThrow(playbackFailure);

    expect(playbackSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls.map(([chunk]) => chunk)).toEqual(chunks.map(({ text: chunk }) => chunk));
  });

  it('reuses cached AI audio for repeated text while playing it each time', async () => {
    const audio: boloApi.AiVoiceAudio = { audioBase64: 'Y2FjaGU=', mimeType: 'audio/mpeg' };
    const requestSpy = jest.spyOn(boloApi, 'requestAiVoiceAudio').mockResolvedValue(audio);
    const playbackSpy = jest.spyOn(aiVoicePlayer, 'playAiVoiceAudio').mockResolvedValue();
    const text = 'Cache this exact AI voice regression phrase.';

    await speakText(text);
    await speakText(text);

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledWith(text, expect.any(AbortSignal));
    expect(playbackSpy).toHaveBeenCalledTimes(2);
    expect(playbackSpy.mock.calls.every(([value]) => value === audio)).toBe(true);
  });

  it('shares an in-flight warm-up with an immediate replay request', async () => {
    const request = deferred<boloApi.AiVoiceAudio>();
    const audio: boloApi.AiVoiceAudio = { audioBase64: 'd2FybWVk', mimeType: 'audio/mpeg' };
    const requestSpy = jest.spyOn(boloApi, 'requestAiVoiceAudio').mockReturnValue(request.promise);
    const playbackSpy = jest.spyOn(aiVoicePlayer, 'playAiVoiceAudio').mockResolvedValue();
    const text = 'Warm this completed realtime reply.';

    const warmup = preloadSpeech(text);
    await waitFor(() => requestSpy.mock.calls.length === 1);
    const replay = speakText(text);
    await Promise.resolve();
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(playbackSpy).not.toHaveBeenCalled();

    request.resolve(audio);
    await expect(warmup).resolves.toBeUndefined();
    await expect(replay).resolves.toBeUndefined();
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(playbackSpy).toHaveBeenCalledWith(audio, expect.any(AbortSignal));
  });

  it('retries normally when a best-effort warm-up fails', async () => {
    const audio: boloApi.AiVoiceAudio = { audioBase64: 'cmV0cnk=', mimeType: 'audio/mpeg' };
    const requestSpy = jest.spyOn(boloApi, 'requestAiVoiceAudio')
      .mockRejectedValueOnce(new Error('warm-up unavailable'))
      .mockResolvedValueOnce(audio);
    const playbackSpy = jest.spyOn(aiVoicePlayer, 'playAiVoiceAudio').mockResolvedValue();
    const text = 'Retry after this unique warm-up failure.';

    await expect(preloadSpeech(text)).resolves.toBeUndefined();
    await expect(speakText(text)).resolves.toBeUndefined();

    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(playbackSpy).toHaveBeenCalledWith(audio, expect.any(AbortSignal));
  });

  it('supersedes prior speech and does not play audio from the canceled request', async () => {
    const firstStarted = deferred<void>();
    let firstSignal: AbortSignal | undefined;
    const secondAudio: boloApi.AiVoiceAudio = { audioBase64: 'c2Vjb25k', mimeType: 'audio/mpeg' };
    const requestSpy = jest.spyOn(boloApi, 'requestAiVoiceAudio').mockImplementation((text, signal) => {
      if (text === 'First superseded phrase.') {
        firstSignal = signal;
        firstStarted.resolve();
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('request canceled by replacement')), { once: true });
        });
      }
      return Promise.resolve(secondAudio);
    });
    const playbackSpy = jest.spyOn(aiVoicePlayer, 'playAiVoiceAudio').mockResolvedValue();

    const firstSpeech = speakText('First superseded phrase.');
    await firstStarted.promise;
    const secondSpeech = speakText('Second replacement phrase.');

    await expect(secondSpeech).resolves.toBeUndefined();
    await expect(firstSpeech).resolves.toBeUndefined();
    expect(firstSignal?.aborted).toBe(true);
    expect(requestSpy.mock.calls.map(([text]) => text)).toEqual([
      'First superseded phrase.',
      'Second replacement phrase.',
    ]);
    expect(playbackSpy).toHaveBeenCalledTimes(1);
    expect(playbackSpy).toHaveBeenCalledWith(secondAudio, expect.any(AbortSignal));
  });

  it('atomically supersedes speech started in the same event-loop turn', async () => {
    let firstSignal: AbortSignal | undefined;
    const secondAudio: boloApi.AiVoiceAudio = { audioBase64: 'YXRvbWljLXNlY29uZA==', mimeType: 'audio/mpeg' };
    const requestSpy = jest.spyOn(boloApi, 'requestAiVoiceAudio').mockImplementation((text, signal) => {
      if (text === 'Atomic first phrase.') {
        firstSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('first same-turn request canceled')), { once: true });
        });
      }
      return Promise.resolve(secondAudio);
    });
    const playbackSpy = jest.spyOn(aiVoicePlayer, 'playAiVoiceAudio').mockResolvedValue();

    const firstSpeech = speakText('Atomic first phrase.');
    const secondSpeech = speakText('Atomic second phrase.');
    await waitFor(() => requestSpy.mock.calls.length === 2);

    expect(firstSignal?.aborted).toBe(true);
    await expect(firstSpeech).resolves.toBeUndefined();
    await expect(secondSpeech).resolves.toBeUndefined();
    expect(playbackSpy).toHaveBeenCalledTimes(1);
    expect(playbackSpy).toHaveBeenCalledWith(secondAudio, expect.any(AbortSignal));
  });

  it('propagates genuine playback failures', async () => {
    const audio: boloApi.AiVoiceAudio = { audioBase64: 'ZmFpbHVyZQ==', mimeType: 'audio/mpeg' };
    jest.spyOn(boloApi, 'requestAiVoiceAudio').mockResolvedValue(audio);
    jest.spyOn(aiVoicePlayer, 'playAiVoiceAudio').mockRejectedValue(new Error('native decoder failure'));

    await expect(speakText('A real playback failure.')).rejects.toThrow('native decoder failure');
  });

  it('suppresses expected external cancellation errors', async () => {
    const requestStarted = deferred<void>();
    const controller = new AbortController();
    jest.spyOn(boloApi, 'requestAiVoiceAudio').mockImplementation((_text, signal) => {
      requestStarted.resolve();
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('expected canceled request')), { once: true });
      });
    });
    const playbackSpy = jest.spyOn(aiVoicePlayer, 'playAiVoiceAudio').mockResolvedValue();

    const speech = speakText('Cancel this AI voice request.', controller.signal);
    await requestStarted.promise;
    controller.abort();

    await expect(speech).resolves.toBeUndefined();
    expect(playbackSpy).not.toHaveBeenCalled();
  });
});

describe('lesson-consistent Hindi speech routing', () => {
  beforeEach(async () => {
    await stopSpeaking();
    jest.restoreAllMocks();
  });

  afterEach(async () => {
    await stopSpeaking();
    jest.restoreAllMocks();
  });

  it('keeps a Hindi phrase and its seat identifier together between English narration', () => {
    expect(splitSpeechByLanguage('You can say, सीट 12A मिल गई है। if needed.')).toEqual([
      { text: 'You can say,', language: undefined },
      { text: 'सीट 12A मिल गई है।', language: 'hi' },
      { text: 'if needed.', language: undefined },
    ]);
  });

  it('keeps an English lesson number in the English narration before a Hindi phrase', () => {
    expect(splitSpeechByLanguage('In lesson 2, say नमस्ते।')).toEqual([
      { text: 'In lesson 2, say', language: undefined },
      { text: 'नमस्ते', language: 'hi' },
    ]);
  });

  it('resolves a Romanized lesson phrase to its exact bundled Hindi clip', async () => {
    const native = installPlayer();
    native.player.play.mockImplementation(() => native.emit({ didJustFinish: true }));
    const requestSpy = jest.spyOn(boloApi, 'requestAiVoiceAudio');
    const romanizedLessonPhrase = romanizeDevanagari('चीनी कम, कृपया।');

    expect(hasOfflineSpeech(romanizedLessonPhrase)).toBe(true);
    await expect(speakText(romanizedLessonPhrase, undefined, 1, 'hi')).resolves.toBeUndefined();

    expect(requestSpy).not.toHaveBeenCalled();
    expect(expoAudio.createAudioPlayer).toHaveBeenLastCalledWith(expect.any(Number), {
      updateInterval: 100,
      keepAudioSessionActive: true,
    });
    expect(native.player.play).toHaveBeenCalledTimes(1);
  });
});
