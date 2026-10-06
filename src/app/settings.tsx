import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { Activity, ArchiveRestore, Bell, ChevronRight, DatabaseBackup, ExternalLink, FileDown, FileText, Languages, LifeBuoy, LockKeyhole, ShieldCheck, Sparkles, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { SegmentedControl } from '@/components/segmented-control';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { showAppAlert } from '@/lib/app-alert';
import { openPublicPage, type PublicPage } from '@/lib/public-pages';
import { observe } from '@/lib/observability';
import { applyRestoredReminder, cancelPracticeReminder, clearAllPracticeReminders, schedulePracticeReminder } from '@/lib/practice-reminder';
import { parseProgressBackup, progressBackupFileName, serializeProgressBackup, type ProgressBackup } from '@/lib/progress-backup';
import { pickProgressBackupText, ProgressBackupFileError, shareProgressBackup } from '@/lib/progress-backup-file';
import { DEFAULT_MOTION_PREFERENCE, defaultLearnerProfile, defaultReminderSettings } from '@/lib/storage';
import { deleteMobileData } from '@/services/bolo-api';
import { useAppState } from '@/state/app-state';
import type { MotionPreference, ReminderSettings } from '@/state/app-state-types';
import { makeStyles, radius, spacing, useSharedStyles, useTheme } from '@/theme';

export function formatReminderTime(hour: number, minute = 0) {
  const normalizedHour = Math.min(23, Math.max(0, Math.round(hour)));
  const normalizedMinute = Math.min(59, Math.max(0, Math.round(minute)));
  return `${normalizedHour % 12 || 12}:${String(normalizedMinute).padStart(2, '0')} ${normalizedHour >= 12 ? 'PM' : 'AM'}`;
}

const motionDescriptions: Record<MotionPreference, string> = {
  system: 'Follows your iPhone’s Reduce Motion setting.',
  gentle: 'Uses calm, short transitions. This is Bolo’s default.',
  lively: 'Adds more movement to progress, feedback, captions, and the voice orb.',
  reduced: 'Turns off nonessential movement.',
};

export default function SettingsScreen() {
  const router = useRouter();
  const state = useAppState();
  const { colors } = useTheme();
  const sharedStyles = useSharedStyles();
  const styles = useStyles();
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const largeTextLayout = useLargeTextLayout();
  const { aiConsent, clearAllData, clientId, setAiConsent } = state;
  const learnerProfile = state.learnerProfile ?? { ...defaultLearnerProfile(), completed: true };
  const reminder = state.reminder ?? defaultReminderSettings();
  const motionPreference = state.motionPreference ?? DEFAULT_MOTION_PREFERENCE;
  const stackMotionPreferences = fontScale >= 1.2 || windowWidth < 360;
  const { restoreProgress, setMotionPreference, setReminder, updateLearnerProfile } = state;
  const [deleting, setDeleting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [backupBusy, setBackupBusy] = useState<'export' | 'restore' | null>(null);
  const backupInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const deletionRef = useRef<AbortController | null>(null);
  const deletionInFlightRef = useRef(false);
  const withdrawalInFlightRef = useRef(false);

  useEffect(() => () => {
    mountedRef.current = false;
    deletionRef.current?.abort();
  }, []);

  function withdraw() {
    if (withdrawing) return;
    showAppAlert(
      'Withdraw AI processing consent?',
      'AI Listen, typed coaching, live voice, and pronunciation feedback will stop working until you consent again. Written scenes and saved phrases still work offline.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Withdraw', style: 'destructive', onPress: () => void performWithdrawal() },
      ],
    );
  }

  async function performWithdrawal() {
    if (withdrawalInFlightRef.current) return;
    withdrawalInFlightRef.current = true;
    setWithdrawing(true);
    try {
      const saved = await setAiConsent(false);
      if (saved && mountedRef.current) {
        observe('consent_declined');
        showAppAlert('AI consent withdrawn', 'Connected AI features are now disabled.');
      }
    } finally {
      withdrawalInFlightRef.current = false;
      if (mountedRef.current) setWithdrawing(false);
    }
  }

  function openPage(page: PublicPage, title: string) {
    void openPublicPage(page).catch((error: unknown) => {
      showAppAlert(`Could not open ${title}`, error instanceof Error ? error.message : 'Check your connection and try again.');
    });
  }

  async function performDeletion() {
    if (deletionInFlightRef.current) return;
    deletionInFlightRef.current = true;
    setDeleting(true);
    const controller = new AbortController();
    deletionRef.current = controller;
    try {
      await deleteMobileData(clientId, controller.signal);
      await clearAllPracticeReminders();
      await clearAllData();
      if (mountedRef.current) {
        showAppAlert('Bolo data deleted', 'Stored reports and data on this device were deleted. Bolo created a new random app identifier.');
      }
    } catch (error) {
      if (mountedRef.current && !controller.signal.aborted) {
        showAppAlert(
          'Could not delete data',
          error instanceof Error ? error.message : 'Your data and current identifier were kept so you can try again.',
        );
      }
    } finally {
      if (deletionRef.current === controller) {
        deletionRef.current = null;
        deletionInFlightRef.current = false;
      }
      if (mountedRef.current) setDeleting(false);
    }
  }

  function confirmDeletion() {
    showAppAlert(
      'Delete your Bolo data?',
      'This permanently deletes reports tied to this installation, recent Asha chat history, saved phrases, practice progress, your consent choice, and the current random app identifier.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete data', style: 'destructive', onPress: () => void performDeletion() },
      ],
    );
  }

  async function changeReminder(hour?: number) {
    if (savingReminder) return;
    setSavingReminder(true);
    try {
      const next = hour === undefined
        ? await cancelPracticeReminder(reminder)
        : await schedulePracticeReminder(reminder, hour);
      setReminder(next);
    } catch (error) {
      showAppAlert('Could not update reminder', error instanceof Error ? error.message : 'Try again from system settings.');
    } finally {
      if (mountedRef.current) setSavingReminder(false);
    }
  }

  function backupErrorMessage(error: unknown, fallback: string) {
    return error instanceof ProgressBackupFileError ? error.message : fallback;
  }

  async function exportProgress() {
    if (backupInFlightRef.current) return;
    backupInFlightRef.current = true;
    setBackupBusy('export');
    try {
      await shareProgressBackup(serializeProgressBackup({ ...state, reminder }), progressBackupFileName());
    } catch (error) {
      if (mountedRef.current) {
        showAppAlert('Could not export progress', backupErrorMessage(error, 'Bolo could not open the share sheet. Try again in a moment.'));
      }
    } finally {
      backupInFlightRef.current = false;
      if (mountedRef.current) setBackupBusy(null);
    }
  }

  async function chooseBackup() {
    if (backupInFlightRef.current) return;
    backupInFlightRef.current = true;
    setBackupBusy('restore');
    let backup: ProgressBackup | null = null;
    try {
      const text = await pickProgressBackupText();
      if (text === null || !mountedRef.current) return;
      const parsed = parseProgressBackup(text);
      if (!parsed.ok) {
        showAppAlert('Could not restore progress', parsed.error);
        return;
      }
      backup = parsed.backup;
    } catch (error) {
      if (mountedRef.current) {
        showAppAlert('Could not restore progress', backupErrorMessage(error, 'Bolo could not open that file. Try again or choose a different backup.'));
      }
    } finally {
      backupInFlightRef.current = false;
      if (mountedRef.current) setBackupBusy(null);
    }
    if (backup && mountedRef.current) confirmRestore(backup);
  }

  function confirmRestore(backup: ProgressBackup) {
    // Shown after the picker guard is released: the web alert runs onPress synchronously.
    const exported = new Date(backup.exportedAt).toLocaleDateString();
    showAppAlert(
      'Replace progress on this device?',
      `Restoring the backup from ${exported} replaces the saved phrases, reviews, scene progress, streaks, goal, and learning preferences on this device. Your AI consent choice and Asha chat history are not changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => void performRestore(backup) },
      ],
    );
  }

  // A failed reminder save rolls state back to the device's previous reminder, whose
  // notification applyRestoredReminder may already have cancelled. Drop the replacement
  // notification and reschedule the previous reminder so OS and saved state agree.
  async function revertRestoredReminder(replacement: ReminderSettings) {
    if (replacement.notificationId && replacement.notificationId !== reminder.notificationId) {
      await cancelPracticeReminder(replacement).catch(() => undefined);
    }
    if (!reminder.enabled) return;
    try {
      const rescheduled = await schedulePracticeReminder({ ...reminder, notificationId: null }, reminder.hour, reminder.minute);
      if (!(await setReminder(rescheduled))) await cancelPracticeReminder(rescheduled).catch(() => undefined);
    } catch {
      // Leave the reminder as it was saved; the alert asks the learner to check it.
    }
  }

  async function performRestore(backup: ProgressBackup) {
    if (backupInFlightRef.current) return;
    backupInFlightRef.current = true;
    setBackupBusy('restore');
    try {
      const { reminder: backupReminder, ...progress } = backup.data;
      // restoreProgress reports and rolls back its own storage failures.
      if (!(await restoreProgress(progress))) return;
      const outcome = await applyRestoredReminder(reminder, backupReminder);
      if (!(await setReminder(outcome.reminder))) {
        await revertRestoredReminder(outcome.reminder);
        if (mountedRef.current) {
          showAppAlert('Progress restored', 'Your learning progress from the backup is now on this device, but Bolo could not save the practice reminder. Check your reminder below.');
        }
        return;
      }
      if (!mountedRef.current) return;
      const reminderNote = outcome.status === 'not-scheduled'
        ? ' Your practice reminder was restored as off because Bolo could not schedule it. Turn it on again below.'
        : outcome.status === 'unchanged'
          ? ' Your existing practice reminder was kept.'
          : '';
      showAppAlert('Progress restored', `Your learning progress from the backup is now on this device.${reminderNote}`);
    } finally {
      backupInFlightRef.current = false;
      if (mountedRef.current) setBackupBusy(null);
    }
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <View style={styles.card}>
        <View style={[styles.row, largeTextLayout && styles.rowLarge]} testID="settings-learning-row">
          <View style={styles.icon}><Languages color={colors.ink} size={22} /></View>
          <View style={[styles.copy, largeTextLayout && styles.copyLarge]} testID="settings-learning-copy"><Text style={styles.title}>Learning preferences</Text><Text style={styles.body}>Control script and Asha’s default reply language</Text></View>
        </View>
        <Text style={styles.choiceLabel}>Hindi display</Text>
        <SegmentedControl
          accessibilityLabel="Hindi display preference"
          onValueChange={(scriptPreference) => updateLearnerProfile({ scriptPreference })}
          options={[
            { label: 'Both', value: 'both' },
            { label: 'हिन्दी', value: 'devanagari' },
            { label: 'Latin', value: 'latin' },
          ]}
          stackedAtLargeText
          value={learnerProfile.scriptPreference}
        />
        <Text style={styles.choiceLabel}>Asha replies</Text>
        <SegmentedControl
          accessibilityLabel="Asha reply language preference"
          onValueChange={(responseLanguage) => updateLearnerProfile({ responseLanguage })}
          options={[
            { label: 'English', value: 'en' },
            { label: 'Hindi', value: 'hi' },
          ]}
          stackedAtLargeText
          value={learnerProfile.responseLanguage}
        />
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/onboarding', params: { mode: 'recalibrate' } })} style={styles.secondaryButton}><Text style={styles.secondaryText}>Recalibrate my plan</Text></Pressable>
      </View>

      <View style={styles.card}>
        <View style={[styles.row, largeTextLayout && styles.rowLarge]}>
          <View style={styles.icon}><Sparkles color={colors.forest} size={22} /></View>
          <View style={[styles.copy, largeTextLayout && styles.copyLarge]}><Text style={styles.title}>Movement</Text><Text style={styles.body}>Choose how much the interface moves</Text></View>
        </View>
        <Text style={styles.choiceLabel}>Animation style</Text>
        <SegmentedControl
          accessibilityLabel="Movement preference"
          columnCount={2}
          compact
          onValueChange={setMotionPreference}
          options={[
            { label: 'System', value: 'system' },
            { label: 'Gentle', value: 'gentle' },
            { label: 'Lively', value: 'lively' },
            { label: 'Reduced', value: 'reduced' },
          ]}
          stacked={stackMotionPreferences}
          stackedAtLargeText
          testID="motion-preference-control"
          value={motionPreference}
        />
        <Text accessibilityLiveRegion="polite" style={styles.detail}>{motionDescriptions[motionPreference]}</Text>
        <Text style={styles.motionPriority}>Your iPhone’s Reduce Motion setting always takes priority.</Text>
      </View>

      <View style={styles.card}>
        <View style={[styles.row, largeTextLayout && styles.rowLarge]}>
        <View style={styles.icon}><Bell color={colors.brand} size={22} /></View>
          <View style={[styles.copy, largeTextLayout && styles.copyLarge]}><Text style={styles.title}>Practice reminder</Text><Text style={styles.body}>{reminder.enabled ? `Daily at ${formatReminderTime(reminder.hour, reminder.minute)}` : 'Off · reminders stay on this device'}</Text></View>
        </View>
        <SegmentedControl
          accessibilityLabel="Practice reminder time"
          columnCount={2}
          compact
          disabled={savingReminder}
          disabledHint="Bolo is updating your reminder."
          onValueChange={(next) => void changeReminder(next === 'off' ? undefined : Number(next))}
          options={[
            { label: 'Off', value: 'off' },
            { label: formatReminderTime(9), value: '9' },
            { label: formatReminderTime(19), value: '19' },
            { label: formatReminderTime(20), value: '20' },
          ]}
          stackedAtLargeText
          testID="practice-reminder-control"
          value={reminder.enabled ? String(reminder.hour) as '9' | '19' | '20' : 'off'}
        />
      </View>

      {aiConsent ? (
        <View style={styles.card}>
          <View style={[styles.row, largeTextLayout && styles.rowLarge]}>
            <View style={styles.icon}><ShieldCheck color={colors.forest} size={22} /></View>
            <View style={[styles.copy, largeTextLayout && styles.copyLarge]}><Text style={styles.title}>AI coaching consent</Text><Text style={styles.body}>Enabled for the current privacy notice</Text></View>
          </View>
          <Text style={styles.detail}>After consent, Listen text, typed messages, active live voice turns, and pronunciation recordings are processed by Bolo&apos;s backend and OpenAI for AI speech, transcription, or coaching.</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: withdrawing }} disabled={withdrawing} onPress={withdraw} style={[styles.destructiveButton, withdrawing && styles.disabled]}><Trash2 color={colors.danger} size={18} /><Text style={styles.destructiveText}>{withdrawing ? 'Saving…' : 'Withdraw consent'}</Text></Pressable>
        </View>
      ) : (
        <AiConsentGate><View /></AiConsentGate>
      )}

      <Pressable accessibilityRole="button" onPress={() => router.push('/privacy')} style={[styles.linkCard, largeTextLayout && styles.linkCardLarge]} testID="settings-privacy-link">
        <View style={styles.icon}><LockKeyhole color={colors.ink} size={22} /></View>
        <View style={[styles.copy, largeTextLayout && styles.copyLarge]}><Text style={styles.title}>Privacy & data use</Text><Text style={styles.body}>Read the in-app data summary</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => router.push('/diagnostics' as Href)} style={[styles.linkCard, largeTextLayout && styles.linkCardLarge]}>
        <View style={styles.icon}><Activity color={colors.ink} size={22} /></View>
        <View style={[styles.copy, largeTextLayout && styles.copyLarge]}><Text style={styles.title}>Private diagnostics</Text><Text style={styles.body}>View content-free reliability counters stored on this device</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => openPage('privacy', 'Privacy Policy')} style={[styles.linkCard, largeTextLayout && styles.linkCardLarge]}>
        <View style={styles.icon}><ExternalLink color={colors.ink} size={22} /></View>
        <View style={[styles.copy, largeTextLayout && styles.copyLarge]}><Text style={styles.title}>Public Privacy Policy</Text><Text style={styles.body}>Open the current policy on the web</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => openPage('support', 'Support')} style={[styles.linkCard, largeTextLayout && styles.linkCardLarge]}>
        <View style={styles.icon}><LifeBuoy color={colors.ink} size={22} /></View>
        <View style={[styles.copy, largeTextLayout && styles.copyLarge]}><Text style={styles.title}>Support</Text><Text style={styles.body}>Get help or make a privacy request</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => openPage('terms', 'Terms of Use')} style={[styles.linkCard, largeTextLayout && styles.linkCardLarge]}>
        <View style={styles.icon}><FileText color={colors.ink} size={22} /></View>
        <View style={[styles.copy, largeTextLayout && styles.copyLarge]}><Text style={styles.title}>Terms of Use</Text><Text style={styles.body}>Read Bolo&apos;s public terms</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <View style={styles.card} testID="settings-progress-backup">
        <View style={[styles.row, largeTextLayout && styles.rowLarge]}>
          <View style={styles.icon}><ArchiveRestore color={colors.forest} size={22} /></View>
          <View style={[styles.copy, largeTextLayout && styles.copyLarge]}><Text style={styles.title}>Progress backup</Text><Text style={styles.body}>Keep your progress when you change phones</Text></View>
        </View>
        <Text style={styles.detail}>Export saves your plan, saved phrases, reviews, scene progress, streaks, and reminder time to a file you choose where to keep. It does not include your random app identifier, AI consent choice, or Asha chat history. The file is not encrypted.</Text>
        <View style={[styles.buttonRow, largeTextLayout && styles.buttonRowLarge]}>
          <Pressable
            accessibilityHint="Opens the share sheet to save a backup file"
            accessibilityLabel="Export progress"
            accessibilityRole="button"
            accessibilityState={{ disabled: backupBusy !== null, busy: backupBusy === 'export' }}
            disabled={backupBusy !== null}
            onPress={() => void exportProgress()}
            style={[styles.secondaryButton, styles.backupButton, backupBusy !== null && styles.disabled]}
            testID="settings-export-progress"
          >
            <FileDown color={colors.forestText} size={18} /><Text style={styles.secondaryText}>{backupBusy === 'export' ? 'Preparing…' : 'Export progress'}</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Choose a backup file. You will confirm before progress is replaced."
            accessibilityLabel="Restore from backup"
            accessibilityRole="button"
            accessibilityState={{ disabled: backupBusy !== null, busy: backupBusy === 'restore' }}
            disabled={backupBusy !== null}
            onPress={() => void chooseBackup()}
            style={[styles.secondaryButton, styles.backupButton, backupBusy !== null && styles.disabled]}
            testID="settings-restore-progress"
          >
            <ArchiveRestore color={colors.forestText} size={18} /><Text style={styles.secondaryText}>{backupBusy === 'restore' ? 'Restoring…' : 'Restore from backup'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={[styles.row, largeTextLayout && styles.rowLarge]}>
          <View style={styles.icon}><DatabaseBackup color={colors.danger} size={22} /></View>
          <View style={[styles.copy, largeTextLayout && styles.copyLarge]}><Text style={styles.title}>Delete Bolo data</Text><Text style={styles.body}>Reports and this device&apos;s local data</Text></View>
        </View>
        <Text style={styles.detail}>Bolo first deletes reports associated with your random app identifier. It then clears local data and rotates that identifier. If the request fails, the identifier is kept so you can retry.</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: deleting }} disabled={deleting} onPress={confirmDeletion} style={[styles.destructiveButton, deleting && styles.disabled]}>
          <Trash2 color={colors.danger} size={18} /><Text style={styles.destructiveText}>{deleting ? 'Deleting…' : 'Delete my Bolo data'}</Text>
        </Pressable>
      </View>

      <View style={styles.about}>
        <Text style={sharedStyles.eyebrow}>Bolo {Constants.expoConfig?.version ?? '1.0.0'}</Text>
        <Text style={styles.aboutText}>A practical Hindi learning app with offline scenarios and optional AI coaching.</Text>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: { backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.lg },
  linkCard: { backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md, flexDirection: 'row', alignItems: 'center' },
  linkCardLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  icon: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 3 },
  copyLarge: { flex: 0, width: '100%' },
  title: { color: c.ink, fontSize: 16, fontWeight: '900' },
  body: { color: c.muted, fontSize: 13 },
  detail: { color: c.muted, fontSize: 14, lineHeight: 21 },
  motionPriority: { color: c.muted, fontSize: 12, lineHeight: 18 },
  destructiveButton: { minHeight: 48, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: c.dangerLine, backgroundColor: c.dangerSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  destructiveText: { color: c.danger, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  choiceLabel: { color: c.muted, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  secondaryButton: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  buttonRowLarge: { flexDirection: 'column' },
  backupButton: { flexGrow: 1, flexBasis: 160, flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  secondaryText: { color: c.forestText, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  about: { padding: spacing.lg, gap: spacing.sm },
  aboutText: { color: c.muted, fontSize: 13, lineHeight: 19 },
}));
