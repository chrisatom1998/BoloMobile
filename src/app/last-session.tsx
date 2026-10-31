import { Stack, useRouter, type Href } from 'expo-router';
import { MessageCircle, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { QueuedReportRow } from '@/components/queued-report-row';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { getScene } from '@/data/scenes';
import { showAppAlert } from '@/lib/app-alert';
import { ashaSessionDurationMs, ashaSessionsNewestFirst, type AshaSessionEndReason, type AshaSessionRecord } from '@/lib/asha-session-log';
import { clearAshaSessionContent, useAshaSessionLog } from '@/lib/asha-session-log-store';
import { syncOutbox, useSyncOutbox, type OutboxEntry } from '@/lib/sync-outbox';
import type { LiveMode } from '@/services/bolo-api';
import { useAshaVoiceSession } from '@/state/asha-voice-session';
import { useAppState } from '@/state/app-state';
import { borderWidth, hindiType, makeStyles, radius, spacing, typeScale, useSharedStyles, useTheme } from '@/theme';

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
  new_conversation: 'Saved when you started a new voice conversation.',
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

/** How the list names a session's place: the newest first, then earlier ones. */
export function sessionPositionLabel(index: number) {
  return index === 0 ? 'Latest session' : 'Earlier session';
}

const hasDevanagari = (text: string) => /[ऀ-ॿ]/u.test(text);

function SessionCard({ index, onDiscardReport, onRetryReport, record, reports }: {
  index: number;
  onDiscardReport: (entryId: string) => void;
  onRetryReport: (entryId: string) => void;
  record: AshaSessionRecord;
  reports: OutboxEntry[];
}) {
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const started = describeStart(record);
  const duration = describeSessionDuration(record);
  const stateLabel = sessionStateLabel(record);
  const cleared = record.contentClearedAt !== undefined;
  const languageLabel = record.responseLanguage === 'hi' ? 'Hindi replies' : 'English replies';
  const modeName = record.mode ? modeNames[record.mode] : null;
  const typedChat = record.endReason === 'new_conversation';
  const lessonTitle = record.lessonId ? getScene(record.lessonId)?.title ?? record.lessonId : null;
  const practicedTitles = record.lessonsPracticed.map((lessonId) => getScene(lessonId)?.title ?? lessonId);
  const summaryLabel = [
    sessionPositionLabel(index),
    started,
    duration,
    stateLabel,
    languageLabel,
    typedChat ? 'typed chat' : null,
    modeName ? `${modeName.toLowerCase()} mode` : null,
    lessonTitle ? `lesson ${lessonTitle}` : null,
    plural(record.learnerTurns, 'learner turn'),
    cleared ? 'transcript cleared' : null,
  ].filter(Boolean).join(', ');

  return (
    <View style={styles.session} testID="last-session-card">
      <View accessibilityLabel={summaryLabel} accessible style={[sharedStyles.card, styles.summary]} testID="last-session-summary">
        <Text style={sharedStyles.eyebrow}>{started}</Text>
        <View style={styles.badges}>
          <View style={[styles.badge, record.state === 'interrupted' && styles.badgeInterrupted]}>
            <Text style={[styles.badgeText, record.state === 'interrupted' && styles.badgeTextInterrupted]}>{stateLabel}</Text>
          </View>
          {duration ? <Text style={styles.detail}>{duration}</Text> : null}
        </View>
        {record.endReason ? <Text style={sharedStyles.body}>{endReasonCopy[record.endReason]}</Text> : null}
        <View style={styles.facts}>
          <Text style={styles.detail}>{languageLabel}</Text>
          {typedChat ? <Text style={styles.detail}>Typed chat</Text> : null}
          {modeName ? <Text style={styles.detail}>{`${modeName} mode`}</Text> : null}
          {lessonTitle ? <Text style={styles.detail}>{lessonTitle}</Text> : null}
          <Text style={styles.detail}>{plural(record.learnerTurns, 'learner turn')}</Text>
        </View>
        {record.savedPhrases.length ? <Text style={[styles.detail, styles.hindiDetail]}>{`Saved phrases: ${record.savedPhrases.join(', ')}`}</Text> : null}
        {practicedTitles.length ? <Text style={styles.detail}>{`Lessons practiced: ${practicedTitles.join(', ')}`}</Text> : null}
      </View>

      {cleared ? (
        <View accessibilityLabel="Transcript cleared" accessible style={[sharedStyles.card, styles.clearedCard]} testID="last-session-cleared">
          <Text accessibilityRole="header" style={styles.transcriptTitle}>Transcript cleared</Text>
          <Text style={sharedStyles.body}>You cleared this conversation from the device. Only its date, length, and how it ended remain.</Text>
        </View>
      ) : (
        <View accessibilityLabel={`Transcript, ${plural(record.rows.length, 'line')}, read only`} style={styles.transcript} testID="last-session-transcript">
          <Text accessibilityRole="header" style={styles.transcriptTitle}>Transcript</Text>
          {record.rows.length === 0 ? <Text style={sharedStyles.body}>No captions were saved for this session.</Text> : null}
          {record.rows.map((row) => {
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

      {reports.length ? (
        <View style={styles.reports} testID="last-session-reports">
          <Text accessibilityRole="header" style={styles.transcriptTitle}>Reports waiting to send</Text>
          {reports.map((entry) => (
            <QueuedReportRow entry={entry} key={entry.id} onDiscard={onDiscardReport} onRetry={onRetryReport} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function LastSessionScreen() {
  const router = useRouter();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const { colors } = useTheme();
  const { clearChatHistory } = useAppState();
  const floatingAsha = useAshaVoiceSession();
  const sessions = ashaSessionsNewestFirst(useAshaSessionLog());
  const outboxEntries = useSyncOutbox();
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');
  const mountedRef = useRef(true);
  const callActive = floatingAsha.available && floatingAsha.status !== 'disconnected';
  const clearDisabled = clearing || callActive || sessions.length === 0;

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

  if (!sessions.length) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
        <Stack.Screen options={{ title: 'Past sessions' }} />
        <View style={[sharedStyles.card, styles.empty]} testID="last-session-empty">
          <MessageCircle color={colors.brand} size={28} />
          <Text accessibilityRole="header" style={sharedStyles.heading}>No saved sessions yet</Text>
          <Text style={sharedStyles.body}>Your recent conversations with Asha are saved on this device as they happen, so a dropped connection never loses what you said. Nothing is uploaded. Voice still needs an internet connection.</Text>
          <Pressable accessibilityLabel="Start a voice conversation with Asha" accessibilityRole="button" onPress={() => router.push('/live' as Href)} style={sharedStyles.primaryButton}>
            <Text style={sharedStyles.primaryButtonText}>Start voice</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen} testID="last-session-list">
      <Stack.Screen options={{ title: 'Past sessions' }} />
      <Text accessibilityLabel={`${plural(sessions.length, 'saved session')}, newest first`} style={styles.listIntro}>{`${plural(sessions.length, 'saved session')} · newest first`}</Text>
      {sessions.map((record, index) => (
        <SessionCard
          index={index}
          key={record.id}
          onDiscardReport={discardReport}
          onRetryReport={retryReport}
          record={record}
          reports={outboxEntries.filter((entry) => entry.sessionId === record.id)}
        />
      ))}

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
  listIntro: { color: c.muted, ...typeScale.caption, fontWeight: '700' },
  session: { gap: spacing.lg, paddingBottom: spacing.lg, borderBottomWidth: borderWidth.thin, borderBottomColor: c.line },
  summary: { gap: spacing.sm },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  badge: { minHeight: 28, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.brandSoft, paddingHorizontal: spacing.sm },
  badgeInterrupted: { backgroundColor: c.goldSoft },
  badgeText: { color: c.brandText, fontSize: 12, fontWeight: '800' },
  badgeTextInterrupted: { color: c.goldText },
  facts: { gap: spacing.xs },
  detail: { color: c.ink, fontSize: 15, lineHeight: 22 },
  hindiDetail: { ...hindiType(15), color: c.ink },
  transcript: { gap: spacing.sm },
  clearedCard: { gap: spacing.xs },
  transcriptTitle: { color: c.ink, fontSize: 17, fontWeight: '900' },
  row: { maxWidth: '92%', borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  rowAsha: { alignSelf: 'flex-start', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1 },
  rowYou: { alignSelf: 'flex-end', backgroundColor: c.night },
  speaker: { color: c.brandText, fontSize: 12, fontWeight: '700' },
  speakerYou: { color: c.gold },
  rowText: { color: c.ink, fontSize: 16, lineHeight: 23 },
  rowTextYou: { color: c.white },
  rowTextHindi: { ...hindiType(18) },
  reports: { gap: spacing.sm },
  footnote: { color: c.muted, fontSize: 13, lineHeight: 18 },
  clearButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.pill, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, paddingHorizontal: spacing.lg },
  clearText: { color: c.danger, fontSize: 15, fontWeight: '700' },
  clearError: { color: c.danger, fontSize: 14, lineHeight: 20 },
  disabled: { opacity: 0.5 },
}));
