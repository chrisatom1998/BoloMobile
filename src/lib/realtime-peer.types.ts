export type RealtimePeerSession = {
  close: () => void;
  send: (event: Record<string, unknown>) => void;
  setMicrophoneEnabled: (enabled: boolean) => void;
};

export type RealtimePeerOptions = {
  /** The trusted Bolo backend creates the GPT-Live session and returns its SDP answer. */
  exchangeSdp: (offerSdp: string, signal: AbortSignal) => Promise<string>;
  onClose: () => void;
  onMessage: (message: string) => void;
  /** Estimated audible output from the received audio track, never from captions. */
  onPlaybackChange?: (playing: boolean) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};
