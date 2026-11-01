import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { layout, useTheme } from '@/theme';

/**
 * Cream paper behind the clock and Dynamic Island. Android draws edge to edge,
 * and headerless iOS screens scroll under the status bar the same way.
 * A short fade keeps the seam from looking like a hard clip.
 */
export function StatusBarScrim() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (Platform.OS === 'web' || insets.top <= 0) return null;
  const fade = layout.statusBarFadeHeight;
  return (
    <View pointerEvents="none" style={[styles.scrim, { height: insets.top + fade }]} testID="status-bar-scrim">
      <View style={{ backgroundColor: colors.background, height: insets.top }} />
      <Svg height={fade} width="100%">
        <Defs>
          <LinearGradient id="statusBarFade" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor={colors.background} stopOpacity="1" />
            <Stop offset="1" stopColor={colors.background} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#statusBarFade)" height={fade} width="100%" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
});
