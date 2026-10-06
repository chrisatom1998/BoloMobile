import { useFonts } from 'expo-font';

import { hindiFont } from '@/theme';

const hindiFontSource = { [hindiFont]: require('../../assets/fonts/TiroDevanagariHindi-Regular.ttf') };

/**
 * The expo-font config plugin only embeds fonts in native projects, so web loads
 * Tiro Devanagari Hindi at runtime. Rendering is not gated on it: Hindi briefly
 * uses the browser's Devanagari fallback and swaps once the face is ready.
 */
export function useHindiFont() {
  useFonts(hindiFontSource);
}
