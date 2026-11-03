import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SayItAloud, type SayItAloudPhase } from '@/components/say-it-aloud';
import { StatusBarScrim } from '@/components/status-bar-scrim';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { playOfflineSpeech } from '@/lib/offline-voice-player';
import { observe } from '@/lib/observability';
import { useAppState } from '@/state/app-state';
import type { LearnerLevel, LearnerProfile, LearningGoal, ScriptPreference } from '@/state/app-state-types';
import { hindiType, makeStyles, maxContentWidth, radius, spacing, useSharedStyles, type, buttons } from '@/theme';

const ashaPortrait = require('../../assets/images/asha-portrait.png');
const NAMASTE_CLIP = 'नमस्ते।';

// Two steps for a new learner: say a first word, then a plan that already has sensible defaults.
type OnboardingStep = 'speak' | 'plan';

const levels: { value: LearnerLevel; label: string; detail: string }[] = [
  { value: 'new', label: 'New to Hindi', detail: 'Start with essential patterns.' },
  { value: 'beginner', label: 'Beginner', detail: 'I know greetings and a few phrases.' },
  { value: 'intermediate', label: 'Intermediate', detail: 'Give me richer real-life situations.' },
];

const goals: { value: LearningGoal; label: string }[] = [
  { value: 'conversation', label: 'Everyday conversation' },
  { value: 'travel', label: 'Travel' },
  { value: 'family', label: 'Family and friends' },
  { value: 'work', label: 'Work' },
];

type Choice<T extends string> = { detail?: string; hindi?: boolean; label: string; value: T };

