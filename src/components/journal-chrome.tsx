import { Text, type StyleProp, type TextStyle } from 'react-native';

import { makeStyles } from '@/theme';

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
  return <Text accessibilityRole="header" numberOfLines={numberOfLines} style={[styles.display, style]}>{children}</Text>;
}

export function JournalKicker({ children, style }: Pick<DisplayProps, 'children' | 'style'>) {
  const styles = useStyles();
  return <Text style={[styles.kicker, style]}>{children}</Text>;
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
}));
