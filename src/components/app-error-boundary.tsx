import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';

import { observe } from '@/lib/observability';
import { makeStyles, radius, spacing } from '@/theme';

type State = { failed: boolean };

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo) {
    observe('runtime_error');
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return <ErrorFallback onRetry={() => this.setState({ failed: false })} />;
  }
}

function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const styles = useStyles();
  return (
    <View accessibilityRole="alert" style={styles.screen}>
      <View style={styles.mark}><Text style={styles.markText}>ब</Text></View>
      <Text style={styles.title}>Bolo needs a fresh start</Text>
      <Text style={styles.body}>Your saved progress is still on this device. Try loading the screen again.</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  mark: { width: 64, height: 64, borderRadius: 22, borderCurve: 'continuous', backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  markText: { color: c.white, fontSize: 32, fontWeight: '900' },
  title: { color: c.ink, fontSize: 25, lineHeight: 31, fontWeight: '900', textAlign: 'center' },
  body: { color: c.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: { minHeight: 50, minWidth: 160, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { color: c.white, fontSize: 16, fontWeight: '800' },
}));
