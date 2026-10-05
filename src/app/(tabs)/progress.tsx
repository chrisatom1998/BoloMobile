import { useRouter, type Href } from 'expo-router';
import { Share2 } from 'lucide-react-native';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { useMemo } from 'react';
import { Platform, Share, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JournalDisplay } from '@/components/journal-chrome';
import { getScene } from '@/data/scenes';
import { lessonPlans } from '@/data/lesson-plans';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { showAppAlert } from '@/lib/app-alert';
import { learningAccuracy, milestoneProgress, weeklyPractice } from '@/lib/learning';
import { useAppStateValue } from '@/state/app-state';
import { displayFont, makeStyles, radius, spacing, useSharedStyles, useTheme, type NamedStyles, type ThemeColors } from '@/theme';

export default function ProgressScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const sharedStyles = useSharedStyles();
  const styles = useStyles();
  const largeTextLayout = useLargeTextLayout();
  const insets = useSafeAreaInsets();
  const { phrases, practiceHistory, reviewStreak, sceneProgress, streak } = useAppStateValue();
  const { week, maxMinutes } = useMemo(() => {
    const days = weeklyPractice(practiceHistory);
    return { week: days, maxMinutes: Math.max(1, ...days.map((day) => Math.round(day.seconds / 60))) };
  }, [practiceHistory]);
  const { accuracy, completedScenes, milestones } = useMemo(() => ({
    accuracy: learningAccuracy(sceneProgress),
    milestones: milestoneProgress(sceneProgress),
    completedScenes: Object.values(sceneProgress).filter((item) => item.completions > 0).length,
  }), [sceneProgress]);
  const reviewedThisWeek = week.reduce((total, day) => total + day.reviews, 0);
  const minutesThisWeek = week.reduce((total, day) => total + Math.round(day.seconds / 60), 0);
  const activeDaysThisWeek = week.filter((day) => day.seconds > 0 || day.reviews > 0).length;
  const hasLearningActivity = practiceHistory.some((day) => day.seconds > 0 || day.reviews > 0)
    || Object.values(sceneProgress).some((item) => item.completions > 0 || item.lastBeatIndex > 0)
    || streak > 0
    || reviewStreak > 0;
  const lessonFocus = useMemo(() => {
    const catalog = lessonPlans.flatMap((plan) => plan.lessonIds.map((lessonId) => ({ lessonId, plan })));
    const resumed = catalog
      .filter(({ lessonId }) => {
        const progress = sceneProgress[lessonId];
        return (progress?.completions ?? 0) === 0 && (progress?.lastBeatIndex ?? 0) > 0;
      })
      .reduce<(typeof catalog)[number] | undefined>((selected, candidate) => {
        if (!selected) return candidate;
        const candidateTime = Date.parse(sceneProgress[candidate.lessonId]?.lastPracticedAt ?? '');
        const selectedTime = Date.parse(sceneProgress[selected.lessonId]?.lastPracticedAt ?? '');
        const normalizedCandidateTime = Number.isNaN(candidateTime) ? 0 : candidateTime;
        const normalizedSelectedTime = Number.isNaN(selectedTime) ? 0 : selectedTime;
        return normalizedCandidateTime > normalizedSelectedTime ? candidate : selected;
      }, undefined);
    const incompletePlan = lessonPlans.find((plan) => plan.lessonIds.some((lessonId) => (sceneProgress[lessonId]?.completions ?? 0) === 0));
    const plan = resumed?.plan ?? incompletePlan ?? lessonPlans[lessonPlans.length - 1]!;
    const lessonId = resumed?.lessonId
      ?? plan.lessonIds.find((id) => (sceneProgress[id]?.completions ?? 0) === 0)
      ?? plan.lessonIds[0]!;
    const lesson = getScene(lessonId);
    const lessonIndex = Math.max(0, plan.lessonIds.indexOf(lessonId));
    const progress = sceneProgress[lessonId];
    const mode = resumed ? 'continue' : incompletePlan ? 'start' : 'review';
    const turnCount = lesson?.beats.length ?? 10;
    const currentTurn = Math.min(turnCount, (progress?.lastBeatIndex ?? 0) + 1);

    return {
      action: mode === 'continue' ? 'Continue lesson' : mode === 'start' ? 'Start lesson' : 'Review lesson',
      lessonId,
      metric: mode === 'continue'
        ? `Plan ${String(plan.order).padStart(2, '0')} · Lesson ${lessonIndex + 1} of ${plan.lessonIds.length} · Turn ${currentTurn} of ${turnCount}`
        : `Plan ${String(plan.order).padStart(2, '0')} · Lesson ${lessonIndex + 1} of ${plan.lessonIds.length} · ${turnCount} turns`,
      mode,
      title: lesson?.title ?? plan.title,
    };
  }, [sceneProgress]);
  const planProgress = useMemo(() => lessonPlans.map((plan) => {
    const completed = plan.lessonIds.filter((id) => (sceneProgress[id]?.completions ?? 0) > 0).length;
    return { completed, id: plan.id, percent: Math.round(completed / plan.lessonIds.length * 100), title: plan.title, total: plan.lessonIds.length };
  }), [sceneProgress]);
  const streakLabel = streak > 0
    ? `${streak}-day practice streak`
    : hasLearningActivity
      ? 'No active practice streak'
      : 'No practice streak yet';
  const weekActivityLabel = activeDaysThisWeek > 0
    ? `${minutesThisWeek} min practiced`
    : 'No activity yet';
  const weekSummary = activeDaysThisWeek > 0
    ? `${activeDaysThisWeek} active day${activeDaysThisWeek === 1 ? '' : 's'}${reviewedThisWeek > 0 ? ` and ${reviewedThisWeek} phrase review${reviewedThisWeek === 1 ? '' : 's'}` : ''}.`
    : 'Your first practice minutes will show here.';

  function shareMilestones() {
    const achieved = milestones.filter((item) => item.achieved).map((item) => item.title);
    const message = achieved.length
      ? `I’m practicing real-life Hindi with Bolo. ${completedScenes} scenes complete — ${achieved.join(', ')}.`
      : `I’m building practical Hindi confidence with Bolo. ${completedScenes} scene${completedScenes === 1 ? '' : 's'} complete.`;
    void Share.share({ message, title: 'My Bolo progress' }).catch((error: unknown) => {
      showAppAlert('Could not share your progress', error instanceof Error ? error.message : 'Try again in a moment.');
    });
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, Platform.OS === 'android' && { paddingTop: insets.top + 18, paddingBottom: insets.bottom + spacing.xxl }]} style={sharedStyles.screen}>
      <View style={[styles.pageHeading, largeTextLayout && styles.pageHeadingLarge]} testID="progress-page-heading">
        <View style={[styles.pageHeadingCopy, largeTextLayout && styles.pageHeadingCopyLarge]}>
          <JournalDisplay style={styles.pageTitle}>Progress</JournalDisplay>
          <Text style={[styles.pageSubtitle, largeTextLayout && styles.pageSubtitleLarge]}>What is taking root.</Text>
        </View>
        <PressableFeedback accessibilityLabel="Share progress" accessibilityRole="button" onPress={shareMilestones} style={styles.shareButton}>
          <Share2 color={colors.ink} size={18} />
        </PressableFeedback>
      </View>

      <View style={styles.weekCard}>
        <Text accessible={false} numberOfLines={1} style={styles.weekWatermark}>बोलो</Text>
        <View style={styles.weekHeading}>
          <Text style={styles.weekEyebrow}>Last 7 days</Text>
          <Text style={styles.weekMeta}>{weekActivityLabel}</Text>
        </View>
        <View accessibilityLabel="Weekly practice minutes chart" style={styles.chart}>
          {week.map((day, index) => {
            const minutes = Math.round(day.seconds / 60);
            const today = index === week.length - 1;
            return (
              <View key={day.date} style={styles.barColumn}>
                <Text style={styles.barValue}>{minutes}</Text>
                <View style={styles.barTrack}><View style={[styles.bar, today && styles.barToday, { height: `${Math.max(6, minutes / maxMinutes * 100)}%` }]} /></View>
                <Text style={[styles.day, today && styles.dayToday]}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.weekSummary}>{weekSummary}</Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statValue}>{completedScenes}</Text><Text style={styles.statLabel}>scenes learned</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{accuracy}%</Text><Text style={styles.statLabel}>answer accuracy</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{streak}</Text><Text style={styles.statLabel}>day practice streak</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{phrases.length}</Text><Text style={styles.statLabel}>phrases saved</Text></View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>
          {lessonFocus.mode === 'continue' ? 'Current lesson' : !hasLearningActivity ? 'Your first lesson' : lessonFocus.mode === 'review' ? 'Review lesson' : 'Next lesson'}
        </Text>
        <Text style={styles.heroTitle}>{lessonFocus.title}</Text>
        <Text style={styles.heroBody}>{lessonFocus.metric}</Text>
        <View style={styles.heroFootnotes}>
          <Text style={styles.heroFootnoteText}>{completedScenes} scene{completedScenes === 1 ? '' : 's'} learned · {reviewedThisWeek} review{reviewedThisWeek === 1 ? '' : 's'} this week</Text>
          <Text style={[styles.heroFootnoteText, styles.heroFootnoteForestText]}>{streakLabel}</Text>
        </View>
        <PressableFeedback
          accessibilityLabel={`${lessonFocus.action}: ${lessonFocus.title}`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/scene/[id]', params: { id: lessonFocus.lessonId } })}
          style={styles.heroAction}
        >
          <Text style={styles.heroActionText}>{lessonFocus.action}</Text>
        </PressableFeedback>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.title}>Lesson plans</Text>
          <PressableFeedback accessibilityLabel={`See all ${lessonPlans.length} lesson plans`} accessibilityRole="button" onPress={() => router.push('/lesson-plans' as Href)} style={styles.seeAll}>
            <Text style={styles.seeAllText}>See all</Text>
          </PressableFeedback>
        </View>
        {planProgress.map((plan) => (
          <View key={plan.id} style={styles.planRow}>
            <View style={styles.planCopy}>
              <Text numberOfLines={1} style={styles.planTitle}>{plan.title}</Text>
              <Text style={styles.planMeta}>{plan.completed === plan.total ? 'Complete' : `${plan.completed}/${plan.total}`}</Text>
            </View>
            <View accessibilityLabel={`${plan.title}: ${plan.completed} of ${plan.total} lessons complete`} style={styles.planTrack}>
              <View style={[styles.planFill, plan.completed === plan.total && styles.planFillComplete, { width: `${Math.max(plan.percent, plan.completed > 0 ? 4 : 0)}%` }]} />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export const createProgressStyles = (c: ThemeColors) => ({
  content: { alignItems: 'center', padding: 20, paddingTop: 18, paddingBottom: 120, gap: spacing.lg },
  pageHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.sm },
  pageHeadingLarge: { flexDirection: 'column', alignItems: 'stretch' },
  pageHeadingCopy: { minWidth: 0, flex: 1, gap: 2 },
  pageHeadingCopyLarge: { flex: 0, width: '100%' },
  pageTitle: { fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  pageSubtitle: { maxWidth: 300, color: c.muted, fontFamily: displayFont, fontSize: 16, lineHeight: 22, textAlign: 'left' },
  pageSubtitleLarge: { maxWidth: '100%' },
  shareButton: { width: 44, height: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weekCard: { width: '100%', overflow: 'hidden', borderRadius: radius.xxl, borderCurve: 'continuous', backgroundColor: c.brand, padding: 20, gap: spacing.lg },
  weekWatermark: { position: 'absolute', right: 8, bottom: -40, color: 'rgba(255, 255, 255, 0.10)', fontFamily: displayFont, fontSize: 150, lineHeight: 170, fontWeight: '700' },
  weekHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  weekEyebrow: { color: c.brandSoft, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  weekMeta: { color: c.brandSoft, fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'right' },
  chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  barColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  barValue: { color: c.brandSoft, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  barTrack: { flex: 1, width: '100%', maxWidth: 28, justifyContent: 'flex-end' },
  bar: { width: '100%', minHeight: 6, borderRadius: radius.pill, backgroundColor: 'rgba(255, 255, 255, 0.28)' },
  barToday: { backgroundColor: c.gold },
  day: { color: c.brandSoft, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  dayToday: { color: c.white },
  weekSummary: { color: '#FBEFE8', fontSize: 14, lineHeight: 20 },
  stats: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { minWidth: 140, minHeight: 84, flexGrow: 1, flexBasis: 140, backgroundColor: c.paperRaised, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: 14, alignItems: 'flex-start', justifyContent: 'center', gap: 2 },
  statValue: { color: c.ink, fontFamily: displayFont, fontSize: 30, lineHeight: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'left' },
  hero: { width: '100%', alignItems: 'flex-start', borderRadius: 22, borderCurve: 'continuous', backgroundColor: c.paperRaised, padding: spacing.lg, gap: spacing.sm },
  heroEyebrow: { color: c.brandText, fontSize: 12, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase' },
  heroTitle: { color: c.ink, fontFamily: displayFont, fontSize: 22, lineHeight: 28, fontWeight: '600', textAlign: 'left' },
  heroBody: { color: c.muted, fontSize: 14, lineHeight: 20, textAlign: 'left' },
  heroFootnotes: { width: '100%', gap: 2, borderTopColor: c.line, borderTopWidth: 1, paddingTop: spacing.sm, marginTop: spacing.xs },
  heroFootnoteText: { color: c.muted, fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'] },
  heroFootnoteForestText: { color: c.forestText, fontWeight: '600' },
  heroAction: { minHeight: 48, alignSelf: 'stretch', borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: spacing.xs },
  heroActionText: { color: c.ink, fontSize: 15, fontWeight: '600' },
  card: { width: '100%', backgroundColor: c.paperRaised, borderRadius: 22, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: c.ink, fontFamily: displayFont, fontSize: 17, lineHeight: 23, fontWeight: '600' },
  seeAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  seeAllText: { color: c.brand, fontSize: 13, fontWeight: '600' },
  planRow: { gap: 6 },
  planCopy: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  planTitle: { minWidth: 0, flexShrink: 1, color: c.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  planMeta: { color: c.muted, fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'] },
  planTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.track },
  planFill: { height: '100%', borderRadius: radius.pill, backgroundColor: c.brand },
  planFillComplete: { backgroundColor: c.forest },
} satisfies NamedStyles);

const useStyles = makeStyles(createProgressStyles);
