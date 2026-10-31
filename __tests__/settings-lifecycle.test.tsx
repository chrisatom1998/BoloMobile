import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

const mockPush = jest.fn();
const mockUseAppState = jest.fn();
const mockSetMotionPreference = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('lucide-react-native', () => ({
  Activity: () => null,
  ArchiveRestore: () => null,
  Bell: () => null,
  ChevronRight: () => null,
  DatabaseBackup: () => null,
  ExternalLink: () => null,
  FileDown: () => null,
  FileText: () => null,
  LifeBuoy: () => null,
  LockKeyhole: () => null,
  Languages: () => null,
  ShieldCheck: () => null,
  Sparkles: () => null,
  Trash2: () => null,
}));

jest.mock('@/components/ai-consent-gate', () => ({
  AiConsentGate: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/app-alert', () => ({
  showAppAlert: jest.fn(),
}));

jest.mock('@/lib/public-pages', () => ({
  openPublicPage: jest.fn(async () => undefined),
}));

jest.mock('@/lib/practice-reminder', () => ({
  NotificationPermissionError: class NotificationPermissionError extends Error {},
  cancelPracticeReminder: jest.fn(async (current) => ({ ...current, enabled: false, notificationId: null })),
  clearAllPracticeReminders: jest.fn(async () => undefined),
  schedulePracticeReminder: jest.fn(async (_current, hour, minute = 0) => ({
    enabled: true,
    hour,
    minute,
    notificationId: 'test-reminder',
  })),
}));

jest.mock('@/services/bolo-api', () => ({
  deleteMobileData: jest.fn(),
}));

jest.mock('@/lib/sync-outbox', () => ({
  syncOutbox: { clear: jest.fn(async () => undefined) },
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockUseAppState(),
}));

import SettingsScreen, { formatReminderTime } from '../src/app/settings';
import { showAppAlert } from '../src/lib/app-alert';
import { cancelPracticeReminder, clearAllPracticeReminders, schedulePracticeReminder } from '../src/lib/practice-reminder';
import { syncOutbox } from '../src/lib/sync-outbox';
import { deleteMobileData } from '../src/services/bolo-api';

const showAppAlertMock = showAppAlert as jest.MockedFunction<typeof showAppAlert>;
const clearAllPracticeRemindersMock = clearAllPracticeReminders as jest.MockedFunction<typeof clearAllPracticeReminders>;
const cancelPracticeReminderMock = cancelPracticeReminder as jest.MockedFunction<typeof cancelPracticeReminder>;
const schedulePracticeReminderMock = schedulePracticeReminder as jest.MockedFunction<typeof schedulePracticeReminder>;
const deleteMobileDataMock = deleteMobileData as jest.MockedFunction<typeof deleteMobileData>;

