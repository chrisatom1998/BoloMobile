import { Redirect, useFocusEffect, useRouter, type Href } from 'expo-router';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { ArrowRight, Check, Flame, Settings } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, ScrollView, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { JournalDisplay } from '@/components/journal-chrome';
import { MasteryMeter } from '@/components/mastery-meter';
import { MotionReveal } from '@/components/motion';
import { PhraseCard } from '@/components/phrase-card';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { getScene } from '@/data/scenes';
import { lessonPlans } from '@/data/lesson-plans';
import { useCalendarDay } from '@/hooks/use-calendar-day';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { useSpeakText } from '@/hooks/use-speak-text';
import { dueSavedPhrases } from '@/lib/learning';
import { selectNextLesson } from '@/lib/lesson-path';
import { hasOfflineSpeech, stopSpeaking } from '@/lib/speech';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
import { buildTodayPlan, type TodayStep } from '@/lib/today-plan';
import { useAppState } from '@/state/app-state';
import { displayFont, hindiType, makeStyles, maxContentWidth, radius, spacing, useSharedStyles, useTheme } from '@/theme';

const goalRingRadius = 27;
const goalRingLength = 2 * Math.PI * goalRingRadius;
/**
 * Due phrases shown on the "Due today" strip. It is a preview, not the full
 * queue: the strip would otherwise spell out every answer before a recall
 * session, and the review route already walks the whole list.
 */
