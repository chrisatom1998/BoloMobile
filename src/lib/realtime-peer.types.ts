export type RealtimePeerSession = {
  close: () => void;
  send: (event: Record<string, unknown>) => void;
  setMicrophoneEnabled: (enabled: boolean) => void;
};

export type RealtimePeerOptions = {
  ephemeralKey: string;
  onClose: () => void;
  onMessage: (message: string) => void;
  signal?: AbortSignal;
};
