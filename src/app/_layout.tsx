import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { observe } from '@/lib/observability';
import { AppStateProvider, useAppState } from '@/state/app-state';
import { colors, spacing } from '@/theme';

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <AppStateProvider>
        <AppNavigator />
      </AppStateProvider>
    </AppErrorBoundary>
  );
}

function AppNavigator() {
  const { hydrated } = useAppState();

  useEffect(() => {
    if (hydrated) observe('app_opened');
  }, [hydrated]);

  return (
    <>
      <StatusBar style="dark" />
      {hydrated ? (
        <Stack
          screenOptions={{
            headerBackButtonDisplayMode: 'minimal',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.ink,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="live" options={{ headerShown: false }} />
          <Stack.Screen name="phrases" options={{ title: 'My phrases', headerLargeTitle: true }} />
          <Stack.Screen name="review" options={{ title: 'Quick review' }} />
          <Stack.Screen name="progress" options={{ title: 'My progress', headerLargeTitle: true }} />
          <Stack.Screen name="settings" options={{ title: 'Settings', headerLargeTitle: true }} />
          <Stack.Screen name="diagnostics" options={{ title: 'Private diagnostics' }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacy & data use' }} />
          <Stack.Screen name="scene/[id]" options={{ title: 'Practice scene' }} />
        </Stack>
      ) : (
        <View accessibilityLabel="Loading Bolo" accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.loading} testID="app-hydration-loading">
          <Text style={styles.loadingMark}>ब</Text>
          <ActivityIndicator color={colors.brand} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  loadingMark: {
    color: colors.brand,
    fontSize: 48,
    fontWeight: '900',
  },
});
