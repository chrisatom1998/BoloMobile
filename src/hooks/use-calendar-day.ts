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
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime() + 1000);
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
