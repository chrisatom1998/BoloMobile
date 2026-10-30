/**
 * Floating Asha picture-in-picture.
 * Set this to false to keep the voice session on Asha's screen and hide the bubble.
 */
export const floatingAshaEnabled = true;

export const FLOATING_ASHA_BUBBLE_SIZE = 76;
export const FLOATING_ASHA_EDGE_MARGIN = 16;
/** iOS tab bar content height, excluding the home-indicator safe area. */
export const FLOATING_ASHA_TAB_BAR_HEIGHT = 49;

export type FloatingAshaBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export function floatingAshaBounds(input: {
  width: number;
  height: number;
  topInset: number;
  bottomInset: number;
  tabBarHeight: number;
  bubbleSize?: number;
  margin?: number;
}): FloatingAshaBounds {
  'worklet';
  const size = input.bubbleSize ?? FLOATING_ASHA_BUBBLE_SIZE;
  const margin = input.margin ?? FLOATING_ASHA_EDGE_MARGIN;
  const minX = margin;
  const maxX = Math.max(minX, input.width - size - margin);
  const minY = input.topInset + margin;
  const maxY = Math.max(minY, input.height - size - input.bottomInset - input.tabBarHeight - margin);
  return { minX, maxX, minY, maxY };
}

/** Snaps the bubble to the nearer left or right edge and clamps it inside the safe area. */
export function snapFloatingAshaPosition(
  x: number,
  y: number,
  screenWidth: number,
  bounds: FloatingAshaBounds,
  bubbleSize = FLOATING_ASHA_BUBBLE_SIZE,
): { x: number; y: number } {
  'worklet';
  const center = x + bubbleSize / 2;
  const snappedX = center < screenWidth / 2 ? bounds.minX : bounds.maxX;
  const snappedY = Math.min(bounds.maxY, Math.max(bounds.minY, y));
  return { x: snappedX, y: snappedY };
}

export function initialFloatingAshaPosition(
  screenWidth: number,
  screenHeight: number,
  bounds: FloatingAshaBounds,
  bubbleSize = FLOATING_ASHA_BUBBLE_SIZE,
): { x: number; y: number } {
  'worklet';
  const y = Math.min(bounds.maxY, Math.max(bounds.minY, (screenHeight - bubbleSize) / 2));
  return snapFloatingAshaPosition(screenWidth, y, screenWidth, bounds, bubbleSize);
}
