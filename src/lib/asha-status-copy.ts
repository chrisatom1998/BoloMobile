import type { RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';

export type AshaStatusCopy = {
  /** Short uppercase status for the pill. */
  kicker: string;
  title: string;
};

/**
 * Status wording for the Today tab's Asha hero. Mirrors the Asha screen's own
 * header copy so both screens describe the shared live voice session the same way.
 * There is no body line: on Today a tap only opens the Asha screen, so the Asha
 * screen's "Tap Asha to unmute…" instructions would be wrong here.
 */
const statusCopy: Record<RealtimeVoiceStatus, AshaStatusCopy> = {
  disconnected: { kicker: 'READY', title: 'Ready when you are' },
  connecting: { kicker: 'CONNECTING', title: 'Connecting to Asha' },
  ready: { kicker: 'MUTED', title: 'Your microphone is muted' },
  recording: { kicker: 'LISTENING', title: 'Your microphone is on' },
  responding: { kicker: 'SPEAKING', title: 'Asha is speaking' },
};

export function ashaStatusCopy(status: RealtimeVoiceStatus): AshaStatusCopy {
  return statusCopy[status];
}