export const duePreviewLimit = 5;
const listenConsentHint = 'Agree to connected AI processing to enable Listen.';

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
    ? Math.max(18, (StatusBar.currentHeight ?? 0) + spacing.md)
    : 18;
  const largeTextLayout = useLargeTextLayout();
  const { width: windowWidth } = useWindowDimensions();
  const stackedTopbarLayout = largeTextLayout || windowWidth <= 380;
  const { aiConsent, goal, learnerProfile, motionPreference = DEFAULT_MOTION_PREFERENCE, phraseReviews, phrases, practice, practiceHistory, reviewStreakDays, sceneProgress: savedSceneProgress, streak } = state;
  const { mode: motionMode } = useMotionPreference(motionPreference);
  const sceneProgress = useMemo(() => savedSceneProgress ?? {}, [savedSceneProgress]);
  const openLesson = useCallback((lessonId: string) => router.push({ pathname: '/scene/[id]', params: { id: lessonId } }), [router]);
  const openPlan = useCallback((planId: string) => router.push({ pathname: '/lesson-plans', params: { planId } }), [router]);
  const openReview = useCallback(() => router.push('/review' as Href), [router]);
  // Whole minutes drive both the label and the ring so they never disagree.
  const minutesToday = Math.floor(practice.seconds / 60);
  const goalPercent = Math.min(100, Math.round(minutesToday / goal * 100));
  const minutesLabel = minutesToday > 999 ? '999+' : String(minutesToday);
  // Every due phrase counts here, not the 5-phrase review-session cap from duePhrases.
  // `calendarDay` re-runs these after midnight: this tab stays mounted, and
  // phrases can fall due overnight without their references changing.
  const calendarDay = useCalendarDay();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- calendarDay invalidates the clock-based due check.
  const duePhraseList = useMemo(() => dueSavedPhrases(phrases, phraseReviews ?? {}, Infinity), [phraseReviews, phrases, calendarDay]);
  const dueCount = duePhraseList.length;
  // dueSavedPhrases sorts weakest first, so the preview is the phrases most worth a look.
  const duePreview = useMemo(() => duePhraseList.slice(0, duePreviewLimit), [duePhraseList]);
  const scriptPreference = learnerProfile?.scriptPreference ?? 'both';
  const playbackRate = learnerProfile?.phrasePlaybackRate ?? 1;
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
      kicker: mode === 'continue' ? 'Continue lesson' : mode === 'next' ? 'Next lesson' : 'Review lesson',
      lessonId,
      plan,
      scene,
      title: scene?.title ?? plan.title,
    };
  }, [learnerProfile, sceneProgress]);
  const currentPlan = lessonSelection.plan;
  const heroScene = lessonSelection.scene;

  const currentStep = todayPlan.nextStep;
  const hero = useMemo(() => {
    const lessonStep = {
      action: lessonSelection.action,
      kicker: `Step 2 of 3 · ${lessonSelection.kicker}`,
      onPress: () => openLesson(lessonSelection.lessonId),
      subtitle: heroScene?.subtitle,
      title: lessonSelection.title,
    };
    switch (currentStep) {
      case 'review':
        return {
          action: 'Start review',
          kicker: 'Step 1 of 3 · Review',
          onPress: openReview,
          subtitle: `${plural(dueCount, 'phrase')} ${dueCount === 1 ? 'is' : 'are'} due. Two minutes keeps them fresh.`,
          title: 'Review your phrases',
        };
      case 'lesson':
        return lessonStep;
      case 'asha':
        return {
          action: 'Talk with Asha',
          kicker: 'Step 3 of 3 · Speak',
          onPress: () => router.push('/live' as Href),
          subtitle: 'Try today’s lesson lines out loud in a short chat with Asha.',
          title: 'Say it out loud',
        };
      default:
        return {
          ...lessonStep,
          action: 'Keep going',
          kicker: 'Done for today',
          subtitle: `Today’s practice is complete. ${streak > 0 ? `${plural(streak, 'day')} in a row. ` : ''}More is optional.`,
          title: 'Shabaash!',
        };
    }
  }, [dueCount, heroScene, lessonSelection, openLesson, openReview, router, streak, currentStep]);
  const dayComplete = currentStep === null;
  const watermark = leadingGraphemes(dayComplete ? 'शाबाश' : currentStep === 'lesson' ? heroScene?.words[0] ?? '' : 'बोलो', 2);

  const stepCopy = useCallback((step: TodayStep) => {
    if (step.key === 'review') {
      if (step.skipped) return { label: 'No phrases due', meta: 'Skipped' };
      return step.status === 'done' ? { label: 'Reviewed phrases', meta: 'Done' } : { label: `Review ${plural(dueCount, 'saved phrase')}`, meta: '2 min' };
    }
    if (step.key === 'lesson') {
      return step.status === 'done' ? { label: 'Finished a lesson', meta: 'Done' } : { label: `Lesson: ${lessonSelection.title}`, meta: '4 min' };
    }
    return step.status === 'done' ? { label: 'Spoke with Asha', meta: 'Done' } : { label: 'Say it out loud with Asha', meta: '3 min' };
  }, [dueCount, lessonSelection.title]);

  // Listen reuses the saved-phrase playback from the Phrases tab: same speech
  // service, same consent rule, same remembered playback speed.
  const { audioError, clearAudioError, speak } = useSpeakText();
  const [playingPhrase, setPlayingPhrase] = useState('');
  // Each tap is a new run; only the latest run may clear the busy state, so a
  // cancelled earlier clip finishing late cannot blank out the one still playing.
  const playbackRun = useRef(0);
  useFocusEffect(useCallback(() => () => {
    playbackRun.current += 1;
    void stopSpeaking();
    setPlayingPhrase('');
  }, []));
  const playPhrase = useCallback(async (text: string) => {
    if (!aiConsent && !hasOfflineSpeech(text)) return;
    const run = playbackRun.current + 1;
    playbackRun.current = run;
    clearAudioError();
    setPlayingPhrase(text);
    await speak(text, undefined, playbackRate);
    if (playbackRun.current === run) setPlayingPhrase('');
  }, [aiConsent, clearAudioError, playbackRate, speak]);

  // Always labelled as a preview: the strip is a peek at the queue, not the review itself.
  const dueMeta = dueCount === 0
    ? 'All caught up'
    : dueCount > duePreviewLimit
      ? `Preview · ${duePreviewLimit} of ${plural(dueCount, 'due phrase')}`
      : `Preview · ${plural(dueCount, 'phrase')} due`;
  const dueCards = duePreview.map((phrase, index) => {
    const canListen = Boolean(aiConsent) || hasOfflineSpeech(phrase.hi);
    return (
      <PhraseCard
        key={phrase.hi}
        devanagari={phrase.hi}
        english={phrase.en}
        listenDisabled={!canListen}
        listenHint={canListen ? undefined : listenConsentHint}
        onListen={() => { void playPhrase(phrase.hi); }}
        playing={playingPhrase === phrase.hi}
        romanized={phrase.latin}
        scriptPreference={scriptPreference}
        size="compact"
        style={[styles.dueCard, largeTextLayout && styles.dueCardLarge]}
        testID={`today-due-card-${index}`}
      >
        <MasteryMeter mastery={phraseReviews?.[phrase.hi]?.mastery ?? 0} testID={`today-due-card-${index}-mastery`} />
      </PhraseCard>
    );
  });

  const header = (
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

      {/* The hero has one job: the next step and its button. */}
      <MotionReveal mode={motionMode} motionKey={currentStep ?? 'done'} style={[styles.hero, dayComplete && styles.heroDone]} testID="today-primary-motion">
        {watermark ? <Text accessibilityElementsHidden accessible={false} aria-hidden ellipsizeMode="clip" importantForAccessibility="no-hide-descendants" numberOfLines={1} style={styles.heroWatermark}>{watermark}</Text> : null}
        <View style={[styles.heroHeader, largeTextLayout && styles.heroHeaderLarge]}>
          <View style={styles.heroCopy} testID="today-next-practice">
            <Text style={styles.heroKicker} testID="today-hero-kicker">{hero.kicker}</Text>
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
            <Svg aria-hidden height={64} pointerEvents="none" style={styles.goalRing} viewBox="0 0 64 64" width={64}>
              <Circle cx={32} cy={32} fill="none" r={goalRingRadius} stroke="rgba(255, 255, 255, 0.22)" strokeWidth={6} />
              {goalPercent > 0 ? (
                <Circle
                  cx={32}
                  cy={32}
                  fill="none"
                  r={goalRingRadius}
                  stroke={colors.gold}
                  strokeDasharray={`${goalRingLength * goalPercent / 100} ${goalRingLength}`}
                  strokeLinecap="round"
                  strokeWidth={6}
                />
              ) : null}
            </Svg>
            <View pointerEvents="none" style={styles.goalValue}>
              {/* Long practice days used to push the number out of the ring. */}
              <Text numberOfLines={1} style={[styles.goalMinutes, minutesLabel.length >= 3 && styles.goalMinutesLong]}>{minutesLabel}</Text>
              <Text style={styles.goalUnit} testID="today-goal-value">of {goal} min</Text>
            </View>
          </View>
        </View>

        <View style={[styles.heroFooter, largeTextLayout && styles.heroFooterLarge]} testID="today-hero-footer">
          <PressableFeedback accessibilityLabel={hero.action} accessibilityRole="button" onPress={hero.onPress} style={styles.heroButton} testID="today-next-step">
            <Text style={styles.heroButtonText}>{hero.action}</Text>
            <ArrowRight color={colors.ink} size={18} strokeWidth={2.2} />
          </PressableFeedback>
        </View>
      </MotionReveal>

      {/* Informational rows: only the hero button navigates, so these carry no button role. */}
      <View accessibilityLabel="Today’s practice steps" accessibilityRole="list" style={styles.stepsCard} testID="today-steps">
        {todayPlan.steps.map((step, index) => {
          const copy = stepCopy(step);
          const done = step.status === 'done';
          const current = step.status === 'current';
          // A skipped review is finished for the day, but it is not a check: nothing was recalled.
          const completed = done && !step.skipped;
          return (
            <View
              key={step.key}
              accessible
              accessibilityLabel={`Step ${index + 1} of 3, ${copy.label}, ${done ? (step.skipped ? 'skipped' : 'done') : current ? 'up next' : 'later'}`}
              style={[styles.stepRow, index > 0 && styles.stepRowDivided]}
              testID={`today-step-${step.key}`}
            >
              <View style={[styles.stepCheck, completed && styles.stepCheckDone, current && styles.stepCheckCurrent]} testID={`today-step-${step.key}-check`}>
                {completed ? <Check color={colors.white} size={14} strokeWidth={3.2} /> : null}
              </View>
              <View style={[styles.stepCopy, largeTextLayout && styles.stepCopyLarge]} testID={`today-step-${step.key}-copy`}>
                <Text style={[styles.stepLabel, completed && styles.stepLabelDone, current && styles.stepLabelCurrent]}>{copy.label}</Text>
                <Text style={[styles.stepMeta, completed && styles.stepMetaDone]}>{copy.meta}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.dueSection} testID="today-due">
        <View style={[styles.sectionHeading, largeTextLayout && styles.sectionHeadingLarge]}>
          <View style={styles.sectionCopy}>
            <JournalDisplay style={styles.sectionTitle}>Due today</JournalDisplay>
            <Text style={styles.sectionMeta} testID="today-due-meta">{dueMeta}</Text>
          </View>
          {dueCount > 0 ? (
            <Pressable
              accessibilityLabel={`Review all ${plural(dueCount, 'due phrase')}`}
              accessibilityRole="button"
              onPress={openReview}
              style={styles.sectionLink}
              testID="today-due-review-all"
            >
              <Text style={styles.sectionLinkText}>Review all</Text>
              <ArrowRight color={colors.brandText} size={16} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
        {dueCount === 0 ? (
          <View style={styles.dueEmpty} testID="today-due-empty">
            <Text style={styles.dueEmptyText}>Nothing is due right now. Phrases you save come back here when it’s time to recall them.</Text>
            {phrases.length > 0 ? (
              <Pressable accessibilityLabel="Saved phrases" accessibilityRole="button" onPress={() => router.push('/phrases' as Href)} style={styles.dueEmptyLink} testID="today-due-saved-phrases">
                <Text style={styles.sectionLinkText}>Saved phrases</Text>
              </Pressable>
            ) : null}
          </View>
        ) : largeTextLayout ? (
          <View style={styles.dueStack} testID="today-due-strip">{dueCards}</View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.dueStrip}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dueScroller}
            testID="today-due-strip"
          >
            {dueCards}
          </ScrollView>
        )}
        {audioError ? <Text accessibilityRole="alert" style={styles.dueError} testID="today-due-error">{audioError}</Text> : null}
      </View>
    </View>
  );

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
              <View style={[styles.sectionHeading, largeTextLayout && styles.sectionHeadingLarge]}>
                <JournalDisplay style={styles.sectionTitle}>Your path</JournalDisplay>
                <Text style={styles.sectionMeta}>Plan {String(plan.order).padStart(2, '0')} of {lessonPlans.length}</Text>
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
                {selectedLessonIndex >= 0 ? (
                  <Text style={styles.planNext} testID="today-plan-next">{lessonSelection.kicker}: {lessonSelection.title}</Text>
                ) : null}
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

const useStyles = makeStyles((c) => ({
  list: { width: '100%', alignItems: 'stretch', paddingHorizontal: 20, paddingTop: 18, paddingBottom: spacing.xxl },
  headerContent: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', minWidth: 0, alignItems: 'stretch', gap: spacing.md, marginBottom: spacing.lg },
  planCell: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', gap: 10 },
  topbar: { width: '100%', minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  topbarLarge: { minHeight: 0, flexDirection: 'column', alignItems: 'stretch', gap: spacing.md, paddingRight: 0 },
  greetingCopy: { minWidth: 0, flex: 1, gap: 2 },
  dateLine: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  greetingRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing.sm },
  greeting: { fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  greetingHindi: { ...hindiType(22), color: c.brand },
  topbarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streakPill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, paddingLeft: 10, paddingRight: spacing.md },
  streakText: { color: c.ink, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  settingsButton: { width: 48, height: 48, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1 },
  hero: { width: '100%', overflow: 'hidden', borderRadius: radius.xxl, borderCurve: 'continuous', backgroundColor: c.brand, padding: 20, gap: spacing.lg },
  heroDone: { backgroundColor: c.forest },
  heroWatermark: { ...hindiType(168), position: 'absolute', right: -14, top: -50, color: 'rgba(255, 255, 255, 0.10)' },
  heroHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  heroHeaderLarge: { flexDirection: 'column-reverse', alignItems: 'flex-start' },
  heroCopy: { minWidth: 0, flex: 1, gap: 6 },
  // Every text on the rust card is full-opacity #FBEFE8 or white (>= 5:1 on brand and forest).
  heroKicker: { color: '#FBEFE8', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  heroTitle: { color: c.white, fontFamily: displayFont, fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3 },
  heroSubtitle: { maxWidth: 300, color: '#FBEFE8', fontSize: 15, lineHeight: 21 },
  goalDial: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  // Rotating the whole ring starts the arc at 12 o'clock without SVG transform props, which web rejects.
  goalRing: { transform: [{ rotate: '-90deg' }] },
  goalValue: { position: 'absolute', alignItems: 'center' },
  goalMinutes: { color: c.white, fontFamily: displayFont, fontSize: 17, lineHeight: 19, fontWeight: '700', fontVariant: ['tabular-nums'] },
  goalMinutesLong: { fontSize: 13, lineHeight: 16 },
  goalUnit: { color: '#FBEFE8', fontSize: 9, lineHeight: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  heroFooter: { flexDirection: 'row' },
  heroFooterLarge: { flexDirection: 'column', alignItems: 'stretch' },
  heroButton: { minHeight: 52, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, paddingHorizontal: 20 },
  heroButtonText: { color: c.ink, fontSize: 17, fontWeight: '700' },
  stepsCard: { width: '100%', borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  stepRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  stepRowDivided: { borderTopColor: c.line, borderTopWidth: 1 },
  stepCheck: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderColor: c.lineStrong, borderWidth: 2 },
  stepCheckDone: { backgroundColor: c.forest, borderColor: c.forest },
  stepCheckCurrent: { backgroundColor: c.goldSoft, borderColor: c.gold },
  stepCopy: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  stepCopyLarge: { flexDirection: 'column', alignItems: 'flex-start', gap: 2 },
  stepLabel: { minWidth: 0, flexShrink: 1, color: c.ink, fontSize: 16, lineHeight: 21 },
  // Done rows read as muted (#535D5A on white, 7:1) with a check: no strikethrough.
  stepLabelDone: { color: c.muted },
  stepLabelCurrent: { fontWeight: '700' },
  stepMeta: { color: c.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  stepMetaDone: { color: c.forestText, fontWeight: '600' },
  dueSection: { gap: 10 },
  sectionHeading: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  sectionHeadingLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  sectionCopy: { minWidth: 0, flexShrink: 1, gap: 2 },
  sectionTitle: { fontSize: 18, lineHeight: 24, letterSpacing: -0.2, fontWeight: '600' },
  sectionMeta: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sectionLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, marginRight: -spacing.sm },
  sectionLinkText: { color: c.brandText, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  // Bleed the strip to the screen edge so the last card peeks in from the right.
  dueScroller: { marginHorizontal: -20 },
  dueStrip: { paddingHorizontal: 20, gap: 10 },
  dueStack: { gap: 10 },
  dueCard: { width: 200, backgroundColor: c.paperRaised },
  dueCardLarge: { width: '100%' },
  dueEmpty: { gap: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, padding: spacing.lg },
  dueEmptyText: { color: c.muted, fontSize: 14, lineHeight: 20 },
  dueEmptyLink: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  dueError: { color: c.danger, fontSize: 13, lineHeight: 18 },
  planCard: { width: '100%', minHeight: 48, gap: 10, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, padding: spacing.lg },
  planCopy: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  planCopyLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  planTitle: { minWidth: 0, flexShrink: 1, color: c.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  planMeta: { color: c.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  planSegments: { flexDirection: 'row', gap: 6 },
  planSegment: { minWidth: 0, flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: c.line },
  planSegmentDone: { backgroundColor: c.brand },
  planSegmentCurrent: { backgroundColor: c.goldIcon },
  planNext: { color: c.muted, fontSize: 13, lineHeight: 18 },
}));
