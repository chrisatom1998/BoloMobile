import type { AshaSessionEndReason } from '@/lib/asha-session-log';
import type { ChatMessage } from '@/state/app-state-types';

/** Width of the chip scroller so the next chip peeks by `peek` points inside `available`. */
export function visibleChipRowWidth(widths: readonly number[], available: number, peek: number, gap: number): number {
  if (available <= 0 || widths.length === 0 || widths.some((width) => width <= 0)) return available;
  let cursor = 0;
  for (let index = 0; index < widths.length; index += 1) {
    const width = widths[index] ?? 0;
    if (cursor + width > available) return Math.min(available, cursor + peek);
    cursor += width;
    if (index < widths.length - 1) cursor += gap;
  }
  return Math.min(available, cursor);
}

export const welcome: ChatMessage = {
  id: 'welcome',
  role: 'asha',
  text: 'Hi! Tell me what you would like to practice. Choose English or Hindi for my replies above.',
};

export const ashaPortrait = require('../../../assets/images/asha-portrait.png');
export const tailFollowThreshold = 48;
/** Releases a send-follow that never emits a scroll-end event. Longer than a scroll animation. */
export const animatedFollowReleaseMs = 500;
/** One frame. The send update already consumes a zero-delay frame, so the follow waits for the next one. */
export const tailFollowFrameMs = 16;
/** Shown instead of the generic network error when a live call cannot even start. */
export const LIVE_OFFLINE_MESSAGE = 'Live voice needs an internet connection. Lessons and saved phrases work offline.';
/** The learner's explicit Clear removes saved transcripts but keeps queued reports and their retries. */
export const CLEAR_CHAT_CONFIRMATION = 'Clear all saved chat transcripts? Saved phrases and progress will remain. Pending reports will still be sent under your existing AI consent.';
export type InterruptedReason = Extract<AshaSessionEndReason, 'connection_lost' | 'backgrounded'>;
export const interruptedCopy: Record<InterruptedReason, string> = {
  connection_lost: 'Connection lost. This conversation is saved on your device.',
  backgrounded: 'The session ended when you left Bolo. This conversation is saved on your device.',
};

export function sharesSpeaker(left: ChatMessage | undefined, right: ChatMessage | undefined) {
  if (!left || !right || left.id === welcome.id || right.id === welcome.id) return false;
  return left.role === right.role;
}
