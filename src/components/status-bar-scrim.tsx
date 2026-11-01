import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

/**
 * The tab screens have no navigation bar and draw edge to edge on both
 * platforms, so scrolled content would otherwise slide under the clock and
 * battery icons.
 */
export function StatusBarScrim() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (insets.top === 0) return null;
  return <View pointerEvents="none" style={[styles.scrim, { height: insets.top, backgroundColor: colors.background }]} testID="status-bar-scrim" />;
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
});
