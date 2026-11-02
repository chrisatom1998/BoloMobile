import { forwardRef } from 'react';
import { Pressable, StyleSheet, type PressableInstance, type PressableProps, type PressableStateCallbackType } from 'react-native';

/**
 * Drop-in `Pressable` with the quick dim-and-settle highlight iOS controls
 * give on touch. Screens import it in place of React Native's `Pressable`, so
 * every tappable surface answers a press the same way without restyling.
 */
export const TapPressable = forwardRef<PressableInstance, PressableProps>(function TapPressable({ disabled, style, ...rest }, ref) {
  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      style={(state: PressableStateCallbackType) => {
        const base = typeof style === 'function' ? style(state) : style;
        return state.pressed && !disabled ? [base, styles.pressed] : base;
      }}
      {...rest}
    />
  );
});

const styles = StyleSheet.create({
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
