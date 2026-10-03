import type { RealtimePeerOptions, RealtimePeerSession } from '@/lib/realtime-peer.types';

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const DISCONNECTED_WATCHDOG_MS = 10_000;
const NEGOTIATION_TIMEOUT_MS = 15_000;
const ICE_GATHERING_TIMEOUT_MS = 10_000;
const GRACEFUL_CLOSE_TIMEOUT_MS = 15_000;

async function waitForIceGathering(peer: RTCPeerConnection, signal?: AbortSignal) {
  const startedAt = Date.now();
  while (peer.iceGatheringState !== 'complete') {
    if (signal?.aborted) throw new Error('The live voice connection was canceled.');
    if (Date.now() - startedAt >= ICE_GATHERING_TIMEOUT_MS) {
      throw new Error('The live voice connection could not finish gathering network routes.');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
}

export async function createRealtimePeerSession({
  ephemeralKey,
  negotiate,
  onClose,
  onMessage,
  signal,
}: RealtimePeerOptions): Promise<RealtimePeerSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }).catch((cause: unknown) => {
    const name = cause instanceof Error ? cause.name : '';
    if (name === 'NotAllowedError') throw new Error('Microphone access is required for live voice practice.');
    if (name === 'NotFoundError') throw new Error('No microphone is available for live voice practice.');
    throw cause;
  });
  const microphone = stream.getAudioTracks()[0];
  if (!microphone) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('No microphone is available for live voice practice.');
  }

  microphone.enabled = false;
  // Match OpenAI's server-mediated WebRTC flow and avoid making session
  // startup depend on a third-party public STUN host.
  const peer = new RTCPeerConnection();
  peer.addTrack(microphone, stream);
  const dataChannel = peer.createDataChannel('oai-events');
  const audio = new Audio();
  audio.autoplay = true;
  peer.ontrack = (event) => {
    audio.srcObject = event.streams[0] ?? null;
    void audio.play().catch(() => undefined);
  };
  let closed = false;
  let sessionClosedResolve: (() => void) | null = null;
  const sessionClosed = new Promise<void>((resolve) => { sessionClosedResolve = resolve; });
  let disconnectedWatchdog: ReturnType<typeof setTimeout> | null = null;

  const close = () => {
    if (closed) return;
    closed = true;
    if (disconnectedWatchdog) clearTimeout(disconnectedWatchdog);
    disconnectedWatchdog = null;
    microphone.enabled = false;
    stream.getTracks().forEach((track) => track.stop());
    dataChannel.close();
    peer.close();
    audio.pause();
    audio.srcObject = null;
    sessionClosedResolve?.();
    sessionClosedResolve = null;
  };

  const closeFromRemote = () => {
    if (closed) return;
    close();
    onClose();
  };
  const updateDisconnectedWatchdog = () => {
    const disconnected = peer.connectionState === 'disconnected' || peer.iceConnectionState === 'disconnected';
    const failed = peer.connectionState === 'failed'
      || peer.connectionState === 'closed'
      || peer.iceConnectionState === 'failed'
      || peer.iceConnectionState === 'closed';
    if (failed) {
      closeFromRemote();
      return;
    }
    if (!disconnected) {
      if (disconnectedWatchdog) clearTimeout(disconnectedWatchdog);
      disconnectedWatchdog = null;
      return;
    }
    if (!disconnectedWatchdog) {
      disconnectedWatchdog = setTimeout(closeFromRemote, DISCONNECTED_WATCHDOG_MS);
    }
  };

  dataChannel.onmessage = (event) => {
    const message = String(event.data);
    try {
      const parsed = JSON.parse(message) as { type?: string };
      if (parsed.type === 'session.closed') sessionClosedResolve?.();
    } catch {
      // Forward malformed service events to the hook so it can report them.
    }
    onMessage(message);
  };
  dataChannel.onclose = () => {
    if (!closed) {
      closeFromRemote();
    }
  };
  peer.addEventListener('connectionstatechange', updateDisconnectedWatchdog);
  peer.addEventListener('iceconnectionstatechange', updateDisconnectedWatchdog);

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (cause?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        if (cause) reject(cause);
        else resolve();
      };
      const abort = () => finish(new Error('The live voice connection was canceled.'));
      const timeout = setTimeout(
        () => finish(new Error('The live voice connection took too long to negotiate.')),
        NEGOTIATION_TIMEOUT_MS,
      );

      void (async () => {
        const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
        await peer.setLocalDescription(offer);
        await waitForIceGathering(peer, signal);
        const offerSdp = peer.localDescription?.sdp;
        if (!offerSdp) throw new Error('The live voice offer did not contain audio session data.');
        let answerSdp: string;
        if (negotiate) {
          answerSdp = (await negotiate(offerSdp, signal)).sdp;
        } else {
          if (!ephemeralKey) throw new Error('The live voice connection is missing secure session credentials.');
          const response = await fetch(REALTIME_CALLS_URL, {
            method: 'POST',
            body: offerSdp,
            headers: {
              Authorization: `Bearer ${ephemeralKey}`,
              'Content-Type': 'application/sdp',
            },
            signal,
          });
          answerSdp = await response.text();
          if (!response.ok) throw new Error('OpenAI could not establish the live audio connection.');
        }
        await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      })().then(() => finish(), finish);

      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });

    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('The live voice connection was canceled.'));
      if (dataChannel.readyState === 'open') return resolve();
      const timeout = setTimeout(() => reject(new Error('The live voice data channel took too long to open.')), 15_000);
      const abort = () => {
        clearTimeout(timeout);
        reject(new Error('The live voice connection was canceled.'));
      };
      dataChannel.addEventListener('open', () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        resolve();
      }, { once: true });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });

    return {
      close,
      async closeGracefully() {
        if (closed) return;
        if (dataChannel.readyState === 'open') {
          dataChannel.send(JSON.stringify({ type: 'session.close' }));
          await Promise.race([
            sessionClosed,
            new Promise<void>((resolve) => setTimeout(resolve, GRACEFUL_CLOSE_TIMEOUT_MS)),
          ]);
        }
        close();
      },
      send(event) {
        if (dataChannel.readyState !== 'open') throw new Error('The live voice session is not connected.');
        dataChannel.send(JSON.stringify(event));
      },
      setMicrophoneEnabled(enabled) {
        microphone.enabled = enabled;
      },
      setPlaybackEnabled(enabled) {
        if (enabled) void audio.play().catch(() => undefined);
        else audio.pause();
      },
    };
  } catch (cause) {
    close();
    throw cause;
  }
}
