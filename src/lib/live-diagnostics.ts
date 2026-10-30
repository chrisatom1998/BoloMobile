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
  /** What the native audio session reported when the call last activated it. */
  audioSession: string;
  peerState: string;
  mic: LiveMicStats | null;
  events: number;
  inputDeltas: number;
  outputDeltas: number;
  lastEvent: string;
  /** The last few server event types, oldest first; error events carry their message. */
  recentEvents: string[];
  lastError: string;
  /** Loudest mic level seen this call. Speech reads about 0.05 or more; a dead mic stays at 0. */
  micPeak: number;
  /** Audio direction in our SDP offer and the server's answer, e.g. "sendrecv/sendrecv". */
  sdpAudio: string;
  /** The iOS audio session as sampled beside the mic level each second, not only at activation. */
  sessionNow: string;
  /**
   * Audio-session changes since the call started, oldest first, each stamped "+Ns": every JS
   * audio-mode transition and activation, and native route changes, interruptions and resets.
   */
  audioEvents: string[];
};

const RECENT_EVENT_LIMIT = 5;
const AUDIO_EVENT_LIMIT = 8;

const EMPTY: LiveDiagnostics = {
  permission: '?',
  audioMode: '?',
  audioModeError: '',
  audioSession: '',
  peerState: '-',
  mic: null,
  events: 0,
  inputDeltas: 0,
  outputDeltas: 0,
  lastEvent: '-',
  recentEvents: [],
  lastError: '',
  micPeak: 0,
  sdpAudio: '',
  sessionNow: '',
  audioEvents: [],
};

/** Preview and development builds only; app.config.js leaves this off for production. */
export const liveDiagnosticsEnabled = Constants.expoConfig?.extra?.liveDiagnostics === true;

let current: LiveDiagnostics = EMPTY;
let startedAt = Date.now();
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
  startedAt = Date.now();
  listeners.forEach((listener) => listener());
}

/** Stamps an audio-session change with seconds since the call started, so it lines up with the mic level. */
export function noteLiveAudioEvent(label: string) {
  if (!liveDiagnosticsEnabled) return;
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  updateLiveDiagnostics({ audioEvents: [...current.audioEvents, `+${seconds}s ${label}`].slice(-AUDIO_EVENT_LIMIT) });
}

export function countLiveEvent(type: string | undefined, errorMessage?: string) {
  if (!liveDiagnosticsEnabled) return;
  const label = type === 'error' ? `error: ${(errorMessage || 'no message').slice(0, 80)}` : type ?? '?';
  updateLiveDiagnostics({
    events: current.events + 1,
    lastEvent: type ?? '?',
    recentEvents: [...current.recentEvents, label].slice(-RECENT_EVENT_LIMIT),
    inputDeltas: current.inputDeltas + (type === 'session.input_transcript.delta' ? 1 : 0),
    outputDeltas: current.outputDeltas + (type === 'session.output_transcript.delta' ? 1 : 0),
  });
}

/** Stores a mic sample and keeps the loudest level seen since the call started. */
export function recordLiveMicStats(mic: LiveMicStats) {
  if (!liveDiagnosticsEnabled) return;
  updateLiveDiagnostics({ mic, micPeak: Math.max(current.micPeak, mic.audioLevel ?? 0) });
}

/** The a= direction of the first audio m-section in an SDP, or '?' when it has none. */
export function sdpAudioDirection(sdp: string | undefined) {
  const section = sdp?.split(/\r?\nm=/).find((part) => /^(?:m=)?audio\s/.test(part));
  return section?.match(/\na=(sendrecv|sendonly|recvonly|inactive)\b/)?.[1] ?? '?';
}

export function formatLiveDiagnostics(value: LiveDiagnostics) {
  const mic = value.mic;
  const track = mic
    ? `track ${mic.trackEnabled ? 'on' : 'off'}/${mic.trackState ?? '?'}${mic.trackMuted ? '/muted' : ''}`
    : 'track -';
  const sent = mic
    ? `sent ${mic.packetsSent ?? '?'}pkt ${mic.bytesSent ?? '?'}B lvl ${mic.audioLevel === undefined ? '?' : mic.audioLevel.toFixed(3)} peak ${value.micPeak.toFixed(3)} energy ${mic.totalAudioEnergy === undefined ? '?' : mic.totalAudioEnergy.toFixed(6)}`
    : 'sent -';
  return [
    `perm ${value.permission} | mode ${value.audioMode}${value.audioModeError ? ` (${value.audioModeError})` : ''}${value.audioSession ? ` | session ${value.audioSession}` : ''} | peer ${value.peerState}${value.sdpAudio ? ` | sdp ${value.sdpAudio}` : ''}`,
    `${track} | ${sent}`,
    ...(value.sessionNow ? [`now ${value.sessionNow}`] : []),
    `events ${value.events} (you ${value.inputDeltas} / asha ${value.outputDeltas}) last ${value.lastEvent}`,
    ...(value.recentEvents.length ? [`recent ${value.recentEvents.join(' > ')}`] : []),
    ...(value.audioEvents.length ? [`audio ${value.audioEvents.join(' > ')}`] : []),
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
