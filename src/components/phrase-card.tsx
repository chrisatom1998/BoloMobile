import { Volume2 } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { phraseCardLines, phraseCardListenLabel } from '@/lib/phrase-card-lines';
import type { ScriptPreference } from '@/state/app-state-types';
import { hindiType, makeStyles, radius, spacing, useTheme } from '@/theme';

export type PhraseCardVariant = 'light' | 'night';
export type PhraseCardSize = 'regular' | 'compact';

export type PhraseCardProps = {
  devanagari?: string | null;
  romanized?: string | null;
  english?: string | null;
  scriptPreference: ScriptPreference;
  /** Renders a 44pt Listen button that calls this; the card itself is never a button. */
  onListen?: () => void;
  /** Audio for this phrase is playing or loading: the button shows a spinner and reads as busy. */
  playing?: boolean;
  listenDisabled?: boolean;
  /** Overrides the default "Listen to <english or romanized>" screen-reader name. */
  listenLabel?: string;
  listenHint?: string;
  /** 'night' sits on the live/voice surface: gold romanization on nightSurface. */
  variant?: PhraseCardVariant;
  /** 'compact' is for horizontal strips and "up next" rows. */
  size?: PhraseCardSize;
  /** Review/recall: a neutral placeholder stands in for the Hindi lines; English stays visible. */
  concealed?: boolean;
  concealedLabel?: string;
  /** Accessory slot rendered under the text lines (mastery dots, chips, notes). */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The one way Bolo lays out a Hindi phrase: Devanagari (Tiro, regular weight,
 * 1.45 leading), then a single romanization, then the English meaning, behind a
 * 4pt gold rule. Script visibility comes from `phraseCardLines`, so 'latin'
 * learners never see Devanagari here and no phrase ever shows two spellings.
 *
 * Each language is its own accessible Text node (the Devanagari one tagged
 * hi-IN) rather than one merged label, so VoiceOver can switch voices. The
 * container carries no role; only the optional Listen button is a control.
 * Heights are never fixed: at Dynamic Type >= 1.4 the Listen button drops
 * below the text instead of sharing the row.
 */
export function PhraseCard({
  devanagari,
  romanized,
  english,
  scriptPreference,
  onListen,
  playing = false,
  listenDisabled = false,
  listenLabel,
  listenHint,
  variant = 'light',
  size = 'regular',
  concealed = false,
  concealedLabel = 'Answer hidden',
  children,
  style,
  testID = 'phrase-card',
}: PhraseCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const largeTextLayout = useLargeTextLayout();
  const lines = phraseCardLines({ devanagari, romanized, english, scriptPreference });
  const night = variant === 'night';
  const compact = size === 'compact';
  const stacked = largeTextLayout;
  const hasHindi = lines.primary !== null;
  const accentColor = night ? colors.gold : colors.brandText;

  return (
    <View
      style={[styles.card, night && styles.cardNight, compact && styles.cardCompact, style]}
      testID={testID}
    >
      <View style={[styles.body, stacked && styles.bodyStacked]} testID={`${testID}-body`}>
        <View style={styles.lines}>
          {concealed && hasHindi ? (
            <Text
              style={[styles.concealed, night && styles.concealedNight, compact && styles.concealedCompact]}
              testID={`${testID}-concealed`}
            >
              {concealedLabel}
            </Text>
          ) : null}
          {!concealed && lines.devanagari ? (
            <Text
              accessibilityLanguage="hi-IN"
              style={[styles.devanagari, compact && styles.devanagariCompact, night && styles.devanagariNight]}
              testID={`${testID}-devanagari`}
            >
              {lines.devanagari}
            </Text>
          ) : null}
          {!concealed && lines.romanized ? (
            <Text
              style={[
                styles.romanized,
                compact && styles.romanizedCompact,
                lines.primary === 'romanized' && (compact ? styles.romanizedPrimaryCompact : styles.romanizedPrimary),
                night && styles.romanizedNight,
              ]}
              testID={`${testID}-romanized`}
            >
              {lines.romanized}
            </Text>
          ) : null}
          {lines.english ? (
            <Text
              style={[styles.english, compact && styles.englishCompact, night && styles.englishNight]}
              testID={`${testID}-english`}
            >
              {lines.english}
            </Text>
          ) : null}
          {children ? <View style={styles.accessory}>{children}</View> : null}
        </View>
        {onListen ? (
          <Pressable
            accessibilityHint={listenHint}
            accessibilityLabel={listenLabel ?? phraseCardListenLabel(lines, concealed)}
            accessibilityRole="button"
            accessibilityState={{ busy: playing, disabled: listenDisabled }}
            disabled={listenDisabled}
            onPress={onListen}
            style={[
              styles.listen,
              night && styles.listenNight,
              stacked && styles.listenStacked,
              playing && (night ? styles.listenPlayingNight : styles.listenPlaying),
              listenDisabled && styles.listenDisabled,
            ]}
            testID={`${testID}-listen`}
          >
            {playing ? (
              <ActivityIndicator color={accentColor} size="small" testID={`${testID}-listen-busy`} />
            ) : (
              <Volume2 color={accentColor} size={18} />
            )}
            {stacked ? <Text style={[styles.listenText, night && styles.listenTextNight]}>{playing ? 'Playing' : 'Listen'}</Text> : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  // Mockup "phrase block": 4pt gold rule, 14pt radii on the right, 6pt on the left.
  card: {
    backgroundColor: c.background,
    borderLeftWidth: 4,
    borderLeftColor: c.gold,
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    borderCurve: 'continuous',
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.md,
  },
  cardNight: { backgroundColor: c.nightSurface },
  cardCompact: { paddingVertical: spacing.sm, paddingLeft: spacing.sm + spacing.xs, paddingRight: spacing.sm },
  body: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bodyStacked: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  lines: { flex: 1, flexShrink: 1, minWidth: 0, gap: spacing.xs },
  devanagari: { ...hindiType(22), color: c.ink },
  devanagariCompact: hindiType(18),
  devanagariNight: { color: c.white },
  romanized: { color: c.brandText, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  romanizedCompact: { fontSize: 14, lineHeight: 19 },
  romanizedPrimary: { fontSize: 20, lineHeight: 27 },
  romanizedPrimaryCompact: { fontSize: 17, lineHeight: 23 },
  romanizedNight: { color: c.gold },
  english: { color: c.muted, fontSize: 14, lineHeight: 19 },
  englishCompact: { fontSize: 13, lineHeight: 18 },
  englishNight: { color: c.heroSubtle },
  concealed: { color: c.muted, fontSize: 15, lineHeight: 20, fontStyle: 'italic' },
  concealedCompact: { fontSize: 14, lineHeight: 19 },
  concealedNight: { color: c.heroSubtle },
  accessory: { marginTop: spacing.xs },
  listen: {
    alignSelf: 'center',
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: c.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  listenNight: { backgroundColor: c.nightLine },
  listenStacked: { alignSelf: 'flex-start', paddingHorizontal: spacing.lg },
  listenPlaying: { backgroundColor: c.goldSoft },
  listenPlayingNight: { backgroundColor: c.night },
  listenDisabled: { opacity: 0.4 },
  listenText: { color: c.brandText, fontSize: 15, fontWeight: '800' },
  listenTextNight: { color: c.gold },
}));
