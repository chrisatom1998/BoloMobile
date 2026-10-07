import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

/**
 * Android draws edge to edge, so scrolled content would otherwise slide under
 * the clock and battery icons. iOS gets this from the large-title navigation bar.
 */
export function StatusBarScrim() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  if (Platform.OS !== 'android' || insets.top === 0) return null;
  return <View pointerEvents="none" style={[styles.scrim, { height: insets.top, backgroundColor: colors.background }]} testID="status-bar-scrim" />;
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
});
