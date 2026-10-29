import { useCallback, useEffect, useRef } from 'react';

/**
 * If the platform never reports that the sheet finished closing, release it
 * after the slide or fade would have ended.
 */
export const SHEET_EXIT_FALLBACK_MS = 500;

/**
 * Calls `onDismissed` once, after a visible sheet has closed. Reopening
 * cancels a close that has not finished yet.
 */
export function useSheetDismiss(visible: boolean, onDismissed?: () => void) {
  const onDismissedRef = useRef(onDismissed);
  const visibleRef = useRef(visible);
  const openedRef = useRef(false);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current || visibleRef.current || !openedRef.current) return;
    finishedRef.current = true;
    onDismissedRef.current?.();
  }, []);

  useEffect(() => {
    onDismissedRef.current = onDismissed;
  }, [onDismissed]);

  useEffect(() => {
    visibleRef.current = visible;
    if (visible) {
      openedRef.current = true;
      finishedRef.current = false;
      return;
    }
    if (!openedRef.current) return;
    const timer = setTimeout(finish, SHEET_EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [finish, visible]);

  return finish;
}
