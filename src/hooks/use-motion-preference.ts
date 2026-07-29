import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import type { MotionPreference } from '@/state/app-state-types';

export type EffectiveMotion = 'gentle' | 'lively' | 'reduced';

const useNativeReducedMotion = typeof Reanimated.useReducedMotion === 'function'
  ? Reanimated.useReducedMotion
  : () => false;

export function resolveMotionPreference(
  preference: MotionPreference,
  systemReduceMotion: boolean,
): EffectiveMotion {
  if (systemReduceMotion || preference === 'reduced') return 'reduced';
  return preference === 'lively' ? 'lively' : 'gentle';
}

export function useMotionPreference(preference: MotionPreference = 'gentle') {
  // Reanimated exposes the native value synchronously, preventing a brief
  // animation before the async AccessibilityInfo query completes.
  const nativeReduceMotion = useNativeReducedMotion();
  const [systemReduceMotion, setSystemReduceMotion] = useState(nativeReduceMotion);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setSystemReduceMotion(enabled);
      })
      .catch(() => {
        // Keep the conservative reduced-motion fallback if the native query fails.
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const mode = useMemo(
    () => resolveMotionPreference(preference, systemReduceMotion),
    [preference, systemReduceMotion],
  );

  return {
    lively: mode === 'lively',
    mode,
    reducedMotion: mode === 'reduced',
    systemReduceMotion,
  };
}
