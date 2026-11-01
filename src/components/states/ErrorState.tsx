import { Text, View } from 'react-native';

import { StateAction } from '@/components/states/state-action';
import { displayFont, makeStyles, spacing, stateMetrics } from '@/theme';

type Tone = 'paper' | 'night';

type ErrorStateProps = {
  accessibilityLabel: string;
  actionLabel: string;
  body: string;
  onAction: () => void;
  testID?: string;
  title: string;
  tone?: Tone;
};

export function ErrorState({
  accessibilityLabel,
  actionLabel,
  body,
  onAction,
  testID,
  title,
  tone = 'paper',
}: ErrorStateProps) {
  const styles = useStyles();
  const night = tone === 'night';
  return (
    <View accessibilityRole="alert" style={styles.wrap} testID={testID}>
      <Text accessibilityRole="header" style={[styles.title, night && styles.titleNight]}>{title}</Text>
      <Text style={[styles.body, night && styles.bodyNight]}>{body}</Text>
      <StateAction
        accessibilityLabel={accessibilityLabel}
        label={actionLabel}
        onPress={onAction}
        testID={testID ? `${testID}-action` : undefined}
        tone={tone}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
  },
  title: {
    color: c.ink,
    fontFamily: displayFont,
    fontSize: stateMetrics.title,
    fontWeight: '700',
    lineHeight: stateMetrics.titleLine,
    textAlign: 'center',
  },
  titleNight: {
    color: c.white,
  },
  body: {
    color: c.muted,
    fontSize: stateMetrics.body,
    lineHeight: stateMetrics.bodyLine,
    textAlign: 'center',
  },
  bodyNight: {
    color: c.heroSubtle,
  },
}));
