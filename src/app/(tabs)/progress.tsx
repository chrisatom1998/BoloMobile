import { useRouter, type Href } from 'expo-router';
import { Award, Check, Leaf, Share2, Sprout } from 'lucide-react-native';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { useMemo } from 'react';
import { Platform, Share, ScrollView, StatusBar, Text, View } from 'react-native';

import { JournalDisplay, JournalKicker, JournalMotif } from '@/components/journal-chrome';
import { getScene } from '@/data/scenes';
import { lessonPlans } from '@/data/lesson-plans';
import { showAppAlert } from '@/lib/app-alert';
import { categoryMastery, learningAccuracy, milestoneProgress, weeklyPractice } from '@/lib/learning';
import { defaultLearnerProfile } from '@/lib/storage';
import { useAppStateValue } from '@/state/app-state';
import { makeStyles, radius, spacing, useSharedStyles, useTheme, type NamedStyles, type ThemeColors } from '@/theme';

export default function ProgressScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const sharedStyles = useSharedStyles();
  const styles = useStyles();
  const androidStatusInset = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;
  const { duePhrases, learnerProfile, phraseReviews, phrases, practiceHistory, reviewStreak, sceneProgress, streak } = useAppStateValue();
  const profile = learnerProfile ?? { ...defaultLearnerProfile(), completed: true };
  const { week, maxMinutes } = useMemo(() => {
    const days = weeklyPractice(practiceHistory);
    return { week: days, maxMinutes: Math.max(1, ...days.map((day) => day.seconds / 60)) };
  }, [practiceHistory]);
  const { accuracy, categories, completedScenes, milestones } = useMemo(() => ({
    categories: categoryMastery(sceneProgress),
    accuracy: learningAccuracy(sceneProgress),
    milestones: milestoneProgress(sceneProgress),
    completedScenes: Object.values(sceneProgress).filter((item) => item.completions > 0).length,
  }), [sceneProgress]);
  const reviewedThisWeek = week.reduce((total, day) => total + day.reviews, 0);
  const activeDaysThisWeek = week.filter((day) => day.seconds > 0 || day.reviews > 0).length;
  const hasLearningActivity = practiceHistory.some((day) => day.seconds > 0 || day.reviews > 0)
    || Object.values(sceneProgress).some((item) => item.completions > 0 || item.lastBeatIndex > 0)
    || streak > 0
    || reviewStreak > 0;
  const featuredPhrase = duePhrases[0] ?? phrases[0] ?? null;
  const featuredMastery = featuredPhrase ? phraseReviews[featuredPhrase.hi]?.mastery ?? 0 : 0;
  const lessonFocus = useMemo(() => {
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
    const lesson = getScene(lessonId);
    const lessonIndex = Math.max(0, plan.lessonIds.indexOf(lessonId));
    const progress = sceneProgress[lessonId];
    const mode = resumed ? 'continue' : incompletePlan ? 'start' : 'review';
    const turnCount = lesson?.beats.length ?? 10;
    const currentTurn = Math.min(turnCount, (progress?.lastBeatIndex ?? 0) + 1);

    return {
      action: mode === 'continue' ? 'Continue lesson' : mode === 'start' ? 'Start lesson' : 'Review lesson',
      lessonId,
      metric: mode === 'continue'
        ? `Plan ${String(plan.order).padStart(2, '0')} · Lesson ${lessonIndex + 1} of ${plan.lessonIds.length} · Turn ${currentTurn} of ${turnCount}`
        : `Plan ${String(plan.order).padStart(2, '0')} · Lesson ${lessonIndex + 1} of ${plan.lessonIds.length} · ${turnCount} turns`,
      mode,
      title: lesson?.title ?? plan.title,
    };
  }, [sceneProgress]);
  const streakLabel = streak > 0
    ? `${streak}-day practice streak`
    : hasLearningActivity
      ? 'No active practice streak'
      : 'No practice streak yet';
  const weekActivityLabel = reviewedThisWeek > 0
    ? `${reviewedThisWeek} phrase review${reviewedThisWeek === 1 ? '' : 's'}`
    : activeDaysThisWeek > 0
      ? `${activeDaysThisWeek} active day${activeDaysThisWeek === 1 ? '' : 's'}`
      : 'No activity yet';

  function shareMilestones() {
    const achieved = milestones.filter((item) => item.achieved).map((item) => item.title);
    const message = achieved.length
      ? `I’m practicing real-life Hindi with Bolo. ${completedScenes} scenes complete — ${achieved.join(', ')}.`
      : `I’m building practical Hindi confidence with Bolo. ${completedScenes} scene${completedScenes === 1 ? '' : 's'} complete.`;
    void Share.share({ message, title: 'My Bolo progress' }).catch((error: unknown) => {
      showAppAlert('Could not share your progress', error instanceof Error ? error.message : 'Try again in a moment.');
    });
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { paddingTop: Math.max(18, androidStatusInset + spacing.md) }]} style={sharedStyles.screen}>
      <View style={styles.pageHeading}>
        <View style={styles.pageHeadingCopy}>
          <JournalKicker>Your language garden</JournalKicker>
          <JournalDisplay style={styles.pageTitle}>What is taking root.</JournalDisplay>
        </View>
        <JournalMotif accessibilityLabel="Progress journal motif" size="tile" />
      </View>

      <View style={styles.hero}>
        <Text pointerEvents="none" style={styles.heroGlyph}>ब</Text>
        <View style={styles.heroIcon}><Sprout color={colors.goldSoft} size={25} /></View>
        <Text style={styles.heroEyebrow}>
          {lessonFocus.mode === 'continue' ? 'Current lesson' : !hasLearningActivity ? 'Your first lesson' : lessonFocus.mode === 'review' ? 'Review lesson' : 'Next lesson'}
        </Text>
        <Text style={styles.heroTitle}>{lessonFocus.title}</Text>
        <Text style={styles.heroBody}>{lessonFocus.metric}</Text>
        <View style={styles.heroFootnotes}>
          <View style={styles.heroFootnote}><Text style={styles.heroFootnoteText}>{completedScenes} scene{completedScenes === 1 ? '' : 's'} learned · {reviewedThisWeek} review{reviewedThisWeek === 1 ? '' : 's'} this week</Text></View>
          <View style={[styles.heroFootnote, styles.heroFootnoteForest]}><Text style={[styles.heroFootnoteText, styles.heroFootnoteForestText]}>{streakLabel}</Text></View>
        </View>
        <PressableFeedback
          accessibilityLabel={`${lessonFocus.action}: ${lessonFocus.title}`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/scene/[id]', params: { id: lessonFocus.lessonId } })}
          style={styles.heroAction}
        >
          <Text style={styles.heroActionText}>{lessonFocus.action}</Text>
        </PressableFeedback>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.statValue}>{completedScenes}</Text><Text style={styles.statLabel}>scenes learned</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{accuracy}%</Text><Text style={styles.statLabel}>answer accuracy</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{streak}</Text><Text style={styles.statLabel}>practice streak</Text></View>
        <View style={styles.stat}><Text style={styles.statValue}>{reviewStreak}</Text><Text style={styles.statLabel}>review streak</Text></View>
      </View>

      <View style={styles.gardenCard}>
        <View style={styles.cardTitleRow}>
          <View>
            <Text style={styles.gardenEyebrow}>This week</Text>
            <Text style={styles.title}>Your practice pattern.</Text>
          </View>
          <Text style={styles.gardenMeta}>{weekActivityLabel}</Text>
        </View>
        <View accessibilityLabel="Weekly practice garden" style={styles.gardenWeek}>
          {week.map((day, index) => {
            const practiced = day.seconds > 0 || day.reviews > 0;
            const today = index === week.length - 1;
            return (
              <View key={day.date} style={styles.gardenDay}>
                <Text style={[styles.gardenDayLabel, today && styles.gardenDayLabelToday]}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
                <View style={[styles.gardenLeaf, practiced && styles.gardenLeafActive, today && styles.gardenLeafToday]}>
                  <Leaf color={practiced || today ? colors.forestText : colors.lineStrong} fill={practiced || today ? colors.forestSoft : 'transparent'} size={20} strokeWidth={1.8} />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {featuredPhrase ? (
        <PressableFeedback accessibilityLabel={`Water saved phrase ${featuredPhrase.hi}`} accessibilityRole="button" onPress={() => router.push((duePhrases.length ? '/review' : '/phrases') as Href)} style={styles.featuredPhrase}>
          <View style={styles.featuredPhraseHeading}>
            <View style={styles.featuredPhraseIcon}><Sprout color={colors.forestText} size={20} /></View>
            <Text style={styles.gardenEyebrow}>Featured phrase</Text>
            <View style={styles.featuredListen}><Text style={styles.featuredNavigate}>→</Text></View>
          </View>
          {profile.scriptPreference !== 'latin' ? <Text style={styles.featuredHindi}>{featuredPhrase.hi}</Text> : null}
          {profile.scriptPreference !== 'devanagari' ? <Text style={styles.featuredLatin}>{featuredPhrase.latin}</Text> : null}
          <Text style={styles.featuredEnglish}>{featuredPhrase.en}</Text>
          <View style={styles.featuredMasteryRow}>
            <Text style={styles.featuredMasteryLabel}>Mastery</Text>
            <View style={styles.featuredLeaves}>{Array.from({ length: 5 }, (_, index) => <Leaf color={index < featuredMastery ? colors.forest : colors.lineStrong} fill={index < featuredMastery ? colors.forestSoft : 'transparent'} key={index} size={18} strokeWidth={1.8} />)}</View>
            <Text style={styles.featuredMasteryValue}>{featuredMastery}/5</Text>
          </View>
          <View style={styles.waterButton}><Text style={styles.waterButtonText}>{duePhrases.length ? 'Water this phrase' : 'Visit your phrase garden'}</Text></View>
        </PressableFeedback>
      ) : null}

      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.title}>Last 7 days</Text>
          <Text style={styles.cardMeta}>minutes</Text>
        </View>
        <View accessibilityLabel="Weekly practice minutes chart" style={styles.chart}>
          {week.map((day) => {
            const minutes = Math.round(day.seconds / 60);
            return (
              <View key={day.date} style={styles.barColumn}>
                <Text style={styles.barValue}>{minutes}</Text>
                <View style={styles.barTrack}><View style={[styles.bar, { height: `${Math.max(4, minutes / maxMinutes * 100)}%` }]} /></View>
                <Text style={styles.day}>{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Category mastery</Text>
        {categories.map((item) => (
          <View key={item.category} style={styles.masteryRow}>
            <View style={styles.masteryCopy}><Text style={styles.masteryTitle}>{item.category}</Text><Text style={styles.masteryMeta}>{item.completed}/{item.total}</Text></View>
            <View style={styles.masteryTrack}><View style={[styles.masteryFill, { width: `${item.percent}%` }]} /></View>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.cardTitleRow}><Text style={styles.title}>Can-do milestones</Text><Award color={colors.gold} size={22} /></View>
        {milestones.map((item) => (
          <View key={item.id} style={styles.milestone}>
            <View style={[styles.milestoneMark, item.achieved && styles.milestoneMarkDone]}>{item.achieved ? <Check color={colors.white} size={16} /> : null}</View>
            <View style={styles.milestoneCopy}><Text style={styles.milestoneTitle}>{item.title}</Text><Text style={styles.masteryMeta}>{item.completed}/{item.sceneIds.length} scenes</Text></View>
          </View>
        ))}
        <PressableFeedback accessibilityRole="button" onPress={shareMilestones} style={styles.shareButton}><Share2 color={colors.forestText} size={18} /><Text style={styles.shareText}>Share a private milestone card</Text></PressableFeedback>
      </View>
    </ScrollView>
  );
}

export const createProgressStyles = (c: ThemeColors) => ({
  content: { alignItems: 'center', padding: spacing.lg, paddingTop: 18, paddingBottom: 120, gap: spacing.lg },
  pageHeading: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.sm },
  pageHeadingCopy: { minWidth: 0, flex: 1, gap: spacing.xs, paddingTop: spacing.xs },
  pageTitle: { maxWidth: 225, fontSize: 30, lineHeight: 36, textAlign: 'left' },
  hero: { width: '100%', position: 'relative', overflow: 'hidden', alignItems: 'flex-start', borderRadius: 26, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, padding: spacing.xl, gap: spacing.sm, boxShadow: '0 10px 24px rgba(0, 0, 0, 0.09)' },
  heroIcon: { width: 46, height: 46, borderRadius: 16, borderCurve: 'continuous', backgroundColor: c.heroRaised, alignItems: 'center', justifyContent: 'center' },
  heroGlyph: { position: 'absolute', right: -6, bottom: -48, color: c.heroGlyph, fontSize: 156, lineHeight: 180, fontWeight: '900' },
  heroEyebrow: { color: c.brandText, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  heroTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 25, lineHeight: 32, fontWeight: '700', textAlign: 'left' },
  heroBody: { color: c.muted, fontSize: 14, lineHeight: 21, textAlign: 'left' },
  heroFootnotes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  heroFootnote: { maxWidth: '100%', flexShrink: 1, borderRadius: radius.pill, backgroundColor: c.goldSoft, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  heroFootnoteText: { color: c.ink, fontSize: 12, fontWeight: '800' },
  heroFootnoteForest: { backgroundColor: c.forestSoft },
  heroFootnoteForestText: { color: c.forestText },
  heroAction: { minHeight: 48, alignSelf: 'stretch', borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.neutralSurface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: spacing.xs },
  heroActionText: { color: c.neutralSurfaceText, fontSize: 14, fontWeight: '900' },
  gardenCard: { width: '100%', backgroundColor: c.paper, borderTopColor: c.lineStrong, borderBottomColor: c.lineStrong, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: spacing.lg, gap: spacing.lg },
  gardenEyebrow: { color: c.brandText, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  gardenMeta: { color: c.muted, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  gardenWeek: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 3 },
  gardenDay: { minWidth: 0, flex: 1, alignItems: 'center', gap: spacing.xs },
  gardenDayLabel: { color: c.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  gardenDayLabelToday: { color: c.brandText },
  gardenLeaf: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: c.backgroundWarm, alignItems: 'center', justifyContent: 'center' },
  gardenLeafActive: { borderColor: c.forest, borderWidth: 1, backgroundColor: c.forestSoft },
  gardenLeafToday: { borderColor: c.neutralSurface, borderWidth: 2, backgroundColor: c.neutralSurface },
  featuredPhrase: { width: '100%', backgroundColor: c.paperRaised, borderColor: c.gold, borderWidth: 1.5, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.sm, boxShadow: '0 5px 16px rgba(84, 58, 11, 0.08)' },
  featuredPhraseHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  featuredPhraseIcon: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: c.goldSoft, borderColor: c.gold, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  featuredListen: { marginLeft: 'auto', width: 38, height: 38, borderRadius: radius.pill, backgroundColor: c.forestSoft, alignItems: 'center', justifyContent: 'center' },
  featuredNavigate: { color: c.forestText, fontSize: 20, fontWeight: '900' },
  featuredHindi: { color: c.ink, fontFamily: 'Georgia', fontSize: 28, lineHeight: 36, fontWeight: '700' },
  featuredLatin: { color: c.brandText, fontSize: 15, fontWeight: '900' },
  featuredEnglish: { color: c.muted, fontSize: 15, lineHeight: 21 },
  featuredMasteryRow: { width: '100%', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.sm },
  featuredMasteryLabel: { color: c.ink, fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  featuredLeaves: { flexDirection: 'row', gap: 3 },
  featuredMasteryValue: { color: c.forestText, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
  waterButton: { minHeight: 48, borderRadius: radius.md, backgroundColor: c.neutralSurface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: spacing.xs },
  waterButtonText: { color: c.neutralSurfaceText, fontSize: 14, fontWeight: '900' },
  stats: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { minWidth: 130, minHeight: 100, flexGrow: 1, flexBasis: 130, backgroundColor: c.paperRaised, borderRadius: 18, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, padding: spacing.md, alignItems: 'center', justifyContent: 'center', gap: 3, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.035)' },
  statValue: { color: c.ink, fontSize: 27, fontWeight: '900', fontVariant: ['tabular-nums'] },
  statLabel: { color: c.muted, fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  card: { width: '100%', backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: 22, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.lg, boxShadow: '0 4px 14px rgba(0, 0, 0, 0.035)' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: c.ink, fontFamily: 'Georgia', fontSize: 22, lineHeight: 28, fontWeight: '700' },
  cardMeta: { color: c.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  chart: { height: 150, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  barColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  barValue: { color: c.muted, fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  barTrack: { flex: 1, width: '70%', borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.backgroundWarm, justifyContent: 'flex-end' },
  bar: { width: '100%', minHeight: 4, borderRadius: radius.pill, backgroundColor: c.brand },
  day: { color: c.muted, fontSize: 11, fontWeight: '700' },
  masteryRow: { gap: spacing.xs },
  masteryCopy: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  masteryTitle: { color: c.ink, fontSize: 14, fontWeight: '800' },
  masteryMeta: { color: c.muted, fontSize: 12, lineHeight: 17, fontVariant: ['tabular-nums'] },
  masteryTrack: { height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.line },
  masteryFill: { height: '100%', borderRadius: radius.pill, backgroundColor: c.forest },
  milestone: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  milestoneMark: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
  milestoneMarkDone: { borderColor: c.forest, backgroundColor: c.forest },
  milestoneCopy: { minWidth: 0, flex: 1, gap: 2 },
  milestoneTitle: { color: c.ink, fontSize: 15, fontWeight: '800' },
  shareButton: { minHeight: 48, overflow: 'hidden', borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: c.forest, backgroundColor: c.forestSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  shareText: { color: c.forestText, fontSize: 14, fontWeight: '800', textAlign: 'center' },
} satisfies NamedStyles);

const useStyles = makeStyles(createProgressStyles);
