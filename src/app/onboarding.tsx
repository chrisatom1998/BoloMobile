import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowRight, Check, ChevronLeft, X } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MotionReveal } from '@/components/motion';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { observe } from '@/lib/observability';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import type { AshaResponseLanguage, LearnerLevel, LearningGoal, ScriptPreference } from '@/state/app-state-types';
import { hindiType, makeStyles, radius, spacing, useSharedStyles, useTheme } from '@/theme';

type Choice<T extends string | number> = {
  label: string;
  value: T;
  detail?: string;
  /** Extra accessible description, read after the label (for example a script preview). */
  accessibleDetail?: string;
  /** Rich preview rendered under the label, in place of `detail`. */
  preview?: ReactNode;
};

/** The same sentence shown in every script option so the choice is concrete. */
export const SCRIPT_PREVIEW = { hi: 'आप कैसे हैं?', latin: 'aap kaise hain?' } as const;

function ChoiceRow<T extends string | number>({ choices, label, onChange, testID, value }: {
  choices: Choice<T>[];
  label: string;
  onChange: (value: T) => void;
  testID?: string;
  value: T | undefined;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View accessibilityLabel={label} accessibilityRole="radiogroup" style={styles.choices} testID={testID}>
      {choices.map((choice) => {
        const selected = choice.value === value;
        const description = choice.accessibleDetail ?? choice.detail;
        return (
          <Pressable
            key={choice.value}
            accessibilityLabel={description ? `${choice.label}, ${description}` : choice.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(choice.value)}
            style={[styles.choice, selected && styles.choiceSelected]}
            testID={`onboarding-choice-${String(choice.value)}`}
          >
            <View style={[styles.check, selected && styles.checkSelected]}>{selected ? <Check color={colors.white} size={15} /> : null}</View>
            <View style={styles.choiceCopy}>
              <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{choice.label}</Text>
              {choice.preview ?? (choice.detail ? <Text style={styles.choiceDetail}>{choice.detail}</Text> : null)}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Preview of one sentence as the learner would see it under a script preference. */
function ScriptPreview({ preference }: { preference: ScriptPreference }) {
  const styles = useStyles();
  // The parent radio carries the combined accessible label, so these nodes are visual only.
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.preview}>
      {preference === 'latin' ? (
        // Latin-only learners never see Devanagari, so the preview shows only the romanization.
        <Text style={styles.previewLatinFirst}>{SCRIPT_PREVIEW.latin}</Text>
      ) : (
        <>
          <Text accessibilityLanguage="hi-IN" style={styles.previewHindi}>{SCRIPT_PREVIEW.hi}</Text>
          {preference === 'both' ? <Text style={styles.previewLatin}>{SCRIPT_PREVIEW.latin}</Text> : null}
        </>
      )}
    </View>
  );
}

const STEP_COUNT = 5;

type Step = { key: string; title: string; lead: string; valid: boolean; body: ReactNode };

export default function OnboardingScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { completeOnboarding, goal: savedGoal, learnerProfile, motionPreference = DEFAULT_MOTION_PREFERENCE } = useAppState();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const largeText = useLargeTextLayout();
  const { mode: motionMode } = useMotionPreference(motionPreference);
  const recalibrating = mode === 'recalibrate' && learnerProfile.completed;
  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [level, setLevel] = useState<LearnerLevel>(recalibrating ? learnerProfile.level : 'new');
  const [scriptPreference, setScriptPreference] = useState<ScriptPreference>(recalibrating ? learnerProfile.scriptPreference : 'both');
  const [primaryGoal, setPrimaryGoal] = useState<LearningGoal>(recalibrating ? learnerProfile.primaryGoal : 'conversation');
  const [responseLanguage, setResponseLanguage] = useState<AshaResponseLanguage>(recalibrating ? learnerProfile.responseLanguage : 'en');
  const [goal, setGoal] = useState<5 | 10 | 15>(recalibrating ? savedGoal : 10);
  // The microphone check left onboarding; live practice asks for permission when it connects.
  // Keep the saved flag on recalibration and start a new learner at false.
  const microphoneTested = recalibrating ? learnerProfile.microphoneTested : false;

  const steps: readonly [Step, Step, Step, Step, Step] = [
    {
      key: 'level',
      title: 'Where are you starting?',
      lead: 'Bolo picks your first lessons from this. You can change it any time in Settings.',
      valid: level !== undefined,
      body: (
        <ChoiceRow label="Hindi level" testID="onboarding-step-level" value={level} onChange={setLevel} choices={[
          { value: 'new', label: 'New to Hindi', detail: 'Start with essential patterns.' },
          { value: 'beginner', label: 'Beginner', detail: 'I know greetings and a few phrases.' },
          { value: 'intermediate', label: 'Intermediate', detail: 'Give me richer real-life situations.' },
        ]} />
      ),
    },
    {
      key: 'script',
      title: 'How should Hindi appear?',
      lead: 'Pick what you can read today. Every phrase in Bolo follows this, and you can change it in Settings.',
      valid: scriptPreference !== undefined,
      body: (
        <ChoiceRow label="Hindi script preference" testID="onboarding-step-script" value={scriptPreference} onChange={setScriptPreference} choices={[
          { value: 'both', label: 'Hindi script with roman letters', accessibleDetail: `${SCRIPT_PREVIEW.hi}, ${SCRIPT_PREVIEW.latin}`, preview: <ScriptPreview preference="both" /> },
          { value: 'devanagari', label: 'Hindi script only', accessibleDetail: SCRIPT_PREVIEW.hi, preview: <ScriptPreview preference="devanagari" /> },
          { value: 'latin', label: 'Roman letters only', accessibleDetail: SCRIPT_PREVIEW.latin, preview: <ScriptPreview preference="latin" /> },
        ]} />
      ),
    },
    {
      key: 'goal',
      title: 'What matters most?',
      lead: 'Asha leans her scenes and phrases toward this.',
      valid: primaryGoal !== undefined,
      body: (
        <ChoiceRow label="Learning goal" testID="onboarding-step-goal" value={primaryGoal} onChange={setPrimaryGoal} choices={[
          { value: 'conversation', label: 'Everyday conversation' },
          { value: 'travel', label: 'Travel' },
          { value: 'family', label: 'Family and friends' },
          { value: 'work', label: 'Work' },
        ]} />
      ),
    },
    {
      key: 'replies',
      title: 'Asha’s replies',
      lead: 'Choose the language Asha answers in during live practice. You can switch before any session.',
      valid: responseLanguage !== undefined,
      body: (
        <ChoiceRow label="Asha response language" testID="onboarding-step-replies" value={responseLanguage} onChange={setResponseLanguage} choices={[
          { value: 'en', label: 'English first', detail: 'Asha explains in English and keeps Hindi for what you practise.' },
          { value: 'hi', label: 'Hindi first', detail: 'Asha stays in Hindi and only helps in English when you ask.' },
        ]} />
      ),
    },
    {
      key: 'target',
      title: 'Daily practice target',
      lead: 'A small target you can keep beats a big one you skip.',
      valid: goal !== undefined,
      body: (
        <ChoiceRow label="Daily practice target" testID="onboarding-step-target" value={goal} onChange={setGoal} choices={[
          { value: 5, label: '5 minutes' },
          { value: 10, label: '10 minutes' },
          { value: 15, label: '15 minutes' },
        ]} />
      ),
    },
  ];
  const stepAt = (index: number): Step => steps[index] ?? steps[0];
  const current = stepAt(step);
  const lastStep = step === STEP_COUNT - 1;
  const stepLabel = `Step ${step + 1} of ${STEP_COUNT}`;
  const finishLabel = recalibrating ? 'Save my practice plan' : 'Build my practice plan';

  function goTo(next: number) {
    setStep(next);
    // Each step is a fresh question. Return to the top without animating so a step
    // reached from a scrolled position (large text, lower options) opens at its heading.
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    // Android reads the new heading through the live region; iOS needs an explicit announcement.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(`Step ${next + 1} of ${STEP_COUNT}. ${stepAt(next).title}`);
  }

  function finish() {
    completeOnboarding({ level, scriptPreference, primaryGoal, responseLanguage, microphoneTested }, goal);
    observe('onboarding_completed');
    router.replace('/');
  }

  function advance() {
    if (!current.valid) return;
    if (lastStep) finish();
    else goTo(step + 1);
  }

  const showCancel = step === 0 && recalibrating;
  const showBack = step > 0;

  return (
    <View style={sharedStyles.screen} testID="onboarding-screen">
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="automatic"
        testID="onboarding-scroll"
        contentContainerStyle={[styles.content, Platform.OS === 'android' && { paddingTop: insets.top + spacing.lg }]}
        style={sharedStyles.screen}
      >
        <View accessibilityLabel={stepLabel} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEP_COUNT, now: step + 1 }} style={[styles.progressRow, largeText && styles.progressRowStacked]} testID="onboarding-progress">
          <View style={styles.progressBrandRow}>
            <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.brandMark}><Text style={styles.brandMarkText}>ब</Text></View>
            {largeText ? <Text style={styles.progressCount}>{step + 1} of {STEP_COUNT}</Text> : null}
          </View>
          <View style={styles.segments}>
            {steps.map((item, index) => (
              <View key={item.key} style={[styles.segment, index < step && styles.segmentDone, index === step && styles.segmentCurrent]} />
            ))}
          </View>
          {largeText ? null : <Text style={styles.progressCount}>{step + 1} of {STEP_COUNT}</Text>}
        </View>

        <MotionReveal key={current.key} mode={motionMode} motionKey={current.key} style={styles.step} testID={`onboarding-step-${current.key}-panel`}>
          <View style={styles.intro}>
            <Text style={sharedStyles.eyebrow}>{recalibrating ? 'Tune your plan' : 'Welcome to Bolo'}</Text>
            <Text accessibilityLiveRegion="polite" accessibilityRole="header" style={styles.heading} testID="onboarding-step-title">{current.title}</Text>
            <Text style={sharedStyles.body}>{current.lead}</Text>
          </View>
          {current.body}
          {current.key === 'script' ? (
            <Text style={styles.note}>English meaning is always shown underneath. Asha’s spoken replies are a separate choice, coming up next.</Text>
          ) : null}
        </MotionReveal>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={[styles.footer, largeText && styles.footerStacked]} testID="onboarding-footer">
        {showCancel ? (
          <Pressable accessibilityLabel="Cancel recalibration" accessibilityRole="button" onPress={() => router.back()} style={[styles.secondaryButton, largeText && styles.secondaryButtonWide]}>
            <X color={colors.ink} size={20} />
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
        ) : null}
        {showBack ? (
          <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => goTo(step - 1)} style={[styles.secondaryButton, largeText && styles.secondaryButtonWide]} testID="onboarding-back">
            <ChevronLeft color={colors.ink} size={22} />
            {largeText ? <Text style={styles.secondaryText}>Back</Text> : null}
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !current.valid }}
          disabled={!current.valid}
          onPress={advance}
          style={[sharedStyles.primaryButton, styles.primaryButton, !current.valid && styles.primaryButtonDisabled]}
          testID="onboarding-continue"
        >
          <Text style={sharedStyles.primaryButtonText}>{lastStep ? finishLabel : 'Continue'}</Text>
          {lastStep ? null : <ArrowRight color={colors.neutralSurfaceText} size={18} />}
        </Pressable>
      </SafeAreaView>
      <StatusBarScrim />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.xl, paddingBottom: spacing.xl, gap: spacing.xl },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  progressRowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  progressBrandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandMark: { minHeight: 44, justifyContent: 'center' },
  brandMarkText: { ...hindiType(30), color: c.brand },
  segments: { flex: 1, flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.line },
  segmentDone: { backgroundColor: c.forest },
  segmentCurrent: { backgroundColor: c.brand },
  progressCount: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  step: { gap: spacing.xl },
  intro: { gap: spacing.sm },
  heading: { color: c.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.3 },
  choices: { gap: spacing.md },
  choice: { minHeight: 54, borderRadius: radius.lg, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, backgroundColor: c.paper, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  choiceSelected: { borderColor: c.forest, backgroundColor: c.successSoft },
  check: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1.5, borderColor: c.inputBorder, alignItems: 'center', justifyContent: 'center' },
  checkSelected: { borderColor: c.forest, backgroundColor: c.forest },
  choiceCopy: { minWidth: 0, flex: 1, gap: 2 },
  choiceLabel: { color: c.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  choiceLabelSelected: { color: c.forestText, fontWeight: '900' },
  choiceDetail: { color: c.muted, fontSize: 13, lineHeight: 18 },
  preview: { marginTop: 2 },
  previewHindi: { ...hindiType(20), color: c.ink },
  previewLatin: { color: c.brandText, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  previewLatinFirst: { color: c.brandText, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  note: { color: c.muted, fontSize: 13, lineHeight: 18 },
  footer: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, backgroundColor: c.background, borderTopWidth: 1, borderTopColor: c.line },
  footerStacked: { flexDirection: 'column-reverse' },
  secondaryButton: { minWidth: 56, minHeight: 52, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md },
  secondaryButtonWide: { minWidth: 0 },
  secondaryText: { color: c.ink, fontSize: 15, fontWeight: '800' },
  primaryButton: { flex: 1 },
  primaryButtonDisabled: { opacity: 0.5 },
}));
