import { Platform } from 'react-native';

import type { ReminderSettings } from '@/state/app-state-types';

const CHANNEL_ID = 'practice-reminders';
const PRACTICE_REMINDER_KIND = 'bolo-practice-reminder';

/** Thrown when a reminder cannot be scheduled because notification permission is off. */
export class NotificationPermissionError extends Error {
  constructor(message = 'Notification permission is off. You can enable it in system settings.') {
    super(message);
    this.name = 'NotificationPermissionError';
  }
}

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
    throw new NotificationPermissionError();
  }
  // Schedule the replacement first so a scheduling failure leaves the existing
  // reminder in place instead of leaving none while settings still show one.
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'A little Hindi goes a long way',
      body: 'Your next Bolo scene and phrase review are ready.',
      data: { kind: PRACTICE_REMINDER_KIND, url: '/review' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
  });
  if (current.notificationId && current.notificationId !== notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(current.notificationId);
    } catch (error) {
      try {
        await cancelOtherPracticeReminders(notificationId, [current.notificationId]);
      } catch {
        // Keep the device at the old reminder rather than two: drop the new one and report.
        try {
          await Notifications.cancelScheduledNotificationAsync(notificationId);
        } catch {
          // The original failure is the one worth reporting.
        }
        throw error;
      }
    }
  }
  return { ...current, enabled: true, hour, minute, notificationId };
}

/** Cancel only Bolo practice reminders, retaining keepId when provided. */
export async function cancelOtherPracticeReminders(keepId: string | null, knownReminderIds: string[] = []) {
  const Notifications = loadNotifications();
  const knownIds = new Set(knownReminderIds);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const cancellations = scheduled
    .filter((request) => {
      const data = request.content.data;
      const isLegacyPracticeReminder = data?.kind == null && data?.url === '/review';
      return request.identifier !== keepId
        && (data?.kind === PRACTICE_REMINDER_KIND || isLegacyPracticeReminder || knownIds.has(request.identifier));
    })
    .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier));
  const results = await Promise.allSettled(cancellations);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) throw failure.reason;
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

export type RestoredReminderOutcome = {
  reminder: ReminderSettings;
  /** 'scheduled': rescheduled on this device; 'off': restored as off; 'not-scheduled': the backup had it on but scheduling failed, so it was restored as off; 'unchanged': this device's existing reminder could not be cancelled and was kept. */
  status: 'scheduled' | 'off' | 'not-scheduled' | 'unchanged';
};

/**
 * Apply a reminder from a progress backup. Notification ids are device-specific
 * and never restored: an enabled reminder is rescheduled with the normal
 * permission flow, and any failure leaves it off at the backed-up time.
 */
export async function applyRestoredReminder(
  current: ReminderSettings,
  restored: Pick<ReminderSettings, 'enabled' | 'hour' | 'minute'>,
): Promise<RestoredReminderOutcome> {
  if (restored.enabled) {
    try {
      return { reminder: await schedulePracticeReminder(current, restored.hour, restored.minute), status: 'scheduled' };
    } catch {
      // Fall through and restore the reminder as off.
    }
  }
  try {
    const cancelled = await cancelPracticeReminder(current);
    return {
      reminder: { ...cancelled, hour: restored.hour, minute: restored.minute },
      status: restored.enabled ? 'not-scheduled' : 'off',
    };
  } catch {
    return { reminder: current, status: 'unchanged' };
  }
}
