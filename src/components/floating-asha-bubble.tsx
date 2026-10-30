import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';

import { TapPressable } from '@/components/tap-pressable';
import type { RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import {
  FLOATING_ASHA_BUBBLE_SIZE,
  FLOATING_ASHA_TAB_BAR_HEIGHT,
  floatingAshaBounds,
  initialFloatingAshaPosition,
  snapFloatingAshaPosition,
} from '@/lib/floating-asha';
import { useAppState } from '@/state/app-state';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
import { makeStyles, radius, useTheme } from '@/theme';

const ashaPortrait = require('../../assets/images/asha-portrait.png');
const SPRING = { damping: 22, stiffness: 240, mass: 0.8 };

type DragCells = {
  maxX: SharedValue<number>;
  maxY: SharedValue<number>;
  minX: SharedValue<number>;
  minY: SharedValue<number>;
  screenWidth: SharedValue<number>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
};

function createDragGesture(cells: DragCells) {
  return Gesture.Pan()
    .minDistance(8)
    .onStart(() => {
      cells.startX.value = cells.x.value;
      cells.startY.value = cells.y.value;
    })
    .onUpdate((event) => {
      cells.x.value = cells.startX.value + event.translationX;
      cells.y.value = cells.startY.value + event.translationY;
    })
    .onEnd(() => {
      // Same edge snap as snapFloatingAshaPosition, inlined so the UI thread does not call JS.
      const center = cells.x.value + FLOATING_ASHA_BUBBLE_SIZE / 2;
      const snappedX = center < cells.screenWidth.value / 2 ? cells.minX.value : cells.maxX.value;
      const snappedY = Math.min(cells.maxY.value, Math.max(cells.minY.value, cells.y.value));
      cells.x.value = withSpring(snappedX, SPRING);
      cells.y.value = withSpring(snappedY, SPRING);
    });
}

type Props = {
  isPlaying: boolean;
  onEnd: () => void;
  onExpand: () => void;
  status: RealtimeVoiceStatus;
};

function bubbleLabel(status: RealtimeVoiceStatus, isPlaying: boolean) {
  if (status === 'responding' || isPlaying) return 'Asha is speaking. Tap to return to the conversation.';
  if (status === 'recording') return 'Asha is listening. Tap to return to the conversation.';
  if (status === 'connecting') return 'Connecting to Asha. Tap to return to the conversation.';
  return 'Asha. Tap to return to the conversation.';
}

/**
 * Draggable portrait that keeps Asha above the navigator.
 * Release snaps her to the nearer screen edge, clear of the notch, home indicator, and tab bar.
 */
export function FloatingAshaBubble({ isPlaying, onEnd, onExpand, status }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const pathname = usePathname();
  const { motionPreference = DEFAULT_MOTION_PREFERENCE } = useAppState();
  const { reducedMotion } = useMotionPreference(motionPreference);
  const onTabs = pathname === '/' || pathname === '/live' || pathname === '/phrases' || pathname === '/progress';
  const speaking = status === 'responding' || status === 'recording' || isPlaying;
  const bounds = floatingAshaBounds({
    width,
    height,
    topInset: insets.top,
    bottomInset: insets.bottom,
    tabBarHeight: onTabs ? FLOATING_ASHA_TAB_BAR_HEIGHT : 0,
  });
  const initial = initialFloatingAshaPosition(width, height, bounds);
  const x = useSharedValue(initial.x);
  const y = useSharedValue(initial.y);
  const startX = useSharedValue(initial.x);
  const startY = useSharedValue(initial.y);
  const minX = useSharedValue(bounds.minX);
  const maxX = useSharedValue(bounds.maxX);
  const minY = useSharedValue(bounds.minY);
  const maxY = useSharedValue(bounds.maxY);
  const screenWidth = useSharedValue(width);
  const pulse = useSharedValue(1);

  const { maxX: boundMaxX, maxY: boundMaxY, minX: boundMinX, minY: boundMinY } = bounds;
  useEffect(() => {
    minX.value = boundMinX;
    maxX.value = boundMaxX;
    minY.value = boundMinY;
    maxY.value = boundMaxY;
    screenWidth.value = width;
    const snapped = snapFloatingAshaPosition(x.value, y.value, width, {
      maxX: boundMaxX,
      maxY: boundMaxY,
      minX: boundMinX,
      minY: boundMinY,
    });
    x.value = snapped.x;
    y.value = snapped.y;
  }, [boundMaxX, boundMaxY, boundMinX, boundMinY, maxX, maxY, minX, minY, screenWidth, width, x, y]);

  useEffect(() => {
    cancelAnimation(pulse);
    if (!speaking || reducedMotion) {
      pulse.value = withTiming(1, { duration: 180 });
      return () => cancelAnimation(pulse);
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reducedMotion, speaking]);

  const pan = useMemo(() => createDragGesture({
    maxX, maxY, minX, minY, screenWidth, startX, startY, x, y,
  }), [maxX, maxY, minX, minY, screenWidth, startX, startY, x, y]);
  const tap = useMemo(() => Gesture.Tap().runOnJS(true).onEnd(() => onExpand()), [onExpand]);
  const gesture = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);
  const position = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Animated.View pointerEvents="box-none" style={[styles.slot, position]}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessible
          accessibilityHint="Opens the conversation with Asha."
          accessibilityLabel={bubbleLabel(status, isPlaying)}
          accessibilityRole="button"
          onAccessibilityTap={onExpand}
          style={styles.bubble}
          testID="asha-bubble"
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, speaking && styles.ringLive, ringStyle]}
            testID={speaking ? 'asha-bubble-speaking' : 'asha-bubble-ring'}
          />
          <Image
            accessible={false}
            cachePolicy="memory-disk"
            contentFit="cover"
            source={ashaPortrait}
            style={styles.portrait}
            testID="asha-bubble-portrait"
          />
          {speaking ? <View pointerEvents="none" style={styles.liveDot} testID="asha-bubble-live-dot" /> : null}
        </Animated.View>
      </GestureDetector>
      <TapPressable
        accessibilityLabel="End live voice session"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onEnd}
        style={styles.end}
        testID="asha-bubble-end"
      >
        <X color={colors.white} size={14} strokeWidth={2.6} />
      </TapPressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  slot: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 40,
    elevation: 40,
    width: FLOATING_ASHA_BUBBLE_SIZE,
    height: FLOATING_ASHA_BUBBLE_SIZE,
  },
  bubble: {
    width: FLOATING_ASHA_BUBBLE_SIZE,
    height: FLOATING_ASHA_BUBBLE_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.night,
    shadowColor: c.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 12,
  },
  ring: {
    position: 'absolute',
    width: FLOATING_ASHA_BUBBLE_SIZE,
    height: FLOATING_ASHA_BUBBLE_SIZE,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: c.portraitRingFaint,
  },
  ringLive: {
    borderWidth: 3,
    borderColor: c.gold,
  },
  portrait: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: c.gold,
    backgroundColor: c.nightSurface,
  },
  liveDot: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: c.night,
    backgroundColor: c.gold,
  },
  end: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: c.nightSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.nightLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
