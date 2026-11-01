import { Redirect, Stack, useLocalSearchParams } from 'expo-router';

import { StatePreviewProvider } from '@/components/states/preview-context';
import { statePreviewEnabled } from '@/lib/state-preview';

import LessonPlansScreen from './lesson-plans';
import HomeScreen from './(tabs)/index';
import LiveScreen from './(tabs)/live';
import PhrasesScreen from './(tabs)/phrases';
import ProgressScreen from './(tabs)/progress';

/**
 * Forces one screen state for screenshots. Release builds omit the flag, so
 * this route sends the learner home and never paints the fixture.
 */
export default function StatePreviewScreen() {
  const params = useLocalSearchParams<{ phase?: string | string[]; screen?: string | string[] }>();
  const screen = firstParam(params.screen);
  const phase = firstParam(params.phase);
  if (!statePreviewEnabled() || !screen || !phase) return <Redirect href="/" />;

  return (
    <StatePreviewProvider phase={phase} screen={screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <PreviewScreen screen={screen} />
    </StatePreviewProvider>
  );
}

function PreviewScreen({ screen }: { screen: string }) {
  switch (screen) {
    case 'today':
      return <HomeScreen />;
    case 'phrases':
      return <PhrasesScreen />;
    case 'asha':
      return <LiveScreen />;
    case 'lesson-plans':
      return <LessonPlansScreen />;
    case 'progress':
      return <ProgressScreen />;
    default:
      return <Redirect href="/" />;
  }
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
