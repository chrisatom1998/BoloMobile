import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { getObservabilitySnapshot, type ObservabilityEvent, type ObservabilitySnapshot } from '@/lib/observability';
import { makeStyles, radius, spacing, useSharedStyles } from '@/theme';

/** Plain names for the counters, so support screenshots read as sentences rather than event ids. */
const eventLabels: Record<ObservabilityEvent, string> = {
  app_opened: 'Times Bolo opened',
  onboarding_completed: 'Setup finished',
  scene_started: 'Lessons started',
  scene_completed: 'Lessons finished',
  consent_viewed: 'Privacy notice shown',
  consent_accepted: 'Asha coaching turned on',
  consent_declined: 'Asha coaching declined',
  voice_connection_succeeded: 'Live voice connected',
  voice_connection_failed: 'Live voice failed to connect',
  ai_request_succeeded: 'Asha replies received',
  ai_request_failed: 'Asha replies that failed',
  review_completed: 'Reviews finished',
  retention_day_1: 'Came back the next day',
  retention_day_7: 'Came back a week later',
  runtime_error: 'App errors caught',
};

export default function DiagnosticsScreen() {
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const [snapshot, setSnapshot] = useState<ObservabilitySnapshot>({ days: {} });
  const [loading, setLoading] = useState(true);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void getObservabilitySnapshot().then((value) => {
      if (active) {
        setSnapshot(value);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []));
  const rows = Object.entries(snapshot.days).sort(([a], [b]) => b.localeCompare(a));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <View style={styles.notice}>
        <Text style={styles.title}>Content-free, local diagnostics</Text>
        <Text style={styles.body}>Bolo stores only daily event counts and total request duration for up to 30 days. It never puts messages, transcripts, audio, phrases, identifiers, or error text in these counters. Nothing here is uploaded.</Text>
      </View>
      {loading ? <Text accessibilityLiveRegion="polite" style={styles.empty}>Loading private diagnostics…</Text> : rows.length ? rows.map(([day, events]) => (
        <View key={day} style={styles.card}>
          <Text style={styles.day}>{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
          {Object.entries(events).map(([event, counter]) => (
            <View key={event} style={styles.row}><Text style={styles.event}>{eventLabels[event as ObservabilityEvent] ?? event.replaceAll('_', ' ')}</Text><Text style={styles.count}>{counter?.count ?? 0}{counter?.totalDurationMs && counter.count > 0 ? ` · ${Math.round(counter.totalDurationMs / counter.count)} ms avg` : ''}</Text></View>
          ))}
        </View>
      )) : <Text style={styles.empty}>No diagnostics recorded yet.</Text>}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  notice: { backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.sm },
  title: { color: c.ink, fontSize: 20, lineHeight: 26, fontWeight: '900' },
  body: { color: c.muted, fontSize: 14, lineHeight: 21 },
  card: { backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.sm },
  day: { color: c.brandDark, fontSize: 13, fontWeight: '900' },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  event: { color: c.ink, fontSize: 13, fontWeight: '700' },
  count: { color: c.muted, fontSize: 12 },
  empty: { color: c.muted, fontSize: 15, textAlign: 'center', padding: spacing.xl },
}));
