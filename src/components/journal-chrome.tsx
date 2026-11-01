import { Text, type StyleProp, type TextStyle } from 'react-native';

import { makeStyles, type } from '@/theme';

type DisplayProps = {
  children: string;
  maxFontSizeMultiplier?: number;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
};

export function JournalDisplay({ children, maxFontSizeMultiplier, numberOfLines, style }: DisplayProps) {
  const styles = useStyles();
  return <Text accessibilityRole="header" maxFontSizeMultiplier={maxFontSizeMultiplier} numberOfLines={numberOfLines} style={[styles.display, style]}>{children}</Text>;
}

export function JournalKicker({ children, style }: Pick<DisplayProps, 'children' | 'style'>) {
  const styles = useStyles();
  return <Text style={[styles.kicker, style]}>{children}</Text>;
}

const useStyles = makeStyles((c) => ({
  display: { ...type.display, color: c.ink },
  kicker: { ...type.eyebrow, color: c.brandText },
}));
