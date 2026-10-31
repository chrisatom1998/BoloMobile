import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { layout, useTheme } from '@/theme';

type StatusBarScrimProps = {
  /** Fade the strip into the content below it. Default true; pass false for a hard edge. */
  fade?: boolean;
};

/**
 * Both platforms draw edge to edge and the tab screens hide their navigation
 * header, so scrolled content would otherwise slide under the clock and battery
 * icons. This paints the status-bar inset in paper, with a short fade below it.
 * Web has no inset and draws nothing.
 */
export function StatusBarScrim({ fade = true }: StatusBarScrimProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (Platform.OS === 'web' || insets.top === 0) return null;
  return (
    <>
      <View pointerEvents="none" style={[styles.scrim, { height: insets.top, backgroundColor: colors.background }]} testID="status-bar-scrim" />
      {fade ? (
        <Svg height={layout.statusBarFadeHeight} pointerEvents="none" style={[styles.fade, { top: insets.top }]} testID="status-bar-scrim-fade">
          <Defs>
            <LinearGradient id="status-bar-scrim-fade" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor={colors.background} stopOpacity={1} />
              <Stop offset="1" stopColor={colors.background} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#status-bar-scrim-fade)" height="100%" width="100%" />
        </Svg>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  fade: { position: 'absolute', left: 0, right: 0, zIndex: 10, height: layout.statusBarFadeHeight },
});
