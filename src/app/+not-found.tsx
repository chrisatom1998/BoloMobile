import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, Text } from 'react-native';

import { makeStyles, spacing, useSharedStyles } from '@/theme';

export default function NotFoundScreen() {
  const router = useRouter();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <Stack.Screen options={{ title: 'Page not found' }} />
      <Text style={styles.title}>That Bolo page is not available.</Text>
      <Text style={styles.body}>The link may be old or incomplete. Your saved practice and phrases are unchanged.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={sharedStyles.primaryButton}>
        <Text style={sharedStyles.primaryButtonText}>Back to Today</Text>
      </Pressable>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  title: { color: c.ink, fontSize: 28, lineHeight: 35, fontWeight: '900' },
  body: { color: c.muted, fontSize: 16, lineHeight: 24 },
}));
