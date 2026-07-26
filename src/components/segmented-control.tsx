import { Tabs } from 'heroui-native/tabs';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
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
  /** Reflows options into full-width rows when a compact segmented row cannot safely fit Dynamic Type. */
  stackedAtLargeText?: boolean;
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
  stackedAtLargeText = false,
  style,
  testID,
  value,
}: SegmentedControlProps<T>) {
  const styles = useStyles();
  const largeTextLayout = useLargeTextLayout();
  const usesStackedLayout = stackedAtLargeText && largeTextLayout;

  if (usesStackedLayout) {
    return (
      <View accessibilityLabel={accessibilityLabel} accessibilityRole="tablist" style={[styles.stackedList, style]} testID={testID}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              accessibilityHint={disabled ? disabledHint : undefined}
              accessibilityLabel={`${accessibilityLabel}: ${option.accessibilityLabel ?? option.label}`}
              accessibilityRole="tab"
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              key={option.value}
              onPress={() => onValueChange(option.value)}
              style={({ pressed }) => [styles.stackedTrigger, selected && styles.stackedTriggerSelected, disabled && styles.stackedTriggerDisabled, pressed && !disabled && styles.stackedTriggerPressed]}
            >
              <Text style={[styles.stackedLabel, selected && styles.stackedLabelSelected, disabled && styles.labelDisabled]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <Tabs
      onValueChange={(nextValue) => onValueChange(nextValue as T)}
      style={style}
      testID={testID}
      value={value}
      variant="primary"
    >
      <Tabs.List accessibilityLabel={accessibilityLabel} style={[styles.list, compact && styles.listCompact, disabled && styles.listDisabled]}>
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
    minHeight: 50,
    borderRadius: 14,
    padding: 3,
  },
  listDisabled: {
    opacity: 0.55,
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
    minHeight: 44,
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
  stackedList: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  stackedTrigger: {
    minHeight: 48,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderColor: c.line,
    borderWidth: 1,
    backgroundColor: c.paper,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  stackedTriggerSelected: {
    borderColor: c.neutralSurface,
    backgroundColor: c.neutralSurface,
  },
  stackedTriggerDisabled: {
    opacity: 0.45,
  },
  stackedTriggerPressed: {
    opacity: 0.82,
  },
  stackedLabel: {
    color: c.muted,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  stackedLabelSelected: {
    color: c.neutralSurfaceText,
  },
}));
