import { Redirect, useRouter, type Href } from 'expo-router';
import { BarChart3, BookOpen, ChevronRight, Mic, Settings } from 'lucide-react-native';
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
  const { dailySteps, duePhrases, goal, learnerProfile, phrases, practice, sceneProgress: savedSceneProgress, setGoal, streak } = state;
  const [filter, setFilter] = useState<Filter>('All');
  const profile = useMemo(() => learnerProfile ?? { ...defaultLearnerProfile(), completed: true }, [learnerProfile]);
  const sceneProgress = useMemo(() => savedSceneProgress ?? {}, [savedSceneProgress]);
  const recommendations = useMemo(() => recommendedScenes(profile, sceneProgress), [profile, sceneProgress]);
  const visibleScenes = useMemo(() => filter === 'All' ? scenes : scenes.filter((scene) => scene.category === filter), [filter]);
  const openScene = useCallback((scene: Scene) => router.push({ pathname: '/scene/[id]', params: { id: scene.id } }), [router]);
  const goalPercent = Math.min(100, Math.round(practice.seconds / (goal * 60) * 100));
  const resumed = recommendations.find((scene) => (sceneProgress[scene.id]?.lastBeatIndex ?? 0) > 0);
  const recommended = resumed ?? recommendations[0] ?? scenes[0];

  const primary = useMemo(() => duePhrases.length > 0
    ? { eyebrow: 'Ready to review', title: `Review ${duePhrases.length} phrase${duePhrases.length === 1 ? '' : 's'}`, body: 'A quick recall round keeps useful Hindi ready when you need it.', action: 'Start review', onPress: () => router.push('/review' as Href) }
    : dailySteps === 1
      ? practice.chaiDone
        ? { eyebrow: 'Finish today’s challenge', title: 'Take one turn with Mira', body: 'One calm spoken or typed response completes today’s challenge.', action: 'Practice with Mira', onPress: () => router.push('/live') }
        : { eyebrow: 'Finish today’s challenge', title: 'Handle the chai stop', body: 'Complete the guided chai scene to finish your second step.', action: 'Open scene', onPress: () => openScene(scenes[0]) }
      : goalPercent >= 100
        ? { eyebrow: 'Daily goal complete', title: 'Use your Hindi live', body: 'Your lesson goal is done. Try one free-form conversation with Mira.', action: 'Talk with Mira', onPress: () => router.push('/live') }
        : { eyebrow: resumed ? 'Continue your scene' : 'Your next step', title: recommended.title, body: recommended.subtitle, action: resumed ? 'Continue' : 'Start 3-minute scene', onPress: () => openScene(recommended) },
  [dailySteps, duePhrases.length, goalPercent, openScene, practice.chaiDone, recommended, resumed, router]);

  const header = useMemo(() => (
    <View style={styles.headerContent}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>ब</Text></View>
          <View style={styles.brandCopy}><Text style={styles.brandName}>Bolo</Text><Text style={styles.brandTagline}>Practical Hindi, one moment at a time</Text></View>
        </View>
        <Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.roundButton}><Settings color={colors.ink} size={20} /></Pressable>
      </View>

      <View style={styles.nextCard}>
        <Text style={styles.nextEyebrow}>{primary.eyebrow}</Text>
        <Text style={styles.nextTitle}>{primary.title}</Text>
        <Text style={styles.nextBody}>{primary.body}</Text>
        <View style={styles.todayRow}>
          <Text style={styles.todayLabel}>Today · {goalPercent}% of {goal} min</Text>
          <Text style={styles.streakLabel}>{streak} day streak</Text>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${goalPercent}%` }]} /></View>
        <Pressable accessibilityRole="button" onPress={primary.onPress} style={styles.nextButton}>
          <Text style={styles.nextButtonText}>{primary.action}</Text><ChevronRight color={colors.ink} size={19} />
        </Pressable>
      </View>

      <View style={styles.quickActions}>
        <Pressable accessibilityLabel="Progress" accessibilityRole="button" onPress={() => router.push('/progress' as Href)} style={styles.quickAction}>
          <BarChart3 color={colors.forest} size={21} />
          <Text style={styles.quickActionTitle}>Progress</Text>
          <Text style={styles.quickActionMeta}>{Math.floor(practice.seconds / 60)} min today</Text>
        </Pressable>
        <Pressable accessibilityLabel="Saved phrases" accessibilityRole="button" onPress={() => router.push('/phrases')} style={styles.quickAction}>
          <BookOpen color={colors.forest} size={21} />
          <Text style={styles.quickActionTitle}>Phrases</Text>
          <Text style={styles.quickActionMeta}>{phrases.length} saved</Text>
        </Pressable>
        <Pressable accessibilityLabel="Practice live with Mira" accessibilityRole="button" onPress={() => router.push('/live')} style={[styles.quickAction, styles.quickActionPrimary]}>
          <Mic color={colors.white} size={21} />
          <Text style={[styles.quickActionTitle, styles.quickActionTitlePrimary]}>Mira</Text>
          <Text style={[styles.quickActionMeta, styles.quickActionMetaPrimary]}>Talk live</Text>
        </Pressable>
      </View>

      <View style={styles.goalRow}>
        <View style={styles.goalCopy}>
          <Text style={styles.goalTitle}>Daily goal</Text>
          <View style={styles.challengeChecks}>
            <Text style={styles.challengeCheck}>{practice.chaiDone ? '✓' : '○'} Chai scene</Text>
            <Text style={styles.challengeCheck}>{practice.liveDone ? '✓' : '○'} Mira turn</Text>
          </View>
        </View>
        <View style={styles.goalChoices}>
          {([5, 10, 15] as const).map((minutes) => (
            <Pressable key={minutes} accessibilityLabel={`${minutes} minute daily goal`} accessibilityRole="button" accessibilityState={{ selected: goal === minutes }} onPress={() => setGoal(minutes)} style={[styles.goalChoice, goal === minutes && styles.goalChoiceActive]}>
              <Text style={[styles.goalChoiceText, goal === minutes && styles.goalChoiceTextActive]}>{minutes}m</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <View><Text style={sharedStyles.eyebrow}>Guided practice</Text><Text style={styles.sectionTitle}>Choose a moment</Text></View>
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
  ), [filter, goal, goalPercent, phrases.length, practice.chaiDone, practice.liveDone, practice.seconds, primary, router, setGoal, streak]);

  if (learnerProfile?.completed === false) return <Redirect href={'/onboarding' as Href} />;

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.list, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xxl }]}
      data={visibleScenes}
      keyExtractor={(scene) => scene.id}
      renderItem={({ item }) => <SceneCard progress={sceneProgress[item.id]} scene={item} onPress={openScene} />}
      ListHeaderComponent={header}
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
  roundButton: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.paperRaised, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  nextCard: { backgroundColor: colors.brand, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.xl, gap: spacing.md, overflow: 'hidden' },
  nextEyebrow: { color: '#FFF0E8', fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  nextTitle: { color: colors.white, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  nextBody: { color: '#FFF2EA', fontSize: 16, lineHeight: 23 },
  todayRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.xs },
  todayLabel: { color: colors.white, fontSize: 13, fontWeight: '800' },
  streakLabel: { color: '#FFF0E8', fontSize: 13, fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.25)' },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.white },
  nextButton: { minHeight: 50, alignSelf: 'stretch', backgroundColor: colors.white, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
  nextButtonText: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  quickActions: { flexDirection: 'row', gap: spacing.sm },
  quickAction: { minWidth: 0, minHeight: 92, flex: 1, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, backgroundColor: colors.paperRaised, padding: spacing.md, justifyContent: 'center', gap: 3 },
  quickActionPrimary: { backgroundColor: colors.ink, borderColor: colors.ink },
  quickActionTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', marginTop: spacing.xs },
  quickActionTitlePrimary: { color: colors.white },
  quickActionMeta: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  quickActionMetaPrimary: { color: '#BFC9C6' },
  goalRow: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm },
  goalCopy: { minWidth: 150, flex: 1, gap: spacing.xs },
  goalTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  goalChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  goalChoice: { minWidth: 48, minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.paperRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  goalChoiceActive: { backgroundColor: colors.ink },
  goalChoiceText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  goalChoiceTextActive: { color: colors.white },
  challengeChecks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  challengeCheck: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '900', marginTop: spacing.xs },
  filters: { gap: spacing.sm, paddingBottom: spacing.xs },
  filter: { minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.paperRaised, borderColor: colors.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  filterActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  filterTextActive: { color: colors.white },
});
