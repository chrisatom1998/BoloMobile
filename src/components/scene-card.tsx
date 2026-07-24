import { ChevronRight } from 'lucide-react-native';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { memo } from 'react';
import { Text, View } from 'react-native';

import type { Scene } from '@/data/scenes';
import type { SceneProgress } from '@/state/app-state-types';
import { makeStyles, maxContentWidth, radius, spacing, useTheme } from '@/theme';

type Props = {
  scene: Scene;
  onPress: (scene: Scene) => void;
  progress?: SceneProgress;
};

export const SceneCard = memo(function SceneCard({ scene, onPress, progress }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const progressLabel = progress?.lastBeatIndex
    ? `Continue at turn ${progress.lastBeatIndex + 1}`
    : progress?.completions
      ? `Completed ${progress.completions} time${progress.completions === 1 ? '' : 's'}, best accuracy ${progress.bestAccuracy} percent`
      : scene.level;
  return (
    <PressableFeedback
      accessibilityRole="button"
      accessibilityLabel={`${scene.title}. ${scene.subtitle}. ${progressLabel}.`}
      onPress={() => onPress(scene)}
      style={styles.card}
    >
      <View pointerEvents="none" style={[styles.accent, { backgroundColor: scene.color }]} />
      <View style={[styles.iconWrap, { backgroundColor: `${scene.color}20` }]}>
        <Text style={styles.emoji}>{scene.emoji}</Text>
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>{scene.title}</Text>
          <View style={[styles.chevron, { backgroundColor: `${scene.color}20` }]}><ChevronRight color={colors.ink} size={18} /></View>
        </View>
        <Text numberOfLines={2} style={styles.subtitle}>{scene.subtitle}</Text>
        <View style={styles.meta}>
          <Text style={styles.place}>{scene.place} · {scene.category}</Text>
          <View style={[styles.statusPill, progress?.completions ? styles.statusPillDone : null]}>
            <Text style={[styles.status, progress?.completions ? styles.statusDone : null]}>{progress?.lastBeatIndex ? 'Continue' : progress?.completions ? 'Completed' : scene.level}</Text>
          </View>
        </View>
        <Text accessibilityLabel={`Practice words: ${scene.words.join(', ')}`} numberOfLines={1} style={styles.words}>{scene.words.join('  ·  ')}</Text>
      </View>
    </PressableFeedback>
  );
});

const useStyles = makeStyles((c) => ({
  card: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    position: 'relative',
    minHeight: 142,
    overflow: 'hidden',
    backgroundColor: c.paper,
    borderColor: c.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    boxShadow: '0 5px 16px rgba(0, 0, 0, 0.04)',
  },
  accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  iconWrap: { width: 58, height: 58, flexShrink: 0, borderRadius: 20, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 30 },
  copy: { minWidth: 0, flex: 1, gap: 5 },
  titleRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { minWidth: 0, flex: 1, color: c.ink, fontSize: 19, lineHeight: 24, fontWeight: '900' },
  subtitle: { color: c.muted, fontSize: 13, lineHeight: 19 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  place: { color: c.muted, fontSize: 11, fontWeight: '800' },
  statusPill: { borderRadius: radius.pill, backgroundColor: c.brandSoft, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  statusPillDone: { backgroundColor: c.successSoft },
  status: { color: c.brandText, fontSize: 10, fontWeight: '900', letterSpacing: 0.25, textTransform: 'uppercase' },
  statusDone: { color: c.forestText },
  words: { color: c.mutedSoft, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  chevron: { width: 38, height: 38, flexShrink: 0, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
}));
