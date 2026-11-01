import { Redirect, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { ArrowRight, Check, Flame, Settings } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { FlatList, Platform, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { JournalDisplay } from '@/components/journal-chrome';
import { MotionReveal } from '@/components/motion';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { getScene } from '@/data/scenes';
import { lessonPlans } from '@/data/lesson-plans';
import { selectNextLesson } from '@/lib/lesson-path';
import { useCalendarDay } from '@/hooks/use-calendar-day';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { learnerPhraseLatin } from '@/lib/learner-phrase-display';
import { dueSavedPhrases } from '@/lib/learning';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
import { buildTodayPlan, type TodayStep } from '@/lib/today-plan';
import { useAppState } from '@/state/app-state';
import { createButtonStyles, hindiType, makeStyles, maxContentWidth, radius, spacing, type NamedStyles, type, useSharedStyles, useTheme } from '@/theme';
import { StatusBarScrim } from '@/components/status-bar-scrim';

const ashaPortrait = require('../../../assets/images/asha-portrait.png');
const goalRingSize = 76;
const goalRingStroke = 6;
const goalRingRadius = (goalRingSize - goalRingStroke) / 2;
const goalRingLength = 2 * Math.PI * goalRingRadius;
/** Due phrases previewed on the review step; the last one fades to hint at the rest. */
const reviewPreviewLimit = 3;

/** First `count` grapheme clusters (base letter plus its marks), so Devanagari matras stay attached. */
function leadingGraphemes(text: string, count: number) {
  const SegmenterCtor = (Intl as { Segmenter?: new (locale: string, options: { granularity: 'grapheme' }) => { segment: (input: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (SegmenterCtor) {
    return Array.from(new SegmenterCtor('hi', { granularity: 'grapheme' }).segment(text)).slice(0, count).map((part) => part.segment).join('');
  }
  return text.match(/^(?:\p{L}\p{M}*){1,2}/u)?.[0] ?? text.slice(0, count);
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const state = useAppState();
  const { colors } = useTheme();
  const sharedStyles = useSharedStyles();
  const styles = useStyles();
  const contentTopPadding = Platform.OS === 'android'
    ? Math.max(spacing.lg, (StatusBar.currentHeight ?? 0) + spacing.md)
    : spacing.lg;
  const largeTextLayout = useLargeTextLayout();
  const { width: windowWidth } = useWindowDimensions();
  const stackedTopbarLayout = largeTextLayout || windowWidth <= 380;
  const { goal, learnerProfile, motionPreference = DEFAULT_MOTION_PREFERENCE, phraseReviews, phrases, practice, practiceHistory, reviewStreakDays, sceneProgress: savedSceneProgress, streak } = state;
  const { mode: motionMode } = useMotionPreference(motionPreference);
  const sceneProgress = useMemo(() => savedSceneProgress ?? {}, [savedSceneProgress]);
  const openLesson = useCallback((lessonId: string) => router.push({ pathname: '/scene/[id]', params: { id: lessonId } }), [router]);
  const openPlan = useCallback((planId: string) => router.push({ pathname: '/lesson-plans', params: { planId } }), [router]);
  // Whole minutes drive both the label and the ring so they never disagree.
  const minutesToday = Math.floor(practice.seconds / 60);
  const goalPercent = Math.min(100, Math.round(minutesToday / goal * 100));
  // Past the goal the ring shows "15+" rather than a lopsided "911 of 15 min".
  const goalMet = minutesToday > goal;
  const minutesLabel = goalMet ? `${goal}+` : String(minutesToday);
  // Every due phrase counts here, not the 5-phrase review-session cap from duePhrases.
  // `calendarDay` re-runs these after midnight: this tab stays mounted, and
  // phrases can fall due overnight without their references changing.
  const calendarDay = useCalendarDay();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- calendarDay invalidates the clock-based due check.
  const duePhraseList = useMemo(() => dueSavedPhrases(phrases, phraseReviews ?? {}, Infinity), [phraseReviews, phrases, calendarDay]);
  const dueCount = duePhraseList.length;
  const showLatinPreview = learnerProfile?.scriptPreference === 'latin';
  const reviewPreview = useMemo(() => duePhraseList.slice(0, reviewPreviewLimit).map((phrase) => ({
    key: phrase.hi,
    text: showLatinPreview ? learnerPhraseLatin(phrase.hi, phrase.latin) : phrase.hi,
  })), [duePhraseList, showLatinPreview]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- calendarDay is the only input to today's date line.
  const dateLine = useMemo(() => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), [calendarDay]);
  const todayPlan = useMemo(
    () => buildTodayPlan({ dueCount, practice, practiceHistory, reviewStreakDays }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- calendarDay rolls the plan over at midnight.
    [calendarDay, dueCount, practice, practiceHistory, reviewStreakDays],
  );
  const lessonSelection = useMemo(() => {
    const { lessonId, mode, plan } = selectNextLesson(sceneProgress, learnerProfile);
    const scene = getScene(lessonId);

    return {
      action: mode === 'continue' ? 'Continue' : mode === 'next' ? 'Start lesson' : 'Review lesson',
      kicker: mode === 'continue' ? 'CONTINUE LESSON' : mode === 'next' ? 'NEXT LESSON' : 'REVIEW LESSON',
      lessonId,
      plan,
      scene,
      title: scene?.title ?? plan.title,
    };
  }, [learnerProfile, sceneProgress]);
  const currentPlan = lessonSelection.plan;
  const heroScene = lessonSelection.scene;

  const currentStep = todayPlan.nextStep;
  // A review step with nothing due is not shown, so a new learner never sees a struck-out "Skipped" row.
  const visibleSteps = useMemo(() => todayPlan.steps.filter((step) => !step.skipped), [todayPlan.steps]);
  const stepKicker = useCallback((key: TodayStep['key'], label: string) => {
    const position = visibleSteps.findIndex((step) => step.key === key) + 1;
    return position > 0 ? `STEP ${position} OF ${visibleSteps.length} · ${label}` : label;
  }, [visibleSteps]);
  const lessonNumber = lessonSelection.plan.lessonIds.indexOf(lessonSelection.lessonId) + 1;
  const hero = useMemo(() => {
    const lessonStep = {
      action: lessonSelection.action,
      chips: (heroScene?.words ?? []).map((word) => ({ key: word, latin: false, text: word })),
      kicker: stepKicker('lesson', lessonSelection.kicker),
      meta: lessonNumber > 0 ? `${lessonSelection.plan.title} · Lesson ${lessonNumber} of ${lessonSelection.plan.lessonIds.length}` : undefined,
      onPress: () => openLesson(lessonSelection.lessonId),
      subtitle: heroScene?.subtitle ? `New phrase: “${heroScene.subtitle.replace(/[.!?]$/u, '')}”` : undefined,
      title: lessonSelection.title,
    };
    switch (currentStep) {
      case 'review':
        return {
          action: 'Start review',
          chips: reviewPreview.map((item) => ({ ...item, latin: showLatinPreview })),
          kicker: stepKicker('review', 'REVIEW'),
          meta: undefined,
          onPress: () => router.push('/review' as Href),
          subtitle: `${plural(dueCount, 'phrase')} due. A quick recall keeps them fresh.`,
          title: 'Review your phrases',
        };
      case 'lesson':
        return lessonStep;
      case 'asha':
        return {
          action: 'Talk with Asha',
          chips: [],
          kicker: stepKicker('asha', 'SPEAK'),
          meta: undefined,
          onPress: () => router.push('/live' as Href),
          subtitle: 'Try today’s lesson lines out loud in a short chat with Asha.',
          title: 'Say it out loud',
        };
      default:
        return {
          ...lessonStep,
          action: 'Keep going',
          chips: [],
          kicker: 'DONE FOR TODAY',
          meta: undefined,
          subtitle: `Today’s practice is complete. ${streak > 0 ? `${plural(streak, 'day')} in a row. ` : ''}More is optional.`,
          title: 'Shabaash!',
        };
    }
  }, [dueCount, heroScene, lessonNumber, lessonSelection, openLesson, reviewPreview, router, showLatinPreview, stepKicker, streak, currentStep]);
  const dayComplete = currentStep === null;
  const watermark = leadingGraphemes(dayComplete ? 'शाबाश' : currentStep === 'lesson' ? heroScene?.words[0] ?? '' : 'बोलो', 2);

  const stepCopy = useCallback((step: TodayStep) => {
    if (step.key === 'review') {
      if (step.skipped) return { label: 'No phrases due', meta: 'Skipped' };
      return step.status === 'done' ? { label: 'Reviewed phrases', meta: 'Done' } : { label: 'Review saved phrases', meta: '2 min' };
    }
    if (step.key === 'lesson') {
      return step.status === 'done' ? { label: 'Finished a lesson', meta: 'Done' } : { label: `Lesson: ${lessonSelection.title}`, meta: '4 min' };
    }
    return step.status === 'done' ? { label: 'Spoke with Asha', meta: 'Done' } : { label: 'Chat with Asha', meta: '3 min' };
  }, [lessonSelection.title]);

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
          <Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.settingsButton} testID="today-settings">
            <Settings color={colors.ink} size={20} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      <MotionReveal mode={motionMode} motionKey={currentStep ?? 'done'} style={[styles.hero, dayComplete && styles.heroDone]} testID="today-primary-motion">
        {watermark ? <Text accessibilityElementsHidden accessible={false} aria-hidden ellipsizeMode="clip" importantForAccessibility="no-hide-descendants" numberOfLines={1} style={styles.heroWatermark}>{watermark}</Text> : null}
        <View style={[styles.heroHeader, largeTextLayout && styles.heroHeaderLarge]}>
          <View style={styles.heroCopy} testID="today-next-practice">
            <View style={styles.heroTopline}>
              <View style={styles.heroChip}><Text style={styles.heroChipText}>{hero.kicker}</Text></View>
              {hero.meta ? <Text numberOfLines={2} style={styles.heroMeta}>{hero.meta}</Text> : null}
            </View>
            <Text style={styles.heroTitle}>{hero.title}</Text>
            {hero.subtitle ? <Text style={styles.heroSubtitle}>{hero.subtitle}</Text> : null}
          </View>
          <View
            accessible
            accessibilityLabel={`${goalPercent} percent of daily goal complete`}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: goalPercent }}
            style={styles.goalDial}
            testID="today-goal-dial"
          >
            <Svg aria-hidden height={goalRingSize} pointerEvents="none" style={styles.goalRing} viewBox={`0 0 ${goalRingSize} ${goalRingSize}`} width={goalRingSize}>
              <Circle cx={goalRingSize / 2} cy={goalRingSize / 2} fill="none" r={goalRingRadius} stroke={colors.onBrandTrack} strokeWidth={goalRingStroke} />
              {goalPercent > 0 ? (
                <Circle
                  cx={goalRingSize / 2}
                  cy={goalRingSize / 2}
                  fill="none"
                  r={goalRingRadius}
                  stroke={colors.gold}
                  strokeDasharray={`${goalRingLength * goalPercent / 100} ${goalRingLength}`}
                  strokeLinecap="round"
                  strokeWidth={goalRingStroke}
                />
              ) : null}
            </Svg>
            <View pointerEvents="none" style={styles.goalValue}>
              {/* Long practice days used to push the number out of the ring. */}
              <Text numberOfLines={1} style={[styles.goalMinutes, minutesLabel.length >= 3 && styles.goalMinutesLong]}>{minutesLabel}</Text>
              <Text style={styles.goalUnit} testID="today-goal-value">{goalMet ? 'min' : `of ${goal} min`}</Text>
            </View>
          </View>
        </View>

        {hero.chips.length > 0 ? (
          <View style={styles.heroWords} testID={currentStep === 'review' ? 'today-review-preview' : 'today-lesson-words'}>
            {hero.chips.map((chip, index) => (
              <View key={chip.key} style={[styles.heroWord, currentStep === 'review' && index === reviewPreviewLimit - 1 && styles.heroWordFaded]}>
                <Text accessibilityLanguage={chip.latin ? undefined : 'hi-IN'} ellipsizeMode="tail" numberOfLines={1} style={chip.latin ? styles.heroWordLatin : styles.heroWordText}>{chip.text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {currentStep === 'asha' ? (
          <View style={styles.ashaInvite}>
            <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.ashaPortrait} testID="today-asha-portrait" transition={0} />
            <Text style={styles.ashaInviteText}>“Ready? Greet me like a neighbor and tell me your name.”</Text>
          </View>
        ) : null}

        <View accessibilityLabel="Today’s practice steps" accessibilityRole="list" style={styles.steps} testID="today-steps">
          {visibleSteps.map((step, index) => {
            const copy = stepCopy(step);
            const done = step.status === 'done';
            const current = step.status === 'current';
            return (
              <View
                key={step.key}
                accessible
                accessibilityLabel={`Step ${index + 1} of ${visibleSteps.length}, ${copy.label}, ${done ? 'done' : current ? 'up next' : 'later'}`}
                style={styles.stepRow}
                testID={`today-step-${step.key}`}
              >
                <View style={[styles.stepDot, done && styles.stepDotDone, current && styles.stepDotCurrent]}>
                  {done ? <Check color={colors.ink} size={13} strokeWidth={3.2} /> : null}
                </View>
                <Text style={[styles.stepLabel, done && styles.stepLabelDone, current && styles.stepLabelCurrent]}>{copy.label}</Text>
                <Text style={styles.stepMeta}>{copy.meta}</Text>
              </View>
            );
          })}
        </View>

        <View style={[styles.heroFooter, largeTextLayout && styles.heroFooterLarge]} testID="today-hero-footer">
          <PressableFeedback accessibilityLabel={hero.action} accessibilityRole="button" onPress={hero.onPress} style={styles.heroButton} testID="today-next-step">
            <Text style={styles.heroButtonText}>{hero.action}</Text>
            <ArrowRight color={colors.ink} size={18} strokeWidth={2.2} />
          </PressableFeedback>
        </View>
      </MotionReveal>
    </View>
  ), [colors, dateLine, dayComplete, dueCount, goal, goalPercent, hero, largeTextLayout, minutesLabel, motionMode, router, currentStep, stackedTopbarLayout, stepCopy, streak, styles, visibleSteps, watermark]);

  if (learnerProfile?.completed === false) return <Redirect href={'/onboarding' as Href} />;

  return (
    <>
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
                <PressableFeedback accessibilityLabel={`Browse all ${lessonPlans.length} plans`} accessibilityRole="button" onPress={() => router.push('/lesson-plans' as Href)} style={styles.allPlans} testID="today-plan-catalog">
                  <Text style={styles.allPlansText}>All plans</Text>
                </PressableFeedback>
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
        style={sharedStyles.screen}
        testID="today-guided-plan-list"
      />
      <StatusBarScrim />
    </>
  );
}

const useStyles = makeStyles((c) => {
  const button = createButtonStyles(c);
  return {
  list: { width: '100%', alignItems: 'stretch', paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  headerContent: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', minWidth: 0, alignItems: 'stretch', gap: spacing.md, marginBottom: spacing.lg },
  planCell: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', gap: spacing.md },
  topbar: { width: '100%', minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  topbarLarge: { minHeight: 0, flexDirection: 'column', alignItems: 'stretch', gap: spacing.md, paddingRight: 0 },
  greetingCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  dateLine: { ...type.caption, color: c.muted },
  greetingRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing.sm },
  greeting: { ...type.display },
  greetingHindi: { ...hindiType(20), color: c.brand },
  topbarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streakPill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, paddingLeft: spacing.md, paddingRight: spacing.md },
  streakText: { ...type.label, color: c.ink, fontVariant: ['lining-nums', 'tabular-nums'] },
  settingsButton: { width: 44, height: 44, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1 },
  hero: { width: '100%', overflow: 'hidden', borderRadius: radius.xxl, borderCurve: 'continuous', backgroundColor: c.brand, padding: spacing.gutter, gap: spacing.lg },
  heroDone: { backgroundColor: c.forest },
  // Parked at the bottom-right corner, faint, so it never crosses the ring or the title.
  heroWatermark: { ...hindiType(168), position: 'absolute', right: -14, bottom: -64, color: c.onBrandWatermark },
  heroHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroHeaderLarge: { flexDirection: 'column-reverse', alignItems: 'flex-start' },
  heroCopy: { minWidth: 0, flex: 1, gap: spacing.sm },
  heroTopline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  heroChip: { borderRadius: radius.pill, backgroundColor: c.gold, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  heroChipText: { ...type.eyebrow, color: c.ink },
  heroMeta: { ...type.caption, color: c.brandSoft },
  heroTitle: { ...type.title, color: c.white },
  heroSubtitle: { ...type.body, color: c.onBrandText },
  goalDial: { width: goalRingSize, height: goalRingSize, alignItems: 'center', justifyContent: 'center' },
  // Rotating the whole ring starts the arc at 12 o'clock without SVG transform props, which web rejects.
  goalRing: { transform: [{ rotate: '-90deg' }] },
  goalValue: { position: 'absolute', alignItems: 'center' },
  goalMinutes: { ...type.headline, color: c.white, fontVariant: ['lining-nums', 'tabular-nums'] },
  goalMinutesLong: { ...type.label, fontFamily: type.headline.fontFamily, fontWeight: '700' },
  goalUnit: { ...type.eyebrow, textTransform: 'none', letterSpacing: 0, fontWeight: '600', color: c.onBrandText, fontVariant: ['lining-nums', 'tabular-nums'] },
  heroWords: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroWord: { maxWidth: '100%', borderRadius: radius.sm, backgroundColor: c.onBrandChip, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  heroWordFaded: { opacity: 0.5 },
  heroWordText: { ...hindiType(17), color: c.white },
  heroWordLatin: { ...type.body, color: c.white },
  ashaInvite: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.onBrandCallout, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  ashaPortrait: { width: 48, height: 48, borderRadius: radius.pill, borderColor: c.gold, borderWidth: 2, backgroundColor: c.brandSoft },
  ashaInviteText: { ...type.body, minWidth: 0, flex: 1, color: c.onBrandText },
  steps: { gap: spacing.xs, borderTopColor: c.onBrandLine, borderTopWidth: 1, paddingTop: spacing.md },
  stepRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepDot: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderColor: c.onBrandOutline, borderWidth: 2 },
  stepDotDone: { backgroundColor: c.gold, borderColor: c.gold },
  stepDotCurrent: { backgroundColor: c.onBrandGoldTint, borderColor: c.gold },
  stepLabel: { ...type.body, minWidth: 0, flex: 1, color: c.onBrandText },
  stepLabelDone: { color: c.brandSoft, textDecorationLine: 'line-through' },
  stepLabelCurrent: { color: c.white, fontWeight: '600' },
  stepMeta: { ...type.caption, color: c.brandSoft, fontVariant: ['lining-nums', 'tabular-nums'] },
  heroFooter: { flexDirection: 'row' },
  heroFooterLarge: { flexDirection: 'column', alignItems: 'stretch' },
  heroButton: { ...button.primaryOnBrand, flex: 1 },
  heroButtonText: button.primaryOnBrandText,
  pathHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  pathHeadingLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  pathTitle: { ...type.headline },
  allPlans: button.quiet,
  allPlansText: button.quietText,
  planCard: { width: '100%', minHeight: 48, gap: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, padding: spacing.lg },
  planCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  planCopyLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  planTitle: { ...type.label, minWidth: 0, flexShrink: 1, color: c.ink },
  planMeta: { ...type.caption, color: c.muted, fontVariant: ['lining-nums', 'tabular-nums'] },
  planSegments: { flexDirection: 'row', gap: spacing.xs },
  planSegment: { minWidth: 0, flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: c.line },
  planSegmentDone: { backgroundColor: c.brand },
  planSegmentCurrent: { backgroundColor: c.goldIcon },
  } satisfies NamedStyles;
});
