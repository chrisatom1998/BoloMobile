import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { screenshotChatFixtureEntries } from '@/lib/screenshot-chat-fixture';
import { sanitizeLearnerProfile, storageKeys } from '@/lib/storage';

/**
 * Writes the local Asha chat fixture, then waits until Maestro relaunches Bolo.
 * A learner who already finished onboarding is left untouched.
 */
export default function ScreenshotChatScreen() {
  const [message, setMessage] = useState('Seeding screenshot chat');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const existing = await AsyncStorage.getItem(storageKeys.learnerProfile);
        if (existing && sanitizeLearnerProfile(existing).completed) {
          throw new Error('Screenshot chat does not replace an existing learner.');
        }
        await AsyncStorage.multiSet(screenshotChatFixtureEntries(new Date()));
        const stored = await AsyncStorage.getItem(storageKeys.learnerProfile);
        if (!stored || !sanitizeLearnerProfile(stored).completed) {
          throw new Error('Screenshot chat did not persist.');
        }
        if (active) {
          setMessage('Ready');
          setReady(true);
        }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Could not seed screenshot chat.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <View>
        <Text>{message}</Text>
      </View>
    );
  }

  return (
    <View testID="screenshot-chat-ready">
      <Text>{message}</Text>
    </View>
  );
}
