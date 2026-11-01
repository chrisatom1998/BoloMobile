import { useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import { showAppAlert } from '@/lib/app-alert';
import { NotificationPermissionError, schedulePracticeReminder } from '@/lib/practice-reminder';
import type { ReminderSettings } from '@/state/app-state-types';
import { makeStyles, radius, spacing, type, buttons } from '@/theme';

function formatReminderLabel(hour: number, minute: number) {
  const normalizedHour = Math.min(23, Math.max(0, hour));
  const normalizedMinute = Math.min(59, Math.max(0, minute));
  return `${normalizedHour % 12 || 12}:${String(normalizedMinute).padStart(2, '0')} ${normalizedHour >= 12 ? 'PM' : 'AM'}`;
}

type LessonReminderOfferProps = {
  onAnswered: (reminder: ReminderSettings) => void;
  reminder: ReminderSettings;
};

export function LessonReminderOffer({ onAnswered, reminder }: LessonReminderOfferProps) {
  const styles = useStyles();
  const offeredAt = useMemo(() => new Date(), []);
  const [saving, setSaving] = useState(false);
  const hour = offeredAt.getHours();
  const minute = offeredAt.getMinutes();
  const timeLabel = formatReminderLabel(hour, minute);

  function decline() {
    if (saving) return;
    onAnswered({ ...reminder, offerAnswered: true });
  }

  async function accept() {
    if (saving) return;
    setSaving(true);
    try {
      const next = await schedulePracticeReminder({ ...reminder, offerAnswered: true }, hour, minute);
      onAnswered(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Try again from Settings.';
      if (error instanceof NotificationPermissionError) {
        showAppAlert('Could not set your reminder', message, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
        ]);
      } else {
        showAppAlert('Could not set your reminder', message);
      }
      setSaving(false);
    }
  }

  return (
    <View style={styles.card} testID="lesson-reminder-offer">
      <Text accessibilityRole="header" style={styles.question}>Remind me tomorrow at this time?</Text>
      <Text style={styles.detail}>A daily reminder at {timeLabel}. You can change it in Settings.</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={`Yes, remind me at ${timeLabel}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={() => { void accept(); }}
          style={[styles.yesButton, saving && styles.disabled]}
          testID="lesson-reminder-yes"
        >
          <Text style={styles.yesText}>{saving ? 'Saving…' : 'Yes'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={decline}
          style={styles.notNowButton}
          testID="lesson-reminder-not-now"
        >
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.paperRaised,
    borderColor: c.line,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  question: { ...type.headline, color: c.ink },
  detail: { ...type.caption, color: c.muted },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  yesButton: buttons.primary,
  yesText: buttons.primaryText,
  notNowButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  notNowText: { ...type.label, color: c.muted },
  disabled: { opacity: 0.5 },
}));
