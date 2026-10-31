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
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { usePracticeReminderRouting } from '@/hooks/use-practice-reminder-routing';
import { setHapticsReducedMotion } from '@/lib/haptics';
import { readingSheetOptions, reviewSheetOptions, rootStackScreenOptions } from '@/lib/navigation-chrome';
import { screenCopy } from '@/lib/screen-copy';
import { observe } from '@/lib/observability';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
import { AshaVoiceSessionProvider } from '@/state/asha-voice-session';
import { AppStateProvider, useAppState } from '@/state/app-state';
import { hindiType, makeStyles, spacing, useTheme } from '@/theme';

export default function RootLayout() {
  useHindiFont();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <HeroUINativeProvider>
          <AppErrorBoundary>
            <AppStateProvider>
              <AshaVoiceSessionProvider>
                <AppNavigator />
              </AshaVoiceSessionProvider>
            </AppStateProvider>
          </AppErrorBoundary>
        </HeroUINativeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppNavigator() {
  const { hydrated, motionPreference = DEFAULT_MOTION_PREFERENCE } = useAppState();
  const { colors } = useTheme();
  const styles = useStyles();
  const { reducedMotion } = useMotionPreference(motionPreference);
  usePracticeReminderRouting(hydrated);

  useEffect(() => {
    setHapticsReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    if (hydrated) observe('app_opened');
  }, [hydrated]);

  return (
    <>
      <StatusBar animated style="dark" />
      {hydrated ? (
        <Stack screenOptions={rootStackScreenOptions(colors.background, colors.ink)}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen
            name="review"
            options={({ navigation }) => ({
              title: 'Quick review',
              // A short session is a form sheet: grabber, swipe down, or Done.
              ...reviewSheetOptions,
              headerRight: () => <SheetDoneButton onPress={() => navigation.goBack()} />,
            })}
          />
          <Stack.Screen name="lesson-plans" options={{ title: 'Lesson plans', headerLargeTitle: true }} />
          <Stack.Screen name="settings" options={{ title: 'Settings', headerLargeTitle: true }} />
          <Stack.Screen name="diagnostics" options={{ title: 'Private diagnostics', ...readingSheetOptions }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacy & data use', ...readingSheetOptions }} />
          <Stack.Screen name="last-session" options={{ title: 'Last session', ...readingSheetOptions }} />
          <Stack.Screen name="scene/[id]" options={{ title: 'Lesson' }} />
        </Stack>
      ) : (
        <View accessibilityLabel="Loading Bolo" accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.loading} testID="app-hydration-loading">
          <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" maxFontSizeMultiplier={1.2} style={styles.loadingMark}>ब</Text>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.loadingCaption}>{screenCopy.loadingCaption}</Text>
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
  loadingCaption: {
    color: c.muted,
    fontSize: 16,
    lineHeight: 22,
  },
}));