function ChoiceRow<T extends string>({ choices, label, onChange, testIDFor, value }: {
  choices: Choice<T>[];
  label: string;
  onChange: (value: T) => void;
  testIDFor?: (choice: Choice<T>) => string | undefined;
  value: T | null;
}) {
  const styles = useStyles();
  return (
    <View accessibilityLabel={label} accessibilityRole="radiogroup" style={styles.choices}>
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            accessibilityLabel={choice.detail ? `${choice.label}, ${choice.detail}` : choice.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(choice.value)}
            style={[styles.choice, selected && styles.choiceSelected]}
            testID={testIDFor?.(choice)}
          >
            <View style={[styles.mark, selected && styles.markSelected]}>{selected ? <Text style={styles.markCheck}>✓</Text> : null}</View>
            <View style={styles.choiceCopy}>
              <Text style={[styles.choiceLabel, choice.hindi && styles.choiceHindi]}>{choice.label}</Text>
              {choice.detail ? <Text style={styles.choiceDetail}>{choice.detail}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { completeOnboarding, goal: savedGoal, learnerProfile } = useAppState();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const recalibrating = mode === 'recalibrate' && learnerProfile.completed;
  const steps: OnboardingStep[] = recalibrating ? ['plan'] : ['speak', 'plan'];
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex] ?? 'plan';
  const [replayToken, setReplayToken] = useState(0);
  const [sayPhase, setSayPhase] = useState<SayItAloudPhase>('idle');
  // Said it, or chose to say it later: either way the learner moves on.
  const [spoken, setSpoken] = useState(false);
  const [level, setLevel] = useState<LearnerLevel>(recalibrating ? learnerProfile.level : 'new');
  // How Hindi appears is a Settings choice; setup keeps the default so nothing stands between the learner and Asha.
  const scriptPreference: ScriptPreference = recalibrating ? learnerProfile.scriptPreference : 'both';
  const [primaryGoal, setPrimaryGoal] = useState<LearningGoal>(recalibrating ? learnerProfile.primaryGoal : 'conversation');
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (step !== 'speak') return undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        await playOfflineSpeech(NAMASTE_CLIP, controller.signal);
      } catch {
        // The clip is bundled. A playback failure still leaves the replies on screen.
      }
    })();
    return () => controller.abort();
  }, [replayToken, step]);

  async function finish() {
    if (saving) return;
    setSaving(true);
    setSaveFailed(false);
    const profile: Omit<LearnerProfile, 'completed'> = {
      ...(learnerProfile.displayName?.trim() ? { displayName: learnerProfile.displayName.trim() } : {}),
      ...(learnerProfile.phrasePlaybackRate !== undefined ? { phrasePlaybackRate: learnerProfile.phrasePlaybackRate } : {}),
      level,
      scriptPreference,
      primaryGoal,
      responseLanguage: recalibrating ? learnerProfile.responseLanguage : 'en',
      microphoneTested: recalibrating ? learnerProfile.microphoneTested : false,
    };
    const dailyMinutes = recalibrating && (savedGoal === 5 || savedGoal === 10 || savedGoal === 15) ? savedGoal : 10;
    // Leave only once the completed profile is stored. A failed write rolls the
    // state back, and navigating first would bounce the learner back into setup.
    const saved = await completeOnboarding(profile, dailyMinutes).catch(() => false);
    // The screen may have been left meanwhile; nothing navigates or updates after that.
    if (!mountedRef.current) return;
    if (!saved) {
      setSaving(false);
      setSaveFailed(true);
      return;
    }
    observe('onboarding_completed');
    router.replace('/');
  }

  function continueForward() {
    if (step === 'speak' && !spoken) return;
    if (stepIndex >= steps.length - 1) {
      void finish();
      return;
    }
    setStepIndex((current) => current + 1);
  }

  const stepNumber = stepIndex + 1;
  const onLastStep = stepIndex >= steps.length - 1;
  const continueDisabled = (step === 'speak' && !spoken) || saving;
  const continueLabel = onLastStep ? (recalibrating ? 'Save my practice plan' : 'Start practicing') : 'Continue';

  return (
    <ScrollView contentContainerStyle={[styles.screen, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]} style={sharedStyles.screen}>
      <View style={styles.column}>
        <View style={styles.header}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.brandMark}>ब</Text>
          <Text style={styles.stepLabel}>{recalibrating ? 'Tune your plan' : `Step ${stepNumber} of ${steps.length}`}</Text>
          {recalibrating ? (
            <Pressable accessibilityLabel="Cancel recalibration" accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => router.back()} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          ) : <View style={styles.cancelSpacer} />}
        </View>

        <View style={styles.body}>
          {step === 'speak' ? (
            <View style={styles.stack}>
              <View style={styles.ashaRow}>
                <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.asha} transition={0} />
                <View style={styles.ashaCopy}>
                  <Text accessibilityRole="header" style={styles.heading}>Say namaste</Text>
                  <Text style={sharedStyles.body}>Asha says it first. Then it’s your turn, out loud. She’ll wait.</Text>
                </View>
              </View>
              <Text accessibilityLanguage="hi-IN" style={styles.hindi}>नमस्ते</Text>
              <Text style={styles.latin}>Namaste · hello</Text>
              <Pressable accessibilityLabel="Hear नमस्ते again" accessibilityRole="button" onPress={() => setReplayToken((current) => current + 1)} style={styles.hearButton} testID="onboarding-hear-again">
                <Text style={styles.hearText}>Hear it again</Text>
              </Pressable>
              <SayItAloud onHeard={() => setSpoken(true)} onPhase={setSayPhase} onSkip={() => { setSpoken(true); setSayPhase('idle'); setStepIndex((current) => current + 1); }} phase={sayPhase} />
              <Text style={styles.miss}>Your voice stays on this phone. Nothing is uploaded here.</Text>
            </View>
          ) : null}

          {step === 'plan' ? (
            <View style={styles.stack}>
              <Text accessibilityRole="header" style={styles.heading}>{recalibrating ? 'Tune your plan' : 'Your plan'}</Text>
              <Text style={sharedStyles.body}>{recalibrating ? 'Change what Asha focuses on.' : 'These are set for a fresh start. Change them now or any time in Settings.'}</Text>
              <Text accessibilityRole="header" style={styles.subheading}>Where are you starting?</Text>
              <ChoiceRow choices={levels} label="Hindi level" onChange={setLevel} value={level} />
              <Text accessibilityRole="header" style={styles.subheading}>What matters most?</Text>
              <ChoiceRow choices={goals} label="Learning goal" onChange={setPrimaryGoal} value={primaryGoal} />
            </View>
          ) : null}
        </View>

        {saveFailed ? <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.saveError} testID="onboarding-save-error">{"Couldn't save your setup. Try again."}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: continueDisabled }}
          disabled={continueDisabled}
          onPress={continueForward}
          style={[styles.continueButton, continueDisabled && styles.continueDisabled]}
          testID={onLastStep ? 'onboarding-start' : 'onboarding-continue'}
        >
          <Text style={styles.continueText}>{continueLabel}</Text>
        </Pressable>
      </View>
      <StatusBarScrim />
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flexGrow: 1 },
  column: {
    alignSelf: 'center',
    flexGrow: 1,
    gap: spacing.lg,
    maxWidth: maxContentWidth,
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  brandMark: { ...hindiType(28), color: c.brand },
  stepLabel: { ...type.eyebrow, color: c.brandText },
  cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  cancelText: { ...type.label, color: c.ink },
  cancelSpacer: { width: 64 },
  body: { flex: 1, justifyContent: 'center' },
  stack: { gap: spacing.md },
  heading: { ...type.display, color: c.ink },
  subheading: { ...type.title, color: c.ink, marginTop: spacing.sm },
  hindi: { ...hindiType(56), color: c.ink },
  latin: { ...type.bodyLarge, color: c.brandText },
  prompt: { ...type.label, color: c.ink, marginTop: spacing.sm, fontWeight: '700' },
  hearButton: { ...buttons.secondary, alignSelf: 'flex-start', minHeight: 44 },
  hearText: buttons.secondaryText,
  miss: { ...type.caption, color: c.muted },
  saveError: { ...type.caption, color: c.danger, textAlign: 'center' },
  choices: { gap: spacing.sm },
  choice: {
    alignItems: 'center',
    backgroundColor: c.paperRaised,
    borderColor: c.line,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  choiceSelected: { borderColor: c.ink, borderWidth: 2 },
  mark: { alignItems: 'center', justifyContent: 'center', borderColor: c.lineStrong, borderRadius: radius.pill, borderWidth: 1.5, height: 22, width: 22 },
  markSelected: { backgroundColor: c.ink, borderColor: c.ink },
  markCheck: { ...type.caption, color: c.white, fontWeight: '700' },
  choiceCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  choiceLabel: { ...type.label, color: c.ink, fontWeight: '700' },
  choiceHindi: { ...hindiType(20) },
  choiceDetail: { ...type.caption, color: c.muted },
  ashaRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  asha: { backgroundColor: c.brandSoft, borderColor: c.gold, borderRadius: radius.pill, borderWidth: 2, height: 72, width: 72 },
  ashaCopy: { flex: 1, gap: spacing.sm, minWidth: 0 },
  continueButton: buttons.primary,
  continueDisabled: { opacity: 0.45 },
  continueText: buttons.primaryText,
}));
