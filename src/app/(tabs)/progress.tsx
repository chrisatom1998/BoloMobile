import { Award, BarChart3, Check, Share2 } from 'lucide-react-native';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { Share, ScrollView, Text, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

import { JournalDisplay, JournalKicker, JournalMotif } from '@/components/journal-chrome';
import { categoryMastery, learningAccuracy, milestoneProgress, weeklyPractice } from '@/lib/learning';
import { useAppState } from '@/state/app-state';
import { makeStyles, radius, spacing, useSharedStyles, useTheme, type ThemeColors } from '@/theme';

type ProgressStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

export default function ProgressScreen() {
  const { colors } = useTheme();
  const sharedStyles = useSharedStyles();
  const styles = useStyles();
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
      <View style={styles.pageHeading}>
        <View style={styles.pageHeadingCopy}>
          <JournalKicker>Our week in words</JournalKicker>
          <JournalDisplay style={styles.pageTitle}>A longer conversation.</JournalDisplay>
        </View>
        <JournalMotif accessibilityLabel="Progress journal motif" size="tile" />
      </View>

      <View style={styles.hero}>
        <Text pointerEvents="none" style={styles.heroGlyph}>ब</Text>
        <View style={styles.heroIcon}><BarChart3 color={colors.goldSoft} size={25} /></View>
        <Text style={styles.heroTitle}>Your Hindi is becoming instinct.</Text>
        <Text style={styles.heroBody}>Progress reflects practice and recall—never message or microphone content.</Text>
        <View style={styles.heroFootnote}><Text style={styles.heroFootnoteText}>{streak ? `${streak} day practice streak` : 'Start a calm practice streak today'}</Text></View>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statValue}>{completedScenes}</Text><Text style={styles.statLabel}>scenes learned</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{accuracy}%</Text><Text style={styles.statLabel}>answer accuracy</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{streak}</Text><Text style={styles.statLabel}>practice streak</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{reviewStreak}</Text><Text style={styles.statLabel}>review streak</Text></View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.title}>Last 7 days</Text>
          <Text style={styles.cardMeta}>minutes</Text>
        </View>
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
        <PressableFeedback accessibilityRole="button" onPress={shareMilestones} style={styles.shareButton}><Share2 color={colors.forestText} size={18} /><Text style={styles.shareText}>Share a private milestone card</Text></PressableFeedback>
      </View>
    </ScrollView>
  );
}

export const createProgressStyles = (c: ThemeColors) => {
  const isDarkSurface = c.shadowOpacityScale === 0;
  return ({
  content: { alignItems: 'center', padding: spacing.lg, paddingTop: 18, paddingBottom: spacing.xxl, gap: spacing.lg },
  pageHeading: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.sm },
  pageHeadingCopy: { minWidth: 0, flex: 1, gap: spacing.xs, paddingTop: spacing.xs },
  pageTitle: { maxWidth: 225, fontSize: 30, lineHeight: 36, textAlign: 'left' },
  hero: { width: '100%', position: 'relative', overflow: 'hidden', alignItems: 'flex-start', borderRadius: 26, borderCurve: 'continuous', backgroundColor: isDarkSurface ? c.heroBase : c.paperRaised, borderColor: c.line, borderWidth: 1, padding: spacing.xl, gap: spacing.sm, boxShadow: '0 10px 24px rgba(0, 0, 0, 0.09)' },
  heroIcon: { width: 46, height: 46, borderRadius: 16, borderCurve: 'continuous', backgroundColor: c.heroRaised, alignItems: 'center', justifyContent: 'center' },
  heroGlyph: { position: 'absolute', right: -6, bottom: -48, color: c.heroGlyph, fontSize: 156, lineHeight: 180, fontWeight: '900' },
  heroTitle: { color: isDarkSurface ? c.white : c.ink, fontFamily: 'Georgia', fontSize: 25, lineHeight: 32, fontWeight: '700', textAlign: 'left' },
  heroBody: { color: isDarkSurface ? c.heroSubtle : c.muted, fontSize: 14, lineHeight: 21, textAlign: 'left' },
  heroFootnote: { borderRadius: radius.pill, backgroundColor: c.goldSoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  heroFootnoteText: { color: c.ink, fontSize: 12, fontWeight: '800' },
  stats: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { minWidth: 130, minHeight: 100, flexGrow: 1, flexBasis: 130, backgroundColor: c.paperRaised, borderRadius: 18, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, padding: spacing.md, alignItems: 'center', justifyContent: 'center', gap: 3, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.035)' },
  statValue: { color: c.ink, fontSize: 27, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLabel: { color: c.muted, fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  card: { width: '100%', backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: 22, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.lg, boxShadow: '0 4px 14px rgba(0, 0, 0, 0.035)' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: c.ink, fontFamily: 'Georgia', fontSize: 22, lineHeight: 28, fontWeight: '700' },
  cardMeta: { color: c.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  chart: { height: 150, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  barColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  barValue: { color: c.muted, fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  barTrack: { flex: 1, width: '70%', borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.backgroundWarm, justifyContent: 'flex-end' },
  bar: { width: '100%', minHeight: 4, borderRadius: radius.pill, backgroundColor: c.brand },
  day: { color: c.muted, fontSize: 11, fontWeight: '700' },
  masteryRow: { gap: spacing.xs },
  masteryCopy: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  masteryTitle: { color: c.ink, fontSize: 14, fontWeight: '800' },
  masteryMeta: { color: c.muted, fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'] },
  masteryTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.line },
  masteryFill: { height: '100%', borderRadius: radius.pill, backgroundColor: c.forest },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  milestoneMark: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
  milestoneMarkDone: { borderColor: c.forest, backgroundColor: c.forest },
  milestoneCopy: { minWidth: 0, flex: 1, gap: 2 },
  milestoneTitle: { color: c.ink, fontSize: 15, fontWeight: '800' },
  shareButton: { minHeight: 48, overflow: 'hidden', borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: c.forest, backgroundColor: c.forestSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  shareText: { color: c.forestText, fontSize: 14, fontWeight: '800', textAlign: 'center' },
} satisfies ProgressStyles);
};

const useStyles = makeStyles(createProgressStyles);
