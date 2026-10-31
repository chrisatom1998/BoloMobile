import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Foreground time counts only this long past the last tap, answer, or resume.
 * A lesson left open on a desk stops earning minutes after a minute and a half.
 */
export const IDLE_WINDOW_MS = 90_000;

/** One sitting never records more than an hour, whatever the clock says. */
export const MAX_SESSION_SECONDS = 60 * 60;

/** Milliseconds earned in the current foreground stretch, cut off at the idle window. */
function creditedMs(activeSince: number | null, lastActiveAt: number, now: number) {
  if (activeSince === null) return 0;
  return Math.max(0, Math.min(now, lastActiveAt + IDLE_WINDOW_MS) - activeSince);
}

export function useForegroundTimer(enabled = true) {
  const accumulatedMs = useRef(0);
  // Start of the current counting stretch; null while the app is not in the foreground.
  const activeSince = useRef<number | null>(null);
  // Last tap, answer, or foreground resume. Counting stops IDLE_WINDOW_MS after it.
  const lastActiveAt = useRef(0);

  const begin = useCallback((now: number) => {
    activeSince.current = now;
    lastActiveAt.current = now;
  }, []);

  const pause = useCallback((now: number) => {
    accumulatedMs.current += creditedMs(activeSince.current, lastActiveAt.current, now);
    activeSince.current = null;
  }, []);

  /** Records learner activity. After an idle gap, counting resumes from this moment. */
  const markActive = useCallback(() => {
    const now = Date.now();
    if (activeSince.current !== null && now - lastActiveAt.current > IDLE_WINDOW_MS) {
      accumulatedMs.current += creditedMs(activeSince.current, lastActiveAt.current, now);
      activeSince.current = now;
    }
    lastActiveAt.current = now;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (AppState.currentState === 'active') begin(Date.now());
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (activeSince.current === null) begin(Date.now());
        else markActive();
        return;
      }
      pause(Date.now());
    });

    return () => {
      pause(Date.now());
      subscription.remove();
    };
  }, [begin, enabled, markActive, pause]);

  const elapsedSeconds = useCallback(() => {
    const totalMs = accumulatedMs.current + creditedMs(activeSince.current, lastActiveAt.current, Date.now());
    return Math.min(MAX_SESSION_SECONDS, Math.max(1, Math.round(totalMs / 1000)));
  }, []);

  const reset = useCallback(() => {
    const now = Date.now();
    accumulatedMs.current = 0;
    if (AppState.currentState === 'active') begin(now);
    else {
      activeSince.current = null;
      lastActiveAt.current = now;
    }
  }, [begin]);

  return { elapsedSeconds, markActive, reset };
}
