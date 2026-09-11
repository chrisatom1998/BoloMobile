import {
  mediaDevices,
  RTCPeerConnection,
} from 'react-native-webrtc';

import { waitForLiveIceGathering } from '@/lib/live-ice';
import { observeLivePlayback } from '@/lib/live-playback';
import type { RealtimePeerOptions, RealtimePeerSession } from '@/lib/realtime-peer.types';


const PEER_CONFIGURATION = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const DISCONNECTED_WATCHDOG_MS = 10_000;
const NEGOTIATION_TIMEOUT_MS = 15_000;

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
  exchangeSdp,
  onPlaybackChange,
  onClose,
  onMessage,
  signal,
}: RealtimePeerOptions): Promise<RealtimePeerSession> {
  if (signal?.aborted) throw new Error('The live voice connection was canceled.');
  const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
  if (signal?.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('The live voice connection was canceled.');
  }
  const microphone = stream.getAudioTracks()[0];
  if (!microphone) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('No microphone is available for live voice practice.');
  }

  microphone.enabled = false;
  let peer!: RTCPeerConnection;
  let dataChannel: ReturnType<RTCPeerConnection['createDataChannel']>;
  try {
    peer = new RTCPeerConnection(PEER_CONFIGURATION);
    peer.addTrack(microphone, stream);
    dataChannel = peer.createDataChannel('oai-events');
  } catch (cause) {
    stream.getTracks().forEach((track) => track.stop());
    // A native constructor or addTrack can fail before negotiation begins.
    peer?.close();
    throw cause;
  }
  const dataEvents = withNativeEvents(dataChannel);
  const peerEvents = withNativeEvents(peer);
  let closed = false;
  const negotiation = new AbortController();
  let stopPlayback = () => {};
  const abortSession = () => close();
  let disconnectedWatchdog: ReturnType<typeof setTimeout> | null = null;

  const close = () => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener('abort', abortSession);
    negotiation.abort();
    stopPlayback();
    if (disconnectedWatchdog) clearTimeout(disconnectedWatchdog);
    disconnectedWatchdog = null;
    microphone.enabled = false;
    stream.getTracks().forEach((track) => track.stop());
    dataChannel.close();
    peer.close();
  };

  signal?.addEventListener('abort', abortSession, { once: true });

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

  dataEvents.addEventListener('message', (event) => { if (!closed) onMessage(String(event.data)); });
  dataEvents.addEventListener('close', () => {
    if (!closed) {
      closeFromRemote();
    }
  });
  peerEvents.addEventListener('connectionstatechange', updateDisconnectedWatchdog);
  peerEvents.addEventListener('iceconnectionstatechange', updateDisconnectedWatchdog);

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (cause?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        if (cause) { negotiation.abort(); reject(cause); }
        else resolve();
      };
      const abort = () => finish(new Error('The live voice connection was canceled.'));
      const timeout = setTimeout(
        () => finish(new Error('The live voice connection took too long to negotiate.')),
        NEGOTIATION_TIMEOUT_MS,
      );

      void (async () => {
        const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
        if (closed) throw new Error('The live voice connection was canceled.');
        await peer.setLocalDescription(offer);
        await waitForLiveIceGathering(() => peer.iceGatheringState, negotiation.signal);
        const offerSdp = peer.localDescription?.sdp;
        if (!offerSdp) throw new Error('The live voice offer did not contain audio session data.');
        if (closed || negotiation.signal.aborted) throw new Error('The live voice connection was canceled.');
        const answerSdp = await exchangeSdp(offerSdp, negotiation.signal);
        if (closed || negotiation.signal.aborted) throw new Error('The live voice connection was canceled.');
        await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      })().then(() => finish(), finish);

      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });

    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('The live voice connection was canceled.'));
      if (dataChannel.readyState === 'open') return resolve();
      let settled = false;
      const finish = (cause?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        if (cause) reject(cause);
        else resolve();
      };
      const timeout = setTimeout(() => finish(new Error('The live voice data channel took too long to open.')), 15_000);
      const abort = () => finish(new Error('The live voice connection was canceled.'));
      dataEvents.addEventListener('open', () => {
        finish();
      }, { once: true });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });

    if (closed || signal?.aborted) throw new Error('The live voice connection was canceled.');
    stopPlayback = observeLivePlayback(
      typeof peer.getStats === 'function' ? () => peer.getStats() : undefined,
      onPlaybackChange,
    );
    return {
      close,
      send(event) {
        if (closed || dataChannel.readyState !== 'open') throw new Error('The live voice session is not connected.');
        dataChannel.send(JSON.stringify(event));
      },
      setMicrophoneEnabled(enabled) {
        if (!closed) microphone.enabled = enabled;
      },
    };
  } catch (cause) {
    close();
    throw cause;
  }
}
