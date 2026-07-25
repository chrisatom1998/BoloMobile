import { useWindowDimensions } from 'react-native';

/** Dynamic Type at this scale or larger needs reflowed, stacked layouts instead of compact rows. */
export const LARGE_TEXT_FONT_SCALE = 1.4;

export function useLargeTextLayout() {
  const { fontScale } = useWindowDimensions();
  return fontScale >= LARGE_TEXT_FONT_SCALE;
}
