import { router, type ErrorBoundaryProps } from 'expo-router';
import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Text, View } from 'react-native';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import { observe } from '@/lib/observability';
import { hindiType, makeStyles, radius, spacing } from '@/theme';

type State = { failed: boolean };

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    if (__DEV__) console.error(error);
    observe('runtime_error');
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
  mark: { width: 64, height: 64, borderRadius: 22, borderCurve: 'continuous', backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  markText: { ...hindiType(32), color: c.white },
  title: { color: c.ink, fontSize: 25, lineHeight: 31, fontWeight: '900', textAlign: 'center' },
  body: { color: c.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: { minHeight: 50, minWidth: 160, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { color: c.white, fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 44, minWidth: 160, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  secondaryButtonText: { color: c.forestText, fontSize: 16, fontWeight: '700' },
}));
