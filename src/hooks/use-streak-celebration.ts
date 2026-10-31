import { useEffect, useRef } from 'react';

import { hapticStreak } from '@/lib/haptics';

/**
 * A quiet tap the first time the streak grows after this screen is ready.
 * The opening value is remembered and not celebrated, so a launch does not buzz.
 */
export function useStreakCelebration(streak: number, ready: boolean) {
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (seen.current === null) {
      seen.current = streak;
      return;
    }
    if (streak > seen.current) hapticStreak();
    seen.current = streak;
  }, [ready, streak]);
}
