import { useMemo } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

export const lightColors = {
  background: '#F7F4EE',
  backgroundWarm: '#FBF1E4',
  paper: '#FFFCF6',
  paperRaised: '#FFFFFF',
  line: '#E3DBCF',
  lineStrong: '#D0C5B6',

  ink: '#172523',
  muted: '#535D5A',
  mutedSoft: '#66716D',

  brand: '#AC4828',
  brandDark: '#9C3F25',
  brandText: '#9C3F25',
  brandSoft: '#F8E1D3',

  forest: '#167366',
  forestDark: '#15594F',
  forestText: '#125E53',
  forestSoft: '#DDECE8',

  danger: '#A93B2B',
  dangerSurface: '#B84737',
  dangerSoft: '#FBEDEA',
  dangerLine: '#E4B5AE',

  success: '#1C6650',
  successSurface: '#23745E',
  successSoft: '#EBF6F1',

  gold: '#E7AC3D',
  goldSoft: '#FFF1C9',

  neutralSurface: '#172523',
  neutralSurfaceText: '#FFFFFF',

  night: '#10201E',
  white: '#FFFFFF',
  black: '#000000',

  shadowOpacityScale: 1,

  heroBase: '#0D1513',
  heroRaised: '#18201E',
  heroLine: 'rgba(255, 255, 255, 0.11)',
  heroMuted: '#909B97',
  heroSegmentIdle: '#C1C8C5',
  heroBody: '#FFF2EA',
  heroSubtle: '#BFC9C6',
  heroOverlay: 'rgba(20, 33, 31, 0.24)',
  heroGlyph: 'rgba(255, 255, 255, 0.18)',

  orb: '#E76B48',
  orbActive: '#D85F3D',
  orbRecording: '#C95335',
} as const;

export type ThemeColors = { [Key in keyof typeof lightColors]: typeof lightColors[Key] extends string ? string : number };

export const darkColors: ThemeColors = {
  background: '#0D1513',
  backgroundWarm: '#141E1B',
  paper: '#18211F',
  paperRaised: '#1E2826',
  line: '#2A3431',
  lineStrong: '#3B4643',

  ink: '#F2EFE9',
  muted: '#AAB4B0',
  mutedSoft: '#8B9591',

  brand: '#C2532F',
  brandDark: '#F0A184',
  brandText: '#F0A184',
  brandSoft: '#3A2018',

  forest: '#12786A',
  forestDark: '#0F6355',
  forestText: '#5FC7A6',
  forestSoft: '#16413A',

  danger: '#F09A88',
  dangerSurface: '#A63F2F',
  dangerSoft: '#331914',
  dangerLine: '#6B3125',

  success: '#5FC7A6',
  successSurface: '#1C6650',
  successSoft: '#14322A',

  gold: '#E7AC3D',
  goldSoft: '#3A2E12',

  neutralSurface: '#F2EFE9',
  neutralSurfaceText: '#0D1513',

  night: '#243330',
  white: '#FFFFFF',
  black: '#000000',

  // Ambient shadows read as muddy smears on dark surfaces; elevation comes from borders instead.
  shadowOpacityScale: 0,

  heroBase: '#0A110F',
  heroRaised: '#161E1C',
  heroLine: 'rgba(255, 255, 255, 0.11)',
  heroMuted: '#9AA5A1',
  heroSegmentIdle: '#C1C8C5',
  heroBody: '#FFF2EA',
  heroSubtle: '#BFC9C6',
  heroOverlay: 'rgba(20, 33, 31, 0.4)',
  heroGlyph: 'rgba(255, 255, 255, 0.16)',

  orb: '#D45F3F',
  orbActive: '#C25535',
  orbRecording: '#B44B2E',
};

/** Light palette. Prefer `useTheme()` in components so dark mode is honored. */
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

/** Widest comfortable measure for a single content column on tablets. */
export const maxContentWidth = 640;

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return useMemo(
    () => ({ colors: isDark ? darkColors : lightColors, isDark, scheme: isDark ? ('dark' as const) : ('light' as const) }),
    [isDark],
  );
}

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

const styleCache = new WeakMap<object, WeakMap<object, NamedStyles>>();

/**
 * Builds a themed stylesheet hook. Results are cached per (factory, palette) pair,
 * so switching schemes reuses stylesheets instead of rebuilding them each render.
 */
export function makeStyles<T extends NamedStyles>(factory: (colors: ThemeColors) => T) {
  return function useThemedStyles(): T {
    const { colors: palette } = useTheme();
    return useMemo(() => {
      let perPalette = styleCache.get(factory);
      if (!perPalette) {
        perPalette = new WeakMap();
        styleCache.set(factory, perPalette);
      }
      const cached = perPalette.get(palette);
      if (cached) return cached as T;
      const created = StyleSheet.create(factory(palette));
      perPalette.set(palette, created);
      return created;
    }, [palette]);
  };
}

export function createSharedStyles(c: ThemeColors) {
  return {
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
    card: {
      backgroundColor: c.paper,
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      padding: spacing.lg,
      gap: spacing.md,
      shadowColor: c.black,
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.06 * c.shadowOpacityScale,
      shadowRadius: 18,
      elevation: 2 * c.shadowOpacityScale,
    },
    elevatedCard: {
      backgroundColor: c.paperRaised,
      borderColor: c.line,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
      shadowColor: c.black,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.09 * c.shadowOpacityScale,
      shadowRadius: 22,
      elevation: 3 * c.shadowOpacityScale,
    },
    eyebrow: {
      color: c.brandText,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    heading: {
      color: c.ink,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '800',
    },
    body: {
      color: c.muted,
      fontSize: 16,
      lineHeight: 23,
    },
    primaryButton: {
      minHeight: 52,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: c.neutralSurface,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    primaryButtonText: {
      color: c.neutralSurfaceText,
      fontSize: 16,
      fontWeight: '800',
    },
  } as const satisfies NamedStyles;
}

export const useSharedStyles = makeStyles(createSharedStyles);

/** Light-mode shared styles. Prefer `useSharedStyles()` so dark mode is honored. */
export const sharedStyles = StyleSheet.create(createSharedStyles(lightColors));
