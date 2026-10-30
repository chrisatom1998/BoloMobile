import {
  FLOATING_ASHA_BUBBLE_SIZE,
  FLOATING_ASHA_EDGE_MARGIN,
  FLOATING_ASHA_TAB_BAR_HEIGHT,
  floatingAshaBounds,
  floatingAshaEnabled,
  initialFloatingAshaPosition,
  snapFloatingAshaPosition,
} from '../src/lib/floating-asha';

describe('floating Asha placement', () => {
  const bounds = floatingAshaBounds({
    width: 390,
    height: 844,
    topInset: 59,
    bottomInset: 34,
    tabBarHeight: FLOATING_ASHA_TAB_BAR_HEIGHT,
  });

  it('is on unless the flag is flipped', () => {
    expect(floatingAshaEnabled).toBe(true);
  });

  it('keeps the bubble clear of the notch, home indicator, and tab bar', () => {
    expect(bounds).toEqual({
      minX: FLOATING_ASHA_EDGE_MARGIN,
      maxX: 390 - FLOATING_ASHA_BUBBLE_SIZE - FLOATING_ASHA_EDGE_MARGIN,
      minY: 59 + FLOATING_ASHA_EDGE_MARGIN,
      maxY: 844 - FLOATING_ASHA_BUBBLE_SIZE - 34 - FLOATING_ASHA_TAB_BAR_HEIGHT - FLOATING_ASHA_EDGE_MARGIN,
    });
  });

  it('drops the tab bar inset on screens that do not show it', () => {
    const stackBounds = floatingAshaBounds({
      width: 390,
      height: 844,
      topInset: 59,
      bottomInset: 34,
      tabBarHeight: 0,
    });
    expect(stackBounds.maxY).toBe(bounds.maxY + FLOATING_ASHA_TAB_BAR_HEIGHT);
  });

  it('snaps to the nearer side and clamps the vertical position', () => {
    expect(snapFloatingAshaPosition(20, 400, 390, bounds).x).toBe(bounds.minX);
    expect(snapFloatingAshaPosition(200, 400, 390, bounds).x).toBe(bounds.maxX);
    expect(snapFloatingAshaPosition(200, 10, 390, bounds).y).toBe(bounds.minY);
    expect(snapFloatingAshaPosition(200, 900, 390, bounds).y).toBe(bounds.maxY);
    expect(snapFloatingAshaPosition(200, 420, 390, bounds).y).toBe(420);
  });

  it('starts on the right edge inside the safe area', () => {
    expect(initialFloatingAshaPosition(390, 844, bounds)).toEqual({
      x: bounds.maxX,
      y: Math.min(bounds.maxY, Math.max(bounds.minY, (844 - FLOATING_ASHA_BUBBLE_SIZE) / 2)),
    });
  });

  it('never places the top above the bottom when the screen is very short', () => {
    const tight = floatingAshaBounds({ width: 200, height: 120, topInset: 40, bottomInset: 40, tabBarHeight: 49 });
    expect(tight.maxX).toBeGreaterThanOrEqual(tight.minX);
    expect(tight.maxY).toBe(tight.minY);
    expect(snapFloatingAshaPosition(0, 0, 200, tight).y).toBe(tight.minY);
  });
});
