import type { RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';

export type AshaStatusCopy = {
  /** Short uppercase status for the pill. */
  kicker: string;
  title: string;
  body: string;
};

/**
 * Status wording for the Today tab's Asha hero. Mirrors the Asha screen's own
 * header copy so both screens describe the shared live voice session the same way.
 */
const statusCopy: Record<RealtimeVoiceStatus, AshaStatusCopy> = {
  disconnected: { kicker: 'READY', title: 'Ready when you are', body: 'Tap Asha to start talking with her.' },
  connecting: { kicker: 'CONNECTING', title: 'Connecting to Asha', body: 'Opening a private live voice session…' },
  ready: { kicker: 'MUTED', title: 'Your microphone is muted', body: 'Tap Asha to unmute and join the conversation.' },
  recording: { kicker: 'LISTENING', title: 'Your microphone is on', body: 'Speak naturally, even while Asha talks. Tap to mute.' },
  responding: { kicker: 'SPEAKING', title: 'Asha is speaking', body: 'Your mic is muted. Tap Asha to speak at any time.' },
};

export function ashaStatusCopy(status: RealtimeVoiceStatus): AshaStatusCopy {
  return statusCopy[status];
}
