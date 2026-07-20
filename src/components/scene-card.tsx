import { ChevronRight } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Scene } from '@/data/scenes';
import type { SceneProgress } from '@/state/app-state-types';
import { colors, radius, spacing } from '@/theme';

type Props = {
  scene: Scene;
  onPress: (scene: Scene) => void;
  progress?: SceneProgress;
};

export const SceneCard = memo(function SceneCard({ scene, onPress, progress }: Props) {
  const progressLabel = progress?.lastBeatIndex
    ? `Continue at turn ${progress.lastBeatIndex + 1}`
    : progress?.completions
      ? `Completed ${progress.completions} time${progress.completions === 1 ? '' : 's'}, best accuracy ${progress.bestAccuracy} percent`
      : scene.level;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${scene.title}. ${scene.subtitle}. ${progressLabel}.`}
      onPress={() => onPress(scene)}
      style={styles.card}
    >
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
          <Text style={[styles.status, progress?.completions ? styles.statusDone : null]}>{progress?.lastBeatIndex ? 'Continue' : progress?.completions ? 'Completed' : scene.level}</Text>
        </View>
        <Text accessibilityLabel={`Practice words: ${scene.words.join(', ')}`} numberOfLines={1} style={styles.words}>{scene.words.join('  ·  ')}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    minHeight: 132,
    backgroundColor: colors.paperRaised,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  iconWrap: { width: 54, height: 54, flexShrink: 0, borderRadius: 18, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 28 },
  copy: { minWidth: 0, flex: 1, gap: 4 },
  titleRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { minWidth: 0, flex: 1, color: colors.ink, fontSize: 18, lineHeight: 23, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  place: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  status: { color: colors.brandText, fontSize: 11, fontWeight: '900' },
  statusDone: { color: colors.forestText },
  words: { color: colors.mutedSoft, fontSize: 11, lineHeight: 15 },
  chevron: { width: 36, height: 36, flexShrink: 0, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
