import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, radius } from '@/theme';

export const masteryMax = 5;

type MasteryMeterProps = {
  mastery: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Five 18×4 segments, forest when earned. One accessible progressbar rather
 * than five decorative views, so VoiceOver reads "Mastery 2 of 5" once.
 */
export function MasteryMeter({ mastery, style, testID }: MasteryMeterProps) {
  const styles = useStyles();
  const earned = Math.max(0, Math.min(masteryMax, Math.floor(mastery)));
  return (
    <View
      accessible
      accessibilityLabel={`Mastery ${earned} of ${masteryMax}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: masteryMax, now: earned }}
      style={[styles.meter, style]}
      testID={testID}
    >
      {Array.from({ length: masteryMax }, (_, index) => (
        <View key={index} style={[styles.segment, index < earned && styles.segmentFilled]} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  meter: { flexDirection: 'row', gap: 4 },
  segment: { width: 18, height: 4, borderRadius: radius.pill, backgroundColor: c.track },
  segmentFilled: { backgroundColor: c.forest },
}));
