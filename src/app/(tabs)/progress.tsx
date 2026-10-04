import { useRouter, type Href } from 'expo-router';
import { Award, Check, Share2 } from 'lucide-react-native';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { useMemo } from 'react';
import { Platform, Share, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getScene } from '@/data/scenes';
import { lessonPlans } from '@/data/lesson-plans';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { showAppAlert } from '@/lib/app-alert';
import { categoryMastery, learningAccuracy, milestoneProgress, weeklyPractice } from '@/lib/learning';
import { useAppStateValue } from '@/state/app-state';
import { makeStyles, maxContentWidth, radius, spacing, useSharedStyles, useTheme, type NamedStyles, type ThemeColors } from '@/theme';

export default function ProgressScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const sharedStyles = useSharedStyles();
  const styles = useStyles();
  const largeTextLayout = useLargeTextLayout();
  const insets = useSafeAreaInsets();
  const { duePhrases, learnerProfile, phraseReviews, phrases, practiceHistory, reviewStreak, sceneProgress, streak } = useAppStateValue();
  const { week, maxMinutes, totalMinutes } = useMemo(() => {
    const days = weeklyPractice(practiceHistory);
    const minutes = days.map((day) => Math.round(day.seconds / 60));
    return { week: days, maxMinutes: Math.max(1, ...minutes), totalMinutes: minutes.reduce((total, value) => total + value, 0) };
  }, [practiceHistory]);
  const planProgress = useMemo(() => {
    const plans = lessonPlans.map((plan) => {
      const done = plan.lessonIds.filter((id) => (sceneProgress[id]?.completions ?? 0) > 0).length;
      return { done, id: plan.id, title: plan.title, total: plan.lessonIds.length };
    });
    // Show the plan being worked on with its neighbours: the last finished plan and the next one.
    const current = plans.findIndex((plan) => plan.done < plan.total);
    const anchor = current === -1 ? plans.length - 1 : current;
    const start = Math.max(0, Math.min(anchor - 1, plans.length - 3));
    return plans.slice(start, start + 3);
  }, [sceneProgress]);
  const { accuracy, categories, completedScenes, milestones } = useMemo(() => ({
    categories: categoryMastery(sceneProgress),
    accuracy: learningAccuracy(sceneProgress),
    milestones: milestoneProgress(sceneProgress),
    completedScenes: Object.values(sceneProgress).filter((item) => item.completions > 0).length,
  }), [sceneProgress]);
  const reviewedThisWeek = week.reduce((total, day) => total + day.reviews, 0);
  const activeDaysThisWeek = week.filter((day) => day.seconds > 0 || day.reviews > 0).length;
  const hasLearningActivity = practiceHistory.some((day) => day.seconds > 0 || day.reviews > 0)
    || Object.values(sceneProgress).some((item) => item.completions > 0 || item.lastBeatIndex > 0)
    || streak > 0
    || reviewStreak > 0;
  const featuredPhrase = duePhrases[0] ?? phrases[0] ?? null;
  const featuredMastery = featuredPhrase ? phraseReviews[featuredPhrase.hi]?.mastery ?? 0 : 0;
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
  const streakLabel = streak > 0
    ? `${streak}-day practice streak`
    : hasLearningActivity
      ? 'No active practice streak'
      : 'No practice streak yet';
  const weekActivityLabel = reviewedThisWeek > 0
    ? `${reviewedThisWeek} phrase review${reviewedThisWeek === 1 ? '' : 's'}`
    : activeDaysThisWeek > 0
      ? `${activeDaysThisWeek} active day${activeDaysThisWeek === 1 ? '' : 's'}`
      : 'No activity yet';

  const weekSummary = totalMinutes > 0
    ? `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'} across ${activeDaysThisWeek} day${activeDaysThisWeek === 1 ? '' : 's'} this week.`
    : activeDaysThisWeek > 0
      ? `Practiced on ${activeDaysThisWeek} day${activeDaysThisWeek === 1 ? '' : 's'} this week. Every short session counts.`
      : 'Nothing logged yet this week. One short lesson starts the chart.';

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
          <Text accessibilityRole="header" style={styles.pageTitle}>Progress</Text>
          <Text style={[styles.pageSubtitle, largeTextLayout && styles.pageSubtitleLarge]}>What is taking root.</Text>
        </View>
        <PressableFeedback accessibilityHint="Opens the share sheet with your completed scenes and milestones." accessibilityLabel="Share progress" accessibilityRole="button" onPress={shareMilestones} style={styles.shareButton} testID="progress-share">
          <Share2 color={colors.ink} size={18} />
        </PressableFeedback>
      </View>

      <View style={styles.weekHero} testID="progress-week-hero">
        <Text accessible={false} importantForAccessibility="no" pointerEvents="none" style={styles.weekGlyph}>बो</Text>
        <View style={[styles.weekHeader, largeTextLayout && styles.weekHeaderLarge]}>
          <Text style={styles.weekEyebrow}>THIS WEEK</Text>
          <Text style={styles.weekMeta}>{weekActivityLabel}</Text>
        </View>
        <View accessibilityLabel="Weekly practice minutes chart" accessible style={styles.chart}>
          {week.map((day, index) => {
            const minutes = Math.round(day.seconds / 60);
            const today = index === week.length - 1;
            return (
              <View key={day.date} style={styles.barColumn}>
                <Text style={styles.barValue}>{minutes > 0 ? minutes : '–'}</Text>
                <View style={[styles.bar, { height: Math.max(4, Math.round(minutes / maxMinutes * 56)) }, minutes > 0 ? styles.barActive : styles.barEmpty, today && styles.barToday]} />
                <Text style={[styles.day, today && styles.dayToday]}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
              </View>
            );
          })}
        </View>
        <Text style={styles.weekSummary}>{weekSummary}</Text>
      </View>

      <View style={styles.stats}>
        <View style={[styles.stat, largeTextLayout && styles.statLarge]}><Text style={styles.statValue}>{completedScenes}</Text><Text style={styles.statLabel}>scenes learned</Text></View>
        <View style={[styles.stat, largeTextLayout && styles.statLarge]}><Text style={styles.statValue}>{accuracy}%</Text><Text style={styles.statLabel}>answer accuracy</Text></View>
        <View style={[styles.stat, largeTextLayout && styles.statLarge]}><Text style={styles.statValue}>{streak}</Text><Text style={styles.statLabel}>practice streak</Text></View>
        <View style={[styles.stat, largeTextLayout && styles.statLarge]}><Text style={styles.statValue}>{reviewStreak}</Text><Text style={styles.statLabel}>review streak</Text></View>
      </View>

      <View style={styles.focusCard} testID="progress-lesson-focus">
        <Text style={styles.eyebrow}>
          {lessonFocus.mode === 'continue' ? 'Current lesson' : !hasLearningActivity ? 'Your first lesson' : lessonFocus.mode === 'review' ? 'Review lesson' : 'Next lesson'}
        </Text>
        <Text style={styles.focusTitle}>{lessonFocus.title}</Text>
        <Text style={styles.focusBody}>{lessonFocus.metric}</Text>
        <View style={styles.focusNotes}>
          <View style={styles.focusNote}><Text style={styles.focusNoteText}>{completedScenes} scene{completedScenes === 1 ? '' : 's'} learned · {reviewedThisWeek} review{reviewedThisWeek === 1 ? '' : 's'} this week</Text></View>
          <View style={[styles.focusNote, styles.focusNoteForest]}><Text style={[styles.focusNoteText, styles.focusNoteForestText]}>{streakLabel}</Text></View>
        </View>
        <PressableFeedback
          accessibilityLabel={`${lessonFocus.action}: ${lessonFocus.title}`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/scene/[id]', params: { id: lessonFocus.lessonId } })}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>{lessonFocus.action}</Text>
        </PressableFeedback>
      </View>

      <View style={styles.card} testID="progress-lesson-plans">
        <View style={styles.cardTitleRow}>
          <Text accessibilityRole="header" style={styles.title}>Lesson plans</Text>
          <PressableFeedback accessibilityLabel="See all lesson plans" accessibilityRole="link" onPress={() => router.push('/lesson-plans' as Href)} style={styles.linkButton}>
            <Text style={styles.linkText}>See all</Text>
          </PressableFeedback>
        </View>
        {planProgress.map((plan) => {
          const complete = plan.done === plan.total;
          return (
            <PressableFeedback
              accessibilityLabel={`${plan.title}, ${plan.done} of ${plan.total} lessons complete`}
              accessibilityRole="button"
              key={plan.id}
              onPress={() => router.push({ pathname: '/lesson-plans', params: { planId: plan.id } })}
              style={styles.planRow}
            >
              <View style={styles.planCopy}>
                <Text style={styles.planTitle}>{plan.title}</Text>
                <Text style={styles.planMeta}>{plan.done} of {plan.total}</Text>
              </View>
              <View style={styles.track}><View style={[styles.fill, complete && styles.fillComplete, { width: `${Math.round(plan.done / Math.max(1, plan.total) * 100)}%` }]} /></View>
            </PressableFeedback>
          );
        })}
      </View>

      {featuredPhrase ? (
        <PressableFeedback accessibilityLabel={`Water saved phrase ${featuredPhrase.hi}`} accessibilityRole="button" onPress={() => router.push((duePhrases.length ? '/review' : '/phrases') as Href)} style={styles.card}>
          <Text style={styles.eyebrow}>Featured phrase</Text>
          <View style={styles.featuredCopy}>
            {learnerProfile.scriptPreference !== 'latin' ? <Text style={styles.featuredHindi}>{featuredPhrase.hi}</Text> : null}
            {learnerProfile.scriptPreference !== 'devanagari' ? <Text style={styles.featuredLatin}>{featuredPhrase.latin}</Text> : null}
            <Text style={styles.featuredEnglish}>{featuredPhrase.en}</Text>
          </View>
          <View style={styles.featuredMasteryRow}>
            <View accessibilityLabel={`Mastery ${featuredMastery} of 5`} style={styles.segments}>
              {Array.from({ length: 5 }, (_, index) => <View key={index} style={[styles.segment, index < featuredMastery && styles.segmentFilled]} />)}
            </View>
            <Text style={styles.featuredMasteryValue}>{featuredMastery}/5</Text>
          </View>
          <View style={styles.primaryButton}><Text style={styles.primaryButtonText}>{duePhrases.length ? 'Water this phrase' : 'Visit your phrase garden'}</Text></View>
        </PressableFeedback>
      ) : null}

      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>Category mastery</Text>
        {categories.map((item) => (
          <View key={item.category} style={styles.planRow}>
            <View style={styles.planCopy}><Text style={styles.planTitle}>{item.category}</Text><Text style={styles.planMeta}>{item.completed} of {item.total}</Text></View>
            <View style={styles.track}><View style={[styles.fill, item.completed === item.total && styles.fillComplete, { width: `${item.percent}%` }]} /></View>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitleRow}><Text accessibilityRole="header" style={styles.title}>Can-do milestones</Text><Award color={colors.brand} size={20} /></View>
        {milestones.map((item) => (
          <View key={item.id} style={styles.milestone}>
            <View style={[styles.milestoneMark, item.achieved && styles.milestoneMarkDone]}>{item.achieved ? <Check color={colors.white} size={16} /> : null}</View>
            <View style={styles.milestoneCopy}><Text style={styles.milestoneTitle}>{item.title}</Text><Text style={styles.planMeta}>{item.completed}/{item.sceneIds.length} scenes</Text></View>
          </View>
        ))}
        <PressableFeedback accessibilityRole="button" onPress={shareMilestones} style={styles.secondaryButton}><Share2 color={colors.ink} size={18} /><Text style={styles.secondaryButtonText}>Share a private milestone card</Text></PressableFeedback>
      </View>
    </ScrollView>
  );
}

export const createProgressStyles = (c: ThemeColors) => ({
  content: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'stretch', paddingHorizontal: spacing.lg, paddingTop: 18, paddingBottom: 120, gap: spacing.lg },
  pageHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.sm },
  pageHeadingLarge: { flexDirection: 'column', alignItems: 'stretch' },
  pageHeadingCopy: { minWidth: 0, flex: 1, gap: 2 },
  pageHeadingCopyLarge: { flex: 0, width: '100%' },
  pageTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.3, textAlign: 'left' },
  pageSubtitle: { maxWidth: 260, color: c.muted, fontSize: 14, lineHeight: 20, textAlign: 'left' },
  pageSubtitleLarge: { maxWidth: '100%' },
  shareButton: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  weekHero: { width: '100%', position: 'relative', overflow: 'hidden', borderRadius: 28, borderCurve: 'continuous', backgroundColor: c.brand, padding: 20, gap: spacing.lg },
  weekGlyph: { position: 'absolute', right: 8, bottom: -40, color: c.heroGlyph, opacity: 0.55, fontFamily: 'Georgia', fontSize: 150, lineHeight: 170, fontWeight: '700' },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  weekHeaderLarge: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.xs },
  weekEyebrow: { color: c.brandSoft, fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  weekMeta: { color: c.brandSoft, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  chart: { minHeight: 104, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  barColumn: { minWidth: 0, flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  barValue: { color: c.brandSoft, fontSize: 11, fontVariant: ['tabular-nums'] },
  bar: { width: '100%', maxWidth: 26, borderRadius: 8, borderCurve: 'continuous', backgroundColor: c.white },
  barActive: { opacity: 0.85 },
  barEmpty: { opacity: 0.25 },
  barToday: { backgroundColor: c.gold, opacity: 1 },
  day: { color: c.brandSoft, fontSize: 12, fontWeight: '500' },
  // goldSoft keeps today's label above 4.5:1 on the brand card; the bar itself carries the gold.
  dayToday: { color: c.goldSoft, fontWeight: '700' },
  weekSummary: { color: c.white, fontSize: 14, lineHeight: 20, textAlign: 'left' },
  stats: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { minWidth: 130, flexGrow: 1, flexBasis: 140, backgroundColor: c.paperRaised, borderRadius: radius.lg, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: spacing.lg, alignItems: 'flex-start', gap: 2 },
  statLarge: { flexBasis: '100%' },
  statValue: { color: c.ink, fontFamily: 'Georgia', fontSize: 30, lineHeight: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'left' },
  focusCard: { width: '100%', backgroundColor: c.paperRaised, borderRadius: 22, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.sm },
  eyebrow: { color: c.brandText, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  focusTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 22, lineHeight: 28, fontWeight: '700', textAlign: 'left' },
  focusBody: { color: c.muted, fontSize: 14, lineHeight: 20, textAlign: 'left' },
  focusNotes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  focusNote: { maxWidth: '100%', flexShrink: 1, borderRadius: radius.pill, backgroundColor: c.goldSoft, paddingHorizontal: 10, paddingVertical: spacing.xs },
  focusNoteText: { color: c.ink, fontSize: 12, fontWeight: '600' },
  focusNoteForest: { backgroundColor: c.forestSoft },
  focusNoteForestText: { color: c.forestText },
  primaryButton: { minHeight: 48, alignSelf: 'stretch', borderRadius: radius.pill, backgroundColor: c.neutralSurface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.xs },
  primaryButtonText: { color: c.neutralSurfaceText, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  card: { width: '100%', backgroundColor: c.paperRaised, borderRadius: 22, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  title: { color: c.ink, fontFamily: 'Georgia', fontSize: 17, lineHeight: 23, fontWeight: '700' },
  linkButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  linkText: { color: c.brandText, fontSize: 13, fontWeight: '600' },
  planRow: { minHeight: 44, justifyContent: 'center', gap: 6 },
  planCopy: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  planTitle: { flexShrink: 1, color: c.ink, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  planMeta: { color: c.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.line },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: c.brand },
  fillComplete: { backgroundColor: c.forest },
  featuredCopy: { gap: 2 },
  featuredHindi: { color: c.ink, fontFamily: 'Georgia', fontSize: 24, lineHeight: 32, fontWeight: '700' },
  featuredLatin: { color: c.brand, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  featuredEnglish: { color: c.muted, fontSize: 14, lineHeight: 20 },
  featuredMasteryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  segments: { flexDirection: 'row', gap: spacing.xs },
  segment: { width: 18, height: 6, borderRadius: radius.pill, backgroundColor: c.line },
  segmentFilled: { backgroundColor: c.brand },
  featuredMasteryValue: { color: c.muted, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  milestoneMark: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
  milestoneMarkDone: { borderColor: c.forest, backgroundColor: c.forest },
  milestoneCopy: { minWidth: 0, flex: 1, gap: 2 },
  milestoneTitle: { color: c.ink, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  secondaryButton: { minHeight: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.paperRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  secondaryButtonText: { flexShrink: 1, color: c.ink, fontSize: 14, fontWeight: '600', textAlign: 'center' },
} satisfies NamedStyles);

const useStyles = makeStyles(createProgressStyles);
