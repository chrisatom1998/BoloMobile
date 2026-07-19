jest.mock('react-native-webrtc', () => ({
  mediaDevices: { getUserMedia: jest.fn() },
  RTCPeerConnection: jest.fn(),
}));

import { mediaDevices, RTCPeerConnection } from 'react-native-webrtc';

import { createRealtimePeerSession as createNativeSession } from '../src/lib/realtime-peer';
import { createRealtimePeerSession as createWebSession } from '../src/lib/realtime-peer.web';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

describe('Realtime peer setup cleanup', () => {
  const originalAudio = globalThis.Audio;
  const originalFetch = globalThis.fetch;
  const originalNavigator = globalThis.navigator;
  const originalPeerConnection = globalThis.RTCPeerConnection;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    globalThis.Audio = originalAudio;
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
    globalThis.RTCPeerConnection = originalPeerConnection;
    jest.useRealTimers();
  });

  it('closes the native microphone and peer when abort fires during remote description setup', async () => {
    const remoteDescription = deferred<void>();
    const microphone = { enabled: true, stop: jest.fn() };
    const stream = {
      getAudioTracks: jest.fn(() => [microphone]),
      getTracks: jest.fn(() => [microphone]),
    };
    const dataChannel = {
      addEventListener: jest.fn(),
      close: jest.fn(),
      readyState: 'connecting',
      send: jest.fn(),
    };
    const peer = {
      addTrack: jest.fn(),
      close: jest.fn(),
      connectionState: 'connecting',
      createDataChannel: jest.fn(() => dataChannel),
      createOffer: jest.fn(async () => ({ sdp: 'native-offer', type: 'offer' })),
      setLocalDescription: jest.fn(async () => undefined),
      setRemoteDescription: jest.fn(() => remoteDescription.promise),
      addEventListener: jest.fn(),
    };
    (mediaDevices.getUserMedia as jest.Mock).mockResolvedValue(stream);
    (RTCPeerConnection as unknown as jest.Mock).mockImplementation(() => peer);
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => 'native-answer',
    })) as unknown as typeof fetch;
    const controller = new AbortController();
    let rejection: unknown;
    const session = createNativeSession({
      ephemeralKey: 'ek_native',
      onClose: jest.fn(),
      onMessage: jest.fn(),
      signal: controller.signal,
    }).catch((error: unknown) => {
      rejection = error;
    });

    await flushMicrotasks();
    expect(peer.setRemoteDescription).toHaveBeenCalledTimes(1);
    controller.abort();
    remoteDescription.resolve();
    await flushMicrotasks();

    try {
      expect(microphone.stop).toHaveBeenCalledTimes(1);
      expect(dataChannel.close).toHaveBeenCalledTimes(1);
      expect(peer.close).toHaveBeenCalledTimes(1);
      expect(rejection).toEqual(expect.objectContaining({ message: 'The live voice connection was canceled.' }));
    } finally {
      jest.advanceTimersByTime(15_000);
      await flushMicrotasks();
      await session;
    }
  });

  it('closes the web microphone and peer when abort fires during remote description setup', async () => {
    const remoteDescription = deferred<void>();
    const microphone = { enabled: true, stop: jest.fn() };
    const stream = {
      getAudioTracks: jest.fn(() => [microphone]),
      getTracks: jest.fn(() => [microphone]),
    };
    const dataChannel = {
      addEventListener: jest.fn(),
      close: jest.fn(),
      onclose: null,
      onmessage: null,
      readyState: 'connecting',
      send: jest.fn(),
    };
    const peer = {
      addTrack: jest.fn(),
      close: jest.fn(),
      connectionState: 'connecting',
      createDataChannel: jest.fn(() => dataChannel),
      createOffer: jest.fn(async () => ({ sdp: 'web-offer', type: 'offer' })),
      onconnectionstatechange: null,
      ontrack: null,
      setLocalDescription: jest.fn(async () => undefined),
      setRemoteDescription: jest.fn(() => remoteDescription.promise),
    };
    const audio = {
      autoplay: false,
      pause: jest.fn(),
      play: jest.fn(async () => undefined),
      srcObject: null,
    };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia: jest.fn(async () => stream) } },
    });
    globalThis.RTCPeerConnection = jest.fn(() => peer) as unknown as typeof globalThis.RTCPeerConnection;
    globalThis.Audio = jest.fn(() => audio) as unknown as typeof Audio;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => 'web-answer',
    })) as unknown as typeof fetch;
    const controller = new AbortController();
    let rejection: unknown;
    const session = createWebSession({
      ephemeralKey: 'ek_web',
      onClose: jest.fn(),
      onMessage: jest.fn(),
      signal: controller.signal,
    }).catch((error: unknown) => {
      rejection = error;
    });

    await flushMicrotasks();
    expect(peer.setRemoteDescription).toHaveBeenCalledTimes(1);
    controller.abort();
    remoteDescription.resolve();
    await flushMicrotasks();

    try {
      expect(microphone.stop).toHaveBeenCalledTimes(1);
      expect(dataChannel.close).toHaveBeenCalledTimes(1);
      expect(peer.close).toHaveBeenCalledTimes(1);
      expect(audio.pause).toHaveBeenCalledTimes(1);
      expect(rejection).toEqual(expect.objectContaining({ message: 'The live voice connection was canceled.' }));
    } finally {
      jest.advanceTimersByTime(15_000);
      await flushMicrotasks();
      await session;
    }
  });

  it('rejects and closes the native peer when abort wins before an already-open data channel is awaited', async () => {
    const remoteDescription = deferred<void>();
    const microphone = { enabled: true, stop: jest.fn() };
    const stream = {
      getAudioTracks: jest.fn(() => [microphone]),
      getTracks: jest.fn(() => [microphone]),
    };
    const dataChannel = {
      addEventListener: jest.fn(),
      close: jest.fn(),
      readyState: 'open',
      send: jest.fn(),
    };
    const peer = {
      addTrack: jest.fn(),
      close: jest.fn(),
      connectionState: 'connecting',
      createDataChannel: jest.fn(() => dataChannel),
      createOffer: jest.fn(async () => ({ sdp: 'native-offer', type: 'offer' })),
      setLocalDescription: jest.fn(async () => undefined),
      setRemoteDescription: jest.fn(() => remoteDescription.promise),
      addEventListener: jest.fn(),
    };
    (mediaDevices.getUserMedia as jest.Mock).mockResolvedValue(stream);
    (RTCPeerConnection as unknown as jest.Mock).mockImplementation(() => peer);
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => 'native-answer',
    })) as unknown as typeof fetch;
    const controller = new AbortController();
    let rejection: unknown;
    const session = createNativeSession({
      ephemeralKey: 'ek_native',
      onClose: jest.fn(),
      onMessage: jest.fn(),
      signal: controller.signal,
    }).catch((error: unknown) => {
      rejection = error;
    });

    await flushMicrotasks();
    expect(peer.setRemoteDescription).toHaveBeenCalledTimes(1);
    controller.abort();
    remoteDescription.resolve();
    await flushMicrotasks();

    expect(rejection).toEqual(expect.objectContaining({ message: 'The live voice connection was canceled.' }));
    expect(microphone.stop).toHaveBeenCalledTimes(1);
    expect(dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
    await session;
  });

  it('rejects and closes the web peer when abort wins before an already-open data channel is awaited', async () => {
    const remoteDescription = deferred<void>();
    const microphone = { enabled: true, stop: jest.fn() };
    const stream = {
      getAudioTracks: jest.fn(() => [microphone]),
      getTracks: jest.fn(() => [microphone]),
    };
    const dataChannel = {
      addEventListener: jest.fn(),
      close: jest.fn(),
      onclose: null,
      onmessage: null,
      readyState: 'open',
      send: jest.fn(),
    };
    const peer = {
      addTrack: jest.fn(),
      close: jest.fn(),
      connectionState: 'connecting',
      createDataChannel: jest.fn(() => dataChannel),
      createOffer: jest.fn(async () => ({ sdp: 'web-offer', type: 'offer' })),
      onconnectionstatechange: null,
      ontrack: null,
      setLocalDescription: jest.fn(async () => undefined),
      setRemoteDescription: jest.fn(() => remoteDescription.promise),
    };
    const audio = {
      autoplay: false,
      pause: jest.fn(),
      play: jest.fn(async () => undefined),
      srcObject: null,
    };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia: jest.fn(async () => stream) } },
    });
    globalThis.RTCPeerConnection = jest.fn(() => peer) as unknown as typeof globalThis.RTCPeerConnection;
    globalThis.Audio = jest.fn(() => audio) as unknown as typeof Audio;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => 'web-answer',
    })) as unknown as typeof fetch;
    const controller = new AbortController();
    let rejection: unknown;
    const session = createWebSession({
      ephemeralKey: 'ek_web',
      onClose: jest.fn(),
      onMessage: jest.fn(),
      signal: controller.signal,
    }).catch((error: unknown) => {
      rejection = error;
    });

    await flushMicrotasks();
    expect(peer.setRemoteDescription).toHaveBeenCalledTimes(1);
    controller.abort();
    remoteDescription.resolve();
    await flushMicrotasks();

    expect(rejection).toEqual(expect.objectContaining({ message: 'The live voice connection was canceled.' }));
    expect(microphone.stop).toHaveBeenCalledTimes(1);
    expect(dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    await session;
  });
});
