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
          <Eye color={colors.ink} size={16} />
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
            <Check color={colors.forestText} size={16} />
            <Text style={styles.gradeRightText}>Got it</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.footer}>Grade yourself honestly — Needs work marks this phrase for extra practice.</Text>
    </View>
  );
}

const SERIF = 'Georgia';

const useStyles = makeStyles((c) => ({
  container: { gap: spacing.md },
  instructions: { color: c.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  promptCard: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 18, borderCurve: 'continuous', backgroundColor: c.background, gap: 2 },
  promptEyebrow: { color: c.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  promptText: { color: c.ink, fontFamily: SERIF, fontSize: 20, lineHeight: 27, fontWeight: '700' },
  hiddenCard: { minHeight: 64, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 18, borderCurve: 'continuous', backgroundColor: c.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center' },
  hiddenText: { color: c.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  answerCard: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: 18, borderCurve: 'continuous', backgroundColor: c.brandSoft, gap: 2 },
  answerEyebrow: { color: c.brandText, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  answerHindi: { color: c.ink, fontFamily: SERIF, fontSize: 22, lineHeight: 30, fontWeight: '700' },
  answerLatin: { color: c.brandText, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  primary: { minHeight: 52, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg },
  primaryText: { color: c.ink, fontSize: 16, fontWeight: '600' },
  gradeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gradeWrong: { minHeight: 52, flexGrow: 1, flexBasis: 140, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.dangerSoft, borderWidth: 2, borderColor: c.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  gradeWrongText: { color: c.danger, fontSize: 15, fontWeight: '700' },
  gradeRight: { minHeight: 52, flexGrow: 1, flexBasis: 140, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.successSoft, borderWidth: 2, borderColor: c.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  gradeRightText: { color: c.forestText, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  footer: { color: c.muted, fontSize: 13, lineHeight: 18 },
}));
