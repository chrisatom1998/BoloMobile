import { Stack, useRouter } from 'expo-router';
import { Check, RotateCcw, Volume2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { PronunciationRecorder } from '@/components/pronunciation-recorder';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { useSpeakText } from '@/hooks/use-speak-text';
import { learnerPhraseLatin } from '@/lib/learner-phrase-display';
import { reviewCardMode } from '@/lib/learning';
import { observe } from '@/lib/observability';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { hasOfflineSpeech, stopSpeaking } from '@/lib/speech';
import { useAppState } from '@/state/app-state';
import { displayFont, hindiType, makeStyles, radius, spacing, useSharedStyles, useTheme, type, buttons } from '@/theme';

export default function ReviewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const { aiConsent, duePhrases, learnerProfile, phraseReviews, phrases, reviewPhrase } = useAppState();
  const { audioError, clearAudioError, speak } = useSpeakText();
  const gradedPhraseRef = useRef<string | null>(null);
  const supportedRecallRef = useRef(false);
  // Monotonic so a finished card's late result cannot match the next card's run.
  const hintRunRef = useRef(0);
  // A hint clip that actually finished on this card. A later failure must not
  // erase that. grade() clears it before the next card is shown.
  const hintHeardRef = useRef(false);
  // Grading a phrase re-derives duePhrases, and a live list would shift under the
  // advancing index. Lock the displayed session at the first grade instead of at
  // mount so a screen rendered before hydration still picks up the due list.
  const [lockedSession, setLockedSession] = useState<typeof duePhrases | null>(null);
  const session = lockedSession ?? (duePhrases.length ? duePhrases : [...phrases].sort((a, b) => (phraseReviews[a.hi]?.mastery ?? 0) - (phraseReviews[b.hi]?.mastery ?? 0)).slice(0, 5));
  const [index, setIndex] = useState(0);
  // Mirrors supportedRecallRef for the screen, so sighted learners see why Got it counts as Again.
  const [hintUsed, setHintUsed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [recorderBusy, setRecorderBusy] = useState(false);
  const phrase = session[index];
  const phraseHi = phrase?.hi;
  const mastery = phraseHi ? (phraseReviews[phraseHi]?.mastery ?? 0) : 0;
  const canListen = !!phraseHi && (aiConsent || hasOfflineSpeech(phraseHi));
  // Choose the mix once per presented card. Granting consent can enable audio,
  // but must not change an English prompt into listen-first mid-card.
  const [presentedCard, setPresentedCard] = useState(() => ({
    index, phraseHi, mode: reviewCardMode(mastery, index, canListen),
  }));
  if (index !== presentedCard.index || phraseHi !== presentedCard.phraseHi) {
    setPresentedCard({ index, phraseHi, mode: reviewCardMode(mastery, index, canListen) });
  }
  const listenFirst = presentedCard.mode === 'listen-first';

  useEffect(() => () => { void stopSpeaking(); }, []);
  useEffect(() => {
    // Depend on the phrase text, not the re-derived session array, so revealing
    // the answer or checking pronunciation never restarts the reference audio.
    if (listenFirst && phraseHi) void speak(phraseHi, undefined, 1);
  }, [listenFirst, phraseHi, speak]);
  useEffect(() => {
    if (session.length > 0 && index >= session.length) observe('review_completed');
  }, [index, session.length]);

  function grade(remembered: boolean) {
    if (!phrase || gradedPhraseRef.current === phrase.hi) return;
    gradedPhraseRef.current = phrase.hi;
    // The recorder clears its abort handle once feedback playback starts, so
    // unmounting it does not stop coaching that is already speaking.
    void stopSpeaking();
    if (!lockedSession) setLockedSession(session);
    clearAudioError();
    // Hearing the answer before a speak-first reveal is supported recall.
    // Reuse Again's scheduling so it cannot raise mastery or the recall score.
    const recalled = remembered && (listenFirst || !supportedRecallRef.current);
    reviewPhrase(phrase.hi, recalled);
    if (recalled) hapticSuccess();
    else hapticWarning();
    if (recalled) setCorrect((value) => value + 1);
    supportedRecallRef.current = false;
    hintHeardRef.current = false;
    setHintUsed(false);
    setRevealed(false);
    setIndex((value) => value + 1);
  }

  /** Review opens as a sheet, so finishing dismisses it back to wherever it was opened from. */
  function finishReview() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function playPhrase(playbackRate = 1) {
    if (!phrase || !canListen || recorderBusy) return;
    // Listen, Slow, and a second hint tap all stop the clip that is already
    // playing. Bump the run first so that cancel cannot clear a hint the
    // learner already started. Only the latest hint run may clear, and only
    // when it fails and no earlier hint on this card finished.
    const run = ++hintRunRef.current;
    if (listenFirst || revealed) {
      void speak(phrase.hi, undefined, playbackRate);
      return;
    }
    const hintedPhrase = phrase.hi;
    supportedRecallRef.current = true;
    setHintUsed(true);
    void speak(hintedPhrase, undefined, playbackRate).then((played) => {
      if (gradedPhraseRef.current === hintedPhrase || run !== hintRunRef.current) return;
      if (played) {
        hintHeardRef.current = true;
        return;
      }
      if (hintHeardRef.current) return;
      supportedRecallRef.current = false;
      setHintUsed(false);
    });
  }

  if (session.length === 0) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.center}>
        <Text accessibilityRole="header" style={styles.title}>Save a phrase to start reviewing</Text>
        <Text style={styles.body}>Tap the bookmark on an answer during a lesson, and it becomes a quick recall card here.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={sharedStyles.primaryButton}><Text style={sharedStyles.primaryButtonText}>Back to Today</Text></Pressable>
      </ScrollView>
    );
  }

  if (!phrase) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.center}>
        {/* The body button is the way out here; a second "Done" in the header only doubled it. */}
        <Stack.Screen options={{ headerRight: () => null }} />
        <View style={styles.doneMark}><Check color={colors.white} size={34} /></View>
        <Text style={sharedStyles.eyebrow}>Review complete</Text>
        <Text accessibilityRole="header" style={styles.title}>{correct} of {session.length} remembered</Text>
        <Text style={styles.body}>Bolo scheduled each phrase based on how it felt today.</Text>
        <Pressable accessibilityRole="button" onPress={finishReview} style={sharedStyles.primaryButton}><Text style={sharedStyles.primaryButtonText}>Done</Text></Pressable>
      </ScrollView>
    );
  }

  const showHindi = learnerProfile.scriptPreference !== 'latin';
  const showLatin = learnerProfile.scriptPreference !== 'devanagari';
  // Keep reference audio out of the microphone while a practice clip is recording or being checked.
  const listenEnabled = canListen && !recorderBusy;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screen} testID="review-scroll">
      <View style={styles.header}><Text style={styles.progress}>Phrase {index + 1} of {session.length}</Text><Text style={styles.mastery}>Mastery {mastery}/5</Text></View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.track}><View style={[styles.trackFill, { width: `${(index + 1) / session.length * 100}%` }]} /></View>
      <View style={styles.card}>
        <Text style={sharedStyles.eyebrow}>{listenFirst ? 'Listen, then say what it means' : 'Say it in Hindi'}</Text>
        {!listenFirst || revealed ? <Text style={styles.prompt}>{phrase.en}</Text> : null}
        {!revealed ? (
          <View style={styles.audioRow}>
            <Pressable accessibilityHint={listenFirst ? undefined : 'Hearing a hint counts as Again for scheduling, even if you tap Got it.'} accessibilityLabel={listenFirst ? 'Replay phrase' : 'Hear a hint'} accessibilityRole="button" accessibilityState={{ disabled: !listenEnabled }} disabled={!listenEnabled} onPress={() => playPhrase()} style={[styles.audioButton, !listenEnabled && styles.disabled]}><Volume2 color={colors.forest} size={18} /><Text style={styles.audioText}>{listenFirst ? 'Replay' : 'Hear a hint'}</Text></Pressable>
          </View>
        ) : null}
        {revealed ? (
          <View style={styles.answer}>
            {showHindi ? <Text accessibilityLanguage="hi-IN" style={styles.hindi}>{phrase.hi}</Text> : null}
            {showLatin ? <Text style={styles.latin}>{learnerPhraseLatin(phrase.hi, phrase.latin)}</Text> : null}
            <View style={styles.audioRow}>
              <Pressable accessibilityHint={canListen ? undefined : 'Agree to connected AI processing to enable Listen.'} accessibilityLabel={`Hear ${phrase.hi}`} accessibilityRole="button" accessibilityState={{ disabled: !listenEnabled }} disabled={!listenEnabled} onPress={() => playPhrase()} style={[styles.audioButton, !listenEnabled && styles.disabled]}><Volume2 color={colors.forest} size={18} /><Text style={styles.audioText}>Listen</Text></Pressable>
              <Pressable accessibilityHint={canListen ? undefined : 'Agree to connected AI processing to enable Listen.'} accessibilityLabel={`Hear ${phrase.hi} slowly`} accessibilityRole="button" accessibilityState={{ disabled: !listenEnabled }} disabled={!listenEnabled} onPress={() => playPhrase(0.72)} style={[styles.audioButton, !listenEnabled && styles.disabled]}><Volume2 color={colors.forest} size={18} /><Text style={styles.audioText}>Slow</Text></Pressable>
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} style={styles.revealButton}><Text style={styles.revealText}>Reveal answer</Text></Pressable>
        )}
        {hintUsed && !listenFirst ? <Text style={styles.hintNote} testID="review-hint-note">Hint used, so this card counts as Again.</Text> : null}
        {audioError ? <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text> : null}
      </View>
      {/* Grading sits right under the answer so it is never pushed below optional pronunciation practice. */}
      {revealed ? (
        <View style={styles.grades}>
          <Pressable accessibilityRole="button" onPress={() => grade(false)} style={[styles.gradeButton, styles.againButton]}><RotateCcw color={colors.danger} size={19} /><Text style={styles.againText}>Again</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => grade(true)} style={[styles.gradeButton, styles.gotItButton]}><Check color={colors.white} size={19} /><Text style={styles.gotItText}>Got it</Text></Pressable>
        </View>
      ) : null}
      {revealed ? (
        // Optional practice: grading never waits on a recording. Keying by card
        // remounts the recorder so feedback never carries over to the next phrase.
        <PronunciationRecorder key={`${index}-${phrase.hi}`} lessonTitle="Review" onActivityChange={setRecorderBusy} target={phrase} />
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flexGrow: 1, backgroundColor: c.background, padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  center: { flexGrow: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  header: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.sm },
  progress: { ...type.label, color: c.ink, fontWeight: '700' },
  mastery: { ...type.label, color: c.muted, fontWeight: '700' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.line },
  trackFill: { height: '100%', borderRadius: radius.pill, backgroundColor: c.forest },
  card: { backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', minHeight: 240, justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  prompt: { ...type.display, color: c.ink, textAlign: 'center' },
  answer: { alignItems: 'center', gap: spacing.sm },
  hindi: { ...hindiType(28), color: c.ink, textAlign: 'center' },
  latin: { ...type.bodyLarge, color: c.brandText, textAlign: 'center', fontWeight: '600' },
  audioRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.sm },
  audioButton: { minHeight: 46, borderRadius: radius.pill, backgroundColor: c.backgroundWarm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  audioText: { ...type.label, color: c.brandText },
  hintNote: { ...type.caption, color: c.muted },
  error: { ...type.caption, color: c.danger, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  revealButton: buttons.primary,
  revealText: buttons.primaryText,
  grades: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gradeButton: { minWidth: 140, flexGrow: 1, minHeight: 54, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  againButton: { backgroundColor: c.paper, borderWidth: 1, borderColor: c.lineStrong },
  gotItButton: { backgroundColor: c.forest },
  againText: buttons.secondaryText,
  gotItText: { ...type.label, color: c.white, fontWeight: '700' },
  doneMark: { width: 72, height: 72, borderRadius: radius.xl, backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.title, color: c.ink, textAlign: 'center' },
  body: { ...type.body, color: c.muted, textAlign: 'center' },
}));
