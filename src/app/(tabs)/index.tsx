import { Redirect, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowRight, AudioLines, Flame, Settings } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { Platform, Pressable, ScrollView, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { MotionReveal } from '@/components/motion';
import { getScene } from '@/data/scenes';
import { lessonPlans } from '@/data/lesson-plans';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { DEFAULT_MOTION_PREFERENCE, defaultLearnerProfile } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import { makeStyles, maxContentWidth, spacing, useSharedStyles, useTheme } from '@/theme';

const ashaPortrait = require('../../../assets/images/asha-portrait.png');

/** Local radii from the Today mockup; kept here so the shared theme stays untouched. */
const cardRadius = 22;
const heroRadius = 28;
const pillRadius = 999;

const ringSize = 64;
const ringStroke = 8;
const ringRadius = (ringSize - ringStroke) / 2;
const ringCircumference = 2 * Math.PI * ringRadius;

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
  const { duePhrases, goal, learnerProfile, motionPreference = DEFAULT_MOTION_PREFERENCE, phrases, practice, sceneProgress: savedSceneProgress, setGoal, streak } = state;
  const { mode: motionMode } = useMotionPreference(motionPreference);
  const profile = useMemo(() => learnerProfile ?? { ...defaultLearnerProfile(), completed: true }, [learnerProfile]);
  const sceneProgress = useMemo(() => savedSceneProgress ?? {}, [savedSceneProgress]);
  const openLesson = useCallback((lessonId: string) => router.push({ pathname: '/scene/[id]', params: { id: lessonId } }), [router]);
  const openPlan = useCallback((planId: string) => router.push({ pathname: '/lesson-plans', params: { planId } }), [router]);
  const goalPercent = Math.min(100, Math.round(practice.seconds / (goal * 60) * 100));
  const minutesToday = Math.floor(practice.seconds / 60);
  const minutesToGo = Math.max(0, goal - minutesToday);
  const useLatinScript = profile.scriptPreference !== 'devanagari';
  const featuredPhrase = duePhrases[0] ?? phrases[0] ?? null;
  const featuredPhraseText = featuredPhrase
    ? useLatinScript ? featuredPhrase.latin : featuredPhrase.hi
    : 'Save your first phrase';
  const todayLabel = useMemo(() => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), []);

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
      beats: scene?.beats.length ?? 0,
      kicker: mode === 'continue' ? 'CONTINUE LESSON' : mode === 'next' ? 'NEXT LESSON' : 'REVIEW LESSON',
      lessonId,
      place: scene?.place ?? plan.place,
      plan,
      subtitle: scene?.subtitle ?? plan.subtitle,
      title: scene?.title ?? plan.title,
      words: scene?.words ?? plan.words,
    };
  }, [sceneProgress]);
  const currentPlan = lessonSelection.plan;
  const heroGlyph = Array.from(lessonSelection.words[0] ?? '').slice(0, 2).join('');

  const pathSummary = useMemo(() => {
    const plan = currentPlan;
    const completed = plan.lessonIds.filter((id) => (sceneProgress[id]?.completions ?? 0) > 0).length;
    const selectedLessonIndex = plan.lessonIds.indexOf(lessonSelection.lessonId);
    const selectedProgress = sceneProgress[lessonSelection.lessonId];
    const selectedLessonIsInProgress = selectedLessonIndex >= 0
      && (selectedProgress?.completions ?? 0) === 0
      && (selectedProgress?.lastBeatIndex ?? 0) > 0;
    const inProgressNote = selectedLessonIsInProgress ? `lesson ${selectedLessonIndex + 1} in progress, ` : '';
    return {
      accessibilityLabel: `${plan.title}, plan ${plan.order} of ${lessonPlans.length}, ${inProgressNote}${completed} of ${plan.lessonIds.length} lessons complete`,
      completed,
      linkText: `${plan.title} · ${completed} of ${plan.lessonIds.length}`,
      segments: plan.lessonIds.map((id) => {
        if ((sceneProgress[id]?.completions ?? 0) > 0) return 'done' as const;
        return id === lessonSelection.lessonId ? 'current' as const : 'todo' as const;
      }),
    };
  }, [currentPlan, lessonSelection.lessonId, sceneProgress]);

  if (learnerProfile?.completed === false) return <Redirect href={'/onboarding' as Href} />;

  const dueCount = duePhrases.length;
  const reviewLabel = dueCount > 0
    ? `Review ${plural(dueCount, 'saved phrase')} due today`
    : 'Open saved phrases';
  const ashaSubtitle = practice.liveDone
    ? 'Today’s Asha turn is done. Keep talking'
    : `Try “${useLatinScript ? romanizeDevanagari(lessonSelection.words[0]) : lessonSelection.words[0]}” out loud`;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.list, { paddingTop: contentTopPadding }]}
      style={sharedStyles.screen}
      testID="today-guided-plan-list"
    >
      <View style={[styles.column, largeTextLayout && styles.columnLarge]}>
        <View style={[styles.topbar, stackedTopbarLayout && styles.topbarLarge]} testID="today-topbar">
          <View style={styles.greetingCopy}>
            <Text style={styles.dateLine}>{todayLabel}</Text>
            <Text accessibilityLabel="Namaste" accessibilityRole="header" style={styles.greeting}>
              Namaste
              <Text style={styles.greetingHindi}>{'  '}नमस्ते</Text>
            </Text>
          </View>
          <View style={styles.topbarActions}>
            <Pressable
              accessibilityLabel={`View practice streak, ${plural(streak, 'day')}`}
              accessibilityRole="button"
              onPress={() => router.push('/progress' as Href)}
              style={styles.streakPill}
              testID="today-streak"
            >
              <Flame color={colors.brand} size={18} strokeWidth={2} />
              <Text style={styles.streakText}>{plural(streak, 'day')}</Text>
            </Pressable>
            <Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.settingsButton}>
              <Settings color={colors.muted} size={20} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        <MotionReveal mode={motionMode} motionKey={lessonSelection.lessonId} style={styles.heroMotion} testID="today-primary-motion">
          <View style={[styles.hero, largeTextLayout && styles.heroLarge]} testID="today-next-practice">
            <Text accessible={false} importantForAccessibility="no-hide-descendants" style={styles.heroGlyph}>{heroGlyph}</Text>
            <View style={styles.heroMetaRow}>
              <View style={styles.heroKicker}>
                <Text style={styles.heroKickerText}>{lessonSelection.kicker}</Text>
              </View>
              <Text style={styles.heroPlace}>{lessonSelection.place}</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text accessibilityRole="header" style={styles.heroTitle}>{lessonSelection.title}</Text>
              <Text style={styles.heroSubtitle}>{lessonSelection.subtitle}</Text>
            </View>
            <View style={styles.wordChips} testID="today-lesson-words">
              {lessonSelection.words.map((word) => (
                <View key={word} style={styles.wordChip}>
                  <Text style={styles.wordChipText}>{useLatinScript ? romanizeDevanagari(word) : word}</Text>
                </View>
              ))}
            </View>
            <View style={styles.heroActions}>
              <Pressable
                accessibilityLabel={lessonSelection.action}
                accessibilityRole="button"
                onPress={() => openLesson(lessonSelection.lessonId)}
                style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
                testID="today-start-lesson"
              >
                <Text style={styles.heroButtonText}>{lessonSelection.action}</Text>
                <ArrowRight color={colors.ink} size={18} strokeWidth={2.2} />
              </Pressable>
              {lessonSelection.beats > 0 ? <Text style={styles.heroPlace}>{plural(lessonSelection.beats, 'beat')}</Text> : null}
            </View>
          </View>
        </MotionReveal>

        <View style={[styles.tileRow, largeTextLayout && styles.tileRowLarge]}>
          <View style={[styles.goalCard, largeTextLayout && styles.tileLarge]} testID="today-daily-goal">
            <View style={styles.goalHeader}>
              <Text style={styles.tileLabel}>Daily goal</Text>
              <Text style={styles.goalValue} testID="today-goal-value">{goal} min</Text>
            </View>
            <View style={styles.goalProgressRow}>
              <View
                accessible
                accessibilityLabel={`${goalPercent} percent of daily goal complete`}
                accessibilityRole="progressbar"
                accessibilityValue={{ max: 100, min: 0, now: goalPercent }}
                style={styles.goalDial}
                testID="today-goal-dial"
              >
                <Svg
                  accessibilityElementsHidden
                  height={ringSize}
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  testID="today-goal-arc"
                  viewBox={`0 0 ${ringSize} ${ringSize}`}
                  width={ringSize}
                >
                  <Circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    fill="none"
                    r={ringRadius}
                    stroke={colors.line}
                    strokeWidth={ringStroke}
                    testID="today-goal-arc-track"
                  />
                  {goalPercent > 0 ? (
                    <Circle
                      cx={ringSize / 2}
                      cy={ringSize / 2}
                      fill="none"
                      origin={`${ringSize / 2}, ${ringSize / 2}`}
                      r={ringRadius}
                      rotation={-90}
                      stroke={colors.brand}
                      strokeDasharray={`${ringCircumference * goalPercent / 100} ${ringCircumference}`}
                      strokeLinecap="round"
                      strokeWidth={ringStroke}
                      testID="today-goal-progress-arc"
                    />
                  ) : null}
                </Svg>
              </View>
              <View style={styles.goalNumbers}>
                <Text style={styles.goalMinutes} testID="today-goal-minutes">
                  {minutesToday}
                  <Text style={styles.goalMinutesUnit}> min</Text>
                </Text>
                <Text style={styles.tileMeta}>{minutesToGo > 0 ? `${minutesToGo} to go` : 'Goal met'}</Text>
              </View>
            </View>
            <View style={styles.goalChoices}>
              {([5, 10, 15] as const).map((minutes) => {
                const selected = goal === minutes;
                return (
                  <Pressable
                    key={minutes}
                    accessibilityLabel={`${minutes} minute daily goal`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setGoal(minutes)}
                    style={styles.goalChoice}
                    testID={`today-goal-choice-${minutes}`}
                  >
                    <View style={[styles.goalChoicePill, selected && styles.goalChoicePillActive]}>
                      <Text style={[styles.goalChoiceText, selected && styles.goalChoiceTextActive]} testID={`today-goal-label-${minutes}`}>{minutes}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            accessibilityLabel={reviewLabel}
            accessibilityRole="button"
            onPress={() => router.push('/phrases')}
            style={({ pressed }) => [styles.reviewTile, largeTextLayout && styles.tileLarge, pressed && styles.pressed]}
            testID="today-review-phrases"
          >
            <Text style={styles.reviewLabel}>Ready to review</Text>
            <Text style={styles.reviewCount} testID="today-review-count">{dueCount}</Text>
            <View style={styles.reviewFooter}>
              <Text style={styles.reviewMeta}>{dueCount === 1 ? 'phrase due' : 'phrases due'}</Text>
              <Text numberOfLines={largeTextLayout ? undefined : 1} style={styles.reviewPhrase}>{featuredPhraseText}</Text>
            </View>
          </Pressable>
        </View>

        <Pressable
          accessibilityLabel="Talk with Asha"
          accessibilityHint={ashaSubtitle}
          accessibilityRole="button"
          onPress={() => router.push('/live' as Href)}
          style={({ pressed }) => [styles.ashaBanner, pressed && styles.pressed]}
          testID="today-talk-with-asha"
        >
          <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.ashaPortrait} testID="today-asha-portrait" transition={0} />
          <View style={styles.ashaCopy}>
            <Text style={styles.ashaTitle}>Talk with Asha</Text>
            <Text style={styles.ashaSubtitle}>{ashaSubtitle}</Text>
          </View>
          <View style={styles.ashaIcon}>
            <AudioLines color={colors.ink} size={20} strokeWidth={2.2} />
          </View>
        </Pressable>

        <MotionReveal mode={motionMode} motionKey={currentPlan.id} style={styles.path} testID="today-current-plan">
          <View style={[styles.pathHeader, largeTextLayout && styles.pathHeaderLarge]}>
            <Text accessibilityRole="header" style={styles.pathTitle}>Your path</Text>
            <Pressable
              accessibilityLabel={pathSummary.accessibilityLabel}
              accessibilityRole="button"
              hitSlop={4}
              onPress={() => openPlan(currentPlan.id)}
              style={styles.pathLink}
              testID="today-plan-link"
            >
              <Text style={styles.pathLinkText}>{pathSummary.linkText}</Text>
            </Pressable>
          </View>
          <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.segments} testID="today-path-segments">
            {pathSummary.segments.map((segment, index) => (
              <View
                key={index}
                style={[styles.segment, segment === 'done' ? styles.segmentDone : segment === 'current' ? styles.segmentCurrent : styles.segmentTodo]}
                testID={`today-path-segment-${segment}`}
              />
            ))}
          </View>
          <Pressable
            accessibilityLabel={`Browse all ${lessonPlans.length} plans`}
            accessibilityRole="button"
            onPress={() => router.push('/lesson-plans' as Href)}
            style={styles.catalogLink}
            testID="today-plan-catalog"
          >
            <Text style={styles.catalogText}>Browse all {lessonPlans.length} plans</Text>
            <ArrowRight color={colors.brandText} size={16} strokeWidth={2.2} />
          </Pressable>
        </MotionReveal>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  list: { flexGrow: 1, width: '100%', alignItems: 'stretch', paddingHorizontal: 20, paddingTop: 18, paddingBottom: spacing.xxl },
  column: { flexGrow: 1, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', minWidth: 0, justifyContent: 'space-between', gap: 14 },
  columnLarge: { gap: spacing.lg },
  pressed: { opacity: 0.85 },

  topbar: { width: '100%', minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  topbarLarge: { minHeight: 0, flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm, paddingRight: 0 },
  greetingCopy: { minWidth: 0, flexShrink: 1, gap: 2 },
  dateLine: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  greeting: { color: c.ink, fontFamily: 'Georgia', fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.3 },
  greetingHindi: { color: c.brand, fontFamily: 'Georgia', fontSize: 22, fontWeight: '600', letterSpacing: 0 },
  topbarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start' },
  streakPill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: pillRadius, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, paddingLeft: 10, paddingRight: 12 },
  streakText: { color: c.ink, fontSize: 14, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  settingsButton: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', borderRadius: pillRadius, backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1 },

  heroMotion: { width: '100%' },
  hero: { width: '100%', minHeight: 52, position: 'relative', overflow: 'hidden', borderRadius: heroRadius, borderCurve: 'continuous', backgroundColor: c.brand, padding: 22, gap: 14 },
  heroLarge: { padding: spacing.lg, gap: spacing.md },
  heroGlyph: { position: 'absolute', right: -14, top: -38, color: 'rgba(255,255,255,0.10)', fontFamily: 'Georgia', fontSize: 168, lineHeight: 190, fontWeight: '700' },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  heroKicker: { borderRadius: pillRadius, backgroundColor: c.gold, paddingHorizontal: 9, paddingVertical: 4 },
  heroKickerText: { color: c.ink, fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9 },
  heroPlace: { flexShrink: 1, color: c.brandSoft, fontSize: 13, lineHeight: 18 },
  heroCopy: { gap: 4 },
  heroTitle: { color: c.white, fontFamily: 'Georgia', fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -0.3 },
  heroSubtitle: { color: c.white, fontSize: 15, lineHeight: 21 },
  wordChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wordChip: { borderRadius: 12, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 12, paddingVertical: 6 },
  wordChipText: { color: c.white, fontFamily: 'Georgia', fontSize: 15, lineHeight: 20 },
  heroActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.md, marginTop: 4 },
  heroButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: pillRadius, borderCurve: 'continuous', backgroundColor: c.gold, paddingHorizontal: 20, paddingVertical: spacing.sm },
  heroButtonText: { color: c.ink, fontSize: 16, lineHeight: 21, fontWeight: '700' },

  tileRow: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  tileRowLarge: { flexDirection: 'column' },
  tileLarge: { flex: 0, width: '100%' },
  tileLabel: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  tileMeta: { color: c.muted, fontSize: 12, lineHeight: 16 },
  goalCard: { minWidth: 0, flex: 1, borderRadius: cardRadius, borderCurve: 'continuous', backgroundColor: c.paperRaised, padding: 14, gap: 8 },
  goalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xs },
  goalValue: { color: c.muted, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  goalProgressRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  goalDial: { width: ringSize, height: ringSize },
  goalNumbers: { minWidth: 0, flexShrink: 1 },
  goalMinutes: { color: c.ink, fontFamily: 'Georgia', fontSize: 28, lineHeight: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  goalMinutesUnit: { color: c.muted, fontSize: 15, fontWeight: '600' },
  goalChoices: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: -2 },
  goalChoice: { minWidth: 44, minHeight: 48, flex: 1, alignItems: 'center', justifyContent: 'center' },
  goalChoicePill: { minWidth: 36, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: pillRadius, backgroundColor: c.background, borderColor: c.line, borderWidth: 1, paddingHorizontal: spacing.sm },
  goalChoicePillActive: { backgroundColor: c.ink, borderColor: c.ink },
  goalChoiceText: { color: c.muted, fontSize: 13, lineHeight: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  goalChoiceTextActive: { color: c.white },
  reviewTile: { minWidth: 0, flex: 1, justifyContent: 'space-between', borderRadius: cardRadius, borderCurve: 'continuous', backgroundColor: c.goldSoft, padding: 16, gap: 6 },
  reviewLabel: { color: c.brandText, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  reviewCount: { color: c.ink, fontFamily: 'Georgia', fontSize: 40, lineHeight: 44, fontWeight: '700', fontVariant: ['tabular-nums'] },
  reviewFooter: { gap: 2 },
  reviewMeta: { color: c.brandText, fontSize: 12, lineHeight: 16 },
  reviewPhrase: { color: c.ink, fontFamily: 'Georgia', fontSize: 14, lineHeight: 19, fontWeight: '700' },

  ashaBanner: { width: '100%', minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: cardRadius, borderCurve: 'continuous', backgroundColor: c.neutralSurface, paddingVertical: 14, paddingLeft: 14, paddingRight: 16 },
  ashaPortrait: { width: 52, height: 52, borderRadius: pillRadius, borderColor: c.gold, borderWidth: 2 },
  ashaCopy: { minWidth: 0, flex: 1, gap: 2 },
  ashaTitle: { color: c.neutralSurfaceText, fontSize: 16, lineHeight: 21, fontWeight: '600' },
  ashaSubtitle: { color: c.heroSubtle, fontSize: 13, lineHeight: 18 },
  ashaIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: pillRadius, backgroundColor: c.gold },

  path: { width: '100%', gap: 10 },
  pathHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: spacing.md },
  pathHeaderLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  pathTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 18, lineHeight: 24, fontWeight: '700' },
  pathLink: { minHeight: 44, flexShrink: 1, justifyContent: 'center' },
  pathLinkText: { color: c.brand, fontSize: 13, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  segments: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 6, borderRadius: pillRadius },
  segmentDone: { backgroundColor: c.brand },
  segmentCurrent: { backgroundColor: c.gold },
  segmentTodo: { backgroundColor: c.line },
  catalogLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6 },
  catalogText: { color: c.brandText, fontSize: 13, lineHeight: 18, fontWeight: '600' },
}));
