import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { observe } from '@/lib/observability';
import { colors, radius, spacing } from '@/theme';

type State = { failed: boolean };

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    observe('runtime_error');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View accessibilityRole="alert" style={styles.screen}>
        <View style={styles.mark}><Text style={styles.markText}>ब</Text></View>
        <Text style={styles.title}>Bolo needs a fresh start</Text>
        <Text style={styles.body}>Your saved progress is still on this device. Try loading the screen again.</Text>
        <Pressable accessibilityRole="button" onPress={() => this.setState({ failed: false })} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  mark: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  markText: { color: colors.white, fontSize: 32, fontWeight: '900' },
  title: { color: colors.ink, fontSize: 25, lineHeight: 31, fontWeight: '900', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  button: { minHeight: 50, minWidth: 160, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});
