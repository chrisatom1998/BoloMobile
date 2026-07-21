import { Platform } from 'react-native';

import type { ReminderSettings } from '@/state/app-state-types';

const CHANNEL_ID = 'practice-reminders';

function loadNotifications(): typeof import('expo-notifications') {
  // Metro evaluates this native module only when the reminder feature is used.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications');
}

export async function schedulePracticeReminder(current: ReminderSettings, hour: number, minute = 0): Promise<ReminderSettings> {
  const Notifications = loadNotifications();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Practice reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) {
    throw new Error('Notification permission is off. You can enable it in system settings.');
  }
  if (current.notificationId) await Notifications.cancelScheduledNotificationAsync(current.notificationId);
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'A little Hindi goes a long way',
      body: 'Your next Bolo scene and phrase review are ready.',
      data: { url: '/review' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
  });
  return { enabled: true, hour, minute, notificationId };
}

export async function cancelPracticeReminder(current: ReminderSettings): Promise<ReminderSettings> {
  if (current.notificationId) {
    const Notifications = loadNotifications();
    await Notifications.cancelScheduledNotificationAsync(current.notificationId);
  }
  return { ...current, enabled: false, notificationId: null };
}

export async function clearAllPracticeReminders() {
  const Notifications = loadNotifications();
  await Notifications.cancelAllScheduledNotificationsAsync();
}
