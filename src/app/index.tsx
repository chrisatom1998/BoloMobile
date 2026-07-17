import { useRouter } from 'expo-router';
import { BookOpen, Check, ChevronRight, Flame, Mic, Settings, Sparkles, Target } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SceneCard } from '@/components/scene-card';
import { sceneCategories, scenes, type Scene, type SceneCategory } from '@/data/scenes';
import { useAppState } from '@/state/app-state';
import { colors, radius, sharedStyles, spacing } from '@/theme';

type Filter = 'All' | SceneCategory;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dailySteps, goal, hydrated, phrases, practice, setGoal, streak } = useAppState();
  const [filter, setFilter] = useState<Filter>('All');
  const visibleScenes = useMemo(() => filter === 'All' ? scenes : scenes.filter((scene) => scene.category === filter), [filter]);
  const openScene = useCallback((scene: Scene) => router.push({ pathname: '/scene/[id]', params: { id: scene.id } }), [router]);
  const goalPercent = Math.min(100, Math.round(practice.seconds / (goal * 60) * 100));

  if (!hydrated) {
    return <View style={styles.loading}><Text style={styles.loadingMark}>ब</Text><ActivityIndicator color={colors.brand} /></View>;
  }

  const Header = (
    <View style={styles.headerContent}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>ब</Text></View>
          <View><Text style={styles.brandName}>Bolo</Text><Text style={styles.brandTagline}>Hindi, in the moment</Text></View>
        </View>
        <View style={styles.topActions}>
          <Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.roundButton}><Settings color={colors.ink} size={18} /></Pressable>
          <Pressable accessibilityLabel="Saved phrases" accessibilityRole="button" onPress={() => router.push('/phrases')} style={styles.phraseButton}>
            <BookOpen color={colors.ink} size={18} />
            <Text style={styles.phraseButtonText}>{phrases.length}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTopline}>
          <Text style={[sharedStyles.eyebrow, styles.heroEyebrow]}>Immersive Hindi practice</Text>
          <View style={styles.heroBadge}><Sparkles color={colors.goldSoft} size={14} /><Text style={styles.heroBadgeText}>Live AI</Text></View>
        </View>
        <View style={styles.heroTitleRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Learn Hindi by{`\n`}living the moment.</Text>
            <Text style={styles.heroBody}>Step into real-life scenes, hear Mira reply, and build the instinct to answer calmly.</Text>
          </View>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.heroGlyph}>ब</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/live')} style={styles.liveButton}>
          <View style={styles.liveIcon}><Mic color={colors.white} size={20} /></View>
          <View style={styles.liveCopy}>
            <Text style={styles.liveTitle}>Practice live with Mira</Text>
            <Text style={styles.liveSubtitle}>English-first voice coaching · Hindi when asked</Text>
          </View>
          <View style={styles.livePill}><Text style={styles.livePillText}>Start</Text></View>
          <ChevronRight color={colors.white} size={20} />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}><Text style={styles.statValue}>{scenes.length}</Text><Text style={styles.statLabel}>guided scenes</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{streak}</Text><Text style={styles.statLabel}>day streak</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{Math.floor(practice.seconds / 60)}</Text><Text style={styles.statLabel}>min today</Text></View>
      </View>

      <View style={styles.quest}>
        <View style={styles.questTop}>
          <View style={styles.questLabel}><Target color={colors.brandDark} size={16} /><Text style={styles.questEyebrow}>Today’s challenge</Text></View>
          <View style={styles.goalChoices}>
            {([5, 10, 15] as const).map((minutes) => (
              <Pressable
                key={minutes}
                accessibilityLabel={`${minutes} minute daily goal`}
                accessibilityRole="button"
                accessibilityState={{ selected: goal === minutes }}
                onPress={() => setGoal(minutes)}
                style={[styles.goalChoice, goal === minutes && styles.goalChoiceActive]}
              >
                <Text style={[styles.goalChoiceText, goal === minutes && styles.goalChoiceTextActive]}>{minutes}m</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text style={styles.questTitle}>Handle the chai stop</Text>
        <Text style={styles.questBody}>Complete the chai scene, then say or type one phrase with Mira.</Text>
        <View style={styles.questChecks}>
          <View style={practice.chaiDone ? styles.checkDone : styles.check}><Check size={14} color={practice.chaiDone ? colors.white : colors.muted} /><Text style={practice.chaiDone ? styles.checkTextDone : styles.checkText}>Chai scene</Text></View>
          <View style={practice.liveDone ? styles.checkDone : styles.check}><Check size={14} color={practice.liveDone ? colors.white : colors.muted} /><Text style={practice.liveDone ? styles.checkTextDone : styles.checkText}>Mira turn</Text></View>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${goalPercent}%` }]} /></View>
        <View style={styles.progressMeta}><Text style={styles.progressText}>{dailySteps} / 2 challenge steps</Text><Text style={styles.progressText}>{goalPercent}% of daily goal</Text></View>
      </View>

      <View style={styles.sectionHeading}>
        <View><Text style={sharedStyles.eyebrow}>Choose your scene</Text><Text style={styles.sectionTitle}>Where are you headed?</Text></View>
        <Flame color={colors.gold} fill={colors.gold} size={24} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {sceneCategories.map((category) => {
          const count = category === 'All' ? scenes.length : scenes.filter((scene) => scene.category === category).length;
          const active = filter === category;
          return (
            <Pressable
              key={category}
              accessibilityLabel={`${category} scenes, ${count}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(category)}
              style={[styles.filter, active && styles.filterActive]}
            >
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
      renderItem={({ item }) => <SceneCard scene={item} onPress={openScene} />}
      ListHeaderComponent={Header}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      style={sharedStyles.screen}
    />
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  loadingMark: { color: colors.brand, fontSize: 48, fontWeight: '900' },
  list: { width: '100%', paddingHorizontal: spacing.lg },
  separator: { height: spacing.md },
  headerContent: { width: '100%', minWidth: 0, gap: spacing.xl, marginBottom: spacing.lg },
  topbar: { width: '100%', minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: { width: 42, height: 42, borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: colors.brandDark, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 10, elevation: 2 },
  brandMarkText: { color: colors.white, fontSize: 25, fontWeight: '900' },
  brandName: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  brandTagline: { color: colors.muted, fontSize: 12 },
  phraseButton: { minHeight: 44, minWidth: 58, borderRadius: radius.pill, backgroundColor: colors.paperRaised, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  topActions: { flexShrink: 0, flexDirection: 'row', gap: spacing.sm },
  roundButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.paperRaised, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  phraseButtonText: { color: colors.ink, fontWeight: '800' },
  hero: {
    width: '100%',
    minWidth: 0,
    backgroundColor: colors.brand,
    borderRadius: 30,
    borderCurve: 'continuous',
    padding: spacing.xl,
    gap: spacing.lg,
    overflow: 'hidden',
    shadowColor: colors.brandDark,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 4,
  },
  heroTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  heroEyebrow: { color: colors.white },
  heroBadge: { minHeight: 30, borderRadius: radius.pill, backgroundColor: 'rgba(20, 33, 31, 0.24)', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  heroBadgeText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroCopy: { minWidth: 0, flex: 1, gap: spacing.md },
  heroGlyph: { color: 'rgba(255, 255, 255, 0.18)', fontSize: 88, lineHeight: 96, fontWeight: '900', marginRight: -spacing.sm },
  heroTitle: { color: colors.white, fontSize: 35, lineHeight: 40, fontWeight: '900', letterSpacing: 0 },
  heroBody: { color: '#FFF2EA', fontSize: 16, lineHeight: 23 },
  liveButton: { minHeight: 76, backgroundColor: colors.ink, borderRadius: radius.lg, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  liveIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  liveCopy: { minWidth: 0, flex: 1, gap: 3 },
  liveTitle: { color: colors.white, fontSize: 16, fontWeight: '800' },
  liveSubtitle: { color: '#BFC9C6', fontSize: 12, lineHeight: 16 },
  livePill: { minHeight: 30, borderRadius: radius.pill, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  livePillText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { minWidth: 0, flex: 1, backgroundColor: colors.paperRaised, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md, alignItems: 'center', gap: 2 },
  statValue: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  quest: { ...sharedStyles.card, gap: spacing.md },
  questTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  questLabel: { minWidth: 0, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  questEyebrow: { color: colors.brandDark, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  goalChoices: { minWidth: 0, flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  goalChoice: { minWidth: 44, minHeight: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundWarm, paddingHorizontal: spacing.sm },
  goalChoiceActive: { backgroundColor: colors.ink },
  goalChoiceText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  goalChoiceTextActive: { color: colors.white },
  questTitle: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  questBody: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  questChecks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minHeight: 34, borderRadius: radius.pill, backgroundColor: colors.backgroundWarm },
  checkDone: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, minHeight: 34, borderRadius: radius.pill, backgroundColor: colors.success },
  checkText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  checkTextDone: { color: colors.white, fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 8, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: colors.backgroundWarm },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
  progressMeta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs },
  progressText: { minWidth: 0, flexShrink: 1, color: colors.muted, fontSize: 11, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sectionTitle: { color: colors.ink, fontSize: 26, lineHeight: 32, fontWeight: '900', marginTop: spacing.xs },
  filters: { gap: spacing.sm, paddingRight: spacing.lg },
  filter: { minHeight: 44, justifyContent: 'center', borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.paperRaised, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth },
  filterActive: { backgroundColor: colors.forestDark, borderColor: colors.forestDark },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  filterTextActive: { color: colors.white },
});
