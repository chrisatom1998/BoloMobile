import '../../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native/provider';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { TapPressable } from '@/components/tap-pressable';
import { useHindiFont } from '@/hooks/use-hindi-font';
import { usePracticeReminderRouting } from '@/hooks/use-practice-reminder-routing';
import { observe } from '@/lib/observability';
import { AppStateProvider, useAppState } from '@/state/app-state';
import { displayFont, hindiType, makeStyles, spacing, useTheme } from '@/theme';

export default function RootLayout() {
  useHindiFont();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <HeroUINativeProvider>
          <AppErrorBoundary>
            <AppStateProvider>
              <AppNavigator />
            </AppStateProvider>
          </AppErrorBoundary>
        </HeroUINativeProvider>
      </SafeAreaProvider>
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
            headerTitleStyle: { color: colors.ink, fontSize: 17, fontWeight: '600' },
            // Large titles use the same serif as the tab screens' own headings.
            headerLargeTitleShadowVisible: false,
            headerLargeStyle: { backgroundColor: colors.background },
            headerLargeTitleStyle: { color: colors.ink, fontFamily: displayFont, fontWeight: '700' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen
            name="review"
            options={({ navigation }) => ({
              title: 'Quick review',
              // A short, self-contained session reads as an iOS sheet: swipe down or tap Done to leave.
              presentation: 'modal',
              headerRight: () => <SheetDoneButton onPress={() => navigation.goBack()} />,
            })}
          />
          <Stack.Screen name="lesson-plans" options={{ title: 'Lesson plans', headerLargeTitle: true }} />
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

function SheetDoneButton({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  return (
    <TapPressable accessibilityLabel="Done" accessibilityRole="button" hitSlop={8} onPress={onPress} style={styles.sheetDone}>
      <Text style={styles.sheetDoneText}>Done</Text>
    </TapPressable>
  );
}

const useStyles = makeStyles((c) => ({
  sheetDone: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  sheetDoneText: { color: c.brandText, fontSize: 17, fontWeight: '600' },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: c.background,
  },
  loadingMark: {
    ...hindiType(48),
    color: c.brand,
  },
}));
