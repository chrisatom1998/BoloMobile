import { router, type ErrorBoundaryProps } from 'expo-router';
import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Text, View } from 'react-native';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import { observe } from '@/lib/observability';
import { releaseSplashScreen } from '@/lib/splash-screen';
import { hindiType, makeStyles, radius, spacing, type, buttons } from '@/theme';

type State = { failed: boolean };

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    if (__DEV__) console.error(error);
    observe('runtime_error');
    // A crash before hydration would otherwise leave the native splash covering the fallback forever.
    releaseSplashScreen();
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return <ErrorFallback onRetry={() => this.setState({ failed: false })} />;
  }
}

/**
 * Route-level boundary for expo-router. Re-export it as `ErrorBoundary` from a
 * route file so a crash in one screen keeps the rest of the app usable and
 * offers a way back to Today instead of re-rendering the same broken screen.
 */
export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) console.error(error);
  return (
    <ErrorFallback
      onRetry={() => void retry()}
      onHome={() => router.replace('/')}
    />
  );
}

function ErrorFallback({ onRetry, onHome }: { onRetry: () => void; onHome?: () => void }) {
  const styles = useStyles();
  return (
    <View accessibilityRole="alert" style={styles.screen}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.mark}>
        <Text maxFontSizeMultiplier={1.2} style={styles.markText}>ब</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>Bolo needs a fresh start</Text>
      <Text style={styles.body}>Your saved progress is still on this device. Try loading the screen again.</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
      {onHome ? (
        <Pressable accessibilityRole="button" onPress={onHome} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Back to Today</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  mark: { width: 64, height: 64, borderRadius: radius.xl, borderCurve: 'continuous', backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  markText: { ...hindiType(28), color: c.white },
  title: { ...type.title, color: c.ink, textAlign: 'center' },
  body: { ...type.body, color: c.muted, textAlign: 'center' },
  button: { ...buttons.primary, minWidth: 160 },
  buttonText: buttons.primaryText,
  secondaryButton: { ...buttons.quiet, minWidth: 160 },
  secondaryButtonText: buttons.quietText,
}));
