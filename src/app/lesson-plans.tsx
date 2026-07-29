import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { ScrollView, Text, View } from 'react-native';

import { JournalDisplay, JournalKicker, JournalMotif } from '@/components/journal-chrome';
import { getScene } from '@/data/scenes';
import { lessonPlans, type LessonPlan } from '@/data/lesson-plans';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import type { SceneProgress } from '@/state/app-state-types';
import { useAppState } from '@/state/app-state';
import { makeStyles, radius, spacing, useSharedStyles } from '@/theme';

export default function LessonPlansScreen() {
  const router = useRouter();
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const largeTextLayout = useLargeTextLayout();
  const { sceneProgress } = useAppState();
  const selectedPlanId = Array.isArray(planId) ? planId[0] : planId;
  const selectedPlan = lessonPlans.find((plan) => plan.id === selectedPlanId);
  const inProgressLesson = lessonPlans
    .flatMap((plan) => plan.lessonIds.map((lessonId) => ({ lessonId, plan })))
    .filter(({ lessonId }) => {
      const progress = sceneProgress[lessonId];
      return (progress?.completions ?? 0) === 0 && (progress?.lastBeatIndex ?? 0) > 0;
    })
    .reduce<{ lessonId: string; plan: LessonPlan } | undefined>((selected, candidate) => {
      if (!selected) return candidate;
      const candidateTime = Date.parse(sceneProgress[candidate.lessonId]?.lastPracticedAt ?? '');
      const selectedTime = Date.parse(sceneProgress[selected.lessonId]?.lastPracticedAt ?? '');
      const normalizedCandidateTime = Number.isNaN(candidateTime) ? 0 : candidateTime;
      const normalizedSelectedTime = Number.isNaN(selectedTime) ? 0 : selectedTime;
      return normalizedCandidateTime > normalizedSelectedTime ? candidate : selected;
    }, undefined);
  const nextPlan = lessonPlans.find((plan) => plan.lessonIds.some((lessonId) => (sceneProgress[lessonId]?.completions ?? 0) === 0));
  const currentPlan = inProgressLesson?.plan ?? nextPlan ?? lessonPlans[lessonPlans.length - 1]!;

  if (selectedPlan) {
    return <PlanLessons plan={selectedPlan} router={router} sceneProgress={sceneProgress} />;
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <Stack.Screen options={{ headerLargeTitle: false, title: 'Lesson plans' }} />
      <View style={[styles.heading, largeTextLayout && styles.headingLarge]} testID="lesson-plans-heading">
        <View style={[styles.headingCopy, largeTextLayout && styles.headingCopyLarge]}>
          <JournalKicker>Guided curriculum</JournalKicker>
          <JournalDisplay style={[styles.title, largeTextLayout && styles.titleLarge]}>One path, 100 small wins.</JournalDisplay>
          <Text style={[styles.intro, largeTextLayout && styles.introLarge]}>Move in order, one useful Hindi phrase at a time. Each plan has ten focused lessons, with ten practice turns in each lesson.</Text>
        </View>
        <JournalMotif accessibilityLabel="Lesson plans journal motif" size="tile" style={largeTextLayout ? styles.headingMotifLarge : undefined} />
      </View>

      <View accessibilityLabel="Ten ordered lesson plans" style={styles.plans}>
        {lessonPlans.map((plan) => {
          const completed = plan.lessonIds.filter((id) => (sceneProgress[id]?.completions ?? 0) > 0).length;
          const nextIndex = plan.lessonIds.findIndex((id) => (sceneProgress[id]?.completions ?? 0) === 0);
          const percent = Math.round(completed / plan.lessonIds.length * 100);
          const isCurrent = plan.id === currentPlan.id;
          const activeLessonIndex = inProgressLesson?.plan.id === plan.id ? plan.lessonIds.indexOf(inProgressLesson.lessonId) : -1;
          const status = isCurrent
            ? activeLessonIndex >= 0
              ? `In progress · Lesson ${activeLessonIndex + 1}`
              : nextIndex < 0
                ? 'Ready to review'
                : completed > 0
                  ? `Continue · Lesson ${nextIndex + 1}`
                  : 'Up next'
            : completed === plan.lessonIds.length
              ? 'Complete'
              : plan.order > currentPlan.order
                ? 'Later plan'
                : 'Available';
          const action = isCurrent
            ? nextIndex < 0
              ? 'Review plan'
              : activeLessonIndex >= 0 || completed > 0
                ? 'Continue plan'
                : 'Start plan'
            : completed === plan.lessonIds.length
              ? 'Review plan'
              : 'Open plan';
          return (
            <PressableFeedback
              accessibilityLabel={`${plan.title}, plan ${plan.order} of ${lessonPlans.length}, ${status}, ${completed} of ${plan.lessonIds.length} lessons complete`}
              accessibilityRole="button"
              accessibilityState={{ selected: isCurrent }}
              key={plan.id}
              onPress={() => router.push({ pathname: '/lesson-plans', params: { planId: plan.id } })}
              style={[
                styles.planCard,
                isCurrent ? styles.planCardCurrent : styles.planCardCompact,
                largeTextLayout && styles.planCardLarge,
              ]}
              testID={`lesson-plan-${plan.id}`}
            >
              <View style={[styles.planAccent, { backgroundColor: plan.color }]} />
              <View style={styles.planTopline}>
                <Text style={[styles.planOrder, isCurrent && styles.planOrderCurrent]}>Plan {String(plan.order).padStart(2, '0')} · {status}</Text>
                <Text style={styles.planMeta}>{completed}/{plan.lessonIds.length} complete</Text>
              </View>
              <View style={styles.planTitleRow}>
                <Text style={styles.planEmoji}>{plan.emoji}</Text>
                <View style={styles.planCopy}>
                  <Text style={[styles.planTitle, !isCurrent && styles.planTitleCompact]}>{plan.title}</Text>
                  {isCurrent ? <Text style={styles.planSubtitle}>{plan.subtitle}</Text> : null}
                </View>
              </View>
              {isCurrent ? (
                <View accessibilityLabel={`${percent} percent complete`} style={styles.track}>
                  <View style={[styles.fill, { backgroundColor: plan.color, width: `${percent}%` }]} />
                </View>
              ) : null}
              <Text style={styles.planAction}>{action} →</Text>
            </PressableFeedback>
          );
        })}
      </View>
    </ScrollView>
  );
}

