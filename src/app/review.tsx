import { useRouter } from 'expo-router';
import { Check, RotateCcw, Volume2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { observe } from '@/lib/observability';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { hasOfflineSpeech, speakText, stopSpeaking } from '@/lib/speech';
import { useAppState } from '@/state/app-state';
import { colors, radius, sharedStyles, spacing } from '@/theme';

export default function ReviewScreen() {
  const router = useRouter();
  const { aiConsent, duePhrases, learnerProfile, phraseReviews, phrases, reviewPhrase } = useAppState();
  const session = useMemo(() => (duePhrases.length ? duePhrases : [...phrases].sort((a, b) => (phraseReviews[a.hi]?.mastery ?? 0) - (phraseReviews[b.hi]?.mastery ?? 0)).slice(0, 5)), [duePhrases, phraseReviews, phrases]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [audioError, setAudioError] = useState('');
  const phrase = session[index];

  useEffect(() => () => { void stopSpeaking(); }, []);
  useEffect(() => {
    if (session.length > 0 && index >= session.length) observe('review_completed');
  }, [index, session.length]);

  function grade(remembered: boolean) {
    if (!phrase) return;
    reviewPhrase(phrase.hi, remembered);
    if (remembered) hapticSuccess();
    else hapticWarning();
    if (remembered) setCorrect((value) => value + 1);
    setRevealed(false);
    setIndex((value) => value + 1);
  }

  async function playPhrase(playbackRate = 1) {
    if (!phrase || (!aiConsent && !hasOfflineSpeech(phrase.hi))) return;
    setAudioError('');
    try {
      await speakText(phrase.hi, undefined, playbackRate);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'Bolo could not play the voice.');
    }
  }

  if (session.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Save a phrase to start reviewing</Text>
        <Text style={styles.body}>Natural answers saved from scenes will become quick recall cards here.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={sharedStyles.primaryButton}><Text style={sharedStyles.primaryButtonText}>Choose a scene</Text></Pressable>
      </View>
    );
  }

  if (!phrase) {
    return (
      <View style={styles.center}>
        <View style={styles.doneMark}><Check color={colors.white} size={34} /></View>
        <Text style={sharedStyles.eyebrow}>Review complete</Text>
        <Text style={styles.title}>{correct} of {session.length} remembered</Text>
        <Text style={styles.body}>Bolo scheduled each phrase based on how it felt today.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={sharedStyles.primaryButton}><Text style={sharedStyles.primaryButtonText}>Back to today</Text></Pressable>
      </View>
    );
  }

  const showHindi = learnerProfile.scriptPreference !== 'latin';
  const showLatin = learnerProfile.scriptPreference !== 'devanagari';
  const mastery = phraseReviews[phrase.hi]?.mastery ?? 0;
  const canListen = aiConsent || hasOfflineSpeech(phrase.hi);

  return (
    <View style={styles.screen}>
      <View style={styles.header}><Text style={styles.progress}>Phrase {index + 1} of {session.length}</Text><Text style={styles.mastery}>Mastery {mastery}/5</Text></View>
      <View style={styles.track}><View style={[styles.trackFill, { width: `${index / session.length * 100}%` }]} /></View>
      <View accessibilityLabel={`Review phrase ${phrase.hi}`} style={styles.card}>
        <Text style={sharedStyles.eyebrow}>Say this naturally</Text>
        <Text style={styles.prompt}>{phrase.en}</Text>
        {revealed ? (
          <View style={styles.answer}>
            {showHindi ? <Text style={styles.hindi}>{phrase.hi}</Text> : null}
            {showLatin ? <Text style={styles.latin}>{phrase.latin}</Text> : null}
            <View style={styles.audioRow}>
              <Pressable accessibilityHint={canListen ? undefined : 'Agree to connected AI processing to enable Listen.'} accessibilityLabel={`Hear ${phrase.hi}`} accessibilityRole="button" accessibilityState={{ disabled: !canListen }} disabled={!canListen} onPress={() => void playPhrase()} style={[styles.audioButton, !canListen && styles.disabled]}><Volume2 color={colors.forest} size={18} /><Text style={styles.audioText}>Listen</Text></Pressable>
              <Pressable accessibilityHint={canListen ? undefined : 'Agree to connected AI processing to enable Listen.'} accessibilityLabel={`Hear ${phrase.hi} slowly`} accessibilityRole="button" accessibilityState={{ disabled: !canListen }} disabled={!canListen} onPress={() => void playPhrase(0.72)} style={[styles.audioButton, !canListen && styles.disabled]}><Volume2 color={colors.forest} size={18} /><Text style={styles.audioText}>Slow</Text></Pressable>
            </View>
            {audioError ? <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text> : null}
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} style={styles.revealButton}><Text style={styles.revealText}>Reveal answer</Text></Pressable>
        )}
      </View>
      {revealed ? (
        <View style={styles.grades}>
          <Pressable accessibilityRole="button" onPress={() => grade(false)} style={[styles.gradeButton, styles.againButton]}><RotateCcw color={colors.danger} size={19} /><Text style={styles.againText}>Again</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => grade(true)} style={[styles.gradeButton, styles.gotItButton]}><Check color={colors.white} size={19} /><Text style={styles.gotItText}>Got it</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  progress: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  mastery: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.line },
  trackFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.forest },
  card: { ...sharedStyles.elevatedCard, minHeight: 360, justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  prompt: { color: colors.ink, fontSize: 29, lineHeight: 37, fontWeight: '900', textAlign: 'center' },
  answer: { alignItems: 'center', gap: spacing.sm },
  hindi: { color: colors.ink, fontSize: 34, lineHeight: 44, fontWeight: '900', textAlign: 'center' },
  latin: { color: colors.forest, fontSize: 18, lineHeight: 25, fontWeight: '700', textAlign: 'center' },
  audioRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  audioButton: { minHeight: 46, borderRadius: radius.pill, backgroundColor: colors.backgroundWarm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  audioText: { color: colors.forest, fontSize: 14, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  revealButton: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  revealText: { color: colors.white, fontSize: 16, fontWeight: '900' },
  grades: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gradeButton: { minWidth: 140, flexGrow: 1, minHeight: 54, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  againButton: { backgroundColor: '#FBEDEA', borderWidth: 1, borderColor: '#E4B5AE' },
  gotItButton: { backgroundColor: colors.forest },
  againText: { color: colors.danger, fontSize: 16, fontWeight: '900' },
  gotItText: { color: colors.white, fontSize: 16, fontWeight: '900' },
  doneMark: { width: 72, height: 72, borderRadius: 25, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 27, lineHeight: 34, fontWeight: '900', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
