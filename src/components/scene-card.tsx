import { ChevronRight, MapPin } from 'lucide-react-native';
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
      <View style={[styles.accent, { backgroundColor: scene.color }]} />
      <View style={styles.iconWrap}>
        <Text style={styles.emoji}>{scene.emoji}</Text>
      </View>
      <View style={styles.copy}>
        <View style={styles.placeRow}>
          <MapPin color={colors.muted} size={13} />
          <Text style={styles.place}>{scene.place}</Text>
        </View>
        <Text style={styles.title}>{scene.title}</Text>
        <Text style={styles.subtitle}>{scene.subtitle}</Text>
        <View accessibilityLabel={`Practice words: ${scene.words.join(', ')}`} style={styles.wordRow}>
          {scene.words.map((word) => (
            <View key={word} style={[styles.wordChip, { borderColor: scene.color }]}>
              <Text style={styles.wordText}>{word}</Text>
            </View>
          ))}
        </View>
        <View style={styles.meta}>
          <View style={[styles.levelPill, progress?.completions ? styles.levelPillDone : null]}><Text style={styles.level}>{progress?.lastBeatIndex ? 'Continue' : progress?.completions ? 'Completed' : scene.level}</Text></View>
          <View style={[styles.chevron, { backgroundColor: scene.color }]}><ChevronRight color={colors.white} size={18} /></View>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    minHeight: 184,
    overflow: 'hidden',
    backgroundColor: colors.paperRaised,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    flexDirection: 'row',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  accent: { width: 7 },
  iconWrap: { width: 72, alignItems: 'center', paddingTop: spacing.xl },
  emoji: { fontSize: 34 },
  copy: { flex: 1, padding: spacing.lg, paddingLeft: 0, gap: spacing.xs },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  place: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 20, lineHeight: 24, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  wordRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingTop: spacing.xs },
  wordChip: { minHeight: 30, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, backgroundColor: colors.backgroundWarm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  wordText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  meta: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  levelPill: { minHeight: 30, borderRadius: radius.pill, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  levelPillDone: { backgroundColor: '#DDEFE9' },
  level: { color: colors.brandDark, fontSize: 12, fontWeight: '900' },
  chevron: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
