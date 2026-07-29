import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

jest.mock('react-native-reanimated', () => ({
  useReducedMotion: jest.fn(() => false),
}));

import { resolveMotionPreference, useMotionPreference } from '../src/hooks/use-motion-preference';
import type { MotionPreference } from '../src/state/app-state-types';

describe('movement preference resolution', () => {
  it.each([
    ['system', 'gentle'],
    ['gentle', 'gentle'],
    ['lively', 'lively'],
    ['reduced', 'reduced'],
  ] as const)('resolves %s to %s when system Reduce Motion is off', (preference, expected) => {
    expect(resolveMotionPreference(preference, false)).toBe(expected);
  });

  it.each(['system', 'gentle', 'lively', 'reduced'] as MotionPreference[])(
    'lets system Reduce Motion override %s',
    (preference) => {
      expect(resolveMotionPreference(preference, true)).toBe('reduced');
    },
  );

  it('follows native changes and removes its listener on unmount', async () => {
    const remove = jest.fn();
    let onReduceMotionChanged: ((enabled: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, handler: (enabled: boolean) => void) => {
      if (event === 'reduceMotionChanged') onReduceMotionChanged = handler;
      return { remove };
    }) as unknown as typeof AccessibilityInfo.addEventListener);

    const hook = await renderHook(() => useMotionPreference('lively'));
    await waitFor(() => expect(hook.result.current.mode).toBe('lively'));

    await act(async () => onReduceMotionChanged?.(true));
    expect(hook.result.current.mode).toBe('reduced');

    await hook.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
