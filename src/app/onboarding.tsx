import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusBarScrim } from '@/components/status-bar-scrim';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { playOfflineSpeech } from '@/lib/offline-voice-player';
import { observe } from '@/lib/observability';
import { useAppState } from '@/state/app-state';
import type { LearnerLevel, LearnerProfile, LearningGoal, ScriptPreference } from '@/state/app-state-types';
import { displayFont, hindiType, makeStyles, maxContentWidth, radius, spacing, useSharedStyles, type, buttons } from '@/theme';

const ashaPortrait = require('../../assets/images/asha-portrait.png');
const NAMASTE_CLIP = 'नमस्ते।';
const SELECTED_ORANGE = '#D8663C';

type OnboardingStep = 'listen' | 'level' | 'goal';
type ReplyId = 'namaste' | 'thanks' | 'bye';

const replies: { id: ReplyId; hi: string; latin: string; en: string; correct: boolean }[] = [
  { id: 'namaste', hi: 'नमस्ते', latin: 'Namaste', en: 'Hello', correct: true },
  { id: 'thanks', hi: 'धन्यवाद', latin: 'Dhanyavaad', en: 'Thank you', correct: false },
  { id: 'bye', hi: 'अलविदा', latin: 'Alvida', en: 'Goodbye', correct: false },
];

const levels: { value: LearnerLevel; label: string; detail: string }[] = [
  { value: 'new', label: 'New to Hindi', detail: 'Start with essential patterns.' },
  { value: 'beginner', label: 'Beginner', detail: 'I know greetings and a few phrases.' },
  { value: 'intermediate', label: 'Intermediate', detail: 'Give me richer real-life situations.' },
];

const scripts: { value: ScriptPreference; label: string }[] = [
  { value: 'both', label: 'Hindi + transliteration' },
  { value: 'devanagari', label: 'Hindi script only' },
  { value: 'latin', label: 'Transliteration first' },
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
            <View style={[styles.mark, selected && styles.markSelected]} />
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
  const steps: OnboardingStep[] = recalibrating ? ['level', 'goal'] : ['listen', 'level', 'goal'];
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex] ?? 'goal';
  const [replayToken, setReplayToken] = useState(0);
  const [reply, setReply] = useState<ReplyId | null>(null);
  const [level, setLevel] = useState<LearnerLevel>(recalibrating ? learnerProfile.level : 'new');
  const [scriptPreference, setScriptPreference] = useState<ScriptPreference>(recalibrating ? learnerProfile.scriptPreference : 'both');
  const [primaryGoal, setPrimaryGoal] = useState<LearningGoal>(recalibrating ? learnerProfile.primaryGoal : 'conversation');
  const heardNamaste = reply === 'namaste';

  useEffect(() => {
    if (step !== 'listen') return undefined;
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

  function finish() {
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
    completeOnboarding(profile, dailyMinutes);
    observe('onboarding_completed');
    router.replace('/');
  }

  function continueForward() {
    if (step === 'listen' && !heardNamaste) return;
    if (stepIndex >= steps.length - 1) {
      finish();
      return;
    }
    setStepIndex((current) => current + 1);
  }

  const stepNumber = stepIndex + 1;
  const onLastStep = stepIndex >= steps.length - 1;
  const continueDisabled = step === 'listen' && !heardNamaste;
  const continueLabel = onLastStep ? (recalibrating ? 'Save my practice plan' : 'Start practicing') : 'Continue';

  return (
    <ScrollView contentContainerStyle={[styles.screen, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]} style={sharedStyles.screen}>
      <View style={styles.column}>
        <View style={styles.header}>
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.brandMark}>ब</Text>
          <Text style={styles.stepLabel}>{recalibrating ? 'Tune your plan' : `Step ${stepNumber} of ${steps.length}`}</Text>
          {recalibrating ? (
            <Pressable accessibilityLabel="Cancel recalibration" accessibilityRole="button" onPress={() => router.back()} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          ) : <View style={styles.cancelSpacer} />}
        </View>

        <View style={styles.body}>
          {step === 'listen' ? (
            <View style={styles.stack}>
              <Text accessibilityRole="header" style={styles.heading}>Hear this</Text>
              <Text accessibilityLanguage="hi-IN" style={styles.hindi}>नमस्ते</Text>
              <Text style={styles.latin}>Namaste</Text>
              <Text style={sharedStyles.body}>Saved in the app. No connection and no microphone.</Text>
              <Pressable accessibilityLabel="Hear नमस्ते again" accessibilityRole="button" onPress={() => setReplayToken((current) => current + 1)} style={styles.hearButton} testID="onboarding-hear-again">
                <Text style={styles.hearText}>Hear it again</Text>
              </Pressable>
              <Text style={styles.prompt}>Which reply fits?</Text>
              <ChoiceRow
                choices={replies.map((item) => ({ detail: `${item.latin}, ${item.en}`, hindi: true, label: item.hi, value: item.id }))}
                label="Reply to नमस्ते"
                onChange={setReply}
                testIDFor={(choice) => choice.value === 'namaste' ? 'onboarding-reply-namaste' : undefined}
                value={reply}
              />
              {reply && !heardNamaste ? <Text accessibilityLiveRegion="polite" style={styles.miss}>Listen again — नमस्ते is hello.</Text> : null}
            </View>
          ) : null}

          {step === 'level' ? (
            <View style={styles.stack}>
              <Text accessibilityRole="header" style={styles.heading}>Where are you starting?</Text>
              <Text style={sharedStyles.body}>This tunes the first lessons. You can change it later.</Text>
              <ChoiceRow choices={levels} label="Hindi level" onChange={setLevel} value={level} />
              <Text accessibilityRole="header" style={styles.subheading}>How should Hindi appear?</Text>
              <ChoiceRow choices={scripts} label="Hindi script preference" onChange={setScriptPreference} value={scriptPreference} />
            </View>
          ) : null}

          {step === 'goal' ? (
            <View style={styles.stack}>
              <View style={styles.ashaRow}>
                <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.asha} transition={0} />
                <View style={styles.ashaCopy}>
                  <Text accessibilityRole="header" style={styles.heading}>Meet Asha</Text>
                  <Text style={sharedStyles.body}>Asha is your voice tutor. When you are ready, she practices these lines out loud with you.</Text>
                </View>
              </View>
              <Text accessibilityRole="header" style={styles.subheading}>What matters most?</Text>
              <ChoiceRow choices={goals} label="Learning goal" onChange={setPrimaryGoal} value={primaryGoal} />
            </View>
          ) : null}
        </View>

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
  choiceSelected: { backgroundColor: '#F8E6DE', borderColor: SELECTED_ORANGE },
  mark: { borderColor: c.lineStrong, borderRadius: radius.pill, borderWidth: 1.5, height: 18, width: 18 },
  markSelected: { backgroundColor: SELECTED_ORANGE, borderColor: SELECTED_ORANGE },
  choiceCopy: { flex: 1, gap: 2, minWidth: 0 },
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
