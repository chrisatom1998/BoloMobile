import * as SplashScreen from 'expo-splash-screen';

let released = false;

/**
 * Hides the native splash screen once. Safe to call from several places (hydration,
 * the root error boundary) so the app can never stay stuck behind the splash.
 */
export function releaseSplashScreen() {
  if (released) return;
  released = true;
  SplashScreen.hideAsync().catch(() => undefined);
}
