import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

function localDayKey(now = new Date()) {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/**
 * The local calendar day as a stable key. It changes at midnight and when the
 * app returns to the foreground on a later day, so day-sensitive memos on
 * always-mounted tabs can list it as a dependency.
 */
export function useCalendarDay() {
  const [day, setDay] = useState(localDayKey);

  useEffect(() => {
    const refresh = () => setDay((current) => {
      const next = localDayKey();
      return next === current ? current : next;
    });
    let timer: ReturnType<typeof setTimeout>;
    // Re-arm after each fire: a clock or time zone change can make the timer
    // fire on the same local day, which would not re-run this effect.
    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(() => {
        refresh();
        scheduleMidnight();
      }, nextMidnight.getTime() - now.getTime() + 1000);
    };
    scheduleMidnight();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [day]);

  return day;
}
