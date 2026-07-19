import {
  mediaDevices,
  RTCPeerConnection,
} from 'react-native-webrtc';

import type { RealtimePeerOptions, RealtimePeerSession } from '@/lib/realtime-peer.types';

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';

type NativeEventTarget = {
  addEventListener: (
    type: string,
    listener: (event: { data?: unknown }) => void,
    options?: { once?: boolean },
  ) => void;
};

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
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    microphone.enabled = false;
    stream.getTracks().forEach((track) => track.stop());
    dataChannel.close();
    peer.close();
  };

  const dataEvents = dataChannel as unknown as NativeEventTarget;
  const peerEvents = peer as unknown as NativeEventTarget;
  dataEvents.addEventListener('message', (event) => onMessage(String(event.data)));
  dataEvents.addEventListener('close', () => {
    if (!closed) {
      close();
      onClose();
    }
  });
  peerEvents.addEventListener('connectionstatechange', () => {
    if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
      close();
      onClose();
    }
  });

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
