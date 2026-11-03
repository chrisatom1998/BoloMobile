import { Redirect, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { ArrowRight, Check, ChevronDown, ChevronUp, Flame, Mic, Play, Settings } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, StatusBar, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { JournalDisplay } from '@/components/journal-chrome';
import { MotionReveal } from '@/components/motion';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { TodayAshaHero } from '@/components/today-asha-hero';
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
import { useAshaVoiceSession } from '@/state/asha-voice-session';
import { createButtonStyles, hindiType, layout, makeStyles, maxContentWidth, radius, spacing, type NamedStyles, type, useSharedStyles, useTheme } from '@/theme';
import { StatusBarScrim } from '@/components/status-bar-scrim';

const ashaPortrait = require('../../../assets/images/asha-portrait.png');
const goalRingSize = layout.touchTarget;
const goalRingStroke = 4;
const goalRingRadius = (goalRingSize - goalRingStroke) / 2;
const goalRingLength = 2 * Math.PI * goalRingRadius;
/** Due phrases previewed on the review step; the last one fades to hint at the rest. */
const reviewPreviewLimit = 3;

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const state = useAppState();
  // Today reads the shared live voice session's status. For a minimized session it only calls
  // expand(), the same public call the floating bubble makes, so the minimized flag clears.
  // It never starts, stops or otherwise changes a session.
  const floatingAsha = useAshaVoiceSession();
  const { colors } = useTheme();
  const sharedStyles = useSharedStyles();
  const styles = useStyles();
  // On web the tab bar is a fixed pill at the top of the page, so Today's date line and greeting start below it.
  const contentTopPadding = Platform.OS === 'android'
    ? Math.max(spacing.lg, (StatusBar.currentHeight ?? 0) + spacing.md)
    : Platform.OS === 'web'
      ? spacing.lg + layout.webTabBarInset
      : spacing.lg;
  const largeTextLayout = useLargeTextLayout();
  const { width: windowWidth } = useWindowDimensions();
  const stackedTopbarLayout = largeTextLayout || windowWidth <= 380;
  const compactHero = largeTextLayout || windowWidth <= 380;
  const { goal, learnerProfile, motionPreference = DEFAULT_MOTION_PREFERENCE, phraseReviews, phrases, practice, practiceHistory, reviewStreakDays, sceneProgress: savedSceneProgress, streak } = state;
  const { mode: motionMode } = useMotionPreference(motionPreference);
  const sceneProgress = useMemo(() => savedSceneProgress ?? {}, [savedSceneProgress]);
  const [nextExpanded, setNextExpanded] = useState(false);
  const listRef = useRef<FlatList<never>>(null);
  // The card's offset inside the list header, so an opened panel can scroll the row to the top.
  const nextCardTopRef = useRef(0);
  // Set when the panel opens; its first layout then scrolls the card into view.
  const revealPendingRef = useRef(false);
  const toggleNext = useCallback(() => setNextExpanded((expanded) => {
    revealPendingRef.current = !expanded;
    return !expanded;
  }), []);
  const measureNextCard = useCallback((event: LayoutChangeEvent) => {
    nextCardTopRef.current = event.nativeEvent.layout.y;
  }, []);
  // The card sits near the bottom of a phone screen, so an opened panel would otherwise land below the fold.
  const revealDetails = useCallback(() => {
    if (!revealPendingRef.current) return;
    revealPendingRef.current = false;
    listRef.current?.scrollToOffset({ animated: motionMode !== 'reduced', offset: Math.max(0, contentTopPadding + nextCardTopRef.current - spacing.lg) });
  }, [contentTopPadding, motionMode]);
  const openLesson = useCallback((lessonId: string) => router.push({ pathname: '/scene/[id]', params: { id: lessonId } }), [router]);
  const openPlan = useCallback((planId: string) => router.push({ pathname: '/lesson-plans', params: { planId } }), [router]);
  // A minimized session expands the way the floating bubble does, which also brings the Asha screen back.
  const openAsha = useCallback(() => {
    if (floatingAsha.available && floatingAsha.minimized) {
      floatingAsha.expand();
      return;
    }
    router.push('/live' as Href);
  }, [floatingAsha, router]);
  // Whole minutes drive both the label and the ring so they never disagree.
  const minutesToday = Math.floor(practice.seconds / 60);
  const goalPercent = Math.min(100, Math.round(minutesToday / goal * 100));
  // Past the goal the caption shows "15+" rather than a lopsided "911 of 15 min".
  const goalExceeded = minutesToday > goal;
  // At the goal the ring closes and shows a check instead of an arc.
  const goalReached = minutesToday >= goal;
  const minutesLine = goalExceeded ? `${goal}+ min today` : `${minutesToday} of ${goal} min today`;
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
      hint: mode === 'continue' ? 'Continues the lesson' : mode === 'next' ? 'Starts the lesson' : 'Opens the lesson again',
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
    // `context` leads the row's one caption ("Lesson 1 of 10 · 4 of 10 min today"); the plan title waits in the panel's Your path section.
    const lessonStep = {
      action: lessonSelection.action,
      chips: (heroScene?.words ?? []).map((word) => ({ key: word, latin: false, text: word })),
      context: lessonNumber > 0 ? `Lesson ${lessonNumber} of ${lessonSelection.plan.lessonIds.length}` : undefined,
      hint: lessonSelection.hint,
      kicker: stepKicker('lesson', lessonSelection.kicker),
      onPress: () => openLesson(lessonSelection.lessonId),
      subtitle: heroScene?.subtitle ? `New phrase: “${heroScene.subtitle.replace(/[.!?]$/u, '')}”` : undefined,
      title: lessonSelection.title,
    };
    switch (currentStep) {
      case 'review':
        return {
          action: 'Start review',
          chips: reviewPreview.map((item) => ({ ...item, latin: showLatinPreview })),
          context: `${plural(dueCount, 'phrase')} due`,
          hint: 'Starts the review',
          kicker: stepKicker('review', 'REVIEW'),
          onPress: () => router.push('/review' as Href),
          subtitle: `${plural(dueCount, 'phrase')} due. A quick recall keeps them fresh.`,
          title: 'Review your phrases',
        };
      case 'lesson':
        return lessonStep;
      case 'asha':
        // "Practice", not "Talk": the hero's filled Talk with Asha button already owns that verb, and this step is practising the lesson lines.
        return {
          action: 'Practice with Asha',
          chips: [],
          context: 'Short chat',
          hint: 'Opens the Asha screen',
          kicker: stepKicker('asha', 'SPEAK'),
          onPress: openAsha,
          subtitle: 'Try today’s lesson lines out loud in a short chat with Asha.',
          title: 'Say it out loud',
        };
      default:
        return {
          ...lessonStep,
          action: 'Keep going',
          chips: [],
          // Only the minutes on a finished day; "Keep going" shows once, on the panel's button.
          context: undefined,
          hint: 'Starts the next lesson',
          kicker: 'DONE FOR TODAY',
          subtitle: `Today’s practice is complete. ${streak > 0 ? `${plural(streak, 'day')} in a row. ` : ''}More is optional.`,
          title: 'Shabaash!',
        };
    }
  }, [dueCount, heroScene, lessonNumber, lessonSelection, openAsha, openLesson, reviewPreview, router, showLatinPreview, stepKicker, streak, currentStep]);
  const dayComplete = currentStep === null;
  // The row keeps to three lines (kicker, title, caption); every step's subtitle opens the panel instead.
  const detailsSubtitle = hero.subtitle;
  // One caption carries the step's context and the minutes; the row's VoiceOver label reads the action and the bare minutes.
  const goalCaption = hero.context ? `${hero.context} · ${minutesLine}` : minutesLine;

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

  const planDetails = useMemo(() => {
    const completed = currentPlan.lessonIds.filter((id) => (sceneProgress[id]?.completions ?? 0) > 0).length;
    const selectedLessonIndex = currentPlan.lessonIds.indexOf(lessonSelection.lessonId);
    const selectedProgress = sceneProgress[lessonSelection.lessonId];
    const selectedLessonIsInProgress = selectedLessonIndex >= 0
      && (selectedProgress?.completions ?? 0) === 0
      && (selectedProgress?.lastBeatIndex ?? 0) > 0;
    const planMeta = selectedLessonIsInProgress
      ? `Lesson ${selectedLessonIndex + 1} in progress`
      : `${completed} of ${currentPlan.lessonIds.length} lessons`;
    return { completed, planMeta, selectedLessonIsInProgress };
  }, [currentPlan, lessonSelection.lessonId, sceneProgress]);

  if (learnerProfile?.completed === false) return <Redirect href={'/onboarding' as Href} />;

  // Hidden from VoiceOver inside the row: the row's own label already reads the minutes.
  const goalDial = (
    <View
      accessible={false}
      accessibilityElementsHidden
      accessibilityLabel={`${goalPercent} percent of daily goal complete`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: goalPercent }}
      importantForAccessibility="no-hide-descendants"
      style={styles.goalDial}
      testID="today-goal-dial"
    >
      <Svg aria-hidden height={goalRingSize} pointerEvents="none" style={styles.goalRing} viewBox={`0 0 ${goalRingSize} ${goalRingSize}`} width={goalRingSize}>
        <Circle cx={goalRingSize / 2} cy={goalRingSize / 2} fill="none" r={goalRingRadius} stroke={colors.track} strokeWidth={goalRingStroke} />
        {goalReached ? (
          <Circle cx={goalRingSize / 2} cy={goalRingSize / 2} fill="none" r={goalRingRadius} stroke={colors.brand} strokeWidth={goalRingStroke} />
        ) : goalPercent > 0 ? (
          <Circle
            cx={goalRingSize / 2}
            cy={goalRingSize / 2}
            fill="none"
            r={goalRingRadius}
            stroke={colors.brand}
            strokeDasharray={`${goalRingLength * goalPercent / 100} ${goalRingLength}`}
            strokeLinecap="round"
            strokeWidth={goalRingStroke}
          />
        ) : null}
      </Svg>
      {/* No numeral: the ring only shows progress, and the caption beside it carries the minutes. A check marks a met goal. */}
      {goalReached ? (
        <View pointerEvents="none" style={styles.goalCheck} testID="today-goal-check">
          <Check color={colors.brand} size={layout.goalCheckIconSize} strokeWidth={3} />
        </View>
      ) : null}
    </View>
  );
  // Three lines: kicker, title, one caption. Subtitles live in the panel.
  const nextCopy = (
    <View style={[styles.nextCopy, largeTextLayout && styles.nextCopyLarge]} testID="today-next-practice">
      <Text numberOfLines={2} style={[styles.nextKicker, dayComplete && styles.nextKickerDone]}>{hero.kicker}</Text>
      <Text style={styles.nextTitle}>{hero.title}</Text>
      <Text style={styles.goalLine} testID="today-goal-value">{goalCaption}</Text>
    </View>
  );
  // Decorative: the row's label already names the action, so VoiceOver skips this. Icon only, so the text column keeps its width at 393pt. The 44pt wrapper gives the glyph a full-size footprint inside the row's single tap target.
  const nextAffordance = (
    <View accessible={false} importantForAccessibility="no" style={styles.nextAffordance} testID="today-next-start">
      <View style={styles.playCircle} testID="today-next-start-circle">
        <Play color={colors.brand} fill={colors.brand} size={layout.playIconSize} strokeWidth={2} />
      </View>
    </View>
  );

  const header = (
    <View style={styles.headerContent}>
      <View style={[styles.topbar, stackedTopbarLayout && styles.topbarLarge]} testID="today-topbar">
        <View style={styles.greetingCopy}>
          <Text style={styles.dateLine}>{dateLine}</Text>
          <View style={styles.greetingRow}>
            {/* Capped like the Asha header title, so the stacked header leaves room for the streak and settings row. */}
            <JournalDisplay maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.greeting}>Namaste</JournalDisplay>
            <Text accessibilityLanguage="hi-IN" maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.greetingHindi}>नमस्ते</Text>
          </View>
        </View>
        {/* Stacked: the streak pill and gear share their own left-aligned row under the greeting. */}
        <View style={[styles.topbarActions, stackedTopbarLayout && styles.topbarActionsLarge]} testID="today-topbar-actions">
          <Pressable accessibilityLabel={`${streak} day practice streak`} accessibilityRole="button" hitSlop={4} onPress={() => router.push('/progress' as Href)} style={styles.streakPill} testID="today-streak">
            <Flame color={colors.goldIcon} size={layout.streakIconSize} strokeWidth={2.2} />
            <Text style={styles.streakText}>{streak} day{streak === 1 ? '' : 's'}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.settingsButton} testID="today-settings">
            <Settings color={colors.ink} size={20} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      <MotionReveal mode={motionMode} style={styles.heroBlock} testID="today-primary-motion">
        <TodayAshaHero compact={compactHero} onPress={openAsha} status={floatingAsha.status} />
        <Pressable accessibilityRole="button" onPress={openAsha} style={styles.talkButton} testID="today-talk-with-asha">
          <Mic color={colors.white} size={20} strokeWidth={2.2} />
          <Text style={styles.talkButtonText}>Talk with Asha</Text>
        </Pressable>
      </MotionReveal>

      <View onLayout={measureNextCard} style={styles.nextCard} testID="today-next-card">
        <View style={[styles.nextCardRow, largeTextLayout && styles.nextCardRowLarge]} testID="today-next-card-row">
          {/* The row body is the step action itself; the chevron beside it is the only expand control. */}
          <Pressable
            accessibilityHint={hero.hint}
            accessibilityLabel={`${hero.action}, ${hero.title}, ${minutesLine}`}
            accessibilityRole="button"
            onPress={hero.onPress}
            style={[styles.nextRow, largeTextLayout && styles.nextRowLarge]}
            testID="today-next-row"
          >
            {largeTextLayout ? (
              <>
                {/* Accessibility sizes: ring left and play right on one line, with the chevron at that line's trailing end, so the text column below gets the full card width. */}
                <View style={styles.nextTopLine} testID="today-next-top-line">
                  {goalDial}
                  {nextAffordance}
                </View>
                {nextCopy}
              </>
            ) : (
              <>
                {goalDial}
                {nextCopy}
                {nextAffordance}
              </>
            )}
          </Pressable>
          <Pressable
            accessibilityLabel={`Next lesson, ${hero.title}, ${nextExpanded ? 'expanded' : 'collapsed'}`}
            accessibilityRole="button"
            accessibilityState={{ expanded: nextExpanded }}
            onPress={toggleNext}
            style={[styles.nextToggle, largeTextLayout && styles.nextToggleLarge]}
            testID="today-next-toggle"
          >
            {nextExpanded
              ? <ChevronUp color={colors.muted} size={layout.chevronIconSize} strokeWidth={2.2} />
              : <ChevronDown color={colors.muted} size={layout.chevronIconSize} strokeWidth={2.2} />}
          </Pressable>
        </View>

        {nextExpanded ? (
          <View onLayout={revealDetails} style={styles.nextDetails} testID="today-next-details">
            <MotionReveal mode={motionMode} motionKey={currentStep ?? 'done'} style={styles.details}>
              {detailsSubtitle ? <Text style={styles.detailsSubtitle}>{detailsSubtitle}</Text> : null}

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
                  <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.ashaInvitePortrait} testID="today-asha-invite-portrait" transition={0} />
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

              <View style={styles.planCell} testID="today-current-plan">
                <View style={[styles.pathHeading, largeTextLayout && styles.pathHeadingLarge]}>
                  <JournalDisplay style={styles.pathTitle}>Your path</JournalDisplay>
                  <PressableFeedback accessibilityLabel={`Browse all ${lessonPlans.length} plans`} accessibilityRole="button" onPress={() => router.push('/lesson-plans' as Href)} style={styles.allPlans} testID="today-plan-catalog">
                    <Text style={styles.allPlansText}>All plans</Text>
                  </PressableFeedback>
                </View>
                <PressableFeedback
                  accessibilityLabel={`${currentPlan.title}, plan ${currentPlan.order} of ${lessonPlans.length}, ${planDetails.selectedLessonIsInProgress ? `${planDetails.planMeta.toLowerCase()}, ` : ''}${planDetails.completed} of ${currentPlan.lessonIds.length} lessons complete`}
                  accessibilityRole="button"
                  onPress={() => openPlan(currentPlan.id)}
                  style={styles.planRow}
                >
                  <View style={[styles.planCopy, largeTextLayout && styles.planCopyLarge]}>
                    <Text style={styles.planTitle}>{currentPlan.title}</Text>
                    <Text style={styles.planMeta}>{planDetails.planMeta}</Text>
                  </View>
                  <View style={styles.planSegments} testID="today-plan-segments">
                    {currentPlan.lessonIds.map((lessonId, index) => {
                      const done = (sceneProgress[lessonId]?.completions ?? 0) > 0;
                      const current = !done && lessonId === lessonSelection.lessonId;
                      return <View key={lessonId} style={[styles.planSegment, done && styles.planSegmentDone, current && styles.planSegmentCurrent]} testID={`today-plan-segment-${index}`} />;
                    })}
                  </View>
                </PressableFeedback>
              </View>

              <View style={[styles.detailsFooter, largeTextLayout && styles.detailsFooterLarge]} testID="today-hero-footer">
                <PressableFeedback accessibilityLabel={hero.action} accessibilityRole="button" onPress={hero.onPress} style={styles.nextStepButton} testID="today-next-step">
                  <Text style={styles.nextStepButtonText}>{hero.action}</Text>
                  <ArrowRight color={colors.brand} size={layout.arrowIconSize} strokeWidth={2.2} />
                </PressableFeedback>
              </View>
            </MotionReveal>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      {/* The panel lives in the header so it shares the row's card; the list itself only scrolls. */}
      <FlatList
        ref={listRef}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.list, { paddingTop: contentTopPadding }]}
        data={[]}
        renderItem={() => null}
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
  // Wraps, so a streak-and-gear row that no longer fits beside the greeting drops below it instead of overlapping.
  topbar: { width: '100%', minHeight: 56, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  topbarLarge: { minHeight: 0, flexDirection: 'column', alignItems: 'stretch', gap: spacing.md, paddingRight: 0 },
  greetingCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  dateLine: { ...type.caption, color: c.muted },
  greetingRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing.sm },
  greeting: { ...type.display },
  greetingHindi: { ...hindiType(20), color: c.brand },
  topbarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Its own row under the greeting, left-aligned; wraps rather than overflowing if the pill grows.
  topbarActionsLarge: { alignSelf: 'flex-start', justifyContent: 'flex-start', flexWrap: 'wrap' },
  streakPill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, paddingLeft: spacing.md, paddingRight: spacing.md },
  streakText: { ...type.label, color: c.ink, fontVariant: ['lining-nums', 'tabular-nums'] },
  settingsButton: { width: 44, height: 44, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1 },
  // Tight so the Next lesson card's top lands near 480pt on a 393x852 phone.
  heroBlock: { width: '100%', alignItems: 'stretch', gap: spacing.md },
  talkButton: { ...button.primary, alignSelf: 'stretch' },
  talkButtonText: button.primaryText,
  // One white card holds the row, the expand toggle and, when open, the details panel.
  nextCard: { width: '100%', borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1 },
  // Less padding on the trailing edge: the 44pt toggle supplies its own.
  nextCardRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.sm },
  // Accessibility sizes: the row body takes the full card width and the chevron is placed at the top line's trailing end.
  nextCardRowLarge: { flexDirection: 'column', alignItems: 'stretch', paddingRight: spacing.lg },
  nextRow: { minWidth: 0, flex: 1, minHeight: layout.nextRowMinHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  nextRowLarge: { flexDirection: 'column', alignItems: 'stretch' },
  // Ring left, play right; the trailing padding keeps the play circle clear of the chevron sitting over this line's end.
  nextTopLine: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: layout.touchTarget },
  nextToggle: { width: layout.touchTarget, height: layout.touchTarget, minWidth: layout.touchTarget, minHeight: layout.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  // Sits on the top line's trailing end, level with the ring (the row's own vertical padding), still a separate 44pt button.
  nextToggleLarge: { position: 'absolute', top: spacing.md, right: spacing.sm },
  goalDial: { width: goalRingSize, height: goalRingSize, alignItems: 'center', justifyContent: 'center' },
  // Rotating the whole ring starts the arc at 12 o'clock without SVG transform props, which web rejects.
  goalRing: { transform: [{ rotate: '-90deg' }] },
  goalCheck: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  goalLine: { ...type.caption, color: c.muted, fontVariant: ['lining-nums', 'tabular-nums'] },
  nextCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  // Full width below the top line in the column layout, so long titles wrap at the card's width.
  nextCopyLarge: { width: '100%', flexGrow: 0, flexBasis: 'auto' },
  // Play glyph in a brand-soft circle, centred in a 44pt box: says the row itself starts the step without taking width from the text column.
  nextAffordance: { width: layout.touchTarget, height: layout.touchTarget, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  playCircle: { width: layout.playCircleSize, height: layout.playCircleSize, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.brandSoft },
  nextKicker: { ...type.eyebrow, color: c.muted },
  // Rust, not forest: Today keeps to the brand palette, and a finished day is a celebration rather than a graded answer.
  nextKickerDone: { color: c.brandText },
  nextTitle: { ...type.label, color: c.ink },
  // A hairline separates the panel from the row inside the same card.
  nextDetails: { borderTopColor: c.line, borderTopWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  details: { width: '100%', gap: spacing.lg },
  detailsSubtitle: { ...type.body, color: c.ink },
  heroWords: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  heroWord: { maxWidth: '100%', borderRadius: radius.sm, backgroundColor: c.brandSoft, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  heroWordFaded: { opacity: 0.5 },
  heroWordText: { ...hindiType(17), color: c.brandText },
  heroWordLatin: { ...type.body, color: c.brandText },
  ashaInvite: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  ashaInvitePortrait: { width: layout.ashaInvitePortraitSize, height: layout.ashaInvitePortraitSize, borderRadius: radius.pill, borderColor: c.gold, borderWidth: 2, backgroundColor: c.brandSoft },
  ashaInviteText: { ...type.body, minWidth: 0, flex: 1, color: c.ink },
  steps: { gap: spacing.xs, borderTopColor: c.line, borderTopWidth: 1, paddingTop: spacing.md },
  stepRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepDot: { width: layout.stepDotSize, height: layout.stepDotSize, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderColor: c.lineStrong, borderWidth: 2 },
  stepDotDone: { backgroundColor: c.gold, borderColor: c.gold },
  stepDotCurrent: { backgroundColor: c.goldSoft, borderColor: c.goldIcon },
  stepLabel: { ...type.body, minWidth: 0, flex: 1, color: c.ink },
  // Struck through but still ink: the line already says it is done, and muted ink on top read too faint.
  stepLabelDone: { color: c.ink, textDecorationLine: 'line-through' },
  stepLabelCurrent: { fontWeight: '600' },
  stepMeta: { ...type.caption, color: c.muted, fontVariant: ['lining-nums', 'tabular-nums'] },
  detailsFooter: { flexDirection: 'row' },
  detailsFooterLarge: { flexDirection: 'column', alignItems: 'stretch' },
  // Rust outline on the shared secondary 1pt border: Talk with Asha keeps the screen's one filled button, so the panel's closing action reads as secondary.
  nextStepButton: { ...button.secondary, flex: 1, backgroundColor: 'transparent', borderColor: c.brand },
  nextStepButtonText: { ...button.secondaryText, color: c.brandText },
  planCell: { width: '100%', gap: spacing.md },
  pathHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  pathHeadingLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  pathTitle: { ...type.headline },
  allPlans: button.quiet,
  allPlansText: button.quietText,
  // A hairline, not a card inside the card.
  planRow: { width: '100%', minHeight: 48, gap: spacing.md, borderTopColor: c.line, borderTopWidth: 1, paddingTop: spacing.md },
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
