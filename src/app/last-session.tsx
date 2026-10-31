import { Stack, useRouter, type Href } from 'expo-router';
import { MessageCircle, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { QueuedReportRow } from '@/components/queued-report-row';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { getScene } from '@/data/scenes';
import { showAppAlert } from '@/lib/app-alert';
import { ashaSessionDurationMs, latestAshaSession, type AshaSessionEndReason, type AshaSessionRecord } from '@/lib/asha-session-log';
import { clearAshaSessionContent, useAshaSessionLog } from '@/lib/asha-session-log-store';
import { syncOutbox, useSyncOutbox } from '@/lib/sync-outbox';
import type { LiveMode } from '@/services/bolo-api';
import { useAshaVoiceSession } from '@/state/asha-voice-session';
import { useAppState } from '@/state/app-state';
import { hindiType, makeStyles, radius, spacing, useSharedStyles, useTheme, type } from '@/theme';

/** Same explicit deletion and copy as the Asha screen's Clear chat. */
export const CLEAR_CHAT_CONFIRMATION = 'Clear all saved chat transcripts? Saved phrases and progress will remain. Pending reports will still be sent under your existing AI consent.';

const endReasonCopy: Record<AshaSessionEndReason, string> = {
  user_ended: 'You ended the session.',
  backgrounded: 'The session ended when you left Bolo.',
  connection_lost: 'The connection dropped before the session ended.',
  start_failed: 'The call could not start.',
  data_deleted: 'The session ended when Bolo data was deleted.',
  config_changed: 'Settings changed, so the session ended.',
  app_terminated: 'Bolo closed before the session ended.',
};

const modeNames: Record<LiveMode, string> = {
  'hindi-immersion': 'Hindi immersion',
  'hindi-english-help': 'Hindi with English help',
  beginner: 'Beginner',
  conversation: 'Conversation',
  lesson: 'Lesson',
};

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function describeSessionDuration(record: AshaSessionRecord): string | null {
  const elapsedMs = ashaSessionDurationMs(record);
  if (elapsedMs === null) return null;
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  if (seconds < 60) return plural(seconds, 'second');
  return plural(Math.round(seconds / 60), 'minute');
}

function describeStart(record: AshaSessionRecord) {
  return new Date(record.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function sessionStateLabel(record: AshaSessionRecord) {
  return record.state === 'interrupted' ? 'Interrupted' : record.state === 'active' ? 'In progress' : 'Completed';
}

const hasDevanagari = (text: string) => /[ऀ-ॿ]/u.test(text);

export default function LastSessionScreen() {
  const router = useRouter();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const { colors } = useTheme();
  const { clearChatHistory } = useAppState();
  const floatingAsha = useAshaVoiceSession();
  const sessions = useAshaSessionLog();
  const latest = latestAshaSession(sessions);
  const outboxEntries = useSyncOutbox();
  const latestId = latest?.id;
  const associatedReports = latestId ? outboxEntries.filter((entry) => entry.sessionId === latestId) : [];
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');
  const mountedRef = useRef(true);
  const callActive = floatingAsha.available && floatingAsha.status !== 'disconnected';
  const clearDisabled = clearing || callActive || !latest;

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  // A delivered report leaves the list through the outbox subscription; the provider
  // announces it once for the whole app, so this screen, which can overlay Asha, does not.

  const retryReport = useCallback((entryId: string) => {
    void syncOutbox.retry(entryId);
  }, []);
  const discardReport = useCallback((entryId: string) => {
    void syncOutbox.discard(entryId);
  }, []);

  const clearSavedChat = useCallback(async () => {
    if (!mountedRef.current || clearing) return;
    setClearing(true);
    setClearError('');
    // The same all-chat explicit deletion as the Asha screen: current chat and every
    // saved session's rows and tool content go; queued reports and their retries stay.
    const cleared = await Promise.all([clearChatHistory(), clearAshaSessionContent().then(() => true, () => false)]).then((results) => results.every(Boolean));
    if (!mountedRef.current) return;
    setClearing(false);
    if (!cleared) setClearError('The chat could not be cleared. Please try again.');
  }, [clearChatHistory, clearing]);

  const confirmClearChat = useCallback(() => {
    if (clearDisabled) return;
    showAppAlert('Clear Asha chat?', CLEAR_CHAT_CONFIRMATION, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear chat', style: 'destructive', onPress: () => void clearSavedChat() },
    ]);
  }, [clearDisabled, clearSavedChat]);

  if (!latest) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
        <Stack.Screen options={{ title: 'Last session' }} />
        <View style={[sharedStyles.card, styles.empty]} testID="last-session-empty">
          <MessageCircle color={colors.brand} size={28} />
          <Text accessibilityRole="header" style={sharedStyles.heading}>No saved session yet</Text>
          <Text style={sharedStyles.body}>Your most recent live voice conversation with Asha is saved on this device as it happens, so a dropped connection never loses what you said. Nothing is uploaded. Voice still needs an internet connection.</Text>
          <Pressable accessibilityLabel="Start a voice conversation with Asha" accessibilityRole="button" onPress={() => router.push('/live' as Href)} style={sharedStyles.primaryButton}>
            <Text style={sharedStyles.primaryButtonText}>Start voice</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const started = describeStart(latest);
  const duration = describeSessionDuration(latest);
  const stateLabel = sessionStateLabel(latest);
  const cleared = latest.contentClearedAt !== undefined;
  const languageLabel = latest.responseLanguage === 'hi' ? 'Hindi replies' : 'English replies';
  const modeName = latest.mode ? modeNames[latest.mode] : null;
  const lessonTitle = latest.lessonId ? getScene(latest.lessonId)?.title ?? latest.lessonId : null;
  const practicedTitles = latest.lessonsPracticed.map((lessonId) => getScene(lessonId)?.title ?? lessonId);
  const summaryLabel = [
    'Last session',
    started,
    duration,
    stateLabel,
    languageLabel,
    modeName ? `${modeName.toLowerCase()} mode` : null,
    lessonTitle ? `lesson ${lessonTitle}` : null,
    plural(latest.learnerTurns, 'learner turn'),
    cleared ? 'transcript cleared' : null,
  ].filter(Boolean).join(', ');

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <Stack.Screen options={{ title: 'Last session' }} />
      <View accessibilityLabel={summaryLabel} accessible style={[sharedStyles.card, styles.summary]} testID="last-session-summary">
        <Text style={sharedStyles.eyebrow}>{started}</Text>
        <View style={styles.badges}>
          <View style={[styles.badge, latest.state === 'interrupted' && styles.badgeInterrupted]}>
            <Text style={[styles.badgeText, latest.state === 'interrupted' && styles.badgeTextInterrupted]}>{stateLabel}</Text>
          </View>
          {duration ? <Text style={styles.detail}>{duration}</Text> : null}
        </View>
        {latest.endReason ? <Text style={sharedStyles.body}>{endReasonCopy[latest.endReason]}</Text> : null}
        <View style={styles.facts}>
          <Text style={styles.detail}>{languageLabel}</Text>
          {modeName ? <Text style={styles.detail}>{`${modeName} mode`}</Text> : null}
          {lessonTitle ? <Text style={styles.detail}>{lessonTitle}</Text> : null}
          <Text style={styles.detail}>{plural(latest.learnerTurns, 'learner turn')}</Text>
        </View>
        {latest.savedPhrases.length ? <Text style={[styles.detail, styles.hindiDetail]}>{`Saved phrases: ${latest.savedPhrases.join(', ')}`}</Text> : null}
        {practicedTitles.length ? <Text style={styles.detail}>{`Lessons practiced: ${practicedTitles.join(', ')}`}</Text> : null}
      </View>

      {cleared ? (
        <View accessibilityLabel="Transcript cleared" accessible style={[sharedStyles.card, styles.clearedCard]} testID="last-session-cleared">
          <Text accessibilityRole="header" style={styles.transcriptTitle}>Transcript cleared</Text>
          <Text style={sharedStyles.body}>You cleared this conversation from the device. Only its date, length, and how it ended remain.</Text>
        </View>
      ) : (
        <View accessibilityLabel={`Transcript, ${plural(latest.rows.length, 'line')}, read only`} style={styles.transcript} testID="last-session-transcript">
          <Text accessibilityRole="header" style={styles.transcriptTitle}>Transcript</Text>
          {latest.rows.length === 0 ? <Text style={sharedStyles.body}>No captions were saved for this session.</Text> : null}
          {latest.rows.map((row) => {
            const isYou = row.speaker === 'you';
            const hindi = hasDevanagari(row.text);
            return (
              <View
                accessibilityLabel={`${isYou ? 'You' : 'Asha'}: ${row.text}`}
                accessibilityLanguage={hindi ? 'hi-IN' : undefined}
                accessible
                key={row.id}
                style={[styles.row, isYou ? styles.rowYou : styles.rowAsha]}
              >
                <Text style={[styles.speaker, isYou && styles.speakerYou]}>{isYou ? 'You' : 'Asha'}</Text>
                <Text style={[styles.rowText, isYou && styles.rowTextYou, hindi && styles.rowTextHindi]}>{row.text}</Text>
              </View>
            );
          })}
        </View>
      )}

      {associatedReports.length ? (
        <View style={styles.reports} testID="last-session-reports">
          <Text accessibilityRole="header" style={styles.transcriptTitle}>Reports waiting to send</Text>
          {associatedReports.map((entry) => (
            <QueuedReportRow entry={entry} key={entry.id} onDiscard={discardReport} onRetry={retryReport} />
          ))}
        </View>
      ) : null}

      <Text style={styles.footnote}>Saved on this device only. Nothing is uploaded.</Text>
      <Pressable
        accessibilityHint={callActive ? 'End the live voice session before clearing saved chat.' : 'Removes saved typed and voice chat from this device, without deleting saved phrases, lesson progress, or reports waiting to be sent.'}
        accessibilityLabel="Clear Asha chat history"
        accessibilityRole="button"
        accessibilityState={{ disabled: clearDisabled }}
        disabled={clearDisabled}
        onPress={confirmClearChat}
        style={[styles.clearButton, clearDisabled && styles.disabled]}
      >
        <Trash2 color={colors.danger} size={18} />
        <Text style={styles.clearText}>{clearing ? 'Clearing…' : 'Clear chat'}</Text>
      </Pressable>
      {clearError ? <Text accessibilityRole="alert" style={styles.clearError}>{clearError}</Text> : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  empty: { alignItems: 'flex-start' },
  summary: { gap: spacing.sm },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  badge: { minHeight: 28, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.brandSoft, paddingHorizontal: spacing.sm },
  badgeInterrupted: { backgroundColor: c.goldSoft },
  badgeText: { ...type.caption, color: c.brandText, fontWeight: '700' },
  badgeTextInterrupted: { color: c.goldText },
  facts: { gap: spacing.xs },
  detail: { ...type.body, color: c.ink },
  hindiDetail: { ...hindiType(17), color: c.ink },
  transcript: { gap: spacing.sm },
  clearedCard: { gap: spacing.xs },
  transcriptTitle: { ...type.label, color: c.ink, fontWeight: '700' },
  row: { maxWidth: '92%', borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  rowAsha: { alignSelf: 'flex-start', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1 },
  rowYou: { alignSelf: 'flex-end', backgroundColor: c.night },
  speaker: { ...type.caption, color: c.brandText, fontWeight: '700' },
  speakerYou: { color: c.gold },
  rowText: { ...type.body, color: c.ink },
  rowTextYou: { color: c.white },
  rowTextHindi: { ...hindiType(17) },
  reports: { gap: spacing.sm },
  footnote: { ...type.caption, color: c.muted },
  clearButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.pill, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, paddingHorizontal: spacing.lg },
  clearText: { ...type.label, color: c.danger, fontWeight: '700' },
  clearError: { ...type.caption, color: c.danger },
  disabled: { opacity: 0.5 },
}));
