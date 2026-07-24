import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { usePracticeReminderRouting } from '@/hooks/use-practice-reminder-routing';
import { observe } from '@/lib/observability';
import { AppStateProvider, useAppState } from '@/state/app-state';
import { makeStyles, spacing, useTheme } from '@/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <AppErrorBoundary>
          <AppStateProvider>
            <AppNavigator />
          </AppStateProvider>
        </AppErrorBoundary>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}

function AppNavigator() {
  const { hydrated } = useAppState();
  const { colors } = useTheme();
  const styles = useStyles();
  usePracticeReminderRouting(hydrated);

  useEffect(() => {
    if (hydrated) observe('app_opened');
  }, [hydrated]);

  return (
    <>
      <StatusBar animated style="dark" />
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
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="review" options={{ title: 'Quick review' }} />
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

const useStyles = makeStyles((c) => ({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: c.background,
  },
  loadingMark: {
    color: c.brand,
    fontSize: 48,
    fontWeight: '900',
  },
}));
