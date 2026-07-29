import { Redirect, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Button } from 'heroui-native/button';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { useCallback, useMemo } from 'react';
import { FlatList, Platform, Pressable, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { JournalDisplay, JournalKicker } from '@/components/journal-chrome';
import { MotionProgress, MotionReveal } from '@/components/motion';
import { getScene } from '@/data/scenes';
import { lessonPlans } from '@/data/lesson-plans';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { DEFAULT_MOTION_PREFERENCE, defaultLearnerProfile } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import { colors, makeStyles, maxContentWidth, radius, spacing, useSharedStyles } from '@/theme';

const ashaPortrait = require('../../../assets/images/asha-portrait.png');
const gardenSaffronHalo = require('../../../assets/images/today-garden-saffron-halo.svg');
const gardenRoseHalo = require('../../../assets/images/today-garden-rose-halo.svg');
const gardenStreakIcon = require('../../../assets/images/today-garden-streak-icon.svg');
const gardenWaterIcon = require('../../../assets/images/today-garden-water-icon.svg');
const gardenFlowers = [
  {
    flower: require('../../../assets/images/today-garden-flower-brand.svg'),
    soil: require('../../../assets/images/today-garden-soil-brand.svg'),
  },
  {
    flower: require('../../../assets/images/today-garden-flower-forest.svg'),
    soil: require('../../../assets/images/today-garden-soil-forest.svg'),
  },
  {
    flower: require('../../../assets/images/today-garden-flower-gold.svg'),
    soil: require('../../../assets/images/today-garden-soil-gold.svg'),
  },
] as const;
const dailyGoalArcLength = 259.36;

function countLabel(count: number) {
  const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'];
  return words[count] ?? String(count);
}

export default function HomeScreen() {
  const router = useRouter();
  const state = useAppState();
  const sharedStyles = useSharedStyles();
  const styles = useStyles();
  const contentTopPadding = Platform.OS === 'android'
    ? Math.max(18, (StatusBar.currentHeight ?? 0) + spacing.md)
    : 18;
  const largeTextLayout = useLargeTextLayout();
  const { width: windowWidth } = useWindowDimensions();
  const stackedTopbarLayout = largeTextLayout || windowWidth <= 380;
  const { duePhrases, goal, learnerProfile, motionPreference = DEFAULT_MOTION_PREFERENCE, phraseReviews, phrases, practice, sceneProgress: savedSceneProgress, setGoal, streak } = state;
  const { mode: motionMode } = useMotionPreference(motionPreference);
  const profile = useMemo(() => learnerProfile ?? { ...defaultLearnerProfile(), completed: true }, [learnerProfile]);
  const sceneProgress = useMemo(() => savedSceneProgress ?? {}, [savedSceneProgress]);
  const openLesson = useCallback((lessonId: string) => router.push({ pathname: '/scene/[id]', params: { id: lessonId } }), [router]);
  const openPlan = useCallback((planId: string) => router.push({ pathname: '/lesson-plans', params: { planId } }), [router]);
  const goalPercent = Math.min(100, Math.round(practice.seconds / (goal * 60) * 100));
  const minutesToday = Math.floor(practice.seconds / 60);
  const featuredPhrase = duePhrases[0] ?? phrases[0] ?? null;
  const featuredMastery = featuredPhrase ? (phraseReviews ?? {})[featuredPhrase.hi]?.mastery ?? 0 : 0;
  const gardenSummary = duePhrases.length > 0
    ? `${countLabel(duePhrases.length)} saved phrase${duePhrases.length === 1 ? ' is' : 's are'} ready for a little water today.`
    : phrases.length > 0
      ? `${countLabel(phrases.length)} saved phrase${phrases.length === 1 ? ' is' : 's are'} growing in your garden.`
      : 'Save a useful phrase and Asha will help it take root here.';
  const featuredPhraseText = featuredPhrase
    ? profile.scriptPreference === 'devanagari' ? featuredPhrase.hi : featuredPhrase.latin
    : 'Save your first phrase';
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
      title: scene?.title ?? plan.title,
    };
  }, [sceneProgress]);
  const currentPlan = lessonSelection.plan;

  const goalFooter = useMemo(() => (
    <View style={[styles.goalFooter, largeTextLayout && styles.goalFooterLarge]} testID="today-daily-goal">
      <View style={[styles.goalHeader, largeTextLayout && styles.goalHeaderLarge]}>
        <JournalDisplay style={styles.goalFooterTitle}>Daily practice target</JournalDisplay>
        <View style={styles.goalTodayBadge}>
          <Text style={styles.goalTodayBadgeText}>{minutesToday} min today</Text>
        </View>
      </View>

      <View
        accessibilityLabel={`${goalPercent} percent of daily goal complete`}
        style={[styles.goalDial, largeTextLayout && styles.goalDialLarge]}
        testID="today-goal-dial"
      >
        <Svg
          accessibilityElementsHidden
          height={136}
          pointerEvents="none"
          preserveAspectRatio="none"
          style={styles.goalDialArc}
          testID="today-goal-arc"
          viewBox="0 0 304 136"
          width="100%"
        >
          <Path
            d="M 58 126 C 78 28 226 28 246 126"
            fill="none"
            stroke={colors.gold}
            strokeLinecap="round"
            strokeWidth={2.5}
            testID="today-goal-arc-track"
          />
          {goalPercent > 0 ? (
            <Path
              d="M 58 126 C 78 28 226 28 246 126"
              fill="none"
              stroke={colors.forest}
              strokeDasharray={`${dailyGoalArcLength * goalPercent / 100} ${dailyGoalArcLength}`}
              strokeLinecap="round"
              strokeWidth={3}
              testID="today-goal-progress-arc"
            />
          ) : null}
        </Svg>

        {([5, 10, 15] as const).map((minutes) => (
          <Pressable
            key={minutes}
            accessibilityLabel={`${minutes} minute daily goal`}
            accessibilityRole="button"
            accessibilityState={{ selected: goal === minutes }}
            onPress={() => setGoal(minutes)}
            style={[
              styles.goalChoice,
              minutes === 5 ? styles.goalChoiceFive : minutes === 10 ? styles.goalChoiceTen : styles.goalChoiceFifteen,
            ]}
            testID={`today-goal-choice-${minutes}`}
          >
            <Text
              style={[
                styles.goalChoiceText,
                minutes === 5 && styles.goalChoiceTextFive,
                minutes === 15 && styles.goalChoiceTextFifteen,
                goal === minutes && styles.goalChoiceTextActive,
              ]}
              testID={`today-goal-label-${minutes}`}
            >
              {minutes}{'\n'}min
            </Text>
            <View
              style={[styles.goalMarkerSpot, minutes === 10 && styles.goalMarkerSpotMiddle]}
              testID={`today-goal-marker-spot-${minutes}`}
            >
              <View
                style={[
                  styles.goalMarker,
                  minutes === 5 ? styles.goalMarkerStart : minutes === 15 ? styles.goalMarkerEnd : styles.goalMarkerMiddle,
                  goal === minutes && styles.goalMarkerActive,
                ]}
                testID={`today-goal-marker-${minutes}`}
              />
            </View>
          </Pressable>
        ))}

        <View pointerEvents="none" style={styles.goalValue}>
          <Text style={styles.goalValueMinutes} testID="today-goal-value">{goal} min</Text>
          <Text style={styles.goalValueLabel}>daily goal</Text>
        </View>
      </View>

      <Text style={styles.goalProgressCopy}>Today · {goalPercent}% of {goal} min</Text>

      <View
        style={[styles.challengeChecks, largeTextLayout && styles.challengeChecksLarge]}
        testID="today-goal-status"
      >
        <View style={[styles.challengePill, practice.chaiDone && styles.challengePillDone]}>
          <Text style={[styles.challengeCheck, practice.chaiDone && styles.challengeCheckDone]}>{practice.chaiDone ? '✓' : '○'} Chai scene</Text>
        </View>
        <View style={[styles.challengePill, practice.liveDone && styles.challengePillDone]}>
          <Text style={[styles.challengeCheck, practice.liveDone && styles.challengeCheckDone]}>{practice.liveDone ? '✓' : '○'} Asha turn</Text>
        </View>
      </View>
    </View>
  ), [goal, goalPercent, largeTextLayout, minutesToday, practice.chaiDone, practice.liveDone, setGoal, styles]);

  const header = useMemo(() => (
    <View style={styles.headerContent}>
      <View style={[styles.topbar, stackedTopbarLayout && styles.topbarLarge]} testID="today-topbar">
        <View style={styles.brandCopy}>
          <JournalKicker>A QUIET PRACTICE</JournalKicker>
          <JournalDisplay style={styles.greeting}>Make Hindi yours.</JournalDisplay>
        </View>
        <Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.settingsButton}>
          <Text style={styles.settingsDots}>•••</Text>
          <Text style={styles.settingsLabel}>Settings</Text>
        </Pressable>
      </View>

      <MotionReveal mode={motionMode} motionKey={lessonSelection.lessonId} style={styles.languageGarden} testID="today-primary-motion">
        <Image accessible={false} contentFit="contain" pointerEvents="none" source={gardenSaffronHalo} style={styles.saffronHalo} />
        <Image accessible={false} contentFit="contain" pointerEvents="none" source={gardenRoseHalo} style={styles.roseHalo} />
        <View style={[styles.gardenIntro, largeTextLayout && styles.gardenIntroLarge]}>
          <View style={styles.gardenIntroCopy}>
            <JournalKicker>LANGUAGE GARDEN</JournalKicker>
            <JournalDisplay style={styles.gardenTitle}>Asha is here to help it grow.</JournalDisplay>
            <Text style={styles.gardenBody}>{gardenSummary}</Text>
            <View style={styles.gardenChips}>
              <Pressable accessibilityLabel="View practice streak" accessibilityRole="button" hitSlop={8} onPress={() => router.push('/progress' as Href)} style={[styles.gardenChip, styles.streakChip]}>
                <Image accessible={false} contentFit="contain" source={gardenStreakIcon} style={styles.gardenChipIcon} />
                <Text style={styles.streakChipText}>{streak} day{streak === 1 ? '' : 's'}</Text>
              </Pressable>
              <View accessibilityLabel={`${duePhrases.length} saved phrases ready to water`} style={[styles.gardenChip, styles.waterChip]}>
                <Image accessible={false} contentFit="contain" source={gardenWaterIcon} style={styles.gardenChipIcon} />
                <Text style={styles.waterChipText}>{duePhrases.length} to water</Text>
              </View>
            </View>
          </View>
          <View style={[styles.portraitFrame, largeTextLayout && styles.portraitFrameLarge]}>
            <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.gardenPortrait} testID="today-asha-portrait" transition={0} />
          </View>
        </View>

        <View style={styles.gardenDivider} />

        <PressableFeedback
          accessibilityLabel={featuredPhrase ? `Practice saved phrase ${featuredPhrase.hi}` : 'Open saved phrases'}
          accessibilityRole="button"
          onPress={() => router.push('/phrases')}
          style={[styles.phraseCard, largeTextLayout && styles.phraseCardLarge]}
          testID="today-language-garden"
        >
          <View style={styles.flowerPatch}>
            {gardenFlowers.map(({ flower, soil }, index) => (
              <View key={index} style={styles.flowerPair}>
                <Image accessible={false} contentFit="contain" source={flower} style={styles.flowerIcon} />
                <Image accessible={false} contentFit="contain" source={soil} style={styles.soilIcon} />
              </View>
            ))}
          </View>
          <View style={styles.phraseCopy}>
            <JournalKicker>READY TO WATER</JournalKicker>
            <Text style={styles.phraseTitle}>{featuredPhraseText}</Text>
            <Text style={styles.phraseMastery}>{featuredPhrase ? `${featuredMastery}/5 roots strong` : 'Ready for your first saved phrase'}</Text>
          </View>
        </PressableFeedback>

        <View style={styles.nextPractice} testID="today-next-practice">
          <JournalKicker>{lessonSelection.kicker}</JournalKicker>
          <JournalDisplay style={styles.nextPracticeTitle}>{lessonSelection.title}</JournalDisplay>
          <Button accessibilityLabel={lessonSelection.action} accessibilityRole="button" onPress={() => openLesson(lessonSelection.lessonId)} size="md" style={styles.nextButton} variant="secondary">
            <Button.Label style={styles.nextButtonText}>{lessonSelection.action}</Button.Label>
          </Button>
        </View>
      </MotionReveal>

      <View style={[styles.learningHeading, largeTextLayout && styles.learningHeadingLarge]}>
        <JournalDisplay style={styles.learningTitle}>Your learning path</JournalDisplay>
        <Text style={styles.learningMeta}>{lessonPlans.length} plans · {lessonPlans.reduce((sum, plan) => sum + plan.lessonIds.length, 0)} lessons</Text>
      </View>
    </View>
  ), [duePhrases.length, featuredMastery, featuredPhrase, featuredPhraseText, gardenSummary, largeTextLayout, lessonSelection, motionMode, openLesson, router, stackedTopbarLayout, streak, styles]);

  const footer = useMemo(() => (
    <View style={styles.footerContent}>
      <PressableFeedback accessibilityLabel="Browse all 10 plans" accessibilityRole="button" onPress={() => router.push('/lesson-plans' as Href)} style={styles.lessonPlansLink} testID="today-plan-catalog">
        <Text style={styles.lessonPlansTitle}>Browse all 10 plans</Text>
        <Text style={styles.lessonPlansArrow}>→</Text>
      </PressableFeedback>
      {goalFooter}
    </View>
  ), [goalFooter, router, styles]);

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
        const selectedLesson = getScene(lessonSelection.lessonId);
        const selectedProgress = sceneProgress[lessonSelection.lessonId];
        const selectedLessonIsInProgress = selectedLessonIndex >= 0
          && (selectedProgress?.completions ?? 0) === 0
          && (selectedProgress?.lastBeatIndex ?? 0) > 0;
        const selectedLessonFraction = selectedLessonIsInProgress
          ? Math.min(0.99, (selectedProgress?.lastBeatIndex ?? 0) / Math.max(1, selectedLesson?.beats.length ?? 10))
          : 0;
        const percent = Math.round((completed + selectedLessonFraction) / plan.lessonIds.length * 100);
        const planMeta = selectedLessonIsInProgress
          ? `Lesson ${selectedLessonIndex + 1} in progress`
          : `${completed} of ${plan.lessonIds.length} lessons`;
        const planAction = lessonSelection.action === 'Start lesson'
          ? 'Start'
          : lessonSelection.action === 'Review lesson'
            ? 'Review'
            : 'Continue';
        return (
          <MotionReveal mode={motionMode} motionKey={plan.id} style={styles.planCell} testID="today-current-plan">
            <PressableFeedback
              accessibilityLabel={`${plan.title}, plan ${plan.order} of ${lessonPlans.length}, ${selectedLessonIsInProgress ? `${planMeta.toLowerCase()}, ` : ''}${completed} of ${plan.lessonIds.length} lessons complete`}
              accessibilityRole="button"
              onPress={() => openPlan(plan.id)}
              style={[styles.planCard, largeTextLayout && styles.planCardLarge]}
            >
              <View style={styles.planNumber}>
                <Text style={styles.planNumberText}>{String(plan.order).padStart(2, '0')}</Text>
              </View>
              <View style={styles.planCopy}>
                <Text style={styles.planTitle}>{plan.title}</Text>
                <Text style={styles.planMeta}>{planMeta}</Text>
                <View accessibilityLabel={`${percent} percent complete`} style={styles.planTrack}>
                  <MotionProgress color={plan.color} mode={motionMode} percent={percent} style={styles.planTrackFill} testID="today-plan-progress-motion" />
                </View>
              </View>
              <Text style={styles.planAction}>{planAction} →</Text>
            </PressableFeedback>
          </MotionReveal>
        );
      }}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      style={sharedStyles.screen}
      testID="today-guided-plan-list"
    />
  );
}

