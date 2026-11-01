import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { StateAction } from '@/components/states/state-action';
import { displayFont, hindiType, makeStyles, radius, spacing, stateMetrics } from '@/theme';

type EmptyStateProps = {
  accessibilityLabel: string;
  actionLabel: string;
  body: string;
  detail?: string;
  icon?: ReactNode;
  onAction: () => void;
  portrait?: boolean;
  testID?: string;
  title: string;
};

const ashaPortrait = require('../../../assets/images/asha-portrait.png');

export function EmptyState({
  accessibilityLabel,
  actionLabel,
  body,
  detail,
  icon,
  onAction,
  portrait,
  testID,
  title,
}: EmptyStateProps) {
  const styles = useStyles();
  return (
    <View style={styles.wrap} testID={testID}>
      {portrait ? (
        <Image
          accessible={false}
          contentFit="cover"
          source={ashaPortrait}
          style={styles.portrait}
        />
      ) : null}
      {icon}
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.hindi}>नमस्ते</Text>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      <Text style={styles.body}>{body}</Text>
      <StateAction accessibilityLabel={accessibilityLabel} label={actionLabel} onPress={onAction} testID={testID ? `${testID}-action` : undefined} />
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
  portrait: {
    borderRadius: radius.pill,
    height: stateMetrics.portrait,
    width: stateMetrics.portrait,
  },
  hindi: {
    ...hindiType(stateMetrics.title),
    color: c.brand,
    textAlign: 'center',
  },
  title: {
    color: c.ink,
    fontFamily: displayFont,
    fontSize: stateMetrics.title,
    fontWeight: '700',
    lineHeight: stateMetrics.titleLine,
    textAlign: 'center',
  },
  detail: {
    color: c.ink,
    fontFamily: displayFont,
    fontSize: stateMetrics.body,
    lineHeight: stateMetrics.bodyLine,
    textAlign: 'center',
  },
  body: {
    color: c.muted,
    fontSize: stateMetrics.body,
    lineHeight: stateMetrics.bodyLine,
    textAlign: 'center',
  },
}));
