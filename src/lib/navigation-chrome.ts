import { displayFont } from '@/theme';

/**
 * Portrait lock for every screen, including sheets. Expo Router maps
 * `portrait_up` to a single upright orientation so a landscape turn cannot
 * slide content under the Dynamic Island or the home indicator.
 * https://docs.expo.dev/versions/v57.0.0/sdk/router/
 */
export const portraitLock = 'portrait_up' as const;

/**
 * A full-height form sheet: grabber, one detent, swipe down to dismiss.
 * Card screens keep the edge-swipe back gesture via `fullScreenGestureEnabled`.
 */
export const reviewSheetOptions = {
  gestureEnabled: true,
  presentation: 'formSheet' as const,
  sheetAllowedDetents: [1],
  sheetGrabberVisible: true,
  sheetInitialDetentIndex: 'last' as const,
};

/**
 * Reading sheets (privacy, last session, diagnostics) rest at 72% and can
 * expand. The grabber and swipe dismiss are the way out; the stack back
 * gesture stays on the card screens underneath.
 */
export const readingSheetOptions = {
  gestureEnabled: true,
  presentation: 'formSheet' as const,
  sheetAllowedDetents: [0.72, 1],
  sheetGrabberVisible: true,
  sheetInitialDetentIndex: 'last' as const,
};

export function rootStackScreenOptions(background: string, ink: string) {
  return {
    contentStyle: { backgroundColor: background },
    fullScreenGestureEnabled: true,
    gestureEnabled: true,
    headerBackButtonDisplayMode: 'minimal' as const,
    headerLargeStyle: { backgroundColor: background },
    headerLargeTitleShadowVisible: false,
    headerLargeTitleStyle: { color: ink, fontFamily: displayFont, fontWeight: '700' as const },
    headerShadowVisible: false,
    headerStyle: { backgroundColor: background },
    headerTintColor: ink,
    headerTitleStyle: { color: ink, fontSize: 17, fontWeight: '600' as const },
    orientation: portraitLock,
  };
}
