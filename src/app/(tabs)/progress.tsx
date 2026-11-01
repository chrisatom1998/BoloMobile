import { useRouter, type Href } from 'expo-router';
import { Share2 } from 'lucide-react-native';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { useMemo } from 'react';
import { Platform, Share, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JournalDisplay } from '@/components/journal-chrome';
import { getScene } from '@/data/scenes';
import { lessonPlans } from '@/data/lesson-plans';
import { selectNextLesson } from '@/lib/lesson-path';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { showAppAlert } from '@/lib/app-alert';
import { completedLessonCount, learningAccuracy, milestoneProgress, weeklyPractice } from '@/lib/learning';
import { useAppStateValue } from '@/state/app-state';
import { createButtonStyles, displayFont, hindiType, makeStyles, radius, spacing, type, useSharedStyles, useTheme, type NamedStyles, type ThemeColors } from '@/theme';
import { StatusBarScrim } from '@/components/status-bar-scrim';

export default function ProgressScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const sharedStyles = useSharedStyles();
  const styles = useStyles();
  const largeTextLayout = useLargeTextLayout();
  const insets = useSafeAreaInsets();
  const { learnerProfile, phrases, practiceHistory, reviewStreak, sceneProgress, streak } = useAppStateValue();
  const { week, maxMinutes } = useMemo(() => {
    const days = weeklyPractice(practiceHistory);
    return { week: days, maxMinutes: Math.max(1, ...days.map((day) => Math.floor(day.seconds / 60))) };
  }, [practiceHistory]);
  const { accuracy, answeredTurns, completedScenes, milestones } = useMemo(() => ({
    accuracy: learningAccuracy(sceneProgress),
    answeredTurns: Object.values(sceneProgress).reduce((total, item) => total + item.totalAnswers, 0),
    milestones: milestoneProgress(sceneProgress),
    completedScenes: completedLessonCount(sceneProgress),
  }), [sceneProgress]);
  const reviewedThisWeek = week.reduce((total, day) => total + day.reviews, 0);
  const minutesThisWeek = week.reduce((total, day) => total + Math.floor(day.seconds / 60), 0);
  const activeDaysThisWeek = week.filter((day) => day.seconds > 0 || day.reviews > 0).length;
  const hasLearningActivity = practiceHistory.some((day) => day.seconds > 0 || day.reviews > 0)
    || Object.values(sceneProgress).some((item) => item.completions > 0 || item.lastBeatIndex > 0)
    || streak > 0
    || reviewStreak > 0;
  const lessonFocus = useMemo(() => {
    const { lessonId, mode: pathMode, plan } = selectNextLesson(sceneProgress, learnerProfile);
    const lesson = getScene(lessonId);
    const lessonIndex = Math.max(0, plan.lessonIds.indexOf(lessonId));
    const progress = sceneProgress[lessonId];
    const mode = pathMode === 'next' ? 'start' : pathMode;
    const turnCount = lesson?.beats.length ?? 10;
    const currentTurn = Math.min(turnCount, (progress?.lastBeatIndex ?? 0) + 1);

    return {
      action: mode === 'continue' ? 'Continue lesson' : mode === 'start' ? 'Start lesson' : 'Review lesson',
      lessonId,
      metric: mode === 'continue'
        ? `Plan ${String(plan.order).padStart(2, '0')} · Lesson ${lessonIndex + 1} of ${plan.lessonIds.length} · Turn ${currentTurn} of ${turnCount}`
        : `Plan ${String(plan.order).padStart(2, '0')} · Lesson ${lessonIndex + 1} of ${plan.lessonIds.length} · ${turnCount} turns`,
      mode,
      planId: plan.id,
      title: lesson?.title ?? plan.title,
    };
  }, [learnerProfile, sceneProgress]);
  // Only plans the learner has started, plus the current one; the full catalog lives in All plans.
  const planProgress = useMemo(() => lessonPlans.map((plan) => {
    const completed = plan.lessonIds.filter((id) => (sceneProgress[id]?.completions ?? 0) > 0).length;
    return { completed, id: plan.id, percent: Math.round(completed / plan.lessonIds.length * 100), title: plan.title, total: plan.lessonIds.length };
  }).filter((plan) => plan.completed > 0 || plan.id === lessonFocus.planId), [lessonFocus.planId, sceneProgress]);
  const weekActivityLabel = reviewedThisWeek > 0
    ? `${reviewedThisWeek} phrase review${reviewedThisWeek === 1 ? '' : 's'}`
    : activeDaysThisWeek > 0
      ? `${activeDaysThisWeek} active day${activeDaysThisWeek === 1 ? '' : 's'}`
      : 'No activity yet';
  const weekSummary = activeDaysThisWeek > 0
    ? `${minutesThisWeek} minute${minutesThisWeek === 1 ? '' : 's'} across ${activeDaysThisWeek} day${activeDaysThisWeek === 1 ? '' : 's'} this week.`
    : 'Your first practice minutes will show here.';

  const stats = [
    { accessibilityLabel: `${streak} day practice streak`, key: 'streak', label: 'day streak', value: String(streak) },
    { accessibilityLabel: `${phrases.length} phrase${phrases.length === 1 ? '' : 's'} saved`, key: 'phrases', label: phrases.length === 1 ? 'phrase' : 'phrases', value: String(phrases.length) },
    { accessibilityLabel: `${completedScenes} lesson${completedScenes === 1 ? '' : 's'} finished`, key: 'scenes', label: completedScenes === 1 ? 'lesson' : 'lessons', value: String(completedScenes) },
    // No answered turns yet: a dash, not a misleading 0%.
    answeredTurns > 0
      ? { accessibilityLabel: `${accuracy} percent answer accuracy`, key: 'accuracy', label: 'accuracy', value: `${accuracy}%` }
      : { accessibilityLabel: 'Answer accuracy, no answers yet', key: 'accuracy', label: 'accuracy', value: '–' },
  ];

  function shareMilestones() {
    const achieved = milestones.filter((item) => item.achieved).map((item) => item.title);
    const message = achieved.length
      ? `I’m practicing real-life Hindi with Bolo. ${completedScenes} lesson${completedScenes === 1 ? '' : 's'} complete — ${achieved.join(', ')}.`
      : `I’m building practical Hindi confidence with Bolo. ${completedScenes} lesson${completedScenes === 1 ? '' : 's'} complete.`;
    void Share.share({ message, title: 'My Bolo progress' }).catch((error: unknown) => {
      showAppAlert('Could not share your progress', error instanceof Error ? error.message : 'Try again in a moment.');
    });
  }

  return (
    <>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, Platform.OS === 'android' && { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]} style={sharedStyles.screen}>
        <View style={[styles.pageHeading, largeTextLayout && styles.pageHeadingLarge]} testID="progress-page-heading">
          <View style={[styles.pageHeadingCopy, largeTextLayout && styles.pageHeadingCopyLarge]}>
            <JournalDisplay style={styles.pageTitle}>Progress</JournalDisplay>
            <Text style={[styles.pageSubtitle, largeTextLayout && styles.pageSubtitleLarge]}>What is taking root.</Text>
          </View>
          <PressableFeedback accessibilityLabel="Share progress" accessibilityRole="button" onPress={shareMilestones} style={styles.shareButton}>
            <Share2 color={colors.ink} size={18} />
          </PressableFeedback>
        </View>

        {hasLearningActivity ? <>
        <View style={styles.weekCard}>
          <Text accessibilityElementsHidden accessible={false} aria-hidden importantForAccessibility="no-hide-descendants" numberOfLines={1} style={styles.weekWatermark}>बोलो</Text>
          <View style={styles.weekHeading}>
            <View style={styles.weekHeadingCopy}>
              <Text style={styles.weekEyebrow}>Last 7 days</Text>
              <Text style={styles.weekMeta}>{weekActivityLabel}</Text>
            </View>
            <Text
              accessibilityLabel={`${minutesThisWeek} minute${minutesThisWeek === 1 ? '' : 's'} practiced in the last 7 days`}
              style={styles.weekTotal}
              testID="progress-week-total"
            >
              {minutesThisWeek}<Text style={styles.weekTotalUnit}> min</Text>
            </Text>
          </View>
          <View
            accessible
            accessibilityLabel={`Practice minutes, last 7 days: ${week.map((day) => `${new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })} ${Math.floor(day.seconds / 60)}`).join(', ')}`}
            accessibilityRole="image"
            style={styles.chart}
          >
            {week.map((day, index) => {
              const minutes = Math.floor(day.seconds / 60);
              const today = index === week.length - 1;
              // A zero-minute day used to keep the 8-point minimum bar, so the
              // chart disagreed with its own "0" label. Cap real days at 100%.
              const barPercent = minutes <= 0 ? 0 : Math.min(100, Math.max(6, minutes / maxMinutes * 100));
              return (
                <View key={day.date} style={styles.barColumn}>
                  <Text style={[styles.barValue, today && styles.barValueToday]}>{minutes > 0 ? minutes : ' '}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[styles.bar, minutes > 0 && today && styles.barToday, minutes > 0 ? { height: `${barPercent}%` } : styles.barEmpty]}
                      testID="progress-day-bar"
                    />
                  </View>
                  <Text style={[styles.day, today && styles.dayToday]}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.weekSummary}>{weekSummary}</Text>
        </View>

        <View style={[styles.stats, largeTextLayout && styles.statsLarge]} testID="progress-stats">
          {stats.map((stat) => (
            <View
              key={stat.key}
              accessible
              accessibilityLabel={stat.accessibilityLabel}
              style={[styles.stat, largeTextLayout && styles.statLarge]}
              testID={`progress-stat-${stat.key}`}
            >
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
        </> : null}

        <View style={styles.card} testID="progress-milestones">
          <Text style={styles.title}>Real-life milestones</Text>
          {milestones.map((milestone) => {
            const total = milestone.sceneIds.length;
            const percent = Math.round(milestone.completed / total * 100);
            const lessonWord = total === 1 ? 'lesson' : 'lessons';
            return (
              <View
                key={milestone.id}
                accessible
                accessibilityLabel={milestone.achieved
                  ? `${milestone.title}, complete`
                  : `${milestone.title}, ${milestone.completed} of ${total} ${lessonWord} complete`}
                accessibilityRole="progressbar"
                accessibilityValue={{ max: total, min: 0, now: milestone.completed }}
                style={styles.milestoneRow}
                testID={`progress-milestone-${milestone.id}`}
              >
                <View style={styles.planCopy}>
                  <Text style={[styles.milestoneTitle, milestone.achieved && styles.milestoneTitleDone]}>{milestone.title}</Text>
                  <Text style={styles.planMeta}>{milestone.achieved ? 'Done' : `${milestone.completed}/${total}`}</Text>
                </View>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.planTrack}>
                  <View style={[styles.planFill, milestone.achieved && styles.planFillComplete, { width: `${Math.max(percent, milestone.completed > 0 ? 4 : 0)}%` }]} />
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>
            {lessonFocus.mode === 'continue' ? 'Current lesson' : !hasLearningActivity ? 'Your first lesson' : lessonFocus.mode === 'review' ? 'Review lesson' : 'Next lesson'}
          </Text>
          <Text style={styles.heroTitle}>{lessonFocus.title}</Text>
          <Text style={styles.heroBody}>{lessonFocus.metric}</Text>
          <View style={styles.heroFootnotes}>
            {hasLearningActivity ? <Text style={styles.heroFootnoteText}>{completedScenes} lesson{completedScenes === 1 ? '' : 's'} finished · {reviewedThisWeek} review{reviewedThisWeek === 1 ? '' : 's'} this week</Text> : <Text style={styles.heroFootnoteText}>Your week, streak and saved phrases will show up here after your first lesson.</Text>}
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
            <Text style={styles.title}>Your plans</Text>
            <PressableFeedback accessibilityLabel={`See all ${lessonPlans.length} lesson plans`} accessibilityRole="button" onPress={() => router.push('/lesson-plans' as Href)} style={styles.seeAll}>
              <Text style={styles.seeAllText}>See all</Text>
            </PressableFeedback>
          </View>
          {planProgress.map((plan) => (
            <View key={plan.id} style={styles.planRow}>
              <View style={styles.planCopy}>
                <Text numberOfLines={largeTextLayout ? undefined : 1} style={styles.planTitle}>{plan.title}</Text>
                <Text style={styles.planMeta}>{plan.completed === plan.total ? 'Complete' : `${plan.completed}/${plan.total}`}</Text>
              </View>
              <View
                accessible
                accessibilityLabel={`${plan.title}: ${plan.completed} of ${plan.total} lessons complete`}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: plan.total, now: plan.completed }}
                style={styles.planTrack}
              >
                <View style={[styles.planFill, plan.completed === plan.total && styles.planFillComplete, { width: `${Math.max(plan.percent, plan.completed > 0 ? 4 : 0)}%` }]} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <StatusBarScrim />
    </>
  );
}

export const createProgressStyles = (c: ThemeColors) => {
  const button = createButtonStyles(c);
  return {
  content: { alignItems: 'center', padding: spacing.gutter, paddingTop: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  pageHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.sm },
  pageHeadingLarge: { flexDirection: 'column', alignItems: 'stretch' },
  pageHeadingCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  pageHeadingCopyLarge: { flex: 0, width: '100%' },
  pageTitle: { ...type.display },
  pageSubtitle: { ...type.body, maxWidth: 300, color: c.muted, fontFamily: displayFont, textAlign: 'left' },
  pageSubtitleLarge: { maxWidth: '100%' },
  shareButton: { width: 44, height: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weekCard: { width: '100%', overflow: 'hidden', borderRadius: radius.xxl, borderCurve: 'continuous', backgroundColor: c.brand, padding: spacing.gutter, gap: spacing.lg },
  // Tucked into the top-right corner, small and faint, so it never sits behind the bars.
  weekWatermark: { ...hindiType(64), position: 'absolute', top: -14, right: -6, color: c.onBrandWatermark },
  weekHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  weekHeadingCopy: { minWidth: 0, flexShrink: 1, gap: spacing.xs, paddingTop: spacing.sm },
  weekEyebrow: { ...type.eyebrow, color: c.brandSoft },
  weekMeta: { ...type.caption, color: c.brandSoft },
  weekTotal: { ...type.display, color: c.white, fontVariant: ['lining-nums', 'tabular-nums'], textAlign: 'right' },
  weekTotalUnit: { ...type.label, color: c.brandSoft },
  chart: { minHeight: 132, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  barColumn: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  barValue: { ...type.caption, color: c.brandSoft, fontVariant: ['lining-nums', 'tabular-nums'] },
  barValueToday: { color: c.white, fontWeight: '700' },
  barTrack: { flex: 1, minHeight: 64, width: '100%', maxWidth: 32, justifyContent: 'flex-end' },
  bar: { width: '100%', minHeight: spacing.sm, borderRadius: radius.sm, borderCurve: 'continuous', backgroundColor: c.backgroundWarm },
  // Zero-minute days keep a 4 pt stub so all seven days always show.
  barEmpty: { height: spacing.xs, minHeight: spacing.xs, borderRadius: radius.pill, backgroundColor: c.track },
  barToday: { backgroundColor: c.gold },
  day: { ...type.caption, color: c.brandSoft, fontWeight: '600' },
  dayToday: { color: c.white },
  weekSummary: { ...type.caption, color: c.onBrandText },
  stats: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statsLarge: { flexDirection: 'column', flexWrap: 'nowrap' },
  stat: { minWidth: 0, flexBasis: '47%', flexGrow: 1, gap: spacing.xs, backgroundColor: c.paperRaised, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg },
  statLarge: { flexBasis: 'auto', flexGrow: 0, flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  statValue: { ...type.title, color: c.ink, fontVariant: ['lining-nums', 'tabular-nums'] },
  statLabel: { ...type.caption, color: c.muted },
  hero: { width: '100%', alignItems: 'flex-start', borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, padding: spacing.lg, gap: spacing.sm },
  heroEyebrow: { ...type.eyebrow, color: c.brandText },
  heroTitle: { ...type.headline, color: c.ink, textAlign: 'left' },
  heroBody: { ...type.caption, color: c.muted, textAlign: 'left', fontVariant: ['lining-nums', 'tabular-nums'] },
  heroFootnotes: { width: '100%', gap: spacing.xs, borderTopColor: c.line, borderTopWidth: 1, paddingTop: spacing.sm, marginTop: spacing.xs },
  heroFootnoteText: { ...type.caption, color: c.muted, fontVariant: ['lining-nums', 'tabular-nums'] },
  heroFootnoteForestText: { color: c.forestText, fontWeight: '600' },
  heroAction: { ...button.primary, alignSelf: 'stretch', marginTop: spacing.xs },
  heroActionText: button.primaryText,
  card: { width: '100%', backgroundColor: c.paperRaised, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { ...type.headline, color: c.ink },
  seeAll: button.quiet,
  seeAllText: button.quietText,
  planRow: { gap: spacing.sm },
  milestoneRow: { gap: spacing.sm },
  milestoneTitle: { ...type.label, minWidth: 0, flexShrink: 1, color: c.ink },
  milestoneTitleDone: { color: c.forestText },
  planCopy: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  planTitle: { ...type.label, minWidth: 0, flexShrink: 1, color: c.ink },
  planMeta: { ...type.caption, color: c.muted, fontVariant: ['lining-nums', 'tabular-nums'] },
  planTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.track },
  planFill: { height: '100%', borderRadius: radius.pill, backgroundColor: c.brand },
  planFillComplete: { backgroundColor: c.forest },
  } satisfies NamedStyles;
};

const useStyles = makeStyles(createProgressStyles);
