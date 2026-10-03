export type RealtimePeerSession = {
  close: () => void;
  closeGracefully?: () => Promise<void>;
  send: (event: Record<string, unknown>) => void;
  setMicrophoneEnabled: (enabled: boolean) => void;
  setPlaybackEnabled?: (enabled: boolean) => void;
};

export type RealtimePeerOptions = {
  /** Legacy Realtime token negotiation. Remove after the old endpoint retires. */
  ephemeralKey?: string;
  /** GPT-Live server-mediated WebRTC negotiation; permanent keys stay server-side. */
  negotiate?: (offerSdp: string, signal?: AbortSignal) => Promise<{ sdp: string }>;
  onClose: () => void;
  onMessage: (message: string) => void;
  signal?: AbortSignal;
};
