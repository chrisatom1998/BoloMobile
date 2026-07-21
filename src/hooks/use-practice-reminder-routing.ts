import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const PRACTICE_REMINDER_ROUTE = '/review' as const;

type NotificationResponseLike = {
  actionIdentifier: string;
  notification: {
    request: {
      content: { data?: Record<string, unknown> | null };
      identifier: string;
    };
  };
};

export function practiceReminderRoute(response: NotificationResponseLike, defaultActionIdentifier: string) {
  if (response.actionIdentifier !== defaultActionIdentifier) return null;
  return response.notification.request.content.data?.url === PRACTICE_REMINDER_ROUTE
    ? PRACTICE_REMINDER_ROUTE
    : null;
}

export function usePracticeReminderRouting(enabled: boolean) {
  const router = useRouter();
  const handledResponseIds = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    let active = true;
    let subscription: { remove(): void } | null = null;
    let Notifications: typeof import('expo-notifications');
    try {
      // Keep the native module out of web startup while retaining notification
      // routing in iOS and Android production builds.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Notifications = require('expo-notifications');
    } catch {
      return;
    }
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    const handle = (response: NotificationResponseLike) => {
      const responseId = response.notification.request.identifier;
      if (!active || handledResponseIds.current.has(responseId)) return;
      const route = practiceReminderRoute(response, Notifications.DEFAULT_ACTION_IDENTIFIER);
      if (!route) return;
      handledResponseIds.current.add(responseId);
      router.push(route);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };

    subscription = Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync()
      .then((initialResponse) => { if (initialResponse) handle(initialResponse); })
      .catch(() => undefined);

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [enabled, router]);
}
