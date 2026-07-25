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

function mountWebPeer() {
  const microphone = { enabled: true, stop: jest.fn() };
  const stream = {
    getAudioTracks: jest.fn(() => [microphone]),
    getTracks: jest.fn(() => [microphone]),
  };
  const peerHandlers = new Map<string, () => void>();
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
    addEventListener: jest.fn((event: string, handler: () => void) => peerHandlers.set(event, handler)),
    close: jest.fn(),
    connectionState: 'connected',
    iceConnectionState: 'connected',
    createDataChannel: jest.fn(() => dataChannel),
    createOffer: jest.fn(async () => ({ sdp: 'web-offer', type: 'offer' })),
    ontrack: null,
    setLocalDescription: jest.fn(async () => undefined),
    setRemoteDescription: jest.fn(async () => undefined),
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
  globalThis.fetch = jest.fn(async () => ({ ok: true, text: async () => 'web-answer' })) as unknown as typeof fetch;
  return { audio, dataChannel, microphone, peer, peerHandlers, stream };
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
      addEventListener: jest.fn(),
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

  it('times out and closes a native peer when remote description setup hangs', async () => {
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

    let rejection: unknown;
    const session = createNativeSession({
      ephemeralKey: 'ek_native_timeout',
      onClose: jest.fn(),
      onMessage: jest.fn(),
      signal: new AbortController().signal,
    }).catch((error: unknown) => {
      rejection = error;
    });

    await flushMicrotasks();
    expect(peer.setRemoteDescription).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(15_000);
    await flushMicrotasks();

    expect(rejection).toEqual(expect.objectContaining({ message: 'The live voice connection took too long to negotiate.' }));
    expect(microphone.stop).toHaveBeenCalledTimes(1);
    expect(dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
    await session;
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
      addEventListener: jest.fn(),
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

  it('closes a native peer that remains ICE-disconnected for ten seconds', async () => {
    const microphone = { enabled: true, stop: jest.fn() };
    const stream = {
      getAudioTracks: jest.fn(() => [microphone]),
      getTracks: jest.fn(() => [microphone]),
    };
    const dataHandlers = new Map<string, (event: { data?: unknown }) => void>();
    const peerHandlers = new Map<string, () => void>();
    const dataChannel = {
      addEventListener: jest.fn((event: string, handler: (event: { data?: unknown }) => void) => dataHandlers.set(event, handler)),
      close: jest.fn(),
      readyState: 'open',
      send: jest.fn(),
    };
    const peer = {
      addTrack: jest.fn(),
      close: jest.fn(),
      connectionState: 'connected',
      iceConnectionState: 'connected',
      createDataChannel: jest.fn(() => dataChannel),
      createOffer: jest.fn(async () => ({ sdp: 'native-offer', type: 'offer' })),
      setLocalDescription: jest.fn(async () => undefined),
      setRemoteDescription: jest.fn(async () => undefined),
      addEventListener: jest.fn((event: string, handler: () => void) => peerHandlers.set(event, handler)),
    };
    (mediaDevices.getUserMedia as jest.Mock).mockResolvedValue(stream);
    (RTCPeerConnection as unknown as jest.Mock).mockImplementation(() => peer);
    globalThis.fetch = jest.fn(async () => ({ ok: true, text: async () => 'native-answer' })) as unknown as typeof fetch;
    const onClose = jest.fn();

    await createNativeSession({
      ephemeralKey: 'temporary-client-secret',
      onClose,
      onMessage: jest.fn(),
      signal: new AbortController().signal,
    });
    peer.iceConnectionState = 'disconnected';
    peerHandlers.get('iceconnectionstatechange')?.();
    jest.advanceTimersByTime(9_999);
    expect(peer.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(microphone.stop).toHaveBeenCalledTimes(1);
    expect(dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes a web peer that remains ICE-disconnected for ten seconds', async () => {
    const { audio, dataChannel, microphone, peer, peerHandlers } = mountWebPeer();
    const onClose = jest.fn();

    await createWebSession({
      ephemeralKey: 'ek_web_watchdog',
      onClose,
      onMessage: jest.fn(),
      signal: new AbortController().signal,
    });
    peer.iceConnectionState = 'disconnected';
    peerHandlers.get('iceconnectionstatechange')?.();
    jest.advanceTimersByTime(9_999);
    expect(peer.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(microphone.stop).toHaveBeenCalledTimes(1);
    expect(dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a web peer open when it reconnects before the watchdog fires', async () => {
    const { dataChannel, microphone, peer, peerHandlers } = mountWebPeer();
    const onClose = jest.fn();

    await createWebSession({
      ephemeralKey: 'ek_web_recovery',
      onClose,
      onMessage: jest.fn(),
      signal: new AbortController().signal,
    });
    peer.connectionState = 'disconnected';
    peerHandlers.get('connectionstatechange')?.();
    jest.advanceTimersByTime(5_000);
    peer.connectionState = 'connected';
    peerHandlers.get('connectionstatechange')?.();
    jest.advanceTimersByTime(20_000);

    expect(microphone.stop).not.toHaveBeenCalled();
    expect(dataChannel.close).not.toHaveBeenCalled();
    expect(peer.close).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('explains a denied web microphone permission in the words the app already uses', async () => {
    const denial = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia: jest.fn(async () => { throw denial; }) } },
    });

    await expect(createWebSession({
      ephemeralKey: 'ek_web_denied',
      onClose: jest.fn(),
      onMessage: jest.fn(),
      signal: new AbortController().signal,
    })).rejects.toThrow('Microphone access is required for live voice practice.');
  });
});
