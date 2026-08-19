import { Check, Eye, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

type PracticeResult = 'correct' | 'incorrect';

type Props = {
  disabled?: boolean;
  targetHi: string;
  targetLatin: string;
  targetEn: string;
  onResolve: (result: PracticeResult) => void;
};

/**
 * Recall-then-reveal is a silent memory check: the learner reads the English
 * meaning, silently retrieves the Hindi in their head, taps Reveal to see the
 * answer, then honestly self-grades with Got it or Needs work. The two grades
 * map directly to the runtime's existing correct/incorrect scoring so weak
 * phrases still queue up and audio playback still triggers the same feedback.
 *
 * No speech, no network, no timers — every learner can finish it offline.
 *
 * There is no reset effect here: the scene runtime remounts this component with
 * a per-beat `key`, so a new or resumed beat always opens with the answer hidden.
 */
export function RecallRevealPractice({ disabled = false, targetHi, targetLatin, targetEn, onResolve }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<'building' | PracticeResult>('building');

  const locked = disabled || status !== 'building';

  function reveal() {
    if (locked || revealed) return;
    hapticSelect();
    setRevealed(true);
  }

  function grade(result: PracticeResult) {
    if (locked || !revealed) return;
    if (result === 'correct') hapticSuccess();
    else hapticWarning();
    setStatus(result);
    onResolve(result);
  }

  return (
    <View testID="scene-recall-reveal" style={styles.container}>
      <Text accessibilityRole="header" style={styles.instructions}>
        Silently rebuild the Hindi from memory, then tap Reveal to check yourself.
      </Text>
      <View style={styles.promptCard}>
        <Text style={styles.promptEyebrow}>English</Text>
        <Text style={styles.promptText}>{targetEn}</Text>
      </View>
      {revealed ? (
        <View
          accessibilityLabel={`Answer revealed. ${targetHi}. ${targetLatin}.`}
          accessibilityLiveRegion="polite"
          style={styles.answerCard}
          testID="scene-recall-reveal-answer"
        >
          <Text style={styles.answerEyebrow}>Hindi</Text>
          <Text style={styles.answerHindi}>{targetHi}</Text>
          <Text style={styles.answerLatin}>{targetLatin}</Text>
        </View>
      ) : (
        <View style={styles.hiddenCard} testID="scene-recall-reveal-hidden">
          <Text style={styles.hiddenText}>Answer hidden — say it in your head first.</Text>
        </View>
      )}
      {!revealed ? (
        <Pressable
          accessibilityLabel="Reveal the Hindi answer"
          accessibilityRole="button"
          accessibilityState={{ disabled: locked }}
          disabled={locked}
          onPress={reveal}
          style={[styles.primary, locked && styles.disabled]}
          testID="scene-recall-reveal-show"
        >
          <Eye color={colors.white} size={16} />
          <Text style={styles.primaryText}>Reveal answer</Text>
        </Pressable>
      ) : (
        <View style={styles.gradeRow}>
          <Pressable
            accessibilityHint="Scores this beat as needs practice and moves on."
            accessibilityLabel="Needs work"
            accessibilityRole="button"
            accessibilityState={{ disabled: locked }}
            disabled={locked}
            onPress={() => grade('incorrect')}
            style={[styles.gradeWrong, locked && styles.disabled]}
            testID="scene-recall-reveal-needs-work"
          >
            <X color={colors.danger} size={16} />
            <Text style={styles.gradeWrongText}>Needs work</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Scores this beat as correct and moves on."
            accessibilityLabel="Got it"
            accessibilityRole="button"
            accessibilityState={{ disabled: locked }}
            disabled={locked}
            onPress={() => grade('correct')}
            style={[styles.gradeRight, locked && styles.disabled]}
            testID="scene-recall-reveal-got-it"
          >
            <Check color={colors.white} size={16} />
            <Text style={styles.gradeRightText}>Got it</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.footer}>Grade yourself honestly — Needs work marks this phrase for extra practice.</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { gap: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous', borderColor: c.brand, borderWidth: 1, backgroundColor: c.brandSoft, padding: spacing.lg },
  instructions: { color: c.brandText, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  promptCard: { padding: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderWidth: 1, borderColor: c.line, gap: spacing.xs },
  promptEyebrow: { color: c.brandText, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  promptText: { color: c.ink, fontSize: 20, lineHeight: 27, fontWeight: '900' },
  hiddenCard: { padding: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.paper, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
  hiddenText: { color: c.muted, fontSize: 14, lineHeight: 20, fontStyle: 'italic', textAlign: 'center' },
  answerCard: { padding: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.night, gap: spacing.xs },
  answerEyebrow: { color: c.heroSubtle, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  answerHindi: { color: c.white, fontSize: 22, lineHeight: 29, fontWeight: '900' },
  answerLatin: { color: c.heroSubtle, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  primary: { minHeight: 48, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  primaryText: { color: c.white, fontSize: 15, fontWeight: '900' },
  gradeRow: { flexDirection: 'row', gap: spacing.sm },
  gradeWrong: { minHeight: 48, flex: 1, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  gradeWrongText: { color: c.danger, fontSize: 15, fontWeight: '900' },
  gradeRight: { minHeight: 48, flex: 1, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.success, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  gradeRightText: { color: c.white, fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  footer: { color: c.muted, fontSize: 13, lineHeight: 18 },
}));
