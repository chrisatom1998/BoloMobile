import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { Activity, Bell, ChevronRight, DatabaseBackup, ExternalLink, FileText, Languages, LifeBuoy, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { showAppAlert } from '@/lib/app-alert';
import { openPublicPage, type PublicPage } from '@/lib/public-pages';
import { observe } from '@/lib/observability';
import { cancelPracticeReminder, clearAllPracticeReminders, schedulePracticeReminder } from '@/lib/practice-reminder';
import { defaultLearnerProfile, defaultReminderSettings } from '@/lib/storage';
import { deleteMobileData } from '@/services/bolo-api';
import { useAppState } from '@/state/app-state';
import { colors, radius, sharedStyles, spacing } from '@/theme';

export function formatReminderTime(hour: number, minute = 0) {
  const normalizedHour = Math.min(23, Math.max(0, Math.round(hour)));
  const normalizedMinute = Math.min(59, Math.max(0, Math.round(minute)));
  return `${normalizedHour % 12 || 12}:${String(normalizedMinute).padStart(2, '0')} ${normalizedHour >= 12 ? 'PM' : 'AM'}`;
}

export default function SettingsScreen() {
  const router = useRouter();
  const state = useAppState();
  const { aiConsent, clearAllData, clientId, setAiConsent } = state;
  const learnerProfile = state.learnerProfile ?? { ...defaultLearnerProfile(), completed: true };
  const reminder = state.reminder ?? defaultReminderSettings();
  const { setReminder, updateLearnerProfile } = state;
  const [deleting, setDeleting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
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

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.icon}><Languages color={colors.white} size={20} /></View>
          <View style={styles.copy}><Text style={styles.title}>Learning preferences</Text><Text style={styles.body}>Control script and Asha’s default reply language</Text></View>
        </View>
        <Text style={styles.choiceLabel}>Hindi display</Text>
        <View accessibilityLabel="Hindi display preference" accessibilityRole="radiogroup" style={styles.choiceRow}>
          {(['both', 'devanagari', 'latin'] as const).map((value) => (
            <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: learnerProfile.scriptPreference === value }} onPress={() => updateLearnerProfile({ scriptPreference: value })} style={[styles.choiceButton, learnerProfile.scriptPreference === value && styles.choiceButtonActive]}>
              <Text style={[styles.choiceButtonText, learnerProfile.scriptPreference === value && styles.choiceButtonTextActive]}>{value === 'both' ? 'Both' : value === 'devanagari' ? 'हिन्दी' : 'Latin'}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.choiceLabel}>Asha replies</Text>
        <View accessibilityLabel="Asha reply language preference" accessibilityRole="radiogroup" style={styles.choiceRow}>
          {(['en', 'hi'] as const).map((value) => (
            <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: learnerProfile.responseLanguage === value }} onPress={() => updateLearnerProfile({ responseLanguage: value })} style={[styles.choiceButton, learnerProfile.responseLanguage === value && styles.choiceButtonActive]}>
              <Text style={[styles.choiceButtonText, learnerProfile.responseLanguage === value && styles.choiceButtonTextActive]}>{value === 'en' ? 'English' : 'Hindi'}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/onboarding' as Href)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Recalibrate my plan</Text></Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: colors.brand }]}><Bell color={colors.white} size={20} /></View>
          <View style={styles.copy}><Text style={styles.title}>Practice reminder</Text><Text style={styles.body}>{reminder.enabled ? `Daily at ${formatReminderTime(reminder.hour, reminder.minute)}` : 'Off · reminders stay on this device'}</Text></View>
        </View>
        <View style={styles.choiceRow}>
          {[9, 19, 20].map((hour) => (
            <Pressable key={hour} accessibilityRole="button" accessibilityState={{ disabled: savingReminder, selected: reminder.enabled && reminder.hour === hour }} disabled={savingReminder} onPress={() => void changeReminder(hour)} style={[styles.choiceButton, reminder.enabled && reminder.hour === hour && styles.choiceButtonActive]}><Text style={[styles.choiceButtonText, reminder.enabled && reminder.hour === hour && styles.choiceButtonTextActive]}>{formatReminderTime(hour)}</Text></Pressable>
          ))}
        </View>
        {reminder.enabled ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: savingReminder }} disabled={savingReminder} onPress={() => void changeReminder()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Turn reminder off</Text></Pressable> : null}
      </View>

      {aiConsent ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.forest }]}><ShieldCheck color={colors.white} size={21} /></View>
            <View style={styles.copy}><Text style={styles.title}>AI coaching consent</Text><Text style={styles.body}>Enabled for the current privacy notice</Text></View>
          </View>
          <Text style={styles.detail}>After consent, Listen text, typed messages, active live voice turns, and pronunciation recordings are processed by Bolo&apos;s backend and OpenAI for AI speech, transcription, or coaching.</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: withdrawing }} disabled={withdrawing} onPress={withdraw} style={[styles.destructiveButton, withdrawing && styles.disabled]}><Trash2 color={colors.danger} size={18} /><Text style={styles.destructiveText}>{withdrawing ? 'Saving…' : 'Withdraw consent'}</Text></Pressable>
        </View>
      ) : (
        <AiConsentGate><View /></AiConsentGate>
      )}

      <Pressable accessibilityRole="button" onPress={() => router.push('/privacy')} style={styles.linkCard}>
        <View style={styles.icon}><LockKeyhole color={colors.white} size={20} /></View>
        <View style={styles.copy}><Text style={styles.title}>Privacy & data use</Text><Text style={styles.body}>Read the in-app data summary</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => router.push('/diagnostics' as Href)} style={styles.linkCard}>
        <View style={styles.icon}><Activity color={colors.white} size={20} /></View>
        <View style={styles.copy}><Text style={styles.title}>Private diagnostics</Text><Text style={styles.body}>View content-free reliability counters stored on this device</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => openPage('privacy', 'Privacy Policy')} style={styles.linkCard}>
        <View style={styles.icon}><ExternalLink color={colors.white} size={20} /></View>
        <View style={styles.copy}><Text style={styles.title}>Public Privacy Policy</Text><Text style={styles.body}>Open the current policy on the web</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => openPage('support', 'Support')} style={styles.linkCard}>
        <View style={styles.icon}><LifeBuoy color={colors.white} size={20} /></View>
        <View style={styles.copy}><Text style={styles.title}>Support</Text><Text style={styles.body}>Get help or make a privacy request</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => openPage('terms', 'Terms of Use')} style={styles.linkCard}>
        <View style={styles.icon}><FileText color={colors.white} size={20} /></View>
        <View style={styles.copy}><Text style={styles.title}>Terms of Use</Text><Text style={styles.body}>Read Bolo&apos;s public terms</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: colors.danger }]}><DatabaseBackup color={colors.white} size={20} /></View>
          <View style={styles.copy}><Text style={styles.title}>Delete Bolo data</Text><Text style={styles.body}>Reports and this device&apos;s local data</Text></View>
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

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: { ...sharedStyles.card, gap: spacing.lg },
  linkCard: { ...sharedStyles.card, flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 15, borderCurve: 'continuous', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 13 },
  detail: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  destructiveButton: { minHeight: 48, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: '#E4B5AE', backgroundColor: '#FBEDEA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  destructiveText: { color: colors.danger, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  choiceLabel: { color: colors.muted, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choiceButton: { minWidth: 78, minHeight: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  choiceButtonActive: { borderColor: colors.ink, backgroundColor: colors.ink },
  choiceButtonText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  choiceButtonTextActive: { color: colors.white },
  secondaryButton: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  secondaryText: { color: colors.forest, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  about: { padding: spacing.lg, gap: spacing.sm },
  aboutText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
