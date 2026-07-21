/* eslint-disable import/first */

const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockSchedule = jest.fn();
const mockCancel = jest.fn();
const mockCancelAll = jest.fn();

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
  cancelScheduledNotificationAsync: (...args: unknown[]) => mockCancel(...args),
  cancelAllScheduledNotificationsAsync: () => mockCancelAll(),
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
  scheduleNotificationAsync: (...args: unknown[]) => mockSchedule(...args),
  setNotificationChannelAsync: jest.fn(),
}));

import { cancelPracticeReminder, clearAllPracticeReminders, schedulePracticeReminder } from '../src/lib/practice-reminder';

describe('practice reminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPermissions.mockResolvedValue({ granted: true });
    mockSchedule.mockResolvedValue('reminder-1');
  });

  it('schedules a daily local reminder with the review destination', async () => {
    const result = await schedulePracticeReminder({ enabled: false, hour: 19, minute: 0, notificationId: null }, 20, 15);

    expect(result).toEqual({ enabled: true, hour: 20, minute: 15, notificationId: 'reminder-1' });
    expect(mockSchedule).toHaveBeenCalledWith({
      content: {
        title: 'A little Hindi goes a long way',
        body: 'Your next Bolo scene and phrase review are ready.',
        data: { url: '/review' },
      },
      trigger: { type: 'daily', hour: 20, minute: 15 },
    });
  });

  it('requests permission when needed and rejects a denied request', async () => {
    mockGetPermissions.mockResolvedValue({ granted: false });
    mockRequestPermissions.mockResolvedValue({ granted: false, ios: { status: 1 } });

    await expect(schedulePracticeReminder({ enabled: false, hour: 19, minute: 0, notificationId: null }, 19)).rejects.toThrow(
      'Notification permission is off.',
    );
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('cancels the scheduled notification and clears its identifier', async () => {
    const result = await cancelPracticeReminder({ enabled: true, hour: 20, minute: 15, notificationId: 'reminder-1' });

    expect(mockCancel).toHaveBeenCalledWith('reminder-1');
    expect(result).toEqual({ enabled: false, hour: 20, minute: 15, notificationId: null });
  });

  it('removes every scheduled reminder during data deletion', async () => {
    await clearAllPracticeReminders();

    expect(mockCancelAll).toHaveBeenCalledTimes(1);
  });
});
