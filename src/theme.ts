import { useMemo } from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

export const lightColors = {
  background: '#F6F3ED',
  backgroundWarm: '#F8EFE4',
  paper: '#FCFAF6',
  paperRaised: '#FFFFFF',
  line: '#E5DED4',
  lineStrong: '#CEC4B7',
  /** Text-field outline; meets the 3:1 non-text contrast minimum on paper surfaces. */
  inputBorder: '#8F8679',

  ink: '#172523',
  muted: '#535D5A',
  mutedSoft: '#66716D',

  brand: '#A84428',
  brandDark: '#923A23',
  brandText: '#923A23',
  brandSoft: '#F6E2D7',

  forest: '#167366',
  forestDark: '#15594F',
  forestText: '#125E53',
  forestSoft: '#DDECE8',

  danger: '#A93B2B',
  dangerSurface: '#B84737',
  dangerSoft: '#FBEDEA',
  dangerLine: '#E4B5AE',

  success: '#1C6650',
  successSoft: '#EBF6F1',

  gold: '#E7AC3D',
  goldSoft: '#FFF1C9',
  /** Gold for icons and small marks on light surfaces (3:1+ on white). */
  goldIcon: '#B87D17',
  /** Readable text on goldSoft surfaces. */
  goldText: '#6B4A10',
  /** Readable secondary text on a solid gold surface. */
  goldDeepText: '#4A3408',

  /** Neutral progress-track fill behind coloured bars. */
  track: '#EDE6DC',

  neutralSurface: '#172523',
  neutralSurfaceText: '#FFFFFF',

  night: '#10201E',
  nightSurface: '#1E302D',
  nightLine: '#34504B',
  nightNav: '#0B1716',
  white: '#FFFFFF',
  black: '#000000',

  shadowOpacityScale: 1,

  heroRaised: '#18201E',
  heroSubtle: '#BFC9C6',
  heroGlyph: 'rgba(255, 255, 255, 0.18)',
  /** Faint decorative Devanagari watermark on brand (rust) surfaces. */
  onBrandWatermark: 'rgba(255, 255, 255, 0.08)',

  orb: '#E76B48',
  orbActive: '#D85F3D',
  orbRecording: '#C95335',
  /** Gold rings around Asha's tap-to-talk portrait on the night surface. */
  portraitRing: 'rgba(231, 172, 61, 0.5)',
  portraitRingFaint: 'rgba(231, 172, 61, 0.25)',
} as const;

export type ThemeColors = { [Key in keyof typeof lightColors]: typeof lightColors[Key] extends string ? string : number };

/** The app intentionally uses this light palette on every device appearance. */
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
  md: 14,
  lg: 20,
  xl: 24,
  xxl: 28,
  pill: 999,
} as const;

/** Control dimensions. 44pt is the platform minimum touch target. */
export const size = {
  /** Smallest width or height of anything tappable. */
  touchTarget: 44,
  /** Round icon controls in the composer row and the live call bar. */
  control: 48,
} as const;

/** Stroke widths for outlines and rings. */
export const borderWidth = {
  /** Pills, badges and outlined buttons. */
  thin: 1,
  /** The gold ring around Asha's portrait while her microphone or voice is live. */
  portraitLive: 3,
} as const;

/** Lucide glyph sizes beside text and inside round controls. */
export const iconSize = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
} as const;

/** Opacity of inactive controls on the night surface. */
export const opacity = {
  disabled: 0.45,
  /** The glyph inside a disabled filled button; the fill carries the disabled look. */
  disabledIcon: 0.4,
} as const;

/** Extra tappable inset around a small glyph. `icon` lifts a 16pt mark to the 44pt touch target. */
export const hitSlop = {
  icon: 14,
} as const;

/** Size and leading pairs for UI text that is not a heading. */
export const typeScale = {
  /** Button and pill labels. */
  label: { fontSize: 15, lineHeight: 20 },
  /** Small captions, kickers and list intros. */
  caption: { fontSize: 13, lineHeight: 18 },
  /** Romanization under a Devanagari caption line. */
  captionSecondary: { fontSize: 15, lineHeight: 21 },
  /** Asha and learner transcript lines. The leading is the unscaled single-line box. */
  chat: { fontSize: 16, lineHeight: 23 },
} as const;

/** Serif display face for Latin headings. Georgia has no Devanagari glyphs; use `hindiFont` for Hindi. */
export const displayFont = 'Georgia';

/**
 * Bundled Devanagari serif (Tiro Devanagari Hindi, OFL). Embedded natively by the
 * expo-font config plugin under this family name and loaded with `useFonts` on web.
 */
export const hindiFont = 'Tiro Devanagari Hindi';

/** Tiro needs ~1.45x leading so matras above the shirorekha and below the baseline are not clipped. */
export const hindiLineHeightRatio = 1.45;

/**
 * Type for rendered Devanagari. Tiro ships one weight, so this pins the regular
 * weight; a bold `fontWeight` would make the platform synthesise a smeared bold.
 */
export function hindiType(fontSize: number) {
  return {
    fontFamily: hindiFont,
    fontSize,
    lineHeight: Math.round(fontSize * hindiLineHeightRatio),
    fontWeight: '400',
  } as const satisfies TextStyle;
}

/** Widest comfortable measure for a single content column on tablets. */
export const maxContentWidth = 640;

const fixedLightTheme: {
  colors: ThemeColors;
  isDark: false;
  scheme: 'light';
} = {
  colors: lightColors,
  isDark: false,
  scheme: 'light' as const,
};

export function useTheme() {
  return fixedLightTheme;
}

export type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

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
    },
    elevatedCard: {
      backgroundColor: c.paperRaised,
      borderColor: c.line,
      borderWidth: 1,
      borderRadius: radius.lg,
      borderCurve: 'continuous',
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

/** Shared styles for Bolo's fixed light appearance. */
export const sharedStyles = StyleSheet.create(createSharedStyles(lightColors));
