import { renderHook } from '@testing-library/react-native';

import { colors, lightColors, useTheme } from '../src/theme';

function relativeLuminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/giu)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  if (red === undefined || green === undefined || blue === undefined) {
    throw new Error(`expected three color channels in ${hex}`);
  }
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('accessible theme contrast', () => {
  it('locks the runtime palette to light mode', async () => {
    const { result } = await renderHook(() => useTheme());

    expect(result.current.colors).toBe(lightColors);
    expect(result.current.isDark).toBe(false);
    expect(result.current.scheme).toBe('light');
  });

  it.each([
    ['white text on the brand color', colors.white, colors.brand],
    ['white text on the forest color', colors.white, colors.forest],
    ['muted text on the app background', colors.muted, colors.background],
    ['muted text on paper cards', colors.muted, colors.paper],
    ['muted text on forest cards', colors.muted, colors.forestSoft],
  ])('keeps %s at or above 4.5:1', (_label, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });
});
