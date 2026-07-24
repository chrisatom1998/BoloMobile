import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { getObservabilitySnapshot, type ObservabilitySnapshot } from '@/lib/observability';
import { makeStyles, radius, spacing, useSharedStyles } from '@/theme';

export default function DiagnosticsScreen() {
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const [snapshot, setSnapshot] = useState<ObservabilitySnapshot>({ days: {} });
  useFocusEffect(useCallback(() => {
    let active = true;
    void getObservabilitySnapshot().then((value) => { if (active) setSnapshot(value); });
    return () => { active = false; };
  }, []));
  const rows = Object.entries(snapshot.days).sort(([a], [b]) => b.localeCompare(a));

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <View style={styles.notice}>
        <Text style={styles.title}>Content-free, local diagnostics</Text>
        <Text style={styles.body}>Bolo stores only daily event counts and total request duration for up to 30 days. It never puts messages, transcripts, audio, phrases, identifiers, or error text in these counters. Nothing here is uploaded.</Text>
      </View>
      {rows.length ? rows.map(([day, events]) => (
        <View key={day} style={styles.card}>
          <Text style={styles.day}>{day}</Text>
          {Object.entries(events).map(([event, counter]) => (
            <View key={event} style={styles.row}><Text style={styles.event}>{event.replaceAll('_', ' ')}</Text><Text style={styles.count}>{counter?.count ?? 0}{counter?.totalDurationMs && counter.count > 0 ? ` · ${Math.round(counter.totalDurationMs / counter.count)} ms avg` : ''}</Text></View>
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
  event: { color: c.ink, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  count: { color: c.muted, fontSize: 12 },
  empty: { color: c.muted, fontSize: 15, textAlign: 'center', padding: spacing.xl },
}));
