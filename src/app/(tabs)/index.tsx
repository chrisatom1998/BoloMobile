import { Redirect, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { ArrowRight, AudioLines, Flame, Settings } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { FlatList, Platform, Pressable, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { JournalDisplay } from '@/components/journal-chrome';
import { MotionReveal } from '@/components/motion';
import { getScene } from '@/data/scenes';
import { lessonPlans } from '@/data/lesson-plans';
import { useCalendarDay } from '@/hooks/use-calendar-day';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { dueSavedPhrases } from '@/lib/learning';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import { displayFont, makeStyles, maxContentWidth, radius, spacing, useSharedStyles, useTheme } from '@/theme';

const ashaPortrait = require('../../../assets/images/asha-portrait.png');
const goalRingRadius = 26;
const goalRingLength = 2 * Math.PI * goalRingRadius;

/** First `count` grapheme clusters (base letter plus its marks), so Devanagari matras stay attached. */
function leadingGraphemes(text: string, count: number) {
  const SegmenterCtor = (Intl as { Segmenter?: new (locale: string, options: { granularity: 'grapheme' }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (SegmenterCtor) {
    return Array.from(new SegmenterCtor('hi', { granularity: 'grapheme' }).segment(text)).slice(0, count).map((part) => part.segment).join('');
  }
  return text.match(/^(?:\p{L}\p{M}*){1,2}/u)?.[0] ?? text.slice(0, count);
}

export default function HomeScreen() {
  const router = useRouter();
  const state = useAppState();
  const { colors } = useTheme();
  const sharedStyles = useSharedStyles();
  const styles = useStyles();
  const contentTopPadding = Platform.OS === 'android'
    ? Math.max(18, (StatusBar.currentHeight ?? 0) + spacing.md)
    : 18;
  const largeTextLayout = useLargeTextLayout();
  const { width: windowWidth } = useWindowDimensions();
  const stackedTopbarLayout = largeTextLayout || windowWidth <= 380;
  const { goal, learnerProfile, motionPreference = DEFAULT_MOTION_PREFERENCE, phraseReviews, phrases, practice, sceneProgress: savedSceneProgress, setGoal, streak } = state;
  const { mode: motionMode } = useMotionPreference(motionPreference);
  const sceneProgress = useMemo(() => savedSceneProgress ?? {}, [savedSceneProgress]);
  const openLesson = useCallback((lessonId: string) => router.push({ pathname: '/scene/[id]', params: { id: lessonId } }), [router]);
  const openPlan = useCallback((planId: string) => router.push({ pathname: '/lesson-plans', params: { planId } }), [router]);
  // Whole minutes drive both the "min" label and the ring so they never disagree.
  const minutesToday = Math.floor(practice.seconds / 60);
  const goalPercent = Math.min(100, Math.round(minutesToday / goal * 100));
  const minutesToGo = Math.max(0, goal - minutesToday);
  // Every due phrase counts here, not the 5-phrase review-session cap from duePhrases.
  // `calendarDay` re-runs these after midnight: this tab stays mounted, and
  // phrases can fall due overnight without their references changing.
  const calendarDay = useCalendarDay();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- calendarDay invalidates the clock-based due check.
  const dueCount = useMemo(() => dueSavedPhrases(phrases, phraseReviews ?? {}, Infinity).length, [phraseReviews, phrases, calendarDay]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- calendarDay is the only input to today's date line.
  const dateLine = useMemo(() => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), [calendarDay]);
  const lessonSelection = useMemo(() => {
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
    const scene = getScene(lessonId);
    const mode = resumed ? 'continue' : incompletePlan ? 'next' : 'review';

    return {
      action: mode === 'continue' ? 'Continue' : mode === 'next' ? 'Start lesson' : 'Review lesson',
      kicker: mode === 'continue' ? 'CONTINUE LESSON' : mode === 'next' ? 'NEXT LESSON' : 'REVIEW LESSON',
      lessonId,
      plan,
      scene,
      title: scene?.title ?? plan.title,
    };
  }, [sceneProgress]);
  const currentPlan = lessonSelection.plan;
  const heroScene = lessonSelection.scene;
  const watermark = leadingGraphemes(heroScene?.words[0] ?? '', 2);

  const header = useMemo(() => (
    <View style={styles.headerContent}>
      <View style={[styles.topbar, stackedTopbarLayout && styles.topbarLarge]} testID="today-topbar">
        <View style={styles.greetingCopy}>
          <Text style={styles.dateLine}>{dateLine}</Text>
          <View style={styles.greetingRow}>
            <JournalDisplay style={styles.greeting}>Namaste</JournalDisplay>
            <Text accessibilityLanguage="hi-IN" style={styles.greetingHindi}>नमस्ते</Text>
          </View>
        </View>
        <View style={styles.topbarActions}>
          <Pressable accessibilityLabel={`${streak} day practice streak`} accessibilityRole="button" hitSlop={4} onPress={() => router.push('/progress' as Href)} style={styles.streakPill} testID="today-streak">
            <Flame color={colors.goldIcon} size={18} strokeWidth={2.2} />
            <Text style={styles.streakText}>{streak} day{streak === 1 ? '' : 's'}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.settingsButton}>
            <Settings color={colors.ink} size={20} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      <MotionReveal mode={motionMode} motionKey={lessonSelection.lessonId} style={styles.hero} testID="today-primary-motion">
        {watermark ? <Text accessible={false} ellipsizeMode="clip" numberOfLines={1} style={styles.heroWatermark}>{watermark}</Text> : null}
        <View style={styles.heroTopline}>
          <View style={styles.heroChip}><Text style={styles.heroChipText}>{lessonSelection.kicker}</Text></View>
          {heroScene?.place ? <Text numberOfLines={1} style={styles.heroMeta}>{heroScene.place}</Text> : null}
        </View>
        <View style={styles.heroCopy} testID="today-next-practice">
          <Text style={styles.heroTitle}>{lessonSelection.title}</Text>
          {heroScene?.subtitle ? <Text style={styles.heroSubtitle}>{heroScene.subtitle}</Text> : null}
        </View>
        {heroScene ? (
          <View style={styles.heroWords}>
            {heroScene.words.map((word) => (
              <View key={word} style={styles.heroWord}><Text accessibilityLanguage="hi-IN" style={styles.heroWordText}>{word}</Text></View>
            ))}
          </View>
        ) : null}
        <View style={[styles.heroFooter, largeTextLayout && styles.heroFooterLarge]} testID="today-hero-footer">
          <PressableFeedback accessibilityLabel={lessonSelection.action} accessibilityRole="button" onPress={() => openLesson(lessonSelection.lessonId)} style={styles.heroButton}>
            <Text style={styles.heroButtonText}>{lessonSelection.action}</Text>
            <ArrowRight color={colors.ink} size={18} strokeWidth={2.2} />
          </PressableFeedback>
          {heroScene ? <Text style={styles.heroMeta}>{heroScene.beats.length} beat{heroScene.beats.length === 1 ? '' : 's'}</Text> : null}
        </View>
      </MotionReveal>

      <View style={[styles.statRow, largeTextLayout && styles.statRowLarge]} testID="today-stat-row">
        <View style={styles.goalCard} testID="today-daily-goal">
          <View style={styles.goalHeader}>
            <Text style={styles.cardLabel}>Daily goal</Text>
            <Text style={styles.cardMeta} testID="today-goal-value">{goal} min</Text>
          </View>
          <View
            accessible
            accessibilityLabel={`${goalPercent} percent of daily goal complete`}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: goalPercent }}
            style={[styles.goalDial, largeTextLayout && styles.goalDialLarge]}
            testID="today-goal-dial"
          >
            <Svg accessibilityElementsHidden importantForAccessibility="no-hide-descendants" height={64} pointerEvents="none" viewBox="0 0 64 64" width={64}>
              <Circle cx={32} cy={32} fill="none" r={goalRingRadius} stroke={colors.track} strokeWidth={8} />
              {goalPercent > 0 ? (
                <Circle
                  cx={32}
                  cy={32}
                  fill="none"
                  r={goalRingRadius}
                  rotation={-90}
                  origin="32, 32"
                  stroke={colors.brand}
                  strokeDasharray={`${goalRingLength * goalPercent / 100} ${goalRingLength}`}
                  strokeLinecap="round"
                  strokeWidth={8}
                />
              ) : null}
            </Svg>
            <View style={styles.goalValue}>
              <Text style={styles.goalMinutes}>{minutesToday}<Text style={styles.goalMinutesUnit}> min</Text></Text>
              <Text style={styles.cardMeta}>{minutesToGo > 0 ? `${minutesToGo} to go` : 'Goal reached'}</Text>
            </View>
          </View>
          <View style={styles.goalChoices} testID="today-goal-status">
            {([5, 10, 15] as const).map((minutes) => (
              <Pressable
                key={minutes}
                accessibilityLabel={`${minutes} minute daily goal`}
                accessibilityRole="button"
                accessibilityState={{ selected: goal === minutes }}
                onPress={() => setGoal(minutes)}
                style={[styles.goalChoice, goal === minutes && styles.goalChoiceActive]}
                testID={`today-goal-choice-${minutes}`}
              >
                <Text style={[styles.goalChoiceText, goal === minutes && styles.goalChoiceTextActive]}>{minutes}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <PressableFeedback
          accessibilityLabel={dueCount > 0 ? `Review ${dueCount} saved phrase${dueCount === 1 ? '' : 's'} due now` : 'Open saved phrases'}
          accessibilityRole="button"
          onPress={() => router.push((dueCount > 0 ? '/review' : '/phrases') as Href)}
          style={styles.reviewCard}
          testID="today-language-garden"
        >
          <Text style={styles.reviewLabel}>{phrases.length === 0 ? 'Saved phrases' : 'Ready to review'}</Text>
          <Text style={styles.reviewCount}>{dueCount}</Text>
          <Text style={styles.reviewMeta}>{phrases.length === 0 ? 'Save one from any lesson' : dueCount === 1 ? 'phrase due' : 'phrases due'}</Text>
        </PressableFeedback>
      </View>

      <PressableFeedback accessibilityLabel="Talk with Asha" accessibilityRole="button" onPress={() => router.push('/live' as Href)} style={[styles.ashaRow, largeTextLayout && styles.ashaRowLarge]} testID="today-talk-with-asha">
        <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.ashaPortrait} testID="today-asha-portrait" transition={0} />
        <View style={styles.ashaCopy}>
          <Text style={styles.ashaTitle}>Talk with Asha</Text>
          <Text style={styles.ashaBody}>Try today’s lesson lines out loud</Text>
        </View>
        <View style={styles.ashaOrb}><AudioLines color={colors.ink} size={20} strokeWidth={2.2} /></View>
      </PressableFeedback>
    </View>
  ), [colors, dateLine, dueCount, goal, goalPercent, phrases.length, heroScene, largeTextLayout, lessonSelection, minutesToGo, minutesToday, motionMode, openLesson, router, setGoal, stackedTopbarLayout, streak, styles, watermark]);

  const footer = useMemo(() => (
    <View style={styles.footerContent}>
      <PressableFeedback accessibilityLabel={`Browse all ${lessonPlans.length} plans`} accessibilityRole="button" onPress={() => router.push('/lesson-plans' as Href)} style={styles.lessonPlansLink} testID="today-plan-catalog">
        <Text style={styles.lessonPlansTitle}>{`Browse all ${lessonPlans.length} plans`}</Text>
        <ArrowRight color={colors.brandText} size={16} strokeWidth={2.2} />
      </PressableFeedback>
    </View>
  ), [colors.brandText, router, styles]);

  if (learnerProfile?.completed === false) return <Redirect href={'/onboarding' as Href} />;

  return (
    <FlatList
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.list, { paddingTop: contentTopPadding }]}
      data={currentPlan ? [currentPlan] : []}
      keyExtractor={(plan) => plan.id}
      renderItem={({ item: plan }) => {
        const completed = plan.lessonIds.filter((id) => (sceneProgress[id]?.completions ?? 0) > 0).length;
        const selectedLessonIndex = plan.lessonIds.indexOf(lessonSelection.lessonId);
        const selectedProgress = sceneProgress[lessonSelection.lessonId];
        const selectedLessonIsInProgress = selectedLessonIndex >= 0
          && (selectedProgress?.completions ?? 0) === 0
          && (selectedProgress?.lastBeatIndex ?? 0) > 0;
        const planMeta = selectedLessonIsInProgress
          ? `Lesson ${selectedLessonIndex + 1} in progress`
          : `${completed} of ${plan.lessonIds.length} lessons`;
        return (
          <MotionReveal mode={motionMode} motionKey={plan.id} style={styles.planCell} testID="today-current-plan">
            <View style={[styles.pathHeading, largeTextLayout && styles.pathHeadingLarge]}>
              <JournalDisplay style={styles.pathTitle}>Your path</JournalDisplay>
              <Text style={styles.pathMeta}>Plan {String(plan.order).padStart(2, '0')} of {lessonPlans.length}</Text>
            </View>
            <PressableFeedback
              accessibilityLabel={`${plan.title}, plan ${plan.order} of ${lessonPlans.length}, ${selectedLessonIsInProgress ? `${planMeta.toLowerCase()}, ` : ''}${completed} of ${plan.lessonIds.length} lessons complete`}
              accessibilityRole="button"
              onPress={() => openPlan(plan.id)}
              style={styles.planCard}
            >
              <View style={[styles.planCopy, largeTextLayout && styles.planCopyLarge]}>
                <Text style={styles.planTitle}>{plan.title}</Text>
                <Text style={styles.planMeta}>{planMeta}</Text>
              </View>
              <View style={styles.planSegments} testID="today-plan-segments">
                {plan.lessonIds.map((lessonId, index) => {
                  const done = (sceneProgress[lessonId]?.completions ?? 0) > 0;
                  const current = !done && lessonId === lessonSelection.lessonId;
                  return <View key={lessonId} style={[styles.planSegment, done && styles.planSegmentDone, current && styles.planSegmentCurrent]} testID={`today-plan-segment-${index}`} />;
                })}
              </View>
            </PressableFeedback>
          </MotionReveal>
        );
      }}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      style={sharedStyles.screen}
      testID="today-guided-plan-list"
    />
  );
}

const useStyles = makeStyles((c) => ({
  list: { width: '100%', alignItems: 'stretch', paddingHorizontal: 20, paddingTop: 18, paddingBottom: spacing.xxl },
  headerContent: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', minWidth: 0, alignItems: 'stretch', gap: spacing.md, marginBottom: spacing.lg },
  footerContent: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', gap: spacing.lg, marginTop: spacing.md },
  planCell: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', gap: 10 },
  topbar: { width: '100%', minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  topbarLarge: { minHeight: 0, flexDirection: 'column', alignItems: 'stretch', gap: spacing.md, paddingRight: 0 },
  greetingCopy: { minWidth: 0, flex: 1, gap: 2 },
  dateLine: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  greetingRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing.sm },
  greeting: { fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  greetingHindi: { color: c.brand, fontFamily: displayFont, fontSize: 22, lineHeight: 30, fontWeight: '600' },
  topbarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streakPill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, paddingLeft: 10, paddingRight: spacing.md },
  streakText: { color: c.ink, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  settingsButton: { width: 48, height: 48, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1 },
  hero: { width: '100%', overflow: 'hidden', borderRadius: radius.xxl, borderCurve: 'continuous', backgroundColor: c.brand, padding: 22, gap: 14 },
  heroWatermark: { position: 'absolute', right: -14, top: -38, color: 'rgba(255, 255, 255, 0.10)', fontFamily: displayFont, fontSize: 168, lineHeight: 190, fontWeight: '700' },
  heroTopline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  heroChip: { borderRadius: radius.pill, backgroundColor: c.gold, paddingHorizontal: 9, paddingVertical: 4 },
  heroChipText: { color: c.ink, fontSize: 11, lineHeight: 15, fontWeight: '600', letterSpacing: 0.9 },
  heroMeta: { color: c.brandSoft, fontSize: 13, lineHeight: 18 },
  heroCopy: { gap: 4 },
  heroTitle: { color: c.white, fontFamily: displayFont, fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -0.3 },
  heroSubtitle: { color: '#FBEFE8', fontSize: 15, lineHeight: 21 },
  heroWords: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroWord: { borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.14)', paddingHorizontal: spacing.md, paddingVertical: 6 },
  heroWordText: { color: c.white, fontFamily: displayFont, fontSize: 15, lineHeight: 22 },
  heroFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: 4 },
  heroFooterLarge: { flexDirection: 'column', alignItems: 'stretch' },
  heroButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, paddingHorizontal: 20 },
  heroButtonText: { color: c.ink, fontSize: 16, fontWeight: '600' },
  statRow: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },
  statRowLarge: { flexDirection: 'column' },
  goalCard: { minWidth: 0, flex: 1, borderRadius: 22, borderCurve: 'continuous', backgroundColor: c.paperRaised, padding: spacing.lg, gap: 10 },
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardLabel: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  cardMeta: { color: c.muted, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  goalDial: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  goalDialLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  goalValue: { minWidth: 0, flex: 1, gap: 2 },
  goalMinutes: { color: c.ink, fontFamily: displayFont, fontSize: 28, lineHeight: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  goalMinutesUnit: { color: c.muted, fontFamily: undefined, fontSize: 15, fontWeight: '600' },
  goalChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  goalChoice: { minWidth: 44, flexGrow: 1, flexBasis: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.track },
  goalChoiceActive: { backgroundColor: c.ink },
  goalChoiceText: { color: c.muted, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  goalChoiceTextActive: { color: c.white },
  reviewCard: { minWidth: 0, flex: 1, justifyContent: 'space-between', gap: 6, borderRadius: 22, borderCurve: 'continuous', backgroundColor: c.goldSoft, padding: spacing.lg },
  reviewLabel: { color: c.goldText, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  reviewCount: { color: c.ink, fontFamily: displayFont, fontSize: 40, lineHeight: 44, fontWeight: '700', fontVariant: ['tabular-nums'] },
  reviewMeta: { color: c.goldText, fontSize: 12, lineHeight: 16 },
  ashaRow: { width: '100%', minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22, borderCurve: 'continuous', backgroundColor: c.neutralSurface, paddingVertical: 14, paddingLeft: 14, paddingRight: spacing.lg },
  ashaRowLarge: { flexWrap: 'wrap' },
  ashaPortrait: { width: 52, height: 52, borderRadius: radius.pill, borderColor: c.gold, borderWidth: 2, backgroundColor: c.brandSoft },
  ashaCopy: { minWidth: 0, flex: 1, gap: 2 },
  ashaTitle: { color: c.white, fontSize: 16, lineHeight: 21, fontWeight: '600' },
  ashaBody: { color: c.heroSubtle, fontSize: 13, lineHeight: 18 },
  ashaOrb: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  pathHeading: { width: '100%', flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  pathHeadingLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  pathTitle: { fontSize: 18, lineHeight: 24, letterSpacing: -0.2, fontWeight: '600' },
  pathMeta: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  planCard: { width: '100%', minHeight: 48, gap: 10, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, padding: spacing.lg },
  planCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  planCopyLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  planTitle: { minWidth: 0, flexShrink: 1, color: c.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  planMeta: { color: c.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  planSegments: { flexDirection: 'row', gap: 6 },
  planSegment: { minWidth: 0, flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: c.line },
  planSegmentDone: { backgroundColor: c.brand },
  planSegmentCurrent: { backgroundColor: c.goldIcon },
  lessonPlansLink: { width: '100%', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.xs },
  lessonPlansTitle: { color: c.brandText, fontSize: 14, lineHeight: 20, fontWeight: '600' },
}));
