import { Redirect, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { Button } from 'heroui-native/button';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { Bookmark, Ear, Mic, Sprout } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';

import { SceneCard } from '@/components/scene-card';
import { JournalDisplay, JournalKicker, JournalMotif } from '@/components/journal-chrome';
import { sceneCategories, scenes, type Scene, type SceneCategory } from '@/data/scenes';
import { recommendedScenes } from '@/lib/learning';
import { defaultLearnerProfile } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import { makeStyles, maxContentWidth, radius, spacing, useSharedStyles } from '@/theme';

type Filter = 'All' | SceneCategory;

const ashaPortrait = require('../../../assets/images/asha-portrait.png');

export default function HomeScreen() {
  const router = useRouter();
  const state = useAppState();
  const sharedStyles = useSharedStyles();
  const styles = useStyles();
  const { dailySteps, duePhrases, goal, learnerProfile, phraseReviews, phrases, practice, sceneProgress: savedSceneProgress, setGoal, streak } = state;
  const [filter, setFilter] = useState<Filter>('All');
  const profile = useMemo(() => learnerProfile ?? { ...defaultLearnerProfile(), completed: true }, [learnerProfile]);
  const sceneProgress = useMemo(() => savedSceneProgress ?? {}, [savedSceneProgress]);
  const recommendations = useMemo(() => recommendedScenes(profile, sceneProgress), [profile, sceneProgress]);
  const visibleScenes = useMemo(() => filter === 'All' ? scenes : scenes.filter((scene) => scene.category === filter), [filter]);
  const openScene = useCallback((scene: Scene) => router.push({ pathname: '/scene/[id]', params: { id: scene.id } }), [router]);
  const goalPercent = Math.min(100, Math.round(practice.seconds / (goal * 60) * 100));
  const resumed = recommendations.find((scene) => (sceneProgress[scene.id]?.lastBeatIndex ?? 0) > 0);
  const recommended = resumed ?? recommendations[0] ?? scenes[0];
  const minutesToday = Math.floor(practice.seconds / 60);
  const featuredPhrase = duePhrases[0] ?? phrases[0] ?? null;
  const featuredMastery = featuredPhrase ? (phraseReviews ?? {})[featuredPhrase.hi]?.mastery ?? 0 : 0;

  const primary = useMemo(() => duePhrases.length > 0
    ? { eyebrow: 'Ready to review', title: `Review ${duePhrases.length} phrase${duePhrases.length === 1 ? '' : 's'}`, body: 'A quick recall round keeps useful Hindi ready when you need it.', action: 'Start review', onPress: () => router.push('/review' as Href) }
    : dailySteps === 1
      ? practice.chaiDone
        ? { eyebrow: 'Finish today’s path', title: 'Take one turn with Asha', body: 'A calm spoken or typed response completes today’s practice.', action: 'Practice with Asha', onPress: () => router.push('/live') }
        : { eyebrow: 'Finish today’s path', title: 'Handle the chai stop', body: 'Complete the guided chai scene to finish your second step.', action: 'Open scene', onPress: () => openScene(scenes[0]) }
      : goalPercent >= 100
        ? { eyebrow: 'Daily goal complete', title: 'Use your Hindi live', body: 'Your lesson goal is done. Try one free-form conversation with Asha.', action: 'Talk with Asha', onPress: () => router.push('/live') }
        : { eyebrow: resumed ? 'Continue your scene' : 'Your next step', title: recommended.title, body: recommended.subtitle, action: resumed ? 'Continue' : 'Start 3-minute scene', onPress: () => openScene(recommended) },
  [dailySteps, duePhrases.length, goalPercent, openScene, practice.chaiDone, recommended, resumed, router]);

  const goalFooter = useMemo(() => (
    <View style={styles.goalFooter}>
      <Text style={styles.goalFooterTitle}>Daily practice target</Text>
      <View style={styles.challengeChecks}>
        <Text style={styles.challengeCheck}>{practice.chaiDone ? '✓' : '○'} Chai scene</Text>
        <Text style={styles.challengeCheck}>{practice.liveDone ? '✓' : '○'} Asha turn</Text>
      </View>
      <View accessibilityLabel="Daily practice target" style={styles.goalChoices}>
        {([5, 10, 15] as const).map((minutes) => (
          <Pressable key={minutes} accessibilityLabel={`${minutes} minute daily goal`} accessibilityRole="button" accessibilityState={{ selected: goal === minutes }} onPress={() => setGoal(minutes)} style={[styles.goalChoice, goal === minutes && styles.goalChoiceActive]}>
            <Text style={[styles.goalChoiceText, goal === minutes && styles.goalChoiceTextActive]}>{minutes}m</Text>
          </Pressable>
        ))}
      </View>
    </View>
  ), [goal, practice.chaiDone, practice.liveDone, setGoal, styles]);

  const header = useMemo(() => (
    <View style={styles.headerContent}>
      <View style={styles.topbar} testID="today-topbar">
        <JournalMotif accessibilityLabel="Bolo journal motif" size="panel" style={styles.headerMotif} />
        <View style={styles.intro}>
          <View style={styles.brandCopy}>
            <JournalKicker>A quiet practice</JournalKicker>
            <JournalDisplay style={styles.greeting}>Make Hindi yours.</JournalDisplay>
            <Text style={styles.brandTagline}>One useful moment at a time.</Text>
          </View>
          <Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.settingsButton}>
            <Text style={styles.settingsDots}>•••</Text>
            <Text style={styles.settingsLabel}>Settings</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.practiceArc}>
        <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.practicePortrait} transition={0} />
        <View style={styles.practiceArcCopy}>
          <View style={styles.practiceArcHeading}>
            <View style={styles.practiceArcTitleCopy}>
              <JournalKicker>Today · a small practice</JournalKicker>
              <JournalDisplay style={styles.practiceArcTitle}>Let one phrase take root.</JournalDisplay>
            </View>
            <Pressable accessibilityLabel="View progress" accessibilityRole="button" onPress={() => router.push('/progress' as Href)} style={styles.streakChip}>
              <Sprout color={styles.streakChipIcon.color} size={15} />
              <Text style={styles.streakChipText}>{streak} day streak</Text>
            </Pressable>
          </View>
          <Text style={styles.nextBody}>{primary.body}</Text>
          <View accessibilityLabel="Today’s gentle practice arc" style={styles.arcSteps}>
            <View style={styles.arcStep}>
              <View style={styles.arcIcon}><Ear color={styles.arcIconText.color} size={19} /></View>
              <Text style={styles.arcStepLabel}>Listen</Text>
            </View>
            <View style={styles.arcConnector} />
            <View style={styles.arcStep}>
              <View style={[styles.arcIcon, styles.arcIconActive]}><Mic color={styles.arcIconTextActive.color} size={19} /></View>
              <Text style={[styles.arcStepLabel, styles.arcStepLabelActive]}>Speak</Text>
            </View>
            <View style={styles.arcConnector} />
            <View style={styles.arcStep}>
              <View style={styles.arcIcon}><Bookmark color={styles.arcIconText.color} size={19} /></View>
              <Text style={styles.arcStepLabel}>Save</Text>
            </View>
          </View>
          <Button accessibilityLabel={primary.action} accessibilityRole="button" onPress={primary.onPress} size="md" style={styles.nextButton} variant="secondary">
            <Button.Label style={styles.nextButtonText}>{primary.action}</Button.Label>
          </Button>
          <View style={styles.goalSummary}>
            <Text style={styles.todayLabel}>Today · {goalPercent}% of {goal} min</Text>
            <Text style={styles.todayLabel}>{minutesToday} min practiced</Text>
          </View>
          <View accessibilityLabel={`${goalPercent} percent of daily goal complete`} style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${goalPercent}%` }]} />
          </View>
        </View>
      </View>

      <PressableFeedback accessibilityLabel="Browse 10 ordered lesson plans with 100 lessons" accessibilityRole="button" onPress={() => router.push('/lesson-plans' as Href)} style={styles.lessonPlansLink}>
        <View>
          <Text style={styles.lessonPlansEyebrow}>Guided curriculum</Text>
          <Text style={styles.lessonPlansTitle}>10 ordered plans · 100 new lessons</Text>
        </View>
        <Text style={styles.lessonPlansArrow}>→</Text>
      </PressableFeedback>
      {featuredPhrase ? (
        <PressableFeedback accessibilityLabel={`Practice saved phrase ${featuredPhrase.hi}`} accessibilityRole="button" onPress={() => router.push('/phrases')} style={styles.gardenCue}>
          <View style={styles.gardenCueIcon}><Sprout color={styles.gardenCueIconText.color} size={21} /></View>
          <View style={styles.gardenCueCopy}>
            <Text style={styles.gardenCueEyebrow}>Language garden</Text>
            <Text style={styles.gardenCueHindi}>{featuredPhrase.hi}</Text>
            <Text style={styles.gardenCueLatin}>{featuredPhrase.latin}</Text>
            <Text style={styles.gardenCueBody}>{featuredMastery ? `${featuredMastery}/5 roots strong` : duePhrases.length ? 'Ready to water today' : 'A phrase worth keeping close'}</Text>
          </View>
          <Text style={styles.gardenCueArrow}>→</Text>
        </PressableFeedback>
      ) : null}

      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionEyebrow}>Guided practice</Text>
          <Text style={styles.sectionTitle}>Choose a moment</Text>
        </View>
        <Text style={styles.catalogMeta}>{visibleScenes.length} scenes</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {sceneCategories.map((category) => {
          const count = category === 'All' ? scenes.length : scenes.filter((scene) => scene.category === category).length;
          const active = filter === category;
          return (
            <Pressable key={category} accessibilityLabel={`${category} scenes, ${count}`} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setFilter(category)} style={[styles.filter, active && styles.filterActive]}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{category} · {count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  ), [duePhrases.length, featuredMastery, featuredPhrase, filter, goal, goalPercent, minutesToday, primary, router, streak, styles, visibleScenes.length]);

  if (learnerProfile?.completed === false) return <Redirect href={'/onboarding' as Href} />;

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.list}
      data={visibleScenes}
      keyExtractor={(scene) => scene.id}
      renderItem={({ item }) => (
        <View style={styles.sceneCell}>
          <SceneCard progress={sceneProgress[item.id]} scene={item} onPress={openScene} />
        </View>
      )}
      ListHeaderComponent={header}
      ListFooterComponent={goalFooter}
      ListFooterComponentStyle={styles.listFooter}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      style={sharedStyles.screen}
      testID="today-scene-list"
    />
  );
}

const useStyles = makeStyles((c) => ({
  list: { width: '100%', alignItems: 'stretch', paddingHorizontal: spacing.lg, paddingTop: 18, paddingBottom: spacing.xxl },
  separator: { height: spacing.md },
  headerContent: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', minWidth: 0, alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg },
  sceneCell: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  topbar: { width: '100%', minHeight: 214, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  intro: { minWidth: 0, flex: 1, maxWidth: 200, paddingTop: spacing.lg, gap: spacing.lg },
  brandCopy: { minWidth: 0, flexShrink: 1 },
  greeting: { marginTop: spacing.xs, maxWidth: 200, fontSize: 27, lineHeight: 33 },
  brandTagline: { color: c.muted, fontSize: 14, lineHeight: 20, marginTop: spacing.sm, textAlign: 'left' },
  headerMotif: { position: 'absolute', right: 0, top: -2, width: 158, height: 196 },
  settingsButton: { alignSelf: 'flex-start', minHeight: 48, minWidth: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, paddingHorizontal: spacing.md, boxShadow: '0 4px 12px rgba(33, 37, 33, 0.08)' },
  settingsDots: { color: c.brandText, fontSize: 15, fontWeight: '900', letterSpacing: 1.2 },
  settingsLabel: { color: c.muted, fontSize: 13, fontWeight: '800' },
  practiceArc: { width: '100%', alignItems: 'stretch', overflow: 'hidden', borderRadius: 26, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, boxShadow: '0 10px 22px rgba(35, 39, 35, 0.08)' },
  practicePortrait: { width: '100%', height: 142 },
  practiceArcCopy: { width: '100%', alignItems: 'stretch', gap: spacing.md, padding: spacing.lg },
  practiceArcHeading: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  practiceArcTitleCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  practiceArcTitle: { maxWidth: 270, fontSize: 28, lineHeight: 34, textAlign: 'left' },
  nextBody: { color: c.muted, fontSize: 14, lineHeight: 20, textAlign: 'left' },
  goalSummary: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.xs },
  todayLabel: { color: c.muted, fontSize: 12, fontWeight: '800', textAlign: 'left' },
  streakChip: { minHeight: 32, borderRadius: radius.pill, backgroundColor: c.forestSoft, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  streakChipIcon: { color: c.forestText },
  streakChipText: { color: c.forestText, fontSize: 12, fontWeight: '900' },
  progressTrack: { width: '100%', height: 7, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.backgroundWarm },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: c.forest },
  arcSteps: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  arcStep: { minWidth: 0, flex: 1, alignItems: 'center', gap: 5 },
  arcIcon: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: c.backgroundWarm, alignItems: 'center', justifyContent: 'center' },
  arcIconActive: { backgroundColor: c.neutralSurface, borderColor: c.gold, borderWidth: 2 },
  arcIconText: { color: c.forestText },
  arcIconTextActive: { color: c.white },
  arcStepLabel: { color: c.muted, fontSize: 11, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
  arcStepLabelActive: { color: c.ink },
  arcConnector: { height: 1, flex: 0.42, backgroundColor: c.gold },
  nextButton: { minHeight: 52, alignSelf: 'stretch', backgroundColor: c.neutralSurface, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
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
  sectionEyebrow: { color: c.brandText, fontSize: 12, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase', textAlign: 'left' },
  todayTitle: { color: c.ink, fontSize: 17, lineHeight: 21, fontWeight: '900', marginTop: 2, textAlign: 'left' },
  progressLink: { minHeight: 32, borderRadius: radius.pill, backgroundColor: c.forestSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  progressLinkText: { color: c.forestText, fontSize: 12, fontWeight: '900' },
  pathActions: { width: '100%', flexDirection: 'row', gap: spacing.sm },
  pathAction: { minWidth: 0, minHeight: 78, flex: 1, borderRadius: 16, borderCurve: 'continuous', alignItems: 'flex-start', justifyContent: 'center', gap: 3, padding: spacing.sm },
  pathActionForest: { backgroundColor: c.forestSoft },
  pathActionBrand: { backgroundColor: c.brandSoft },
  pathTitle: { color: c.ink, fontSize: 15, fontWeight: '900', textAlign: 'left' },
  pathMeta: { color: c.muted, fontSize: 12, lineHeight: 16, textAlign: 'left' },
  pathArrow: { color: c.ink, fontSize: 16, lineHeight: 18, fontWeight: '900', marginTop: 1, textAlign: 'left' },
  lessonPlansLink: { width: '100%', minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous', borderColor: c.gold, borderWidth: 1, backgroundColor: c.goldSoft, paddingHorizontal: spacing.md },
  lessonPlansEyebrow: { color: c.brandText, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  lessonPlansTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 18, lineHeight: 23, fontWeight: '700', marginTop: 2 },
  lessonPlansArrow: { color: c.forestText, fontSize: 24, fontWeight: '900' },
  listFooter: { marginTop: spacing.xl },
  goalFooter: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'center', borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  goalFooterTitle: { color: c.ink, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  challengeChecks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  challengeCheck: { color: c.muted, fontSize: 11, fontWeight: '800' },
  goalChoices: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs },
  goalChoice: { minWidth: 48, minHeight: 48, borderRadius: radius.pill, backgroundColor: c.paperRaised, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  goalChoiceActive: { backgroundColor: c.neutralSurface, borderColor: c.neutralSurface },
  goalChoiceText: { color: c.muted, fontSize: 11, fontWeight: '800' },
  goalChoiceTextActive: { color: c.neutralSurfaceText },
  sectionHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  sectionTitle: { color: c.ink, fontSize: 24, lineHeight: 30, fontWeight: '900', marginTop: spacing.xs, textAlign: 'left' },
  catalogMeta: { color: c.muted, fontSize: 13, fontWeight: '700', marginBottom: 3, textAlign: 'center' },
  filters: { gap: spacing.sm, justifyContent: 'center', paddingBottom: spacing.xs },
  filter: { minHeight: 48, borderRadius: radius.pill, backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  filterActive: { backgroundColor: c.neutralSurface, borderColor: c.neutralSurface },
  filterText: { color: c.muted, fontSize: 13, fontWeight: '800' },
  filterTextActive: { color: c.neutralSurfaceText },
}));
