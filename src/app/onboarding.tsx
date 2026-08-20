import { AudioModule } from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BookOpenText, Check, Languages, Mic, Route, Sparkles, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JournalDisplay, JournalKicker } from '@/components/journal-chrome';
import { MotionReveal } from '@/components/motion';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { selectNextLesson } from '@/lib/learning';
import { observe } from '@/lib/observability';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import type { LearnerLevel, LearningGoal, AshaResponseLanguage, ScriptPreference } from '@/state/app-state-types';
import { makeStyles, radius, spacing, useSharedStyles, useTheme } from '@/theme';

type Choice<T extends string | number> = { label: string; value: T; detail?: string };

const levelLabels: Record<LearnerLevel, string> = {
  new: 'New to Hindi',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
};

const goalLabels: Record<LearningGoal, string> = {
  conversation: 'Everyday conversation',
  travel: 'Travel',
  family: 'Family and friends',
  work: 'Work',
};

const stepKickers = [
  'WHERE YOU START',
  'HOW HINDI APPEARS',
  'WHAT MATTERS MOST',
  'HOW ASHA REPLIES',
  'YOUR DAILY RHYTHM',
  'YOUR VOICE',
  'YOUR GARDEN STARTS HERE',
];

const totalSteps = stepKickers.length;
const microphoneStep = 5;
const previewStep = 6;

