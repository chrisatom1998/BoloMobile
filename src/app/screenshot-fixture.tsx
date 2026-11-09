import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { screenshotFixtureEntries } from '@/lib/screenshot-fixtures';
import { sanitizeLearnerProfile, storageKeys } from '@/lib/storage';

/**
 * Writes a local screenshot fixture, then waits until Maestro relaunches Bolo.
 * A learner who already finished onboarding is left untouched.
 */
export default function ScreenshotFixtureScreen() {
  const params = useLocalSearchParams<{ name?: string | string[] }>();
  const name = Array.isArray(params.name) ? params.name[0] : params.name;
  const [message, setMessage] = useState('Seeding screenshot fixture');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const existing = await AsyncStorage.getItem(storageKeys.learnerProfile);
        if (existing && sanitizeLearnerProfile(existing).completed) {
          throw new Error('Screenshot fixtures do not replace an existing learner.');
        }
        const entries = screenshotFixtureEntries(name ?? '', new Date());
        await AsyncStorage.multiSet(entries);
        const stored = await AsyncStorage.getItem(storageKeys.learnerProfile);
        if (!stored || !sanitizeLearnerProfile(stored).completed) {
          throw new Error('Screenshot fixture did not persist.');
        }
        if (active) {
          setMessage(`Ready ${name}`);
          setReady(true);
        }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Could not seed screenshot fixture.');
      }
    })();
    return () => {
      active = false;
    };
  }, [name]);

  if (!ready) {
    return (
      <View>
        <Text>{message}</Text>
      </View>
    );
  }

  return (
    <View testID="screenshot-fixture-ready">
      <Text>{message}</Text>
    </View>
  );
}
