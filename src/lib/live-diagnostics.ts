import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';

/** Outbound microphone numbers read from the WebRTC peer, so we can see where audio stops. */
export type LiveMicStats = {
  trackEnabled: boolean;
  trackMuted?: boolean;
  trackState?: string;
  packetsSent?: number;
  bytesSent?: number;
  audioLevel?: number;
  /** Fallback when audioLevel is missing: rises only while the mic hears sound. */
  totalAudioEnergy?: number;
};

export type LiveDiagnostics = {
  permission: string;
  audioMode: string;
  audioModeError: string;
  peerState: string;
  mic: LiveMicStats | null;
  events: number;
  inputDeltas: number;
  outputDeltas: number;
  lastEvent: string;
  lastError: string;
};

const EMPTY: LiveDiagnostics = {
  permission: '?',
  audioMode: '?',
  audioModeError: '',
  peerState: '-',
  mic: null,
  events: 0,
  inputDeltas: 0,
  outputDeltas: 0,
  lastEvent: '-',
  lastError: '',
};

/** Preview and development builds only; app.config.js leaves this off for production. */
export const liveDiagnosticsEnabled = Constants.expoConfig?.extra?.liveDiagnostics === true;

let current: LiveDiagnostics = EMPTY;
const listeners = new Set<() => void>();

export function updateLiveDiagnostics(patch: Partial<LiveDiagnostics>) {
  if (!liveDiagnosticsEnabled) return;
  current = { ...current, ...patch };
  listeners.forEach((listener) => listener());
}

/** Each new connection starts from zero counters but keeps nothing stale from the last call. */
export function resetLiveDiagnostics() {
  if (!liveDiagnosticsEnabled) return;
  current = EMPTY;
  listeners.forEach((listener) => listener());
}

export function countLiveEvent(type: string | undefined) {
  if (!liveDiagnosticsEnabled) return;
  updateLiveDiagnostics({
    events: current.events + 1,
    lastEvent: type ?? '?',
    inputDeltas: current.inputDeltas + (type === 'session.input_transcript.delta' ? 1 : 0),
    outputDeltas: current.outputDeltas + (type === 'session.output_transcript.delta' ? 1 : 0),
  });
}

export function formatLiveDiagnostics(value: LiveDiagnostics) {
  const mic = value.mic;
  const track = mic
    ? `track ${mic.trackEnabled ? 'on' : 'off'}/${mic.trackState ?? '?'}${mic.trackMuted ? '/muted' : ''}`
    : 'track -';
  const sent = mic
    ? `sent ${mic.packetsSent ?? '?'}pkt ${mic.bytesSent ?? '?'}B lvl ${mic.audioLevel === undefined ? '?' : mic.audioLevel.toFixed(3)} energy ${mic.totalAudioEnergy === undefined ? '?' : mic.totalAudioEnergy.toFixed(4)}`
    : 'sent -';
  return [
    `perm ${value.permission} | mode ${value.audioMode}${value.audioModeError ? ` (${value.audioModeError})` : ''} | peer ${value.peerState}`,
    `${track} | ${sent}`,
    `events ${value.events} (you ${value.inputDeltas} / asha ${value.outputDeltas}) last ${value.lastEvent}`,
    ...(value.lastError ? [`error ${value.lastError}`] : []),
  ].join('\n');
}

/** Non-hook read of the current values, for tests and one-off logging. */
export function getLiveDiagnostics(): LiveDiagnostics {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useLiveDiagnostics(): LiveDiagnostics {
  return useSyncExternalStore(subscribe, () => current, () => current);
}