function ChoiceRow<T extends string | number>({ choices, label, onChange, value }: {
  choices: Choice<T>[];
  label: string;
  onChange: (value: T) => void;
  value: T;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View accessibilityLabel={label} accessibilityRole="radiogroup" style={styles.choices}>
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            accessibilityLabel={choice.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(choice.value)}
            style={[styles.choice, selected && styles.choiceSelected]}
          >
            <View style={[styles.check, selected && styles.checkSelected]}>{selected ? <Check color={colors.white} size={15} /> : null}</View>
            <View style={styles.choiceCopy}>
              <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{choice.label}</Text>
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
  const { completeOnboarding, goal: savedGoal, learnerProfile, motionPreference = DEFAULT_MOTION_PREFERENCE, sceneProgress } = useAppState();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const { mode: motionMode } = useMotionPreference(motionPreference);
  const recalibrating = mode === 'recalibrate' && learnerProfile.completed;
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<LearnerLevel>(recalibrating ? learnerProfile.level : 'new');
  const [scriptPreference, setScriptPreference] = useState<ScriptPreference>(recalibrating ? learnerProfile.scriptPreference : 'both');
  const [primaryGoal, setPrimaryGoal] = useState<LearningGoal>(recalibrating ? learnerProfile.primaryGoal : 'conversation');
  const [responseLanguage, setResponseLanguage] = useState<AshaResponseLanguage>(recalibrating ? learnerProfile.responseLanguage : 'en');
  const [goal, setGoal] = useState<5 | 10 | 15>(recalibrating ? savedGoal : 10);
  const [microphoneTested, setMicrophoneTested] = useState(recalibrating ? learnerProfile.microphoneTested : false);
  const [microphoneStatus, setMicrophoneStatus] = useState('You can test this later in live practice.');
  const heading = step === previewStep
    ? recalibrating ? 'Your tuned plan' : 'Your garden starts here'
    : recalibrating ? 'Recalibrate without losing your choices' : 'Your Hindi plan in one minute';
  const preview = useMemo(
    () => selectNextLesson(
      { completed: true, level, scriptPreference, primaryGoal, responseLanguage, microphoneTested },
      sceneProgress ?? {},
    ),
    [level, microphoneTested, primaryGoal, responseLanguage, sceneProgress, scriptPreference],
  );

  async function testMicrophone() {
    const current = await AudioModule.getRecordingPermissionsAsync();
    const permission = current.granted ? current : await AudioModule.requestRecordingPermissionsAsync();
    setMicrophoneTested(true);
    setMicrophoneStatus(permission.granted ? 'Microphone ready.' : 'Microphone access is off. Typed and written practice still work.');
  }

  function finish() {
    completeOnboarding({ level, scriptPreference, primaryGoal, responseLanguage, microphoneTested }, goal);
    observe('onboarding_completed');
    router.replace('/');
  }

  return (
    <View style={sharedStyles.screen}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          Platform.OS === 'android' && { paddingTop: insets.top + spacing.lg },
        ]}
        testID="onboarding-scroll"
      >
        <View style={styles.onboardingHeader}>
          <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.brandMark}><Text style={styles.brandMarkText}>ब</Text></View>
          {recalibrating ? (
            <Pressable accessibilityLabel="Cancel recalibration" accessibilityRole="button" onPress={() => router.back()} style={styles.cancelButton}>
              <X color={colors.ink} size={20} />
            </Pressable>
          ) : null}
        </View>

        <View
          accessibilityLabel={`Step ${step + 1} of ${totalSteps}`}
          accessibilityRole="progressbar"
          accessibilityValue={{ now: step + 1, min: 1, max: totalSteps }}
          style={styles.progress}
          testID="onboarding-progress"
        >
          {stepKickers.map((kicker, index) => (
            <View key={kicker} style={[styles.dot, index <= step && styles.dotReached, index === step && styles.dotActive]} />
          ))}
        </View>

        <MotionReveal mode={motionMode} motionKey={step} style={styles.stepBody} testID="onboarding-step">
          <View style={styles.intro}>
            <JournalKicker>{stepKickers[step]!}</JournalKicker>
            <JournalDisplay style={styles.heading}>{heading}</JournalDisplay>
            {step === 0 ? <Text style={sharedStyles.body}>Choose how you want to learn. You can change these preferences later.</Text> : null}
          </View>

          {step === 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionTitle}><Sparkles color={colors.brandDark} size={20} /><Text style={styles.title}>Where are you starting?</Text></View>
              <ChoiceRow label="Hindi level" value={level} onChange={setLevel} choices={[
                { value: 'new', label: 'New to Hindi', detail: 'Start with essential patterns.' },
                { value: 'beginner', label: 'Beginner', detail: 'I know greetings and a few phrases.' },
                { value: 'intermediate', label: 'Intermediate', detail: 'Give me richer real-life situations.' },
              ]} />
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.section}>
              <View style={styles.sectionTitle}><BookOpenText color={colors.brandDark} size={20} /><Text style={styles.title}>How should Hindi appear?</Text></View>
              <ChoiceRow label="Hindi script preference" value={scriptPreference} onChange={setScriptPreference} choices={[
                { value: 'both', label: 'Hindi + transliteration' },
                { value: 'devanagari', label: 'Hindi script only' },
                { value: 'latin', label: 'Transliteration first' },
              ]} />
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.section}>
              <View style={styles.sectionTitle}><Route color={colors.brandDark} size={20} /><Text style={styles.title}>What matters most?</Text></View>
              <ChoiceRow label="Learning goal" value={primaryGoal} onChange={setPrimaryGoal} choices={[
                { value: 'conversation', label: 'Everyday conversation' },
                { value: 'travel', label: 'Travel' },
                { value: 'family', label: 'Family and friends' },
                { value: 'work', label: 'Work' },
              ]} />
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.section}>
              <View style={styles.sectionTitle}><Languages color={colors.brandDark} size={20} /><Text style={styles.title}>Asha’s replies</Text></View>
              <ChoiceRow label="Asha response language" value={responseLanguage} onChange={setResponseLanguage} choices={[
                { value: 'en', label: 'English first' },
                { value: 'hi', label: 'Hindi first' },
              ]} />
            </View>
          ) : null}

          {step === 4 ? (
            <View style={styles.section}>
              <Text style={styles.title}>Daily practice target</Text>
              <ChoiceRow label="Daily practice target" value={goal} onChange={setGoal} choices={[
                { value: 5, label: '5 minutes' },
                { value: 10, label: '10 minutes' },
                { value: 15, label: '15 minutes' },
              ]} />
            </View>
          ) : null}

          {step === microphoneStep ? (
            <View style={styles.section}>
              <View style={styles.sectionTitle}><Mic color={colors.brandDark} size={20} /><Text style={styles.title}>Optional microphone check</Text></View>
              <Text style={styles.detail}>Bolo only asks after you tap. Voice is optional, and no recording begins during this check.</Text>
              <Pressable accessibilityRole="button" onPress={() => void testMicrophone()} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>{microphoneTested ? 'Check again' : 'Check microphone access'}</Text>
              </Pressable>
              <Text accessibilityLiveRegion="polite" style={styles.status}>{microphoneStatus}</Text>
            </View>
          ) : null}

          {step === previewStep ? (
            <View style={styles.section} testID="onboarding-preview">
              <JournalKicker>{preview.pathKicker}</JournalKicker>
              <Text style={styles.previewFocus}>{goalLabels[primaryGoal]} · {levelLabels[level]}</Text>
              <View style={styles.previewPlan}>
                <Text style={styles.title}>{preview.plan.title}</Text>
                <Text style={styles.detail}>{preview.action === 'Continue' ? 'Continue lesson' : preview.action === 'Review lesson' ? 'Review lesson' : 'First lesson'} · {preview.title}</Text>
              </View>
              <Text style={styles.detail}>{preview.why}</Text>
              <View style={styles.previewMinutes}><Text style={styles.previewMinutesText}>{goal} minutes a day</Text></View>
            </View>
          ) : null}
        </MotionReveal>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.md }]}>
        {step > 0 ? (
          <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={() => setStep((current) => current - 1)} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null}
        {step === previewStep ? (
          <Pressable accessibilityRole="button" onPress={finish} style={[sharedStyles.primaryButton, styles.footerAction]}>
            <Text style={sharedStyles.primaryButtonText}>{recalibrating ? 'Save my practice plan' : 'Build my practice plan'}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setStep((current) => current + 1)} style={[styles.nextButton, styles.footerAction]}>
            <Text style={styles.nextText}>{step === microphoneStep ? 'Skip' : 'Next'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg },
  onboardingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandMark: { width: 64, height: 64, borderRadius: 22, borderCurve: 'continuous', backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: c.white, fontSize: 34, fontWeight: '900' },
  cancelButton: { width: 44, height: 44, borderRadius: radius.pill, borderColor: c.line, borderWidth: 1, backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: c.line },
  dotReached: { backgroundColor: c.forestSoft },
  dotActive: { width: 26, backgroundColor: c.forest },
  stepBody: { gap: spacing.lg },
  intro: { gap: spacing.sm },
  heading: { color: c.ink, fontSize: 28, lineHeight: 34 },
  section: { backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flexShrink: 1, color: c.ink, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  choices: { gap: spacing.sm },
  choice: { minHeight: 54, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, backgroundColor: c.background, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  choiceSelected: { borderColor: c.forest, backgroundColor: c.successSoft },
  check: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
  checkSelected: { borderColor: c.forest, backgroundColor: c.forest },
  choiceCopy: { minWidth: 0, flex: 1, gap: 2 },
  choiceLabel: { color: c.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  choiceLabelSelected: { color: c.forestText, fontWeight: '900' },
  choiceDetail: { color: c.muted, fontSize: 13, lineHeight: 18 },
  detail: { color: c.muted, fontSize: 14, lineHeight: 20 },
  secondaryButton: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  secondaryText: { color: c.forestText, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  status: { color: c.muted, fontSize: 13, lineHeight: 18 },
  previewFocus: { color: c.brandText, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  previewPlan: { borderTopColor: c.line, borderTopWidth: 1, paddingTop: spacing.md, gap: spacing.xs },
  previewMinutes: { alignSelf: 'flex-start', borderRadius: radius.pill, backgroundColor: c.goldSoft, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  previewMinutesText: { color: c.forestText, fontSize: 13, fontWeight: '900' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopColor: c.line, borderTopWidth: 1, backgroundColor: c.background, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  footerAction: { minWidth: 0, flex: 1 },
  backButton: { minHeight: 52, minWidth: 96, borderRadius: radius.md, borderCurve: 'continuous', borderColor: c.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  backText: { color: c.ink, fontSize: 16, fontWeight: '800' },
  nextButton: { minHeight: 52, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  nextText: { color: c.white, fontSize: 16, fontWeight: '800' },
}));
