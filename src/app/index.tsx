import { Redirect, useRouter, type Href } from 'expo-router';
import { BarChart3, BookOpen, ChevronRight, Flame, Mic, Settings, Sparkles, Target } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SceneCard } from '@/components/scene-card';
import { sceneCategories, scenes, type Scene, type SceneCategory } from '@/data/scenes';
import { recommendedScenes } from '@/lib/learning';
import { defaultLearnerProfile } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import { colors, radius, sharedStyles, spacing } from '@/theme';

type Filter = 'All' | SceneCategory;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const state = useAppState();
  const [filter, setFilter] = useState<Filter>('All');
  const profile = useMemo(() => state.learnerProfile ?? { ...defaultLearnerProfile(), completed: true }, [state.learnerProfile]);
  const sceneProgress = useMemo(() => state.sceneProgress ?? {}, [state.sceneProgress]);
  const duePhrases = state.duePhrases ?? [];
  const recommendations = useMemo(() => recommendedScenes(profile, sceneProgress), [profile, sceneProgress]);
  const visibleScenes = useMemo(() => filter === 'All' ? scenes : scenes.filter((scene) => scene.category === filter), [filter]);
  const openScene = useCallback((scene: Scene) => router.push({ pathname: '/scene/[id]', params: { id: scene.id } }), [router]);
  const goalPercent = Math.min(100, Math.round(state.practice.seconds / (state.goal * 60) * 100));
  const resumed = recommendations.find((scene) => (sceneProgress[scene.id]?.lastBeatIndex ?? 0) > 0);
  const recommended = resumed ?? recommendations[0] ?? scenes[0];

  if (state.learnerProfile?.completed === false) return <Redirect href={'/onboarding' as Href} />;

  const primary = duePhrases.length > 0
    ? { eyebrow: 'Ready to review', title: `Review ${duePhrases.length} phrase${duePhrases.length === 1 ? '' : 's'}`, body: 'A quick recall round keeps useful Hindi ready when you need it.', action: 'Start review', onPress: () => router.push('/review' as Href) }
    : state.dailySteps === 1
      ? state.practice.chaiDone
        ? { eyebrow: 'Finish today’s challenge', title: 'Take one turn with Mira', body: 'One calm spoken or typed response completes today’s challenge.', action: 'Practice with Mira', onPress: () => router.push('/live') }
        : { eyebrow: 'Finish today’s challenge', title: 'Handle the chai stop', body: 'Complete the guided chai scene to finish your second step.', action: 'Open scene', onPress: () => openScene(scenes[0]) }
      : goalPercent >= 100
        ? { eyebrow: 'Daily goal complete', title: 'Use your Hindi live', body: 'Your lesson goal is done. Try one free-form conversation with Mira.', action: 'Talk with Mira', onPress: () => router.push('/live') }
        : { eyebrow: resumed ? 'Continue your scene' : 'Your next step', title: recommended.title, body: recommended.subtitle, action: resumed ? 'Continue' : 'Start 3-minute scene', onPress: () => openScene(recommended) };

  const Header = (
    <View style={styles.headerContent}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>ब</Text></View>
          <View style={styles.brandCopy}><Text style={styles.brandName}>Bolo</Text><Text style={styles.brandTagline}>Hindi, in the moment</Text></View>
        </View>
        <View style={styles.topActions}>
          <Pressable accessibilityLabel="Progress" accessibilityRole="button" onPress={() => router.push('/progress' as Href)} style={styles.roundButton}><BarChart3 color={colors.ink} size={18} /></Pressable>
          <Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.roundButton}><Settings color={colors.ink} size={18} /></Pressable>
          <Pressable accessibilityLabel="Saved phrases" accessibilityRole="button" onPress={() => router.push('/phrases')} style={styles.phraseButton}>
            <BookOpen color={colors.ink} size={18} /><Text style={styles.phraseButtonText}>{state.phrases.length}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.nextCard}>
        <View style={styles.nextTop}><Text style={styles.nextEyebrow}>{primary.eyebrow}</Text><Target color={colors.goldSoft} size={22} /></View>
        <Text style={styles.nextTitle}>{primary.title}</Text>
        <Text style={styles.nextBody}>{primary.body}</Text>
        <Pressable accessibilityRole="button" onPress={primary.onPress} style={styles.nextButton}>
          <Text style={styles.nextButtonText}>{primary.action}</Text><ChevronRight color={colors.ink} size={19} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/progress' as Href)} style={styles.stat}><Text style={styles.statValue}>{state.streak}</Text><Text style={styles.statLabel}>day streak</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/progress' as Href)} style={styles.stat}><Text style={styles.statValue}>{Math.floor(state.practice.seconds / 60)}</Text><Text style={styles.statLabel}>min today</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/progress' as Href)} style={styles.stat}><Text style={styles.statValue}>{Object.values(sceneProgress).filter((item) => item.completions > 0).length}</Text><Text style={styles.statLabel}>scenes learned</Text></Pressable>
      </View>

      <View style={styles.challenge}>
        <View style={styles.challengeTop}>
          <View style={styles.challengeTitle}><Target color={colors.brandDark} size={16} /><Text style={styles.challengeTitleText}>Today · {goalPercent}% of {state.goal} min</Text></View>
          <View style={styles.goalChoices}>
            {([5, 10, 15] as const).map((minutes) => (
              <Pressable key={minutes} accessibilityLabel={`${minutes} minute daily goal`} accessibilityRole="button" accessibilityState={{ selected: state.goal === minutes }} onPress={() => state.setGoal(minutes)} style={[styles.goalChoice, state.goal === minutes && styles.goalChoiceActive]}>
                <Text style={[styles.goalChoiceText, state.goal === minutes && styles.goalChoiceTextActive]}>{minutes}m</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${goalPercent}%` }]} /></View>
        <View style={styles.challengeChecks}>
          <Text style={styles.challengeCheck}>{state.practice.chaiDone ? '✓' : '○'} Chai scene</Text>
          <Text style={styles.challengeCheck}>{state.practice.liveDone ? '✓' : '○'} Mira turn</Text>
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <View><Text style={sharedStyles.eyebrow}>Recommended for you</Text><Text style={styles.sectionTitle}>Your practice path</Text></View>
        <Flame color={colors.gold} fill={colors.gold} size={23} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendations}>
        {recommendations.map((scene) => {
          const progress = sceneProgress[scene.id];
          return (
            <Pressable key={scene.id} accessibilityRole="button" onPress={() => openScene(scene)} style={styles.recommendation}>
              <Text style={styles.recommendationEmoji}>{scene.emoji}</Text>
              <Text style={styles.recommendationTitle}>{scene.title}</Text>
              <Text style={styles.recommendationMeta}>{progress?.lastBeatIndex ? `Continue at turn ${progress.lastBeatIndex + 1}` : `${scene.level} · ${scene.category}`}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable accessibilityRole="button" onPress={() => router.push('/live')} style={styles.liveButton}>
        <View style={styles.liveIcon}><Mic color={colors.white} size={21} /></View>
        <View style={styles.liveCopy}><View style={styles.liveTitleRow}><Text style={styles.liveTitle}>Practice live with Mira</Text><Sparkles color={colors.gold} size={15} /></View><Text style={styles.liveSubtitle}>Free-form voice and coaching</Text></View>
        <ChevronRight color={colors.white} size={20} />
      </Pressable>

      <View style={styles.sectionHeading}>
        <View><Text style={sharedStyles.eyebrow}>All guided scenes</Text><Text style={styles.sectionTitle}>Where are you headed?</Text></View>
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
  );

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.list, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxl }]}
      data={visibleScenes}
      keyExtractor={(scene) => scene.id}
      renderItem={({ item }) => <SceneCard progress={sceneProgress[item.id]} scene={item} onPress={openScene} />}
      ListHeaderComponent={Header}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      style={sharedStyles.screen}
    />
  );
}

const styles = StyleSheet.create({
  list: { width: '100%', paddingHorizontal: spacing.lg },
  separator: { height: spacing.md },
  headerContent: { width: '100%', minWidth: 0, gap: spacing.lg, marginBottom: spacing.lg },
  topbar: { width: '100%', minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  brand: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandCopy: { minWidth: 0, flexShrink: 1 },
  brandMark: { width: 42, height: 42, borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.white, fontSize: 25, fontWeight: '900' },
  brandName: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  brandTagline: { color: colors.muted, fontSize: 12 },
  topActions: { flexShrink: 0, flexDirection: 'row', gap: spacing.xs },
  roundButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.paperRaised, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  phraseButton: { minHeight: 44, minWidth: 54, borderRadius: radius.pill, backgroundColor: colors.paperRaised, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  phraseButtonText: { color: colors.ink, fontWeight: '800' },
  nextCard: { backgroundColor: colors.brand, borderRadius: 28, borderCurve: 'continuous', padding: spacing.xl, gap: spacing.md, overflow: 'hidden' },
  nextTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  nextEyebrow: { color: '#FFF0E8', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  nextTitle: { color: colors.white, fontSize: 30, lineHeight: 36, fontWeight: '900' },
  nextBody: { color: '#FFF2EA', fontSize: 16, lineHeight: 23 },
  nextButton: { minHeight: 50, alignSelf: 'stretch', backgroundColor: colors.white, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  nextButtonText: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { minWidth: 96, flexGrow: 1, flexBasis: 96, backgroundColor: colors.paperRaised, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: spacing.md, alignItems: 'center', gap: 2 },
  statValue: { color: colors.ink, fontSize: 24, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  challenge: { ...sharedStyles.card, gap: spacing.md },
  challengeTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  challengeTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  challengeTitleText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  goalChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  goalChoice: { minWidth: 44, minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.backgroundWarm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  goalChoiceActive: { backgroundColor: colors.ink },
  goalChoiceText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  goalChoiceTextActive: { color: colors.white },
  progressTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.line },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.forest },
  challengeChecks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  challengeCheck: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '900', marginTop: spacing.xs },
  recommendations: { gap: spacing.sm },
  recommendation: { width: 180, minHeight: 120, backgroundColor: colors.paperRaised, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: spacing.md, gap: spacing.xs },
  recommendationEmoji: { fontSize: 28 },
  recommendationTitle: { color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  recommendationMeta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  liveButton: { minHeight: 76, backgroundColor: colors.ink, borderRadius: radius.lg, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  liveIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  liveCopy: { minWidth: 0, flex: 1, gap: 3 },
  liveTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  liveTitle: { color: colors.white, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  liveSubtitle: { color: '#BFC9C6', fontSize: 12, lineHeight: 17 },
  filters: { gap: spacing.sm, paddingBottom: spacing.xs },
  filter: { minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.paperRaised, borderColor: colors.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  filterActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  filterTextActive: { color: colors.white },
});
