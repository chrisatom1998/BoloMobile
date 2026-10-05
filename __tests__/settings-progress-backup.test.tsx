import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

const mockUseAppState = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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

jest.mock('@/lib/app-alert', () => ({ showAppAlert: jest.fn() }));
jest.mock('@/lib/public-pages', () => ({ openPublicPage: jest.fn(async () => undefined) }));
jest.mock('@/services/bolo-api', () => ({ deleteMobileData: jest.fn() }));

jest.mock('@/lib/practice-reminder', () => ({
  applyRestoredReminder: jest.fn(),
  cancelPracticeReminder: jest.fn(),
  clearAllPracticeReminders: jest.fn(),
  schedulePracticeReminder: jest.fn(),
}));

jest.mock('@/lib/progress-backup-file', () => {
  class ProgressBackupFileError extends Error {}
  return {
    ProgressBackupFileError,
    pickProgressBackupText: jest.fn(),
    shareProgressBackup: jest.fn(async () => undefined),
  };
});

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockUseAppState(),
}));

import SettingsScreen from '../src/app/settings';
import { showAppAlert } from '../src/lib/app-alert';
import { applyRestoredReminder } from '../src/lib/practice-reminder';
import { parseProgressBackup, serializeProgressBackup } from '../src/lib/progress-backup';
import { pickProgressBackupText, ProgressBackupFileError, shareProgressBackup } from '../src/lib/progress-backup-file';
import { createAiConsentRecord, dateKey, defaultLearnerProfile } from '../src/lib/storage';

const showAppAlertMock = showAppAlert as jest.MockedFunction<typeof showAppAlert>;
const shareMock = shareProgressBackup as jest.MockedFunction<typeof shareProgressBackup>;
const pickMock = pickProgressBackupText as jest.MockedFunction<typeof pickProgressBackupText>;
const applyReminderMock = applyRestoredReminder as jest.MockedFunction<typeof applyRestoredReminder>;

const deviceReminder = { enabled: true, hour: 9, minute: 0, notificationId: 'device-notification' };

function learningState() {
  return {
    phrases: [{ hi: 'नमस्ते', latin: 'namaste', en: 'Hello' }],
    goal: 15 as const,
    practice: { date: dateKey(), chaiDone: true, liveDone: false, seconds: 120 },
    streakDays: [dateKey()],
    learnerProfile: { ...defaultLearnerProfile(), completed: true },
    sceneProgress: {},
    phraseReviews: {},
    practiceHistory: [],
    reviewStreakDays: [],
    motionPreference: 'gentle' as const,
  };
}

function backupText(reminder = { enabled: true, hour: 20, minute: 15, notificationId: null }) {
  return serializeProgressBackup({ ...learningState(), goal: 5, reminder }, new Date('2026-10-01T12:00:00.000Z'));
}

type AlertAction = { onPress?: () => void; style?: string; text: string };

function actionsFor(title: string): AlertAction[] {
  const call = showAppAlertMock.mock.calls.findLast(([alertTitle]) => alertTitle === title);
  expect(call).toBeDefined();
  return (call?.[2] ?? []) as AlertAction[];
}