function PlanLessons({ plan, router, sceneProgress }: { plan: LessonPlan; router: ReturnType<typeof useRouter>; sceneProgress: Record<string, SceneProgress> }) {
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const largeTextLayout = useLargeTextLayout();
  const completed = plan.lessonIds.filter((id) => (sceneProgress[id]?.completions ?? 0) > 0).length;
  const nextLessonIndex = plan.lessonIds.findIndex((id) => (sceneProgress[id]?.completions ?? 0) === 0);
  const inProgressLessonId = plan.lessonIds
    .filter((lessonId) => (sceneProgress[lessonId]?.completions ?? 0) === 0 && (sceneProgress[lessonId]?.lastBeatIndex ?? 0) > 0)
    .reduce<string | undefined>((selected, candidate) => {
      if (!selected) return candidate;
      const candidateTime = Date.parse(sceneProgress[candidate]?.lastPracticedAt ?? '');
      const selectedTime = Date.parse(sceneProgress[selected]?.lastPracticedAt ?? '');
      const normalizedCandidateTime = Number.isNaN(candidateTime) ? 0 : candidateTime;
      const normalizedSelectedTime = Number.isNaN(selectedTime) ? 0 : selectedTime;
      return normalizedCandidateTime > normalizedSelectedTime ? candidate : selected;
    }, undefined);
  const currentIndex = inProgressLessonId
    ? plan.lessonIds.indexOf(inProgressLessonId)
    : nextLessonIndex < 0
      ? plan.lessonIds.length - 1
      : nextLessonIndex;
  const currentLessonId = plan.lessonIds[currentIndex] ?? '';
  const currentLesson = getScene(currentLessonId);
  const percent = Math.round(completed / plan.lessonIds.length * 100);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.detailContent} style={sharedStyles.screen}>
      <Stack.Screen options={{ headerLargeTitle: false, title: plan.title }} />
      <PressableFeedback
        accessibilityLabel="Back to all lesson plans"
        accessibilityRole="button"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/lesson-plans');
        }}
        style={styles.backButton}
      >
        <Text style={styles.backButtonText}>← All lesson plans</Text>
      </PressableFeedback>
      <View style={[styles.detailHeading, largeTextLayout && styles.headingLarge]} testID="lesson-plan-detail-heading">
        <View style={[styles.headingCopy, largeTextLayout && styles.headingCopyLarge]}>
          <JournalKicker>{`Plan ${String(plan.order).padStart(2, '0')} · Guided curriculum`}</JournalKicker>
          <JournalDisplay style={[styles.detailTitle, largeTextLayout && styles.detailTitleLarge]}>{plan.title}</JournalDisplay>
          <Text style={[styles.intro, largeTextLayout && styles.introLarge]}>{plan.subtitle}</Text>
        </View>
        <JournalMotif accessibilityLabel="Lesson plan journal motif" size="tile" style={largeTextLayout ? styles.headingMotifLarge : undefined} />
      </View>
      <View style={styles.detailSummary}>
        <View style={styles.detailSummaryTopline}>
          <Text style={styles.detailSummaryLabel}>{completed}/{plan.lessonIds.length} lessons complete</Text>
          <Text style={styles.detailSummaryPercent}>{percent}%</Text>
        </View>
        <View accessibilityLabel={`${percent} percent complete`} style={styles.track}>
          <View style={[styles.fill, { backgroundColor: plan.color, width: `${percent}%` }]} />
        </View>
        <Text style={styles.detailCue}>
          {nextLessonIndex < 0
            ? `All ten lessons are complete. Review ${currentLesson?.title ?? 'the final lesson'} to keep it warm.`
            : inProgressLessonId
              ? `Continue: lesson ${currentIndex + 1} · ${currentLesson?.title ?? 'ten practice turns'}`
              : `Next: lesson ${currentIndex + 1} · ${currentLesson?.title ?? 'ten practice turns'}`}
        </Text>
      </View>
      <View accessibilityLabel={`${plan.title} lessons`} style={styles.lessons}>
        {plan.lessonIds.map((lessonId, index) => {
          const lesson = getScene(lessonId);
          if (!lesson) return null;
          const isComplete = (sceneProgress[lesson.id]?.completions ?? 0) > 0;
          const isCurrent = index === currentIndex;
          const isInProgress = lesson.id === inProgressLessonId;
          const status = isComplete ? (isCurrent ? 'Ready to review' : 'Complete') : isInProgress ? 'In progress' : isCurrent ? 'Next lesson' : 'Up next';
          return (
            <PressableFeedback
              accessibilityLabel={`${lesson.title}, lesson ${index + 1} of ${plan.lessonIds.length}, ${status}`}
              accessibilityRole="button"
              key={lesson.id}
              onPress={() => router.push({ pathname: '/scene/[id]', params: { id: lesson.id } })}
              style={[styles.lessonCard, isCurrent && styles.lessonCardCurrent, largeTextLayout && styles.lessonCardLarge]}
            >
              <View style={[styles.lessonNumber, isComplete && styles.lessonNumberComplete, isCurrent && styles.lessonNumberNext]}>
                <Text style={[styles.lessonNumberText, isComplete && styles.lessonNumberTextComplete]}>{String(index + 1).padStart(2, '0')}</Text>
              </View>
              <View style={styles.lessonCopy}>
                <Text style={styles.lessonStatus}>{status} · 10 turns</Text>
                <Text style={styles.lessonTitle}>{lesson.title}</Text>
                <Text style={styles.lessonSubtitle}>{lesson.subtitle}</Text>
              </View>
              <Text style={styles.lessonArrow}>→</Text>
            </PressableFeedback>
          );
        })}
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  detailContent: { padding: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  heading: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  detailHeading: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headingLarge: { flexDirection: 'column', alignItems: 'stretch' },
  headingCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  headingCopyLarge: { flex: 0, width: '100%' },
  title: { maxWidth: 260, fontSize: 30, lineHeight: 36, textAlign: 'left' },
  titleLarge: { maxWidth: '100%' },
  detailTitle: { maxWidth: 260, fontSize: 30, lineHeight: 36, textAlign: 'left' },
  detailTitleLarge: { maxWidth: '100%' },
  intro: { maxWidth: 310, color: c.muted, fontSize: 14, lineHeight: 20 },
  introLarge: { maxWidth: '100%' },
  headingMotifLarge: { alignSelf: 'flex-end' },
  backButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.sm },
  backButtonText: { color: c.forestText, fontSize: 14, fontWeight: '900' },
  plans: { width: '100%', gap: spacing.md },
  detailSummary: { width: '100%', gap: spacing.sm, borderRadius: radius.lg, backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, padding: spacing.md },
  detailSummaryTopline: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  detailSummaryLabel: { color: c.ink, fontSize: 14, fontWeight: '900' },
  detailSummaryPercent: { color: c.brandText, fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  detailCue: { color: c.muted, fontSize: 13, lineHeight: 18 },
  lessons: { width: '100%', gap: spacing.sm },
  lessonCard: { width: '100%', minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, padding: spacing.md },
  lessonCardCurrent: { borderColor: c.gold, borderWidth: 2, backgroundColor: c.goldSoft },
  lessonCardLarge: { alignItems: 'flex-start', minHeight: 96, padding: spacing.lg },
  lessonNumber: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.backgroundWarm },
  lessonNumberComplete: { backgroundColor: c.forestSoft },
  lessonNumberNext: { borderColor: c.gold, borderWidth: 2 },
  lessonNumberText: { color: c.muted, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  lessonNumberTextComplete: { color: c.forestText },
  lessonCopy: { minWidth: 0, flex: 1, gap: 2 },
  lessonStatus: { color: c.brandText, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  lessonTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 18, lineHeight: 23, fontWeight: '700' },
  lessonSubtitle: { color: c.muted, fontSize: 13, lineHeight: 18 },
  lessonArrow: { color: c.forestText, fontSize: 22, fontWeight: '900' },
  planCard: { width: '100%', position: 'relative', overflow: 'hidden', borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, padding: spacing.md, gap: spacing.sm, boxShadow: '0 5px 16px rgba(35, 39, 35, 0.06)' },
  planCardCurrent: { borderColor: c.gold, borderWidth: 2, backgroundColor: c.goldSoft },
  planCardCompact: { gap: spacing.xs, paddingVertical: spacing.sm, boxShadow: 'none' },
  planCardLarge: { padding: spacing.lg, gap: spacing.sm },
  planAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  planTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  planOrder: { color: c.brandText, fontSize: 11, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase' },
  planOrderCurrent: { color: c.forestText },
  planMeta: { color: c.muted, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  planEmoji: { fontSize: 28 },
  planCopy: { minWidth: 0, flex: 1, gap: 2 },
  planTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 22, lineHeight: 28, fontWeight: '700' },
  planTitleCompact: { fontSize: 18, lineHeight: 23 },
  planSubtitle: { color: c.muted, fontSize: 13, lineHeight: 18 },
  track: { width: '100%', height: 7, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: c.backgroundWarm },
  fill: { height: '100%', borderRadius: radius.pill },
  planAction: { color: c.forestText, fontSize: 13, fontWeight: '900' },
}));
