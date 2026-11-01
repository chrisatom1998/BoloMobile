import { Flag } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import type { OutboxEntry } from '@/lib/sync-outbox';
import { makeStyles, radius, spacing, useTheme, type } from '@/theme';

const EXCERPT_CHARACTERS = 80;

export function reportExcerpt(message: string) {
  const trimmed = message.trim().replace(/\s+/gu, ' ');
  return trimmed.length > EXCERPT_CHARACTERS ? `${trimmed.slice(0, EXCERPT_CHARACTERS - 1)}…` : trimmed;
}

/** "Waiting to send" with the next retry time, or why the report failed. */
export function describeQueuedReport(entry: Pick<OutboxEntry, 'state' | 'nextAttemptAt' | 'lastError'>, now = Date.now()): string {
  if (entry.state === 'failed') return `Couldn’t send. ${entry.lastError ?? ''}`.trim();
  if (entry.state === 'in_flight') return 'Sending…';
  const dueMs = Date.parse(entry.nextAttemptAt) - now;
  if (!Number.isFinite(dueMs) || dueMs <= 1_000) return 'Waiting to send. Next try when Bolo is reachable.';
  const minutes = Math.round(dueMs / 60_000);
  return `Waiting to send. Next try in ${minutes < 1 ? 'under a minute' : minutes === 1 ? '1 minute' : `${minutes} minutes`}.`;
}

/**
 * One report waiting in the sync outbox, with Retry and Discard. Used on the
 * Asha screen for reports whose reply is no longer on screen and on Last
 * session for the reports associated with that conversation.
 */
export function QueuedReportRow({ entry, onDiscard, onRetry, tone = 'light' }: {
  entry: OutboxEntry;
  onDiscard: (entryId: string) => void;
  onRetry: (entryId: string) => void;
  tone?: 'light' | 'dark';
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const dark = tone === 'dark';
  const excerpt = reportExcerpt(entry.payload.message);
  const status = describeQueuedReport(entry);
  const failed = entry.state === 'failed';
  return (
    <View accessibilityLabel={`Queued report: ${excerpt}. ${status}`} accessible style={[styles.row, dark && styles.rowDark]} testID="queued-report-row">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Flag color={failed ? colors.dangerSoft : dark ? colors.gold : colors.brand} size={15} />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={2} style={[styles.excerpt, dark && styles.textDark]}>{excerpt}</Text>
        <Text style={[styles.status, failed && styles.statusFailed, dark && !failed && styles.mutedDark]}>{status}</Text>
        <View style={styles.actions}>
          {failed ? (
            <Pressable accessibilityHint="Sends this report again when Bolo is reachable." accessibilityLabel={`Retry report: ${excerpt}`} accessibilityRole="button" onPress={() => onRetry(entry.id)} style={styles.action}>
              <Text style={[styles.actionText, dark && styles.textDark]}>Retry</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityHint="Removes this unsent report from the device." accessibilityLabel={`Discard report: ${excerpt}`} accessibilityRole="button" onPress={() => onDiscard(entry.id)} style={styles.action}>
            <Text style={[styles.actionText, dark && styles.textDark]}>Discard</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, backgroundColor: c.paperRaised, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  rowDark: { borderColor: c.nightLine, backgroundColor: c.nightSurface },
  copy: { flex: 1, gap: spacing.xs },
  excerpt: { ...type.caption, color: c.ink },
  textDark: { color: c.white },
  status: { ...type.caption, color: c.muted },
  mutedDark: { color: c.heroSubtle },
  statusFailed: { color: c.dangerSoft },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  action: { minHeight: 44, justifyContent: 'center' },
  actionText: { ...type.label, color: c.ink, textDecorationLine: 'underline', fontWeight: '700' },
}));
