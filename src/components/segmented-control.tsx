import { Tabs } from 'heroui-native/tabs';
import { type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, spacing } from '@/theme';

export type SegmentOption<T extends string> = {
  accessibilityLabel?: string;
  label: string;
  value: T;
};

type SegmentedControlProps<T extends string> = {
  accessibilityLabel: string;
  compact?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onValueChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
  value: T;
};

/**
 * A single, accessible HeroUI Native segmented control used for small, mutually
 * exclusive choices throughout Bolo. The control deliberately keeps its values
 * external so learner settings and realtime state remain the source of truth.
 */
export function SegmentedControl<T extends string>({
  accessibilityLabel,
  compact = false,
  disabled = false,
  disabledHint,
  onValueChange,
  options,
  style,
  testID,
  value,
}: SegmentedControlProps<T>) {
  const styles = useStyles();

  return (
    <Tabs
      onValueChange={(nextValue) => onValueChange(nextValue as T)}
      style={style}
      testID={testID}
      value={value}
      variant="primary"
    >
      <Tabs.List accessibilityLabel={accessibilityLabel} style={[styles.list, compact && styles.listCompact]}>
        <Tabs.Indicator pointerEvents="none" style={[styles.indicator, compact && styles.indicatorCompact]} />
        {options.map((option) => (
          <Tabs.Trigger
            accessibilityHint={disabled ? disabledHint : undefined}
            accessibilityLabel={`${accessibilityLabel}: ${option.accessibilityLabel ?? option.label}`}
            accessibilityRole="tab"
            isDisabled={disabled}
            key={option.value}
            style={[styles.trigger, compact && styles.triggerCompact]}
            value={option.value}
          >
            {({ isSelected }) => (
              <Tabs.Label numberOfLines={1} style={[styles.label, isSelected && styles.labelSelected, disabled && styles.labelDisabled]}>
                {option.label}
              </Tabs.Label>
            )}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

const useStyles = makeStyles((c) => ({
  list: {
    alignSelf: 'stretch',
    minHeight: 48,
    overflow: 'hidden',
    borderRadius: 16,
    borderCurve: 'continuous',
    borderColor: c.line,
    borderWidth: 1,
    backgroundColor: c.paper,
    padding: 4,
    boxShadow: '0 3px 10px rgba(0, 0, 0, 0.04)',
  },
  listCompact: {
    minHeight: 42,
    borderRadius: 14,
    padding: 3,
  },
  trigger: {
    zIndex: 1,
    minWidth: 0,
    minHeight: 40,
    flex: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.sm,
  },
  triggerCompact: {
    minHeight: 34,
    borderRadius: 11,
  },
  indicator: {
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: c.neutralSurface,
    boxShadow: '0 2px 5px rgba(0, 0, 0, 0.15)',
  },
  indicatorCompact: {
    borderRadius: 11,
  },
  label: {
    color: c.muted,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  labelSelected: {
    color: c.neutralSurfaceText,
  },
  labelDisabled: {
    color: c.mutedSoft,
  },
}));
