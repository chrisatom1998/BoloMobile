import type { MotionPreference } from '@/state/app-state-types';
import { useMotionPreference } from '@/hooks/use-motion-preference';

export function useReducedMotion(preference: MotionPreference = 'gentle') {
  return useMotionPreference(preference).reducedMotion;
}
