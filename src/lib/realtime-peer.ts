import {
  mediaDevices,
  RTCPeerConnection,
} from 'react-native-webrtc';

import type { RealtimePeerOptions, RealtimePeerSession } from '@/lib/realtime-peer.types';

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const DISCONNECTED_WATCHDOG_MS = 10_000;

type NativeEventTarget = {
  addEventListener(
    type: string,
    listener: (event: { data?: unknown }) => void,
    options?: { once?: boolean },
  ): void;
};

// react-native-webrtc inherits these methods at runtime, but its public class
// declarations currently omit them from the TypeScript surface.
function withNativeEvents<T>(target: T) {
  return target as T & NativeEventTarget;
}

export async function createRealtimePeerSession({
  ephemeralKey,
  onClose,
  onMessage,
  signal,
}: RealtimePeerOptions): Promise<RealtimePeerSession> {
  const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
  const microphone = stream.getAudioTracks()[0];
  if (!microphone) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('No microphone is available for live voice practice.');
  }

  microphone.enabled = false;
  const peer = new RTCPeerConnection();
  peer.addTrack(microphone, stream);
  const dataChannel = peer.createDataChannel('oai-events');
  const dataEvents = withNativeEvents(dataChannel);
  const peerEvents = withNativeEvents(peer);
  let closed = false;
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

  dataEvents.addEventListener('message', (event) => onMessage(String(event.data)));
  dataEvents.addEventListener('close', () => {
    if (!closed) {
      closeFromRemote();
    }
  });
  peerEvents.addEventListener('connectionstatechange', updateDisconnectedWatchdog);
  peerEvents.addEventListener('iceconnectionstatechange', updateDisconnectedWatchdog);

  try {
    const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
    await peer.setLocalDescription(offer);
    if (!offer.sdp) throw new Error('The live voice offer did not contain audio session data.');
    const response = await fetch(REALTIME_CALLS_URL, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
      signal,
    });
    const answerSdp = await response.text();
    if (!response.ok) throw new Error('OpenAI could not establish the live audio connection.');
    await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('The live voice connection was canceled.'));
      if (dataChannel.readyState === 'open') return resolve();
      const timeout = setTimeout(() => reject(new Error('The live voice data channel took too long to open.')), 15_000);
      const abort = () => {
        clearTimeout(timeout);
        reject(new Error('The live voice connection was canceled.'));
      };
      dataEvents.addEventListener('open', () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        resolve();
      }, { once: true });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });

    return {
      close,
      send(event) {
        if (dataChannel.readyState !== 'open') throw new Error('The live voice session is not connected.');
        dataChannel.send(JSON.stringify(event));
      },
      setMicrophoneEnabled(enabled) {
        microphone.enabled = enabled;
      },
    };
  } catch (cause) {
    close();
    throw cause;
  }
}
