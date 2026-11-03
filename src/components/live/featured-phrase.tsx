import { Sprout, Volume2 } from 'lucide-react-native';
import { Text, View } from 'react-native';

import type { LiveScreenViewProps } from '@/components/live/live-screen-types';
import { TapPressable as Pressable } from '@/components/tap-pressable';

export function FeaturedPhrase({
  aiConsent,
  colors,
  hasTranscriptMessages,
  heroContentWidth,
  realtimeOwnsAudio,
  realtimeStatus,
  router,
  speak,
  studioPhrase,
  studioPhraseMastery,
  styles,
}: LiveScreenViewProps) {
  return realtimeStatus === 'disconnected' && !hasTranscriptMessages ? (
    <View style={styles.featuredPhraseSection} testID="featured-phrase-section">
      <Pressable
        accessibilityHint={aiConsent && !realtimeOwnsAudio ? 'Plays this Hindi phrase.' : 'Opens your saved phrases for review.'}
        accessibilityLabel={`Review pronunciation reference for ${studioPhrase.hi}`}
        accessibilityRole="button"
        onPress={() => {
          if (aiConsent && !realtimeOwnsAudio) void speak(studioPhrase.hi);
          else router.push('/phrases');
        }}
        style={[styles.studioPhrase, { width: heroContentWidth }]}
      >
        <View style={styles.studioPhraseHeading}>
          <View style={styles.studioPhraseCopy}>
            <Text style={styles.studioPhraseEyebrow}>Featured phrase</Text>
            <Text style={styles.studioPhraseEnglish}>{studioPhrase.en}</Text>
          </View>
          <View style={styles.studioListenIcon}><Volume2 color={colors.ink} size={18} /></View>
        </View>
        <Text accessibilityLanguage="hi-IN" style={styles.studioPhraseHindi}>{studioPhrase.hi}</Text>
        <Text style={styles.studioPhraseLatin}>{studioPhrase.latin}</Text>
        <View style={styles.studioPhraseFooter}>
          <Text style={styles.studioPhraseCue}>Say “{studioPhrase.latin}” naturally; keep the rhythm relaxed.</Text>
          <View style={styles.studioMastery}>
            <Sprout color={colors.goldText} size={15} />
            <Text style={styles.studioMasteryText}>{studioPhraseMastery ? `Mastery ${studioPhraseMastery}/5` : 'New phrase'}</Text>
          </View>
        </View>
      </Pressable>
    </View>
  ) : null;
}
