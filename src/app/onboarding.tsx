import { AudioModule } from 'expo-audio';
import { useRouter } from 'expo-router';
import { BookOpenText, Check, Languages, Mic, Route, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppState } from '@/state/app-state';
import { observe } from '@/lib/observability';
import type { LearnerLevel, LearningGoal, MiraResponseLanguage, ScriptPreference } from '@/state/app-state-types';
import { colors, radius, sharedStyles, spacing } from '@/theme';

type Choice<T extends string | number> = { label: string; value: T; detail?: string };

function ChoiceRow<T extends string | number>({ choices, label, onChange, value }: {
  choices: Choice<T>[];
  label: string;
  onChange: (value: T) => void;
  value: T;
}) {
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
  const { completeOnboarding } = useAppState();
  const [level, setLevel] = useState<LearnerLevel>('new');
  const [scriptPreference, setScriptPreference] = useState<ScriptPreference>('both');
  const [primaryGoal, setPrimaryGoal] = useState<LearningGoal>('conversation');
  const [responseLanguage, setResponseLanguage] = useState<MiraResponseLanguage>('en');
  const [goal, setGoal] = useState<5 | 10 | 15>(10);
  const [microphoneTested, setMicrophoneTested] = useState(false);
  const [microphoneStatus, setMicrophoneStatus] = useState('You can test this later in live practice.');

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
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <View style={styles.brandMark}><Text style={styles.brandMarkText}>ब</Text></View>
      <View style={styles.intro}>
        <Text style={sharedStyles.eyebrow}>Welcome to Bolo</Text>
        <Text style={styles.heading}>Your Hindi plan in one minute</Text>
        <Text style={sharedStyles.body}>Choose how you want to learn. You can change these preferences later.</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitle}><Sparkles color={colors.brandDark} size={20} /><Text style={styles.title}>Where are you starting?</Text></View>
        <ChoiceRow label="Hindi level" value={level} onChange={setLevel} choices={[
          { value: 'new', label: 'New to Hindi', detail: 'Start with essential patterns.' },
          { value: 'beginner', label: 'Beginner', detail: 'I know greetings and a few phrases.' },
          { value: 'intermediate', label: 'Intermediate', detail: 'Give me richer real-life situations.' },
        ]} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitle}><BookOpenText color={colors.brandDark} size={20} /><Text style={styles.title}>How should Hindi appear?</Text></View>
        <ChoiceRow label="Hindi script preference" value={scriptPreference} onChange={setScriptPreference} choices={[
          { value: 'both', label: 'Hindi + transliteration' },
          { value: 'devanagari', label: 'Hindi script only' },
          { value: 'latin', label: 'Transliteration first' },
        ]} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitle}><Route color={colors.brandDark} size={20} /><Text style={styles.title}>What matters most?</Text></View>
        <ChoiceRow label="Learning goal" value={primaryGoal} onChange={setPrimaryGoal} choices={[
          { value: 'conversation', label: 'Everyday conversation' },
          { value: 'travel', label: 'Travel' },
          { value: 'family', label: 'Family and friends' },
          { value: 'work', label: 'Work' },
        ]} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitle}><Languages color={colors.brandDark} size={20} /><Text style={styles.title}>Mira’s replies</Text></View>
        <ChoiceRow label="Mira response language" value={responseLanguage} onChange={setResponseLanguage} choices={[
          { value: 'en', label: 'English first' },
          { value: 'hi', label: 'Hindi first' },
        ]} />
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Daily practice target</Text>
        <ChoiceRow label="Daily practice target" value={goal} onChange={setGoal} choices={[
          { value: 5, label: '5 minutes' },
          { value: 10, label: '10 minutes' },
          { value: 15, label: '15 minutes' },
        ]} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionTitle}><Mic color={colors.brandDark} size={20} /><Text style={styles.title}>Optional microphone check</Text></View>
        <Text style={styles.detail}>Bolo only asks after you tap. Voice is optional, and no recording begins during this check.</Text>
        <Pressable accessibilityRole="button" onPress={() => void testMicrophone()} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>{microphoneTested ? 'Check again' : 'Check microphone access'}</Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.status}>{microphoneStatus}</Text>
      </View>

      <Pressable accessibilityRole="button" onPress={finish} style={sharedStyles.primaryButton}>
        <Text style={sharedStyles.primaryButtonText}>Build my practice plan</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.xl },
  brandMark: { width: 64, height: 64, borderRadius: 22, borderCurve: 'continuous', backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.white, fontSize: 34, fontWeight: '900' },
  intro: { gap: spacing.sm },
  heading: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: '900' },
  section: { ...sharedStyles.card, gap: spacing.md },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flexShrink: 1, color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  choices: { gap: spacing.sm },
  choice: { minHeight: 54, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.background, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  choiceSelected: { borderColor: colors.forest, backgroundColor: '#EBF6F1' },
  check: { width: 24, height: 24, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkSelected: { borderColor: colors.forest, backgroundColor: colors.forest },
  choiceCopy: { minWidth: 0, flex: 1, gap: 2 },
  choiceLabel: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  choiceLabelSelected: { color: colors.forest, fontWeight: '900' },
  choiceDetail: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  detail: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  secondaryButton: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  secondaryText: { color: colors.forest, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  status: { color: colors.muted, fontSize: 13, lineHeight: 18 },
});
