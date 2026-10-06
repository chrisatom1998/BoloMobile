const { existsSync } = require('fs') as { existsSync: (path: string) => boolean };
const { resolve } = require('path') as { resolve: (...paths: string[]) => string };

import { hindiFont, hindiLineHeightRatio, hindiType } from '../src/theme';

const appJson = require('../app.json') as { expo: { plugins: unknown[] } };

describe('Hindi typeface', () => {
  it('uses the single regular weight with room for matras', () => {
    const type = hindiType(20);
    expect(type.fontFamily).toBe(hindiFont);
    expect(type.fontWeight).toBe('400');
    expect(type.lineHeight).toBeGreaterThanOrEqual(20 * 1.4);
    expect(hindiLineHeightRatio).toBeGreaterThanOrEqual(1.4);
  });

  it('embeds the bundled font natively under the theme family name', () => {
    const plugin = appJson.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-font') as [string, {
      ios: { fonts: string[] };
      android: { fonts: { fontFamily: string; fontDefinitions: { path: string; weight: number }[] }[] };
    }] | undefined;
    expect(plugin).toBeDefined();
    const [, options] = plugin!;
    const androidFamily = options.android.fonts[0]!;
    expect(androidFamily.fontFamily).toBe(hindiFont);
    for (const fontPath of [...options.ios.fonts, ...androidFamily.fontDefinitions.map((definition) => definition.path)]) {
      expect(existsSync(resolve(fontPath))).toBe(true);
    }
    expect(existsSync(resolve('assets/fonts/OFL.txt'))).toBe(true);
  });
});
