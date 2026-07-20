import { Award, BarChart3, Check, Share2 } from 'lucide-react-native';
import { Share, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';

import { categoryMastery, learningAccuracy, milestoneProgress, weeklyPractice } from '@/lib/learning';
import { useAppState } from '@/state/app-state';
import { colors, radius, sharedStyles, spacing } from '@/theme';

export default function ProgressScreen() {
  const { practiceHistory, reviewStreak, sceneProgress, streak } = useAppState();
  const week = weeklyPractice(practiceHistory);
  const categories = categoryMastery(sceneProgress);
  const accuracy = learningAccuracy(sceneProgress);
  const milestones = milestoneProgress(sceneProgress);
  const completedScenes = Object.values(sceneProgress).filter((item) => item.completions > 0).length;
  const maxMinutes = Math.max(1, ...week.map((day) => day.seconds / 60));

  function shareMilestones() {
    const achieved = milestones.filter((item) => item.achieved).map((item) => item.title);
    const message = achieved.length
      ? `I’m practicing real-life Hindi with Bolo. ${completedScenes} scenes complete — ${achieved.join(', ')}.`
      : `I’m building practical Hindi confidence with Bolo. ${completedScenes} scene${completedScenes === 1 ? '' : 's'} complete.`;
    void Share.share({ message, title: 'My Bolo progress' });
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <View style={styles.hero}>
        <BarChart3 color={colors.goldSoft} size={28} />
        <Text style={styles.heroTitle}>Your Hindi is becoming instinct.</Text>
        <Text style={styles.heroBody}>Progress reflects practice and recall—never message or microphone content.</Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statValue}>{completedScenes}</Text><Text style={styles.statLabel}>scenes learned</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{accuracy}%</Text><Text style={styles.statLabel}>answer accuracy</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{streak}</Text><Text style={styles.statLabel}>practice streak</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{reviewStreak}</Text><Text style={styles.statLabel}>review streak</Text></View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Last 7 days</Text>
        <View accessibilityLabel="Weekly practice minutes chart" style={styles.chart}>
          {week.map((day) => {
            const minutes = Math.round(day.seconds / 60);
            return (
              <View key={day.date} style={styles.barColumn}>
                <Text style={styles.barValue}>{minutes}</Text>
                <View style={styles.barTrack}><View style={[styles.bar, { height: `${Math.max(4, minutes / maxMinutes * 100)}%` }]} /></View>
                <Text style={styles.day}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Category mastery</Text>
        {categories.map((item) => (
          <View key={item.category} style={styles.masteryRow}>
            <View style={styles.masteryCopy}><Text style={styles.masteryTitle}>{item.category}</Text><Text style={styles.masteryMeta}>{item.completed}/{item.total}</Text></View>
            <View style={styles.masteryTrack}><View style={[styles.masteryFill, { width: `${item.percent}%` }]} /></View>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitleRow}><Text style={styles.title}>Can-do milestones</Text><Award color={colors.gold} size={22} /></View>
        {milestones.map((item) => (
          <View key={item.id} style={styles.milestone}>
            <View style={[styles.milestoneMark, item.achieved && styles.milestoneMarkDone]}>{item.achieved ? <Check color={colors.white} size={16} /> : null}</View>
            <View style={styles.milestoneCopy}><Text style={styles.milestoneTitle}>{item.title}</Text><Text style={styles.masteryMeta}>{item.completed}/{item.sceneIds.length} scenes</Text></View>
          </View>
        ))}
        <Pressable accessibilityRole="button" onPress={shareMilestones} style={styles.shareButton}><Share2 color={colors.forest} size={18} /><Text style={styles.shareText}>Share a private milestone card</Text></Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  hero: { borderRadius: radius.lg, backgroundColor: colors.ink, padding: spacing.xl, gap: spacing.md },
  heroTitle: { color: colors.white, fontSize: 27, lineHeight: 34, fontWeight: '900' },
  heroBody: { color: '#C7D2CF', fontSize: 14, lineHeight: 21 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { minWidth: 130, flexGrow: 1, flexBasis: 130, backgroundColor: colors.paperRaised, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: spacing.md, alignItems: 'center', gap: 3 },
  statValue: { color: colors.ink, fontSize: 25, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  card: { ...sharedStyles.card, gap: spacing.lg },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '900' },
  chart: { height: 150, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  barColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  barValue: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  barTrack: { flex: 1, width: '70%', borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.backgroundWarm, justifyContent: 'flex-end' },
  bar: { width: '100%', minHeight: 4, borderRadius: radius.pill, backgroundColor: colors.brand },
  day: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  masteryRow: { gap: spacing.xs },
  masteryCopy: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  masteryTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  masteryMeta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  masteryTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.line },
  masteryFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.forest },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  milestoneMark: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  milestoneMarkDone: { borderColor: colors.forest, backgroundColor: colors.forest },
  milestoneCopy: { minWidth: 0, flex: 1, gap: 2 },
  milestoneTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  shareButton: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  shareText: { color: colors.forest, fontSize: 14, fontWeight: '800', textAlign: 'center' },
});
