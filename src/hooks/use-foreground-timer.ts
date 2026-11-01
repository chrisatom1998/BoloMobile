import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/** Time with no tap, answer or turn after which the learner counts as gone. */
export const IDLE_LIMIT_MS = 2 * 60 * 1000;

/**
 * Counts study time only while the app is in the foreground AND the learner is
 * doing something. Call `touch()` on each answer, turn or tap. A screen left
 * open on a table adds at most IDLE_LIMIT_MS after the last touch.
 */
export function useForegroundTimer(enabled = true) {
  const accumulatedMs = useRef(0);
  // Start of the current foreground run and the last time the learner did anything in it.
  const activeSince = useRef<number | null>(null);
  const lastTouch = useRef(0);

  const runMs = (now: number) => {
    const started = activeSince.current;
    if (started === null) return 0;
    const lastActive = Math.max(started, lastTouch.current);
    return Math.max(0, lastActive - started) + Math.min(IDLE_LIMIT_MS, Math.max(0, now - lastActive));
  };

  const touch = useCallback(() => {
    const now = Date.now();
    if (activeSince.current === null) return;
    // Away longer than the idle limit: bank the credited part and start a fresh run.
    if (now - Math.max(activeSince.current, lastTouch.current) > IDLE_LIMIT_MS) {
      accumulatedMs.current += runMs(now);
      activeSince.current = now;
    }
    lastTouch.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const begin = () => {
      const now = Date.now();
      activeSince.current = now;
      lastTouch.current = now;
    };
    const end = () => {
      accumulatedMs.current += runMs(Date.now());
      activeSince.current = null;
    };
    if (AppState.currentState === 'active') begin();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (activeSince.current === null) begin();
        return;
      }
      end();
    });

    return () => {
      end();
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const elapsedSeconds = useCallback(() => {
    return Math.max(1, Math.round((accumulatedMs.current + runMs(Date.now())) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    accumulatedMs.current = 0;
    if (AppState.currentState === 'active') {
      const now = Date.now();
      activeSince.current = now;
      lastTouch.current = now;
    } else {
      activeSince.current = null;
    }
  }, []);

  return { elapsedSeconds, reset, touch };
}
