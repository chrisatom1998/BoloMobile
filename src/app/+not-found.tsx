import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { makeStyles, spacing, useSharedStyles } from '@/theme';

export default function NotFoundScreen() {
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  return (
    <View style={[sharedStyles.screen, styles.screen]}>
      <Text style={styles.title}>That page is not in your practice plan.</Text>
      <Text style={styles.body}>Return to Today to choose your next Hindi step.</Text>
      <Link accessibilityRole="button" href="/" style={sharedStyles.primaryButtonText}>
        Back to today
      </Link>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  title: { color: c.ink, fontSize: 26, lineHeight: 33, fontWeight: '900', textAlign: 'center' },
  body: { color: c.muted, fontSize: 16, lineHeight: 23, textAlign: 'center' },
}));