const useStyles = makeStyles((c) => ({
  list: { width: '100%', alignItems: 'stretch', paddingHorizontal: 20, paddingTop: 18, paddingBottom: spacing.xxl },
  separator: { height: spacing.md },
  headerContent: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', minWidth: 0, alignItems: 'stretch', gap: spacing.md, marginBottom: spacing.md },
  footerContent: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', gap: spacing.lg, marginTop: spacing.lg },
  planCell: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  topbar: { width: '100%', minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  topbarLarge: { minHeight: 0, flexDirection: 'column', alignItems: 'stretch', gap: spacing.md, paddingRight: 0 },
  intro: { minWidth: 0, flex: 1, maxWidth: 200, paddingTop: spacing.lg, gap: spacing.lg },
  brandCopy: { minWidth: 0, flex: 1 },
  greeting: { marginTop: 1, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  brandTagline: { color: c.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm, textAlign: 'left' },
  headerMotif: { position: 'absolute', right: 0, top: -2, width: 158, height: 196 },
  settingsButton: { alignSelf: 'flex-start', minHeight: 48, minWidth: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, paddingHorizontal: spacing.md, boxShadow: '0 4px 12px rgba(33, 37, 33, 0.08)' },
  settingsDots: { color: c.brandText, fontSize: 15, fontWeight: '900', letterSpacing: 1.2 },
  settingsLabel: { color: c.muted, fontSize: 13, fontWeight: '800' },
  languageGarden: { width: '100%', minHeight: 431, position: 'relative', alignItems: 'stretch', overflow: 'hidden', borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: '#F8EBDD', borderColor: c.line, borderWidth: 1, padding: 17, boxShadow: '0 10px 24px rgba(35, 39, 35, 0.08)' },
  saffronHalo: { position: 'absolute', right: 4, top: -39, width: 182, height: 182 },
  roseHalo: { position: 'absolute', right: 2, top: 99, width: 110, height: 110 },
  gardenIntro: { width: '100%', minHeight: 150, flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: spacing.sm, zIndex: 1 },
  gardenIntroLarge: { minHeight: 0, gap: spacing.md },
  gardenIntroCopy: { minWidth: 170, flex: 1, alignItems: 'flex-start' },
  gardenTitle: { maxWidth: 194, marginTop: 4, fontSize: 20, lineHeight: 25, letterSpacing: -0.25 },
  gardenBody: { maxWidth: 194, color: c.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  gardenChips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  gardenChip: { height: 28, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 9 },
  waterChip: { backgroundColor: c.brandSoft },
  gardenChipIcon: { width: 14, height: 14 },
  waterChipText: { color: c.brandText, fontSize: 11, fontWeight: '900' },
  portraitFrame: { width: 132, height: 158, marginTop: -8, marginRight: -6, overflow: 'hidden', borderRadius: 24, borderCurve: 'continuous', backgroundColor: '#FFF8EF', borderColor: 'rgba(255,255,255,0.9)', borderWidth: 2, padding: 6, boxShadow: '0 8px 16px rgba(88, 54, 36, 0.12)' },
  portraitFrameLarge: { marginTop: 0, marginRight: 0 },
  gardenPortrait: { width: '100%', height: '100%', borderRadius: 18, borderCurve: 'continuous' },
  gardenDivider: { width: '100%', height: 1, backgroundColor: c.line, marginTop: 6 },
  phraseCard: { width: '100%', minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: 16, borderCurve: 'continuous', backgroundColor: c.goldSoft, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: 22 },
  phraseCardLarge: { flexWrap: 'wrap' },
  flowerPatch: { width: 112, height: 48, flexDirection: 'row', alignItems: 'flex-end' },
  flowerPair: { width: 32, height: 48, marginRight: 4, position: 'relative', alignItems: 'center' },
  flowerIcon: { position: 'absolute', left: 4, top: 0, width: 24, height: 24, zIndex: 1 },
  soilIcon: { position: 'absolute', left: 0, bottom: 2, width: 32, height: 24 },
  phraseCopy: { minWidth: 0, flex: 1 },
  phraseTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 16, lineHeight: 21, fontWeight: '700', marginTop: 1 },
  phraseMastery: { color: c.muted, fontSize: 11, lineHeight: 15, fontWeight: '700', marginTop: 1 },
  nextPractice: { width: '100%', minHeight: 123, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#FFF7E3', borderColor: 'rgba(232, 199, 143, 0.48)', borderWidth: 1, padding: spacing.md, gap: 6, marginTop: 21, boxShadow: '0 5px 14px rgba(94, 66, 34, 0.08)' },
  nextPracticeTitle: { width: '100%', fontSize: 20, lineHeight: 25, letterSpacing: -0.25, textAlign: 'center' },
  learningHeading: { width: '100%', minHeight: 35, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md },
  learningHeadingLarge: { alignItems: 'flex-start', flexDirection: 'column' },
  learningTitle: { minWidth: 0, flexShrink: 1, fontSize: 20, lineHeight: 25, letterSpacing: -0.25 },
  learningMeta: { color: c.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  practiceArc: { width: '100%', alignItems: 'stretch', overflow: 'hidden', borderRadius: 26, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, boxShadow: '0 10px 22px rgba(35, 39, 35, 0.08)' },
  practicePortrait: { width: '100%', height: 142 },
  practiceArcCopy: { width: '100%', alignItems: 'stretch', gap: spacing.md, padding: spacing.lg },
  practiceArcHeading: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  practiceArcHeadingLarge: { flexDirection: 'column', alignItems: 'stretch' },
  practiceArcTitleCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  practiceArcTitleCopyLarge: { flex: 0 },
  practiceArcTitle: { maxWidth: 270, fontSize: 28, lineHeight: 34, textAlign: 'left' },
  practiceArcTitleLarge: { maxWidth: '100%' },
  nextBody: { color: c.muted, fontSize: 14, lineHeight: 20, textAlign: 'left' },
  goalSummary: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.xs },
  goalSummaryLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  todayLabel: { color: c.muted, fontSize: 12, fontWeight: '800', textAlign: 'left' },
  streakChip: { backgroundColor: c.forestSoft },
  streakChipIcon: { color: c.forestText },
  streakChipText: { color: c.forestText, fontSize: 12, fontWeight: '900' },
  progressTrack: { width: '100%', height: 7, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.backgroundWarm },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: c.forest },
  arcSteps: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  arcStepsLarge: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  arcStep: { minWidth: 0, flex: 1, alignItems: 'center', gap: 5 },
  arcStepLarge: { flex: 0, flexDirection: 'row', justifyContent: 'flex-start', gap: spacing.md },
  arcIcon: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: c.backgroundWarm, alignItems: 'center', justifyContent: 'center' },
  arcIconActive: { backgroundColor: c.neutralSurface, borderColor: c.gold, borderWidth: 2 },
  arcIconText: { color: c.forestText },
  arcIconTextActive: { color: c.white },
  arcStepLabel: { color: c.muted, fontSize: 11, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  arcStepLabelActive: { color: c.ink },
  arcConnector: { height: 1, flex: 0.42, backgroundColor: c.gold },
  nextButton: { width: '100%', minHeight: 48, alignSelf: 'stretch', backgroundColor: c.neutralSurface, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  nextButtonText: { color: c.white, fontSize: 14, fontWeight: '800' },
  gardenCue: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopColor: c.lineStrong, borderBottomColor: c.lineStrong, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: spacing.md },
  gardenCueIcon: { width: 46, height: 46, borderRadius: radius.pill, borderColor: c.gold, borderWidth: 1, backgroundColor: c.goldSoft, alignItems: 'center', justifyContent: 'center' },
  gardenCueIconText: { color: c.forestText },
  gardenCueCopy: { minWidth: 0, flex: 1, gap: 1 },
  gardenCueEyebrow: { color: c.brandText, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  gardenCueHindi: { color: c.ink, fontFamily: 'Georgia', fontSize: 21, lineHeight: 27, fontWeight: '700' },
  gardenCueLatin: { color: c.brandText, fontSize: 13, fontWeight: '900' },
  gardenCueBody: { color: c.muted, fontSize: 12, lineHeight: 17 },
  gardenCueArrow: { color: c.forestText, fontSize: 22, fontWeight: '900' },
  lessonPlansLink: { width: '100%', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderTopColor: c.line, borderBottomColor: c.line, borderTopWidth: 1, borderBottomWidth: 1, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  lessonPlansTitle: { color: c.forestText, fontSize: 14, lineHeight: 20, fontWeight: '900' },
  lessonPlansArrow: { color: c.forestText, fontSize: 20, fontWeight: '900' },
  goalFooter: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'stretch', borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, padding: 14, gap: 6, boxShadow: '0 6px 18px rgba(35, 39, 35, 0.05)' },
  goalFooterLarge: { padding: spacing.lg, gap: spacing.md },
  goalHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  goalHeaderLarge: { alignItems: 'flex-start', flexDirection: 'column' },
  goalFooterTitle: { minWidth: 0, flexShrink: 1, color: c.ink, fontSize: 21, lineHeight: 27, letterSpacing: -0.25, textAlign: 'left' },
  goalTodayBadge: { minHeight: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: c.brandSoft, paddingHorizontal: spacing.md, paddingVertical: 5 },
  goalTodayBadgeText: { color: c.brandText, fontSize: 12, lineHeight: 17, fontWeight: '900', fontVariant: ['tabular-nums'] },
  goalDial: { width: '100%', maxWidth: 320, height: 144, alignSelf: 'center', position: 'relative' },
  goalDialLarge: { height: 190 },
  goalDialArc: { position: 'absolute', left: 0, right: 0, top: -6, height: 136 },
  goalChoice: { position: 'absolute', width: 48, minWidth: 48, height: 58, minHeight: 48, alignItems: 'center', justifyContent: 'flex-start', zIndex: 2 },
  goalChoiceFive: { left: '19.078947%', top: 76, transform: [{ translateX: -24 }] },
  goalChoiceTen: { left: '50%', top: 2, transform: [{ translateX: -24 }] },
  goalChoiceFifteen: { right: '19.078947%', top: 76, transform: [{ translateX: 24 }] },
  goalChoiceText: { color: c.muted, fontSize: 12, lineHeight: 14, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  goalChoiceTextFive: { transform: [{ translateX: -8 }] },
  goalChoiceTextFifteen: { transform: [{ translateX: 8 }] },
  goalChoiceTextActive: { color: c.ink, fontWeight: '900' },
  goalMarkerSpot: { position: 'absolute', left: 12, bottom: 2, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  goalMarkerSpotMiddle: { bottom: 1.5 },
  goalMarker: { width: 9, height: 9, borderRadius: radius.pill },
  goalMarkerStart: { backgroundColor: c.gold },
  goalMarkerMiddle: { backgroundColor: c.gold },
  goalMarkerEnd: { backgroundColor: c.gold },
  goalMarkerActive: { width: 22, height: 22, backgroundColor: c.brand, borderColor: c.white, borderWidth: 2, boxShadow: '0 2px 5px rgba(98, 47, 31, 0.28)' },
  goalValue: { position: 'absolute', left: 58, right: 58, top: 70, alignItems: 'center', zIndex: 1 },
  goalValueMinutes: { color: c.forestText, fontFamily: 'Georgia', fontSize: 36, lineHeight: 40, fontWeight: '700', letterSpacing: -0.5, textAlign: 'center', fontVariant: ['tabular-nums'] },
  goalValueLabel: { color: c.muted, fontSize: 13, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  goalProgressCopy: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  challengeChecks: { width: '100%', maxWidth: 252, alignSelf: 'center', flexDirection: 'row', alignItems: 'stretch', justifyContent: 'center', gap: spacing.sm, marginTop: 10 },
  challengeChecksLarge: { flexDirection: 'column' },
  challengePill: { minWidth: 0, minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderCurve: 'continuous', borderColor: '#DFC99D', borderWidth: 1, backgroundColor: c.paper, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  challengePillDone: { borderColor: '#B9D3C9', backgroundColor: c.successSoft },
  challengeCheck: { color: c.muted, fontSize: 12, lineHeight: 17, fontWeight: '800', textAlign: 'center' },
  challengeCheckDone: { color: c.forestText },
  planCard: { width: '100%', minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: 16, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, padding: spacing.md, boxShadow: '0 4px 12px rgba(35, 39, 35, 0.05)' },
  planCardLarge: { minHeight: 96, flexWrap: 'wrap', alignItems: 'flex-start', padding: spacing.lg },
  planNumber: { width: 42, height: 42, flexShrink: 0, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  planNumberText: { color: c.brandText, fontSize: 13, lineHeight: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  planAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  planTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  planOrder: { color: c.brandText, fontSize: 11, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase' },
  planMeta: { color: c.muted, fontSize: 11, lineHeight: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  planTitleRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  planTitleRowLarge: { alignItems: 'flex-start' },
  planEmoji: { fontSize: 28 },
  planCopy: { minWidth: 150, flex: 1, gap: 2 },
  planTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 17, lineHeight: 22, fontWeight: '700' },
  planSubtitle: { color: c.muted, fontSize: 13, lineHeight: 18 },
  planTrack: { width: '100%', height: 4, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: c.backgroundWarm, marginTop: 3 },
  planTrackFill: { height: '100%', borderRadius: radius.pill },
  planAction: { color: c.forestText, fontSize: 12, lineHeight: 18, fontWeight: '900' },
}));
