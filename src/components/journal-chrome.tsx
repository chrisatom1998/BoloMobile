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
  size?: 'corner' | 'strip' | 'tile';
  style?: StyleProp<ViewStyle>;
};

/** A small, purely native decorative motif inspired by block-print textiles. */
export function JournalMotif({ accessibilityLabel, size = 'corner', style }: JournalMotifProps) {
  const styles = useStyles();
  return (
    <View accessibilityLabel={accessibilityLabel} accessible={Boolean(accessibilityLabel)} pointerEvents="none" style={[styles.motif, styles[`motif${size[0].toUpperCase()}${size.slice(1)}` as 'motifCorner'], style]}>
      <View style={[styles.petals, styles.petalsOne]} />
      <View style={[styles.petals, styles.petalsTwo]} />
      <View style={[styles.leaf, styles.leafOne]} />
      <View style={[styles.leaf, styles.leafTwo]} />
      <View style={[styles.arch, styles.archOne]} />
      <View style={[styles.arch, styles.archTwo]} />
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
  motifCorner: { width: 116, height: 128, borderTopRightRadius: 30, borderBottomLeftRadius: 30, borderCurve: 'continuous' },
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
}));
