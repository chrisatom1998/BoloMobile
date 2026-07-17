import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export function useForegroundTimer() {
  const accumulatedMs = useRef(0);
  const activeSince = useRef<number | null>(null);

  useEffect(() => {
    if (AppState.currentState === 'active') activeSince.current = Date.now();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (activeSince.current === null) activeSince.current = Date.now();
        return;
      }
      const started = activeSince.current;
      if (started !== null) accumulatedMs.current += Math.max(0, Date.now() - started);
      activeSince.current = null;
    });

    return () => {
      const started = activeSince.current;
      if (started !== null) accumulatedMs.current += Math.max(0, Date.now() - started);
      activeSince.current = null;
      subscription.remove();
    };
  }, []);

  const elapsedSeconds = useCallback(() => {
    const activeMs = activeSince.current === null ? 0 : Math.max(0, Date.now() - activeSince.current);
    return Math.max(1, Math.round((accumulatedMs.current + activeMs) / 1000));
  }, []);

  const reset = useCallback(() => {
    accumulatedMs.current = 0;
    activeSince.current = AppState.currentState === 'active' ? Date.now() : null;
  }, []);

  return { elapsedSeconds, reset };
}
