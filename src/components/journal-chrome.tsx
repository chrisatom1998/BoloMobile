import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { makeStyles, radius } from '@/theme';

type DisplayProps = {
  children: string;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
};

/**
 * Shared visual language for the editorial Bolo surfaces. These are deliberately
 * simple native primitives so the learning UI remains fast, accessible, and
 * independent of the web-only HeroUI packages.
 */
export function JournalDisplay({ children, numberOfLines, style }: DisplayProps) {
  const styles = useStyles();
  return <Text numberOfLines={numberOfLines} style={[styles.display, style]}>{children}</Text>;
}

export function JournalKicker({ children, style }: Pick<DisplayProps, 'children' | 'style'>) {
  const styles = useStyles();
  return <Text style={[styles.kicker, style]}>{children}</Text>;
}

type JournalMotifProps = {
  accessibilityLabel?: string;
  size?: 'corner' | 'panel' | 'strip' | 'tile';
  style?: StyleProp<ViewStyle>;
};

/** A small, purely native decorative motif inspired by block-print textiles. */
export function JournalMotif({ accessibilityLabel, size = 'corner', style }: JournalMotifProps) {
  const styles = useStyles();
  const panel = size === 'panel';
  return (
    <View accessibilityLabel={accessibilityLabel} accessible={Boolean(accessibilityLabel)} pointerEvents="none" style={[styles.motif, styles[`motif${size[0].toUpperCase()}${size.slice(1)}` as 'motifCorner'], style]}>
      <View style={[styles.petals, styles.petalsOne, panel && styles.petalsOnePanel]} />
      <View style={[styles.petals, styles.petalsTwo, panel && styles.petalsTwoPanel]} />
      <View style={[styles.leaf, styles.leafOne, panel && styles.leafOnePanel]} />
      <View style={[styles.leaf, styles.leafTwo, panel && styles.leafTwoPanel]} />
      <View style={[styles.arch, styles.archOne, panel && styles.archOnePanel]} />
      <View style={[styles.arch, styles.archTwo, panel && styles.archTwoPanel]} />
      {panel ? <View style={[styles.arch, styles.archThreePanel]} /> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  display: {
    color: c.ink,
    fontFamily: 'Georgia',
    fontSize: 31,
    fontWeight: '700',
    letterSpacing: -0.7,
    lineHeight: 37,
  },
  kicker: {
    color: c.brandText,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.05,
    textTransform: 'uppercase',
  },
  motif: {
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: c.goldSoft,
  },
  motifCorner: { width: 92, height: 106, borderRadius: 24, borderCurve: 'continuous', borderColor: c.gold, borderWidth: 1 },
  motifPanel: { width: '100%', height: '100%', borderRadius: 32, borderCurve: 'continuous', borderColor: c.gold, borderWidth: 1 },
  motifStrip: { width: '100%', height: 92, borderRadius: radius.lg, borderCurve: 'continuous' },
  motifTile: { width: 94, height: 112, borderRadius: radius.lg, borderCurve: 'continuous' },
  petals: { position: 'absolute', width: 52, height: 52, borderRadius: radius.pill, backgroundColor: c.brandSoft, borderColor: c.brand, borderWidth: 1.5, opacity: 0.88 },
  petalsOne: { left: -13, top: 16 },
  petalsTwo: { right: -17, bottom: 8, backgroundColor: c.backgroundWarm, borderColor: c.gold },
  leaf: { position: 'absolute', width: 52, height: 18, borderRadius: radius.pill, backgroundColor: c.forestSoft, borderColor: c.forest, borderWidth: 1, transform: [{ rotate: '-34deg' }] },
  leafOne: { right: 19, top: 24 },
  leafTwo: { left: 20, bottom: 18, transform: [{ rotate: '38deg' }] },
  arch: { position: 'absolute', width: 68, height: 68, borderRadius: radius.pill, borderColor: c.lineStrong, borderWidth: 2, backgroundColor: 'transparent' },
  archOne: { right: -22, top: -16 },
  archTwo: { left: 34, bottom: -34 },
  petalsOnePanel: { width: 112, height: 112, left: -38, top: 74, borderWidth: 2 },
  petalsTwoPanel: { width: 86, height: 86, right: -24, bottom: 22, borderWidth: 2 },
  leafOnePanel: { width: 104, height: 34, right: 22, top: 58 },
  leafTwoPanel: { width: 92, height: 30, left: 26, bottom: 44 },
  archOnePanel: { width: 168, height: 168, right: -58, top: -62 },
  archTwoPanel: { width: 132, height: 132, left: 10, bottom: -74 },
  archThreePanel: { position: 'absolute', width: 208, height: 208, right: -84, bottom: -46, opacity: 0.5 },
}));
