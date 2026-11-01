import { useEffect, useState, type PropsWithChildren } from 'react';
import {
  Animated,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { EffectiveMotion } from '@/hooks/use-motion-preference';

type MotionRevealProps = PropsWithChildren<{
  mode?: EffectiveMotion;
  motionKey?: string | number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function MotionReveal({
  children,
  mode = 'gentle',
  motionKey,
  style,
  testID,
}: MotionRevealProps) {
  const [progress] = useState(() => new Animated.Value(mode === 'reduced' ? 1 : 0));

  useEffect(() => {
    progress.stopAnimation();
    if (mode === 'reduced') {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    if (mode === 'lively') {
      const animation = Animated.spring(progress, {
        damping: 16,
        mass: 0.8,
        stiffness: 150,
        toValue: 1,
        useNativeDriver: true,
      });
      animation.start();
      return () => animation.stop();
    }
    const animation = Animated.timing(progress, {
      duration: 180,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [mode, motionKey, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [mode === 'lively' ? 14 : 4, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY }],
        },
      ]}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}
