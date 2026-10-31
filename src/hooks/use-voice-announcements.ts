import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import type { RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';

/**
 * iOS VoiceOver ignores `accessibilityLiveRegion`, so the Asha screen announces
 * its state changes and finished replies itself. Android keeps its live regions
 * and gets nothing here, which avoids double announcements.
 */
export type VoiceAnnouncementState = {
  status: RealtimeVoiceStatus;
  /** Asha's audio is playing; while the mic is on, this reads as speaking rather than listening. */
  speaking: boolean;
  /** Copy for a session that ended early (connection lost, left the app). */
  interruptedMessage: string | null;
  /** The current error banner text, if any. */
  error: string;
};

export const VOICE_STATE_ANNOUNCEMENTS = {
  connecting: 'Connecting to Asha.',
  listening: 'Asha is listening.',
  muted: 'Your microphone is muted.',
  speaking: 'Asha is speaking. Just talk to interrupt.',
  ended: 'The conversation ended.',
} as const;

type Phase = 'disconnected' | 'connecting' | 'muted' | 'listening' | 'speaking';

export function voicePhase(status: RealtimeVoiceStatus, speaking: boolean): Phase {
  if (status === 'disconnected' || status === 'connecting') return status;
  if (status === 'responding' || speaking) return 'speaking';
  return status === 'recording' ? 'listening' : 'muted';
}

/** The sentence VoiceOver reads for a phase change, or null when nothing should be said. */
export function voiceStateAnnouncement(previous: Phase, next: Phase, interruptedMessage: string | null): string | null {
  if (previous === next) return null;
  switch (next) {
    case 'connecting':
      return VOICE_STATE_ANNOUNCEMENTS.connecting;
    case 'listening':
      return VOICE_STATE_ANNOUNCEMENTS.listening;
    case 'speaking':
      return VOICE_STATE_ANNOUNCEMENTS.speaking;
    case 'muted':
      return VOICE_STATE_ANNOUNCEMENTS.muted;
    case 'disconnected':
      // A failed start has its own error; only a session that was live has ended.
      if (previous === 'connecting') return interruptedMessage;
      return interruptedMessage ?? VOICE_STATE_ANNOUNCEMENTS.ended;
    default:
      return null;
  }
}

export function announceForIos(message: string) {
  if (Platform.OS !== 'ios' || !message.trim()) return;
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * Announces session state changes once each, errors once each, and finished
 * Asha replies once each. Caption deltas are never announced: the caller passes
 * the latest Asha line, and it is read only when her playback stops or the
 * session ends, so the learner hears one complete reply rather than fragments.
 */
export function useVoiceAnnouncements({ error, interruptedMessage, speaking, status }: VoiceAnnouncementState, latestAshaLine: string) {
  const phase = voicePhase(status, speaking);
  const phaseRef = useRef<Phase>(phase);
  const interruptedRef = useRef(interruptedMessage);
  const lineRef = useRef(latestAshaLine);
  const announcedLineRef = useRef('');
  const errorRef = useRef(error);
  // Synced before the phase effect below runs, so a phase change reads the newest line and copy.
  useEffect(() => {
    interruptedRef.current = interruptedMessage;
    lineRef.current = latestAshaLine;
  }, [interruptedMessage, latestAshaLine]);

  /** Reads one finished Asha reply; the same text is never read twice in a row. */
  const announceReply = useCallback((text: string) => {
    const line = text.trim();
    if (!line || line === announcedLineRef.current) return;
    announcedLineRef.current = line;
    announceForIos(line);
  }, []);

  useEffect(() => {
    const previous = phaseRef.current;
    if (previous === phase) return;
    phaseRef.current = phase;
    // Leaving the speaking phase (playback stopped, learner interrupted, or the
    // session ended) means the latest Asha line is final: read it once.
    if (previous === 'speaking') announceReply(lineRef.current);
    const message = voiceStateAnnouncement(previous, phase, interruptedRef.current);
    if (message) announceForIos(message);
    if (phase === 'connecting') announcedLineRef.current = '';
  }, [announceReply, phase]);

  useEffect(() => {
    if (error === errorRef.current) return;
    errorRef.current = error;
    if (error) announceForIos(error);
  }, [error]);

  return announceReply;
}
