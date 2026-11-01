import { ActivityIndicator, Text, View } from 'react-native';

import { displayFont, makeStyles, radius, spacing, stateMetrics, useTheme } from '@/theme';

type Tone = 'paper' | 'night';

type LoadingStateProps = {
  body: string;
  testID?: string;
  title: string;
  tone?: Tone;
};

export function LoadingState({ body, testID, title, tone = 'paper' }: LoadingStateProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const night = tone === 'night';
  return (
    <View
      accessibilityLabel={title}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={styles.wrap}
      testID={testID}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.skeleton}>
        <View style={[styles.bar, styles.titleBar, night ? styles.barNight : styles.barPaper]} />
        <View style={[styles.bar, styles.bodyBar, night ? styles.barNight : styles.barPaper]} />
        <View style={[styles.bar, styles.shortBar, night ? styles.barNight : styles.barPaper]} />
      </View>
      <ActivityIndicator color={night ? colors.gold : colors.brand} size="small" />
      <Text style={[styles.title, night && styles.titleNight]}>{title}</Text>
      <Text style={[styles.body, night && styles.bodyNight]}>{body}</Text>
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
  skeleton: {
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  bar: {
    borderCurve: 'continuous',
    borderRadius: radius.pill,
    height: stateMetrics.skeletonLine,
  },
  titleBar: {
    height: stateMetrics.skeletonTitle,
    width: stateMetrics.skeletonWidth,
  },
  bodyBar: {
    width: stateMetrics.skeletonWidth,
  },
  shortBar: {
    width: stateMetrics.skeletonShort,
  },
  barPaper: {
    backgroundColor: c.track,
  },
  barNight: {
    backgroundColor: c.nightLine,
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
