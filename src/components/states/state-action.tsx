import { Text } from 'react-native';

import { TapPressable } from '@/components/tap-pressable';
import { control, makeStyles, radius, spacing, stateMetrics } from '@/theme';

type Tone = 'paper' | 'night';

type StateActionProps = {
  accessibilityLabel: string;
  label: string;
  onPress: () => void;
  testID?: string;
  tone?: Tone;
};

export function StateAction({ accessibilityLabel, label, onPress, testID, tone = 'paper' }: StateActionProps) {
  const styles = useStyles();
  return (
    <TapPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.action, tone === 'night' ? styles.actionNight : styles.actionPaper]}
      testID={testID}
    >
      <Text style={[styles.label, tone === 'night' ? styles.labelNight : styles.labelPaper]}>{label}</Text>
    </TapPressable>
  );
}

const useStyles = makeStyles((c) => ({
  action: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: control.minTarget,
    minWidth: control.minTarget,
    paddingHorizontal: spacing.lg,
  },
  actionPaper: {
    backgroundColor: c.neutralSurface,
  },
  actionNight: {
    backgroundColor: c.paperRaised,
  },
  label: {
    fontSize: stateMetrics.action,
    fontWeight: '700',
    lineHeight: stateMetrics.titleLine,
    textAlign: 'center',
  },
  labelPaper: {
    color: c.neutralSurfaceText,
  },
  labelNight: {
    color: c.ink,
  },
}));
