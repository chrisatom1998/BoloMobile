import { ChevronDown } from 'lucide-react-native';
import { useMemo, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { TapPressable } from '@/components/tap-pressable';
import { displayFont, makeStyles, radius, spacing, useTheme, type } from '@/theme';

type MinimizeProps = {
  onPress: () => void;
};

/** Header control that shrinks the live conversation into the floating bubble. */
export function AshaMinimizeButton({ onPress }: MinimizeProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <TapPressable
      accessibilityHint="Keeps your conversation with Asha on screen while you browse."
      accessibilityLabel="Minimize Asha"
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={styles.minimizeButton}
      testID="asha-minimize"
    >
      <ChevronDown color={colors.white} size={18} strokeWidth={2.4} />
    </TapPressable>
  );
}

type SwipeProps = {
  children: ReactNode;
  onMinimize: () => void;
};

/** Swipe down on Asha's header to minimize. Small moves still scroll the conversation. */
export function AshaSwipeToMinimize({ children, onMinimize }: SwipeProps) {
  const pan = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(24)
    .failOffsetX([-40, 40])
    .onEnd((event) => {
      if (event.translationY > 80) onMinimize();
    }), [onMinimize]);
  return <GestureDetector gesture={pan}>{children}</GestureDetector>;
}

type CoverProps = {
  onExpand: () => void;
  statusLabel: string;
};

/** Resting state on Asha's screen while she is floating over the rest of the app. */
export function AshaMinimizedCover({ onExpand, statusLabel }: CoverProps) {
  const styles = useStyles();
  return (
    <View style={styles.cover} testID="asha-minimized-cover">
      <Text style={styles.kicker}>{statusLabel}</Text>
      <Text accessibilityRole="header" style={styles.title}>Asha is still with you</Text>
      <Text style={styles.body}>She stays in the bubble while you look around. Tap it to come back to this conversation.</Text>
      <TapPressable accessibilityLabel="Bring Asha back" accessibilityRole="button" onPress={onExpand} style={styles.returnButton}>
        <Text style={styles.returnText}>Bring Asha back</Text>
      </TapPressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  minimizeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    borderColor: c.nightLine,
    borderWidth: 1,
    backgroundColor: c.nightSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 4,
    backgroundColor: c.night,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  kicker: { ...type.eyebrow, color: c.gold },
  title: { ...type.display, color: c.white, textAlign: 'center' },
  body: { ...type.body, maxWidth: 300, color: c.heroSubtle, textAlign: 'center' },
  returnButton: {
    minHeight: 48,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: c.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  returnText: { ...type.label, color: c.ink },
}));
