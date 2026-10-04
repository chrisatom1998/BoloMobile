import { Check, RotateCcw, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { deterministicallyShuffle, wordOrderTokens } from '@/components/practice-mode';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

type PracticeResult = 'correct' | 'incorrect';

type Props = {
  disabled?: boolean;
  /**
   * When false the component omits its own instruction line. The scene runtime
   * sets this so the lesson screen shows exactly one task instruction; any other
   * caller keeps the default standalone instruction.
   */
  showInstructions?: boolean;
  /** Devanagari phrase the learner is being asked to rebuild. */
  targetHi: string;
  /** Latin transcription shown as a soft prompt underneath the tray. */
  targetLatin: string;
  /** Called exactly once with the final result the runtime should score with. */
  onResolve: (result: PracticeResult) => void;
};

/**
 * Word-order reconstruction: the learner arranges shuffled Hindi tokens into
 * the correct sentence, then locks in a Check answer. This is a silent,
 * offline-capable practice — no microphone, no network — and stays accessible
 * with per-tile labels and a plain-language shuffle explanation.
 *
 * The component reports either `correct` or `incorrect` back to the scene
 * runtime, which keeps its existing scoring, weak-phrase capture, save-phrase
 * row, and pronunciation offer flowing exactly as they do for multiple choice.
 *
 * There is no reset effect here: the scene runtime remounts this component with
 * a per-beat `key`, so every new beat starts from a genuinely fresh tray.
 */
export function WordOrderPractice({ disabled = false, showInstructions = true, targetHi, targetLatin, onResolve }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const solution = useMemo(() => wordOrderTokens(targetHi), [targetHi]);
  const shuffledTiles = useMemo(() => (
    // Preserve duplicate tokens with their original index so identical words remain individually selectable.
    deterministicallyShuffle(solution.map((word, index) => ({ word, index })), targetHi)
  ), [solution, targetHi]);
  const [placedIndexes, setPlacedIndexes] = useState<number[]>([]);
  const [status, setStatus] = useState<'building' | PracticeResult>('building');

  const placedTokens = placedIndexes.map((index) => solution[index] ?? '');
  const ready = placedIndexes.length === solution.length;
  const locked = disabled || status !== 'building';

  function place(index: number) {
    if (locked) return;
    hapticSelect();
    setPlacedIndexes((current) => (current.includes(index) ? current : [...current, index]));
  }

  function removeLast() {
    if (locked || placedIndexes.length === 0) return;
    hapticSelect();
    setPlacedIndexes((current) => current.slice(0, -1));
  }

  function reset() {
    if (locked) return;
    hapticSelect();
    setPlacedIndexes([]);
  }

  function checkAnswer() {
    if (locked || !ready) return;
    const isCorrect = placedIndexes.every((placed, position) => placed === position);
    const nextStatus: PracticeResult = isCorrect ? 'correct' : 'incorrect';
    if (isCorrect) hapticSuccess();
    else hapticWarning();
    setStatus(nextStatus);
    onResolve(nextStatus);
  }

  return (
    <View testID="scene-word-order" style={styles.container}>
      {showInstructions ? (
        <Text style={styles.instructions} accessibilityRole="header">
          Tap the words in the order they belong in the Hindi sentence.
        </Text>
      ) : null}
      <View
        accessibilityLabel={placedIndexes.length === 0
          ? 'Sentence tray, empty. Tap a Hindi word below to start.'
          : `Sentence tray. ${placedTokens.join(' ')}`}
        accessibilityLiveRegion="polite"
        style={styles.tray}
        testID="scene-word-order-tray"
      >
        {placedTokens.length === 0 ? (
          <Text style={styles.trayPlaceholder}>Your sentence appears here</Text>
        ) : placedTokens.map((token, position) => (
          <View key={`placed-${position}-${token}`} style={styles.trayToken}>
            <Text style={styles.trayTokenText}>{token}</Text>
          </View>
        ))}
      </View>
      <View style={styles.tileRow} testID="scene-word-order-choices">
        {shuffledTiles.map((tile) => {
          const used = placedIndexes.includes(tile.index);
          return (
            <Pressable
              accessibilityHint="Adds this word to the end of your sentence."
              accessibilityLabel={`Add word ${tile.word}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: used || locked, selected: used }}
              disabled={used || locked}
              key={`tile-${tile.index}`}
              onPress={() => place(tile.index)}
              style={[styles.tile, used && styles.tileUsed, locked && styles.tileLocked]}
              testID={`scene-word-order-tile-${tile.index}`}
            >
              <Text style={[styles.tileText, used && styles.tileUsedText]}>{tile.word}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityLabel="Undo last word"
          accessibilityRole="button"
          accessibilityState={{ disabled: locked || placedIndexes.length === 0 }}
          disabled={locked || placedIndexes.length === 0}
          onPress={removeLast}
          style={[styles.secondary, (locked || placedIndexes.length === 0) && styles.disabled]}
        >
          <X color={colors.ink} size={16} />
          <Text style={styles.secondaryText}>Undo</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Clear sentence tray"
          accessibilityRole="button"
          accessibilityState={{ disabled: locked || placedIndexes.length === 0 }}
          disabled={locked || placedIndexes.length === 0}
          onPress={reset}
          style={[styles.secondary, (locked || placedIndexes.length === 0) && styles.disabled]}
        >
          <RotateCcw color={colors.ink} size={16} />
          <Text style={styles.secondaryText}>Clear</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Check my sentence"
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || locked }}
          disabled={!ready || locked}
          onPress={checkAnswer}
          style={[styles.primary, (!ready || locked) && styles.disabled]}
          testID="scene-word-order-check"
        >
          <Check color={colors.ink} size={16} />
          <Text style={styles.primaryText}>Check</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>{`Say it evenly: ${targetLatin}`}</Text>
    </View>
  );
}

const SERIF = 'Georgia';

const useStyles = makeStyles((c) => ({
  container: { gap: spacing.md },
  instructions: { color: c.ink, fontFamily: SERIF, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  tray: { minHeight: 64, borderRadius: 18, borderCurve: 'continuous', backgroundColor: c.background, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.lineStrong, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  trayPlaceholder: { color: c.muted, fontSize: 14 },
  trayToken: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.brand },
  trayTokenText: { color: c.white, fontFamily: SERIF, fontSize: 17, lineHeight: 24, fontWeight: '700' },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { minHeight: 48, minWidth: 60, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.white, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
  tileText: { color: c.ink, fontFamily: SERIF, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  tileUsed: { backgroundColor: c.background, borderStyle: 'dashed', opacity: 0.5 },
  tileUsedText: { color: c.muted },
  tileLocked: { opacity: 0.4 },
  controls: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  primary: { minHeight: 48, flexGrow: 1, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg },
  primaryText: { color: c.ink, fontSize: 15, fontWeight: '700' },
  secondary: { minHeight: 48, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.white, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg },
  secondaryText: { color: c.ink, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  hint: { color: c.muted, fontSize: 13, lineHeight: 18 },
}));
