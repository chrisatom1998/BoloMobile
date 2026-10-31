import { forwardRef } from 'react';
import { Pressable, type PressableProps, type PressableStateCallbackType, type View } from 'react-native';

import { press } from '@/theme';

/**
 * Drop-in `Pressable` with the opacity highlight iOS controls use on touch.
 * No scale: a bounce reads as a custom animation, and a dim reads as UIKit.
 */
export const TapPressable = forwardRef<View, PressableProps>(function TapPressable({ disabled, style, ...rest }, ref) {
  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      style={(state: PressableStateCallbackType) => {
        const base = typeof style === 'function' ? style(state) : style;
        return state.pressed && !disabled ? [base, { opacity: press.opacity }] : base;
      }}
      {...rest}
    />
  );
});
