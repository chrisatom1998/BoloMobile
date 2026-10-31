import { PressableFeedback } from 'heroui-native/pressable-feedback';
import type { ComponentProps } from 'react';

import { colors, press } from '@/theme';

/**
 * UIKit highlight: a slight darkening, no scale and no ripple.
 * Scale reads as a bounce; iOS controls dim in place.
 */
const iosPressFeedback = {
  highlight: {
    backgroundColor: { value: colors.ink },
    opacity: { value: [0, press.highlightOpacity] as [number, number] },
  },
  ripple: false as const,
  scale: false as const,
};

export function IosPressable({ animation, ...props }: ComponentProps<typeof PressableFeedback>) {
  return <PressableFeedback animation={animation ?? iosPressFeedback} {...props} />;
}