describe('SettingsScreen progress backup', () => {
  let restoreProgress: jest.Mock;
  let setReminder: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    restoreProgress = jest.fn(async () => true);
    setReminder = jest.fn();
    mockUseAppState.mockReturnValue({
      ...learningState(),
      aiConsent: true,
      aiConsentRecord: createAiConsentRecord(),
      chatHistory: [{ id: 'asha-1', role: 'asha', text: 'Secret chat', language: 'en' }],
      clearAllData: jest.fn(),
      clientId: 'client-12345678',
      reminder: deviceReminder,
      restoreProgress,
      setAiConsent: jest.fn(),
      setMotionPreference: jest.fn(),
      setReminder,
      updateLearnerProfile: jest.fn(),
    });
    applyReminderMock.mockResolvedValue({ reminder: { enabled: true, hour: 20, minute: 15, notificationId: 'new-id' }, status: 'scheduled' });
  });

  it('renders accessible export and restore buttons with comfortable touch targets', async () => {
    const view = await render(<SettingsScreen />);

    for (const name of ['Export progress', 'Restore from backup']) {
      const button = view.getByRole('button', { name });
      expect(button.props.accessibilityState).toEqual({ disabled: false, busy: false });
      expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
    expect(view.getByText(/does not include your random app identifier, AI consent choice, or Asha chat history/u)).toBeTruthy();
  });

  it('exports only learning progress through the share sheet', async () => {
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Export progress' }));

    await waitFor(() => expect(shareMock).toHaveBeenCalledTimes(1));
    const [contents, fileName] = shareMock.mock.calls[0]!;
    expect(fileName).toMatch(/^bolo-progress-\d{4}-\d{2}-\d{2}\.json$/u);
    const parsed = parseProgressBackup(contents);
    expect(parsed.ok && parsed.backup.data.phrases).toEqual(learningState().phrases);
    expect(parsed.ok && parsed.backup.data.reminder).toEqual({ enabled: true, hour: 9, minute: 0 });
    for (const secret of ['client-12345678', 'Secret chat', 'device-notification', 'acceptedAt']) {
      expect(contents).not.toContain(secret);
    }
    expect(showAppAlertMock).not.toHaveBeenCalled();
  });

  it('explains export failures with a friendly message', async () => {
    shareMock.mockRejectedValueOnce(new ProgressBackupFileError('Sharing is not available on this device.'));
    const view = await render(<SettingsScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Export progress' }));
    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith('Could not export progress', 'Sharing is not available on this device.'));

    shareMock.mockRejectedValueOnce(new Error('NSInternalInconsistencyException'));
    await fireEvent.press(view.getByRole('button', { name: 'Export progress' }));
    await waitFor(() => expect(showAppAlertMock).toHaveBeenLastCalledWith('Could not export progress', expect.stringContaining('could not open the share sheet')));
    expect(view.getByRole('button', { name: 'Export progress' }).props.accessibilityState).toEqual({ disabled: false, busy: false });
  });

  it('does nothing when the learner cancels the file picker', async () => {
    pickMock.mockResolvedValueOnce(null);
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Restore from backup' }));

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));
    expect(showAppAlertMock).not.toHaveBeenCalled();
    expect(restoreProgress).not.toHaveBeenCalled();
  });

  it('rejects an invalid file without changing progress', async () => {
    pickMock.mockResolvedValueOnce('{"format":"something-else"}');
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Restore from backup' }));

    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith('Could not restore progress', expect.stringContaining('not a Bolo progress backup')));
    expect(restoreProgress).not.toHaveBeenCalled();
  });

  it('surfaces picker read errors', async () => {
    pickMock.mockRejectedValueOnce(new ProgressBackupFileError('This backup file is larger than 2 MB.'));
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Restore from backup' }));

    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith('Could not restore progress', 'This backup file is larger than 2 MB.'));
  });

  it('asks for confirmation and keeps progress when the learner cancels', async () => {
    pickMock.mockResolvedValueOnce(backupText());
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Restore from backup' }));
    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith(
      'Replace progress on this device?',
      expect.stringContaining('replaces the saved phrases'),
      expect.any(Array),
    ));
    const cancel = actionsFor('Replace progress on this device?').find(({ style }) => style === 'cancel');
    expect(cancel?.onPress).toBeUndefined();
    expect(restoreProgress).not.toHaveBeenCalled();
  });

  it('restores progress, then reschedules the reminder through the existing reminder flow', async () => {
    pickMock.mockResolvedValueOnce(backupText());
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Restore from backup' }));
    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith('Replace progress on this device?', expect.any(String), expect.any(Array)));
    await act(async () => actionsFor('Replace progress on this device?').find(({ text }) => text === 'Restore')?.onPress?.());

    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith('Progress restored', expect.stringContaining('now on this device')));
    const restored = restoreProgress.mock.calls[0]![0] as Record<string, unknown>;
    expect(restored.goal).toBe(5);
    expect(restored).not.toHaveProperty('reminder');
    expect(restored).not.toHaveProperty('clientId');
    expect(applyReminderMock).toHaveBeenCalledWith(deviceReminder, { enabled: true, hour: 20, minute: 15 });
    expect(setReminder).toHaveBeenCalledWith({ enabled: true, hour: 20, minute: 15, notificationId: 'new-id' });
    expect(restoreProgress.mock.invocationCallOrder[0]!).toBeLessThan(applyReminderMock.mock.invocationCallOrder[0]!);
  });

  it('explains when a restored reminder could not be scheduled', async () => {
    applyReminderMock.mockResolvedValueOnce({ reminder: { enabled: false, hour: 20, minute: 15, notificationId: null }, status: 'not-scheduled' });
    pickMock.mockResolvedValueOnce(backupText());
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Restore from backup' }));
    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith('Replace progress on this device?', expect.any(String), expect.any(Array)));
    await act(async () => actionsFor('Replace progress on this device?').find(({ text }) => text === 'Restore')?.onPress?.());

    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith('Progress restored', expect.stringContaining('restored as off')));
    expect(setReminder).toHaveBeenCalledWith({ enabled: false, hour: 20, minute: 15, notificationId: null });
  });

  it('leaves reminders alone and claims no success when saving the restore fails', async () => {
    restoreProgress.mockResolvedValueOnce(false);
    pickMock.mockResolvedValueOnce(backupText());
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Restore from backup' }));
    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith('Replace progress on this device?', expect.any(String), expect.any(Array)));
    await act(async () => actionsFor('Replace progress on this device?').find(({ text }) => text === 'Restore')?.onPress?.());

    await waitFor(() => expect(restoreProgress).toHaveBeenCalledTimes(1));
    expect(applyReminderMock).not.toHaveBeenCalled();
    expect(setReminder).not.toHaveBeenCalled();
    expect(showAppAlertMock).not.toHaveBeenCalledWith('Progress restored', expect.any(String));
    expect(view.getByRole('button', { name: 'Restore from backup' }).props.accessibilityState).toEqual({ disabled: false, busy: false });
  });
});
