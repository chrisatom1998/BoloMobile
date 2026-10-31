import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { ScrollView, Text, View } from 'react-native';

import { JournalDisplay, JournalKicker } from '@/components/journal-chrome';
import { bundledScenes, getScene } from '@/data/scenes';
import { lessonPlans, type LessonPlan } from '@/data/lesson-plans';
import { PlanIcon } from '@/components/plan-icon';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { currentLessonPlan, inProgressLesson } from '@/lib/lesson-path';
import type { SceneProgress } from '@/state/app-state-types';
import { useAppState } from '@/state/app-state';
import { makeStyles, radius, spacing, useSharedStyles, type, buttons } from '@/theme';

export default function LessonPlansScreen() {
  const router = useRouter();
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const largeTextLayout = useLargeTextLayout();
  const { learnerProfile, sceneProgress } = useAppState();
  const selectedPlanId = Array.isArray(planId) ? planId[0] : planId;
  const selectedPlan = lessonPlans.find((plan) => plan.id === selectedPlanId);
  const activeLesson = inProgressLesson(sceneProgress);
  const currentPlan = currentLessonPlan(sceneProgress, learnerProfile);
  const guidedLessonCount = lessonPlans.filter((plan) => plan.id !== 'creator').reduce((total, plan) => total + plan.lessonIds.length, 0);

  if (selectedPlan) {
    return <PlanLessons plan={selectedPlan} router={router} sceneProgress={sceneProgress} />;
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <Stack.Screen options={{ headerLargeTitle: false, title: 'Lesson plans' }} />
      <View style={[styles.heading, largeTextLayout && styles.headingLarge]} testID="lesson-plans-heading">
        <View style={[styles.headingCopy, largeTextLayout && styles.headingCopyLarge]}>
          <JournalKicker>Guided curriculum</JournalKicker>
          <JournalDisplay style={[styles.title, largeTextLayout && styles.titleLarge]}>{`One path, ${guidedLessonCount} small wins.`}</JournalDisplay>
          <Text style={[styles.intro, largeTextLayout && styles.introLarge]}>Move in order, one useful Hindi phrase at a time. Each lesson only practices phrases you have already met.</Text>
        </View>
      </View>

      <View accessibilityLabel={`${lessonPlans.length} ordered lesson plans`} style={styles.plans}>
        {lessonPlans.map((plan) => {
          const completed = plan.lessonIds.filter((id) => (sceneProgress[id]?.completions ?? 0) > 0).length;
          const nextIndex = plan.lessonIds.findIndex((id) => (sceneProgress[id]?.completions ?? 0) === 0);
          const percent = Math.round(completed / plan.lessonIds.length * 100);
          const isCurrent = plan.id === currentPlan.id;
          const activeLessonIndex = activeLesson?.plan.id === plan.id ? plan.lessonIds.indexOf(activeLesson.lessonId) : -1;
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
              : completed > 0
                ? `${completed} of ${plan.lessonIds.length} done`
                : '';
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
              accessibilityLabel={`${plan.title}, plan ${plan.order} of ${lessonPlans.length}, ${status ? `${status}, ` : ''}${completed} of ${plan.lessonIds.length} lessons complete`}
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
                <Text style={[styles.planOrder, isCurrent && styles.planOrderCurrent]}>Plan {String(plan.order).padStart(2, '0')}{status ? ` · ${status}` : ''}</Text>
                {completed > 0 || isCurrent ? <Text style={styles.planMeta}>{completed}/{plan.lessonIds.length} complete</Text> : null}
              </View>
              <View style={styles.planTitleRow}>
                <PlanIcon planId={plan.id} />
                <View style={styles.planCopy}>
                  <Text style={[styles.planTitle, !isCurrent && styles.planTitleCompact]}>{plan.title}</Text>
                  {isCurrent ? <Text style={styles.planSubtitle}>{plan.subtitle}</Text> : null}
                </View>
              </View>
              {isCurrent ? (
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.track}>
                  <View style={[styles.fill, { backgroundColor: plan.color, width: `${percent}%` }]} />
                </View>
              ) : null}
              <Text style={styles.planAction}>{action} →</Text>
            </PressableFeedback>
          );
        })}
      </View>

      <View style={styles.sceneShelfHeading} testID="real-life-scenes">
        <JournalKicker>Real-life scenes</JournalKicker>
        <JournalDisplay style={[styles.sceneShelfTitle, largeTextLayout && styles.titleLarge]}>Try it in the moment.</JournalDisplay>
        <Text style={[styles.intro, largeTextLayout && styles.introLarge]}>Short conversations at a chai stall, in a rickshaw, at the doctor. Pick any one, in any order.</Text>
      </View>
      <View accessibilityLabel={`${bundledScenes.length} real-life scenes`} style={styles.plans}>
        {bundledScenes.map((scene) => {
          const done = (sceneProgress[scene.id]?.completions ?? 0) > 0;
          return (
            <PressableFeedback
              accessibilityLabel={`${scene.title}, ${scene.subtitle}, ${scene.level}${done ? ', complete' : ''}`}
              accessibilityRole="button"
              key={scene.id}
              onPress={() => router.push({ pathname: '/scene/[id]', params: { id: scene.id } })}
              style={[styles.sceneCard, largeTextLayout && styles.planCardLarge]}
              testID={`real-life-scene-${scene.id}`}
            >
              <PlanIcon category={scene.category} size={18} />
              <View style={styles.planCopy}>
                <Text style={styles.sceneTitle}>{scene.title}</Text>
                <Text style={styles.planSubtitle}>{scene.subtitle} · {scene.level}{done ? ' · Done' : ''}</Text>
              </View>
              <Text style={styles.lessonArrow}>→</Text>
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
      </View>
      <View style={styles.detailSummary}>
        <View style={styles.detailSummaryTopline}>
          <Text style={styles.detailSummaryLabel}>{completed}/{plan.lessonIds.length} lessons complete</Text>
          <Text style={styles.detailSummaryPercent}>{percent}%</Text>
        </View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.track}>
          <View style={[styles.fill, { backgroundColor: plan.color, width: `${percent}%` }]} />
        </View>
        <Text style={styles.detailCue}>
          {nextLessonIndex < 0
            ? `${plan.lessonIds.length === 1 ? 'Your lesson is complete.' : `All ${plan.lessonIds.length} lessons are complete.`} Review ${currentLesson?.title ?? 'the final lesson'} to keep it warm.`
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
              testID={`lesson-${lesson.id}`}
              onPress={() => router.push({ pathname: '/scene/[id]', params: { id: lesson.id } })}
              style={[styles.lessonCard, isCurrent && styles.lessonCardCurrent, largeTextLayout && styles.lessonCardLarge]}
            >
              <Text style={[styles.lessonNumberText, isComplete && styles.lessonNumberTextComplete, isCurrent && styles.lessonNumberTextCurrent]}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.lessonCopy}>
                <Text style={styles.lessonStatus}>{status} · {lesson.beats.length} turns</Text>
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
  title: { ...type.display, textAlign: 'left' },
  titleLarge: { maxWidth: '100%' },
  detailTitle: { ...type.display, textAlign: 'left' },
  detailTitleLarge: { maxWidth: '100%' },
  intro: { ...type.caption, maxWidth: 310, color: c.muted },
  introLarge: { maxWidth: '100%' },
  backButton: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing.sm },
  backButtonText: buttons.quietText,
  plans: { width: '100%', gap: spacing.md },
  detailSummary: { width: '100%', gap: spacing.sm, borderRadius: radius.lg, backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, padding: spacing.md },
  detailSummaryTopline: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  detailSummaryLabel: { ...type.label, color: c.ink, fontWeight: '700' },
  detailSummaryPercent: { ...type.label, color: c.brandText, fontVariant: ['lining-nums', 'tabular-nums'], fontWeight: '700' },
  detailCue: { ...type.caption, color: c.muted },
  lessons: { width: '100%', gap: spacing.sm },
  lessonCard: { width: '100%', minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, padding: spacing.md },
  lessonCardCurrent: { backgroundColor: c.brandSoft, borderLeftWidth: 4, borderLeftColor: c.brand },
  lessonCardLarge: { alignItems: 'flex-start', minHeight: 96, padding: spacing.lg },
  lessonNumberText: { ...type.bodyLarge, minWidth: 28, color: c.mutedSoft, fontFamily: 'Georgia', fontVariant: ['lining-nums', 'tabular-nums'], fontWeight: '700' },
  lessonNumberTextComplete: { color: c.forestText },
  lessonNumberTextCurrent: { color: c.ink },
  lessonCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  lessonStatus: { ...type.eyebrow, color: c.brandText },
  lessonTitle: { ...type.headline, color: c.ink },
  lessonSubtitle: { ...type.caption, color: c.muted },
  lessonArrow: { ...type.headline, color: c.mutedSoft, fontWeight: '400' },
  planCard: { width: '100%', position: 'relative', overflow: 'hidden', borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  planCardCurrent: { borderColor: c.brand, backgroundColor: c.brandSoft },
  planCardCompact: { gap: spacing.xs, paddingVertical: spacing.sm },
  planCardLarge: { padding: spacing.lg, gap: spacing.sm },
  planAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  planTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  planOrder: { ...type.eyebrow, color: c.brandText },
  planOrderCurrent: { color: c.brandText },
  planMeta: { ...type.caption, color: c.muted, fontVariant: ['lining-nums', 'tabular-nums'], fontWeight: '700' },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  planCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  planTitle: { ...type.headline, color: c.ink },
  planTitleCompact: { ...type.headline },
  planSubtitle: { ...type.caption, color: c.muted },
  track: { width: '100%', height: 7, overflow: 'hidden', borderRadius: radius.pill, backgroundColor: c.backgroundWarm },
  fill: { height: '100%', borderRadius: radius.pill },
  planAction: { ...type.caption, color: c.brandText, fontWeight: '700' },
  sceneShelfHeading: { width: '100%', gap: spacing.xs, marginTop: spacing.lg },
  sceneShelfTitle: { ...type.title, maxWidth: 320, textAlign: 'left' },
  sceneCard: { width: '100%', minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, padding: spacing.md },
  sceneTitle: { ...type.bodyLarge, color: c.ink, fontFamily: 'Georgia', fontWeight: '700' },
}));