type AlertAction = {
  onPress?: () => void;
  style?: 'cancel' | 'default' | 'destructive';
  text: string;
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function actionsFor(title: string): AlertAction[] {
  const call = showAppAlertMock.mock.calls.findLast(([alertTitle]) => alertTitle === title);
  expect(call).toBeDefined();
  return (call?.[2] ?? []) as AlertAction[];
}

function runAlertAction(title: string, actionText: string) {
  const action = actionsFor(title).find(({ text }) => text === actionText);
  expect(action?.onPress).toBeDefined();
  action?.onPress?.();
}

async function flushMicrotasks() {
  await act(async () => {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

describe('SettingsScreen lifecycle and UI', () => {
  let clearAllData: jest.MockedFunction<() => Promise<void>>;
  let setAiConsent: jest.MockedFunction<(consent: boolean) => Promise<boolean>>;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAllData = jest.fn(async () => undefined);
    setAiConsent = jest.fn(async (_consent: boolean) => true);
    mockUseAppState.mockReturnValue({
      aiConsent: true,
      clearAllData,
      clientId: 'client-12345678',
      motionPreference: 'gentle',
      setAiConsent,
      setMotionPreference: mockSetMotionPreference,
    });
    deleteMobileDataMock.mockResolvedValue({ deleted: true });
  });

  it('formats midnight and noon using twelve-hour clock labels', () => {
    expect(formatReminderTime(0)).toBe('12:00 AM');
    expect(formatReminderTime(12)).toBe('12:00 PM');
  });

  it('offers two plain movement choices and saves the selected option', async () => {
    const view = await render(<SettingsScreen />);
    const gentle = view.getByLabelText('Movement preference: Gentle');
    const reduced = view.getByLabelText('Movement preference: Reduced');

    expect(gentle.props.accessibilityState).toEqual({ disabled: false, selected: true });
    expect(StyleSheet.flatten(reduced.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(view.queryByLabelText('Movement preference: Lively')).toBeNull();
    expect(view.queryByLabelText('Movement preference: System')).toBeNull();
    expect(view.getByText('Your iPhone’s Reduce Motion setting always takes priority.')).toBeTruthy();

    await fireEvent.press(reduced);
    expect(mockSetMotionPreference).toHaveBeenCalledWith('reduced');
  });

  it('keeps Asha’s reply language and the daily practice goal editable', async () => {
    const view = await render(<SettingsScreen />);

    expect(view.getByLabelText('Asha reply language preference: English')).toBeTruthy();
    expect(view.getByLabelText('Asha reply language preference: Hindi')).toBeTruthy();
    expect(view.getByLabelText('Daily practice goal: 5 minutes a day')).toBeTruthy();
    expect(view.getByLabelText('Daily practice goal: 10 minutes a day')).toBeTruthy();
    expect(view.getByLabelText('Daily practice goal: 15 minutes a day')).toBeTruthy();
  });

  it('keeps a previously saved Lively choice visible so it can be changed', async () => {
    mockUseAppState.mockReturnValue({ ...mockUseAppState(), motionPreference: 'lively' });
    const view = await render(<SettingsScreen />);
    expect(view.getByLabelText('Movement preference: Lively').props.accessibilityState).toEqual({ disabled: false, selected: true });
    expect(view.queryByLabelText('Movement preference: System')).toBeNull();
  });

  describe('reminder changes stay consistent with the scheduled notification', () => {
    const current = { enabled: true, hour: 19, minute: 0, notificationId: 'old-reminder' };

    async function renderWithReminder(setReminder: jest.Mock) {
      mockUseAppState.mockReturnValue({ ...mockUseAppState(), reminder: current, setReminder });
      return render(<SettingsScreen />);
    }

    it('keeps the previous notification when saving a new time fails', async () => {
      const setReminder = jest.fn(async () => false);
      const view = await renderWithReminder(setReminder);

      await fireEvent.press(view.getByLabelText('Practice reminder time: 7:00 AM'));
      await flushMicrotasks();

      // Scheduled alongside the current notification, never replacing it.
      expect(schedulePracticeReminderMock).toHaveBeenCalledWith({ ...current, notificationId: null }, 7);
      expect(setReminder).toHaveBeenCalledWith({ enabled: true, hour: 7, minute: 0, notificationId: 'test-reminder' });
      // Only the orphaned replacement is cancelled; the saved setting rolled back to the old one, which still fires.
      expect(cancelPracticeReminderMock.mock.calls.map(([settings]) => settings.notificationId)).toEqual(['test-reminder']);
    });

    it('cancels the previous notification only after the new time is stored', async () => {
      const setReminder = jest.fn(async () => true);
      const view = await renderWithReminder(setReminder);

      await fireEvent.press(view.getByLabelText('Practice reminder time: 7:00 AM'));
      await flushMicrotasks();

      expect(setReminder).toHaveBeenCalledWith({ enabled: true, hour: 7, minute: 0, notificationId: 'test-reminder' });
      expect(cancelPracticeReminderMock).toHaveBeenCalledTimes(1);
      expect(cancelPracticeReminderMock).toHaveBeenCalledWith(current);
      expect(setReminder.mock.invocationCallOrder[0]).toBeLessThan(cancelPracticeReminderMock.mock.invocationCallOrder[0] ?? 0);
    });

    it('leaves the notification scheduled when saving the off setting fails', async () => {
      const setReminder = jest.fn(async () => false);
      const view = await renderWithReminder(setReminder);

      await fireEvent.press(view.getByLabelText('Practice reminder time: Off'));
      await flushMicrotasks();

      expect(setReminder).toHaveBeenCalledWith({ ...current, enabled: false, notificationId: null });
      expect(cancelPracticeReminderMock).not.toHaveBeenCalled();
      expect(schedulePracticeReminderMock).not.toHaveBeenCalled();
    });

    it('cancels the notification once the off setting is stored', async () => {
      const setReminder = jest.fn(async () => true);
      const view = await renderWithReminder(setReminder);

      await fireEvent.press(view.getByLabelText('Practice reminder time: Off'));
      await flushMicrotasks();

      expect(setReminder).toHaveBeenCalledWith({ ...current, enabled: false, notificationId: null });
      expect(cancelPracticeReminderMock).toHaveBeenCalledWith(current);
    });

    it('restores the saved reminder when the notification cannot be cancelled after turning off', async () => {
      const setReminder = jest.fn(async () => true);
      cancelPracticeReminderMock.mockRejectedValueOnce(new Error('native failure'));
      const view = await renderWithReminder(setReminder);

      await fireEvent.press(view.getByLabelText('Practice reminder time: Off'));
      await flushMicrotasks();

      await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith('Could not update reminder', 'native failure'));
      expect(setReminder).toHaveBeenNthCalledWith(1, { ...current, enabled: false, notificationId: null });
      expect(setReminder).toHaveBeenNthCalledWith(2, current);
    });
  });

  it('gives reminder choices balanced rows of two at default iPhone text size', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    const defaultIPhone = { fontScale: 1, height: 852, scale: 3, width: 393 };
    try {
      Dimensions.set({ screen: defaultIPhone, window: defaultIPhone });
      const view = await render(<SettingsScreen />);

      expect(view.getByTestId('practice-reminder-control-row-1').children).toHaveLength(2);
      expect(view.getByTestId('practice-reminder-control-row-2').children).toHaveLength(2);

      for (const label of [
        'Movement preference: Gentle',
        'Movement preference: Reduced',
        'Practice reminder time: 7:00 AM',
        'Practice reminder time: 9:00 AM',
        'Practice reminder time: 7:00 PM',
        'Practice reminder time: 8:00 PM',
      ]) {
        expect(StyleSheet.flatten(view.getByLabelText(label).props.style).minHeight).toBeGreaterThanOrEqual(44);
      }

      await view.unmount();
    } finally {
      Dimensions.set({ screen: originalScreen, window: originalWindow });
    }
  });

  it('stacks the movement choices at moderate Dynamic Type on a narrow phone', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    const narrow = { fontScale: 1.25, height: 844, scale: 1, width: 320 };
    try {
      Dimensions.set({ screen: narrow, window: narrow });
      const view = await render(<SettingsScreen />);

      const reduced = view.getByLabelText('Movement preference: Reduced');
      expect(StyleSheet.flatten(reduced.props.style).minHeight).toBeGreaterThanOrEqual(48);
      expect(view.queryByTestId('motion-preference-control-row-1')).toBeNull();
      expect(view.getByTestId('motion-preference-control').children).toHaveLength(2);
      await view.unmount();
    } finally {
      Dimensions.set({ screen: originalScreen, window: originalWindow });
    }
  });

  it('deletes remote reports before local data, then reports success', async () => {
    const remoteDeletion = deferred<{ deleted: true }>();
    deleteMobileDataMock.mockReturnValue(remoteDeletion.promise);
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Delete my Bolo data' }));
    await act(async () => runAlertAction('Delete your Bolo data?', 'Delete data'));

    expect(deleteMobileDataMock).toHaveBeenCalledTimes(1);
    expect(deleteMobileDataMock).toHaveBeenCalledWith('client-12345678', expect.any(AbortSignal));
    // Queued reports are dropped first, so no retry can file one after the server deletion.
    expect(syncOutbox.clear).toHaveBeenCalledTimes(1);
    expect((syncOutbox.clear as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(deleteMobileDataMock.mock.invocationCallOrder[0]!);
    expect(clearAllData).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Deleting…' }).props.accessibilityState).toEqual({ disabled: true });

    remoteDeletion.resolve({ deleted: true });
    await waitFor(() => expect(clearAllData).toHaveBeenCalledTimes(1));
    expect(clearAllPracticeRemindersMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith(
      'Bolo data deleted',
      expect.stringContaining('new random app identifier'),
    ));
    expect(view.getByRole('button', { name: 'Delete my Bolo data' }).props.accessibilityState).toEqual({ disabled: false });
  });

  it('preserves local data and the current identifier when remote deletion fails', async () => {
    deleteMobileDataMock.mockRejectedValueOnce(new Error('Deletion service unavailable.'));
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Delete my Bolo data' }));
    await act(async () => runAlertAction('Delete your Bolo data?', 'Delete data'));

    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith(
      'Could not delete data',
      'Deletion service unavailable.',
    ));
    expect(deleteMobileDataMock).toHaveBeenCalledWith('client-12345678', expect.any(AbortSignal));
    expect(clearAllPracticeRemindersMock).not.toHaveBeenCalled();
    expect(clearAllData).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Delete my Bolo data' }).props.accessibilityState).toEqual({ disabled: false });
  });

  it('keeps local reminder state available for retry when system cancellation fails', async () => {
    clearAllPracticeRemindersMock.mockRejectedValueOnce(new Error('Reminder cancellation failed.'));
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Delete my Bolo data' }));
    await act(async () => runAlertAction('Delete your Bolo data?', 'Delete data'));

    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith(
      'Could not delete data',
      'Reminder cancellation failed.',
    ));
    expect(clearAllData).not.toHaveBeenCalled();
  });

  it('surfaces a local-clear failure without claiming deletion succeeded', async () => {
    clearAllData.mockRejectedValueOnce(new Error('Local data was left in place.'));
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Delete my Bolo data' }));
    await act(async () => runAlertAction('Delete your Bolo data?', 'Delete data'));

    await waitFor(() => expect(clearAllData).toHaveBeenCalledTimes(1));
    expect(deleteMobileDataMock).toHaveBeenCalledTimes(1);
    expect(showAppAlertMock).toHaveBeenCalledWith('Could not delete data', 'Local data was left in place.');
    expect(showAppAlertMock).not.toHaveBeenCalledWith('Bolo data deleted', expect.any(String));
    expect(view.getByRole('button', { name: 'Delete my Bolo data' }).props.accessibilityState).toEqual({ disabled: false });
  });

  it('locks duplicate deletion submissions while the first request is pending', async () => {
    const remoteDeletion = deferred<{ deleted: true }>();
    deleteMobileDataMock.mockReturnValue(remoteDeletion.promise);
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Delete my Bolo data' }));
    const submit = actionsFor('Delete your Bolo data?').find(({ text }) => text === 'Delete data')?.onPress;
    expect(submit).toBeDefined();
    await act(async () => {
      submit?.();
      submit?.();
      await Promise.resolve();
    });

    expect(deleteMobileDataMock).toHaveBeenCalledTimes(1);
    remoteDeletion.resolve({ deleted: true });
    await waitFor(() => expect(clearAllData).toHaveBeenCalledTimes(1));
  });

  it('aborts an in-flight deletion when the screen unmounts', async () => {
    let requestSignal: AbortSignal | undefined;
    deleteMobileDataMock.mockImplementation((_clientId, signal) => {
      requestSignal = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(Object.assign(new Error('Canceled'), { name: 'AbortError' })), { once: true });
      });
    });
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Delete my Bolo data' }));
    await act(async () => runAlertAction('Delete your Bolo data?', 'Delete data'));
    expect(requestSignal?.aborted).toBe(false);

    await view.unmount();
    expect(requestSignal?.aborted).toBe(true);
    await flushMicrotasks();
    expect(clearAllData).not.toHaveBeenCalled();
    expect(showAppAlertMock).not.toHaveBeenCalledWith('Could not delete data', expect.any(String));
  });

  it('persists consent withdrawal before reporting success and exposes its pending state', async () => {
    const withdrawal = deferred<boolean>();
    setAiConsent.mockReturnValue(withdrawal.promise);
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Withdraw consent' }));
    await act(async () => runAlertAction('Withdraw AI processing consent?', 'Withdraw'));

    expect(setAiConsent).toHaveBeenCalledWith(false);
    const pending = view.getByRole('button', { name: 'Saving…' });
    expect(pending.props.accessibilityState).toEqual({ disabled: true });
    expect(StyleSheet.flatten(pending.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(showAppAlertMock).not.toHaveBeenCalledWith('AI consent withdrawn', expect.any(String));

    withdrawal.resolve(true);
    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith(
      'AI consent withdrawn',
      'Connected AI features are now disabled.',
    ));
    expect(view.getByRole('button', { name: 'Withdraw consent' }).props.accessibilityState).toEqual({ disabled: false });
  });

  it('locks duplicate consent withdrawals while the first save is pending', async () => {
    const withdrawal = deferred<boolean>();
    setAiConsent.mockReturnValue(withdrawal.promise);
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Withdraw consent' }));
    const submit = actionsFor('Withdraw AI processing consent?').find(({ text }) => text === 'Withdraw')?.onPress;
    expect(submit).toBeDefined();
    await act(async () => {
      submit?.();
      submit?.();
      await Promise.resolve();
    });

    expect(setAiConsent).toHaveBeenCalledTimes(1);
    withdrawal.resolve(true);
    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith(
      'AI consent withdrawn',
      'Connected AI features are now disabled.',
    ));
  });

  it('does not claim consent was withdrawn when persistence fails', async () => {
    setAiConsent.mockResolvedValueOnce(false);
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Withdraw consent' }));
    await act(async () => runAlertAction('Withdraw AI processing consent?', 'Withdraw'));
    await flushMicrotasks();

    expect(setAiConsent).toHaveBeenCalledWith(false);
    expect(showAppAlertMock).not.toHaveBeenCalledWith('AI consent withdrawn', expect.any(String));
    expect(view.getByRole('button', { name: 'Withdraw consent' }).props.accessibilityState).toEqual({ disabled: false });
  });

  it('exposes core navigation roles and 44 point destructive actions', async () => {
    const view = await render(<SettingsScreen />);
    const withdraw = view.getByRole('button', { name: 'Withdraw consent' });
    const deletion = view.getByRole('button', { name: 'Delete my Bolo data' });

    expect(StyleSheet.flatten(withdraw.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(deletion.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(view.getByRole('button', { name: /Privacy & data use/u })).toBeTruthy();
    expect(view.getByRole('link', { name: /Public Privacy Policy/u })).toBeTruthy();
    expect(view.getByRole('link', { name: /Support/u })).toBeTruthy();
    expect(view.getByRole('link', { name: /Terms of Use/u })).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: /Privacy & data use/u }));
    expect(mockPush).toHaveBeenCalledWith('/privacy');
  });

  it('stacks settings rows and keeps link-card copy full width at accessibility text sizes', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 2 }, window: { ...window, fontScale: 2 } }));

    try {
      const view = await render(<SettingsScreen />);
      expect(StyleSheet.flatten(view.getByTestId('settings-learning-row').props.style)).toMatchObject({ alignItems: 'flex-start', flexDirection: 'column' });
      expect(StyleSheet.flatten(view.getByTestId('settings-learning-copy').props.style)).toMatchObject({ flex: 0, width: '100%' });
      expect(StyleSheet.flatten(view.getByTestId('settings-privacy-link').props.style)).toMatchObject({ alignItems: 'flex-start', flexDirection: 'column' });
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });
});
