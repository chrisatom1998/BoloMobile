import { Check, Volume1, Volume2, X } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import type { ScriptPreference } from '@/state/app-state-types';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { hindiType, makeStyles, radius, spacing, useTheme, type } from '@/theme';

type Props = {
  audioDisabled?: boolean;
  disabled?: boolean;
  scriptPreference?: ScriptPreference;
  slowRate: number;
  targetHi: string;
  targetLatin: string;
  targetEn: string;
  onPlay: (playbackRate: number) => void;
  onResolve: (result: 'correct' | 'incorrect') => void;
};

/**
 * Say-it-back is the speaking turn that needs no microphone: the phrase stays on screen with
 * Listen and Slow, the learner says it out loud, then confirms it themselves. Nothing is recorded
 * or graded, so it works offline and before anyone has agreed to voice coaching.
 *
 * The scene runtime remounts this with a per-beat `key`, so each turn opens unconfirmed.
 */
export function SayAloudPractice({ audioDisabled = false, disabled = false, scriptPreference = 'both', slowRate, targetHi, targetLatin, targetEn, onPlay, onResolve }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [said, setSaid] = useState(false);
  const locked = disabled || said;

  function confirm(result: 'correct' | 'incorrect') {
    if (locked) return;
    if (result === 'correct') hapticSuccess();
    else hapticWarning();
    setSaid(true);
    onResolve(result);
  }

  return (
    <View style={styles.container} testID="scene-say-aloud">
      <View style={styles.phraseCard}>
        {scriptPreference !== 'latin' ? <Text accessibilityLanguage="hi-IN" style={styles.hindi}>{targetHi}</Text> : null}
        {scriptPreference !== 'devanagari' ? <Text style={scriptPreference === 'latin' ? styles.latinOnly : styles.latin}>{targetLatin}</Text> : null}
        <Text style={styles.meaning}>{targetEn}</Text>
        <View style={styles.audioRow}>
          <Pressable accessibilityLabel="Hear the phrase" accessibilityRole="button" accessibilityState={{ disabled: audioDisabled }} disabled={audioDisabled} hitSlop={4} onPress={() => onPlay(1)} style={[styles.speaker, audioDisabled && styles.disabled]} testID="scene-say-aloud-listen">
            <Volume2 color={colors.brandText} size={16} />
            <Text style={styles.speakerText}>Listen</Text>
          </Pressable>
          <Pressable accessibilityLabel="Hear the phrase slowly" accessibilityRole="button" accessibilityState={{ disabled: audioDisabled }} disabled={audioDisabled} hitSlop={4} onPress={() => onPlay(slowRate)} style={[styles.speaker, styles.speakerQuiet, audioDisabled && styles.disabled]} testID="scene-say-aloud-slow">
            <Volume1 color={colors.brandText} size={16} />
            <Text style={styles.speakerText}>Slow</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.gradeRow}>
        <Pressable
          accessibilityHint="Marks this phrase for extra practice and moves on."
          accessibilityLabel="Not yet"
          accessibilityRole="button"
          accessibilityState={{ disabled: locked }}
          disabled={locked}
          onPress={() => confirm('incorrect')}
          style={[styles.notYet, locked && styles.disabled]}
          testID="scene-say-aloud-not-yet"
        >
          <X color={colors.danger} size={16} />
          <Text style={styles.notYetText}>Not yet</Text>
        </Pressable>
        <Pressable
          accessibilityHint="Confirms you said the phrase out loud. Nothing is recorded."
          accessibilityLabel="I said it"
          accessibilityRole="button"
          accessibilityState={{ disabled: locked }}
          disabled={locked}
          onPress={() => confirm('correct')}
          style={[styles.primary, styles.gradeButton, locked && styles.disabled]}
          testID="scene-say-aloud-done"
        >
          <Check color={colors.white} size={16} />
          <Text style={styles.primaryText}>I said it</Text>
        </Pressable>
      </View>
      <Text style={styles.footer}>No microphone on this turn. Say it out loud as many times as you like. Not yet marks it for extra practice.</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { gap: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous', borderColor: c.brand, borderWidth: 1, backgroundColor: c.brandSoft, padding: spacing.lg },
  phraseCard: { padding: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderWidth: 1, borderColor: c.line, gap: spacing.xs },
  hindi: { ...hindiType(32), color: c.ink },
  latin: { ...type.label, color: c.brandText, fontWeight: '700' },
  latinOnly: { ...type.headline, color: c.ink },
  meaning: { ...type.caption, color: c.muted },
  audioRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  speaker: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, backgroundColor: c.brandSoft, paddingHorizontal: spacing.md },
  speakerQuiet: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.brand },
  speakerText: { ...type.caption, color: c.brandText, fontWeight: '600' },
  primary: { minHeight: 48, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  primaryText: { ...type.label, color: c.white, fontWeight: '700' },
  gradeRow: { flexDirection: 'row', gap: spacing.sm },
  gradeButton: { flex: 1 },
  notYet: { minHeight: 48, flex: 1, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.danger, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  notYetText: { ...type.label, color: c.danger, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  footer: { ...type.caption, color: c.muted },
}));
