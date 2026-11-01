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
  /** Body text on brand (rust) surfaces. */
  onBrandText: '#FBEFE8',
  /** Frosted chips and callouts on brand surfaces. */
  onBrandChip: 'rgba(255, 255, 255, 0.14)',
  onBrandCallout: 'rgba(255, 255, 255, 0.10)',
  /** Hairlines and empty ring tracks on brand surfaces. */
  onBrandLine: 'rgba(255, 255, 255, 0.18)',
  onBrandTrack: 'rgba(255, 255, 255, 0.22)',
  onBrandOutline: 'rgba(255, 255, 255, 0.5)',
  /** The current step's dot fill on brand surfaces. */
  onBrandGoldTint: 'rgba(231, 172, 61, 0.25)',

  orb: '#E76B48',
  orbActive: '#D85F3D',
  orbRecording: '#C95335',
  /** Gold rings around Asha's tap-to-talk portrait on the night surface. */
  portraitRing: 'rgba(231, 172, 61, 0.5)',
  portraitRingFaint: 'rgba(231, 172, 61, 0.25)',
  /** Live-orb ring and highlight on the night surface. */
  orbRingDark: 'rgba(231, 172, 61, 0.35)',
  orbHighlight: 'rgba(255, 255, 255, 0.17)',
  /** Brighter gold for the recording state of the gold orb. */
  goldBright: '#F2BE57',
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
  /** Side padding for every screen. */
  gutter: 20,
} as const;

/** Shared layout measures. */
export const layout = {
  /** Smallest height of a tappable control. */
  touchTarget: 44,
  /** Trailing space after the last suggestion chip once the row is scrolled to the end. Same width as the screen gutter. */
  chipEndInset: spacing.gutter,
  /** Space between the suggestion row and the screen edge. */
  chipScrollInset: spacing.lg,
  /** How much of the next chip stays in view so the row shows it can scroll. */
  chipPeek: spacing.xl,
  /**
   * Stack the Asha header below this width. A 393pt phone stays on one row.
   */
  headerStackBelow: 360,
  /** Distance scrolled before the Asha header collapses to a bar. */
  headerCollapseOffset: spacing.xxl + spacing.lg,
  /**
   * Dynamic Type at this scale or larger is an accessibility size.
   * The Asha header starts as a compact bar so the portrait stays on screen.
   */
  accessibilityFontScale: 1.6,
  /** Caps the Asha title, Private label, and subtitle. */
  headerFontScaleCap: 1.3,
  /**
   * Caps the composer so three lines can hold "Ask in English or Hindi…".
   * Still well above the body size, so the field grows at accessibility sizes.
   */
  composerFontScaleCap: 2.4,
  /** Lines the composer keeps so the placeholder stays whole at an accessibility size. */
  composerLines: 3,
  /** Extra room so the last composer line clears the field's own padding. */
  composerLineSlack: spacing.lg,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  xxl: 28,
  pill: 999,
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

/**
 * Type scale. Every text style uses one of these roles (spread it, then add color).
 * Weights are 400, 600 and 700 only: Georgia ships regular and bold, so 800/900
 * would be synthesised and smear. Hindi uses `hindiType()`: 28 hero, 20 card, 17 inline.
 * Documented exceptions: the tab-bar badge (below 12 pt) and decorative numerals
 * or watermark glyphs of 40 pt and up.
 */
export const type = {
  /** Screen titles: Today greeting, Phrases, Progress, Settings, Onboarding. */
  display: { fontFamily: displayFont, fontSize: 34, lineHeight: 40, fontWeight: '700' },
  /** Hero card titles, lesson title. */
  title: { fontFamily: displayFont, fontSize: 26, lineHeight: 32, fontWeight: '700' },
  /** Section headings, lesson-list titles, prompts. */
  headline: { fontFamily: displayFont, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  /** Asha's lines, lead text. */
  bodyLarge: { fontSize: 17, lineHeight: 24, fontWeight: '400' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  /** Buttons, segmented options, list names. */
  label: { fontSize: 16, lineHeight: 20, fontWeight: '600' },
  /** Metadata, helper text. */
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;

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
      ...type.eyebrow,
      color: c.brandText,
    },
    heading: {
      ...type.display,
      color: c.ink,
    },
    body: {
      ...type.body,
      color: c.muted,
    },
    primaryButton: createButtonStyles(c).primary,
    primaryButtonText: createButtonStyles(c).primaryText,
  } as const satisfies NamedStyles;
}

/**
 * Colour roles. Keep them fixed so every screen reads the same way:
 * - rust (`brand`): the brand, and the single primary action on a cream screen.
 * - gold: celebration and streaks, and the action that sits on a rust surface.
 * - forest: correct answers and success only. Never links, arrows or plain actions.
 * - ink: text, and the selected state of controls.
 *
 * Button variants. A screen shows at most one filled button besides `positive`.
 * Spread the container into a Pressable style and the matching `*Text` into its label.
 */
export function createButtonStyles(c: ThemeColors) {
  const base = {
    minHeight: 52,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  } as const satisfies ViewStyle;
  return {
    /** Rust fill: the one main action on a cream screen. */
    primary: { ...base, backgroundColor: c.brand },
    primaryText: { ...type.label, color: c.white, textAlign: 'center' },
    /** Gold fill: only on rust surfaces. */
    primaryOnBrand: { ...base, backgroundColor: c.gold },
    primaryOnBrandText: { ...type.label, color: c.ink, textAlign: 'center' },
    /** Paper with a strong hairline: supporting actions (Again, Hint, Recalibrate). */
    secondary: { ...base, backgroundColor: c.paper, borderWidth: 1, borderColor: c.lineStrong },
    secondaryText: { ...type.label, color: c.ink, textAlign: 'center' },
    /** Text only: links, Done, All plans. */
    quiet: { minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm },
    quietText: { ...type.label, color: c.brandText },
    /** Forest fill: only the "Got it" grade. */
    positive: { ...base, backgroundColor: c.forest },
    positiveText: { ...type.label, color: c.white, textAlign: 'center' },
  } as const satisfies NamedStyles;
}

/** Button variants for Bolo's fixed light palette. */
export const buttons = StyleSheet.create(createButtonStyles(lightColors));

export const useSharedStyles = makeStyles(createSharedStyles);

/** Shared styles for Bolo's fixed light appearance. */
export const sharedStyles = StyleSheet.create(createSharedStyles(lightColors));
