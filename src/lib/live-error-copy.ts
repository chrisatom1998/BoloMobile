import type { BoloApiErrorKind } from '@/services/bolo-api';

/** What the learner can do about a live voice failure. Drives the one button under the message. */
export type LiveErrorAction = 'retry' | 'resume' | 'settings' | 'wait' | 'none';

export type FriendlyLiveError = { text: string; action: LiveErrorAction };

export const LIVE_LOST_CONNECTION_MESSAGE = 'Lost connection. Want to pick up where we left off?';
export const LIVE_SLOW_NETWORK_MESSAGE = 'Asha is taking a while to answer. Your connection may be slow.';
export const LIVE_BUSY_MESSAGE = 'Asha is busy right now. Give it a minute and try again.';
export const LIVE_GENERIC_MESSAGE = 'Asha hit a snag. Tap her to try again.';

type Rule = { test: RegExp; text: string; action: LiveErrorAction };

// Matched in order. Each technical message maps to one plain line and one next step.
const RULES: Rule[] = [
  { test: /physical iphone|ios simulator/i, text: 'Live voice needs a real iPhone, not the simulator.', action: 'none' },
  { test: /no microphone is available/i, text: 'No microphone was found. Check that nothing else is using it, then try again.', action: 'retry' },
  { test: /wait before starting another|rate limit|too many/i, text: LIVE_BUSY_MESSAGE, action: 'wait' },
  { test: /took too long|timed out|timeout/i, text: LIVE_SLOW_NETWORK_MESSAGE, action: 'retry' },
  { test: /did not confirm the microphone/i, text: LIVE_LOST_CONNECTION_MESSAGE, action: 'resume' },
  { test: /connection closed|session closed|session ended|closed before it was ready|not connected/i, text: LIVE_LOST_CONNECTION_MESSAGE, action: 'resume' },
  { test: /unreadable event|unreadable/i, text: 'Asha sent something the app could not read. If it keeps happening, try again later.', action: 'none' },
  { test: /could not finish an app action/i, text: 'Asha could not finish that in the app. Start a new session to continue.', action: 'retry' },
  { test: /canceled/i, text: '', action: 'none' },
];

/**
 * Turns a transport, server, or microphone failure into one line a learner can act on.
 * `kind` is the typed Bolo API failure when the call setup itself failed.
 * Messages the app already wrote for people (microphone permission, offline) pass through unchanged.
 */
export function friendlyLiveError(message: string, kind?: BoloApiErrorKind, passthrough: readonly string[] = []): FriendlyLiveError {
  if (passthrough.includes(message)) return { text: message, action: 'none' };
  for (const rule of RULES) {
    if (rule.test.test(message)) return { text: rule.text, action: rule.action };
  }
  // A short sentence written for people (Asha's own turn-level notes, Bolo service copy) stays as it is.
  if (readsLikeASentence(message)) return { text: message, action: kind === 'network' || kind === 'timeout' ? 'retry' : 'none' };
  if (kind === 'network') return { text: 'Lost connection. Check your Wi‑Fi or data, then try again.', action: 'retry' };
  if (kind === 'timeout') return { text: LIVE_SLOW_NETWORK_MESSAGE, action: 'retry' };
  return { text: LIVE_GENERIC_MESSAGE, action: 'retry' };
}

/** Plain prose, not an error code: starts with a capital, ends a sentence, and carries no code-like tokens. */
export function readsLikeASentence(message: string) {
  const text = message.trim();
  return text.length > 0 && text.length <= 200 && /^[A-Z]/.test(text) && /[.!?…]$/.test(text) && !/[_{}[\]<>=]|[a-z]+_[a-z_]+|\d{3}/.test(text);
}
