import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import type { RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { ashaStatusCopy } from '@/lib/asha-status-copy';
import { layout, makeStyles, radius, spacing, type NamedStyles, type } from '@/theme';

const ashaPortrait = require('../../assets/images/asha-portrait.png');

const portraitSize = layout.todayPortraitSize;
const portraitSizeCompact = layout.todayPortraitSizeCompact;
const ringGap = layout.todayRingGap;
const statusDotSize = layout.statusDotSize;

type Props = {
  /** Smaller portrait for accessibility text sizes and narrow phones. */
  compact: boolean;
  onPress: () => void;
  /** Read from the shared voice session; this hero never starts or stops it. */
  status: RealtimeVoiceStatus;
  /** First run: the idle title greets the learner instead of "Ready when you are". A live status keeps its own title. */
  welcome?: boolean;
};

/**
 * Asha's portrait as the Today tab's main invitation. Status rings and the title
 * reflect the shared live session; the pill appears only while a session is live,
 * so an idle Today shows no READY badge. Tapping opens the Asha screen.
 */
export function TodayAshaHero({ compact, onPress, status, welcome = false }: Props) {
  const styles = useStyles();
  const copy = ashaStatusCopy(status);
  const live = status !== 'disconnected';
  const recording = status === 'recording';
  const title = welcome && !live ? 'Welcome to Bolo' : copy.title;

  return (
    <View style={styles.hero} testID="today-asha-hero">
      <View style={[styles.stage, compact && styles.stageCompact]}>
        <View pointerEvents="none" style={[styles.ring, styles.ringOuter, compact && styles.ringOuterCompact, live && styles.ringOuterLive]} testID="today-asha-ring-outer" />
        <View pointerEvents="none" style={[styles.ring, styles.ringInner, compact && styles.ringInnerCompact, live && styles.ringInnerLive, recording && styles.ringInnerRecording]} testID="today-asha-ring-inner" />
        <Pressable accessibilityLabel="Talk to Asha" accessibilityRole="button" onPress={onPress} style={[styles.portraitButton, compact && styles.portraitButtonCompact]} testID="today-asha-portrait">
          <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={[styles.portrait, compact && styles.portraitCompact]} transition={0} />
        </Pressable>
      </View>
      <View style={styles.copy}>
        {live ? (
          <View style={styles.pill} testID="today-asha-status">
            <View style={styles.dot} />
            <Text maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.kicker}>{copy.kicker}</Text>
          </View>
        ) : null}
        <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  // Tight gaps keep the Next lesson card above the fold on a 393x852 phone.
  hero: { width: '100%', alignItems: 'center', gap: spacing.sm },
  stage: { width: portraitSize + ringGap * 2, height: portraitSize + ringGap * 2, alignItems: 'center', justifyContent: 'center' },
  stageCompact: { width: portraitSizeCompact + ringGap * 2, height: portraitSizeCompact + ringGap * 2 },
  // 2pt rings match the Asha screen's portrait rings; recording thickens the inner one to 3pt like the live control.
  ring: { position: 'absolute', borderRadius: radius.pill, borderWidth: 2 },
  ringOuter: { width: portraitSize + ringGap * 2, height: portraitSize + ringGap * 2, borderColor: c.portraitRingFaint },
  ringOuterCompact: { width: portraitSizeCompact + ringGap * 2, height: portraitSizeCompact + ringGap * 2 },
  ringOuterLive: { borderColor: c.orb },
  ringInner: { width: portraitSize + ringGap, height: portraitSize + ringGap, borderColor: c.portraitRing },
  ringInnerCompact: { width: portraitSizeCompact + ringGap, height: portraitSizeCompact + ringGap },
  ringInnerLive: { borderColor: c.orbActive },
  ringInnerRecording: { borderWidth: 3, borderColor: c.orbRecording },
  portraitButton: { width: portraitSize, height: portraitSize, borderRadius: radius.pill, overflow: 'hidden' },
  portraitButtonCompact: { width: portraitSizeCompact, height: portraitSizeCompact },
  portrait: { width: portraitSize, height: portraitSize, borderRadius: radius.pill, borderColor: c.gold, borderWidth: 3, backgroundColor: c.brandSoft },
  portraitCompact: { width: portraitSizeCompact, height: portraitSizeCompact },
  copy: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
  // Only rendered while live, so the pill is always the brand-soft variant.
  pill: { minHeight: layout.statusPillMinHeight, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.brandSoft, borderColor: c.brandSoft, borderWidth: 1, paddingHorizontal: spacing.md },
  dot: { width: statusDotSize, height: statusDotSize, borderRadius: radius.pill, backgroundColor: c.brand },
  kicker: { ...type.eyebrow, color: c.brandText },
  title: { ...type.title, color: c.ink, textAlign: 'center' },
} satisfies NamedStyles));
