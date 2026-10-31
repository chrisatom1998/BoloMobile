import { useRouter } from 'expo-router';
import { Check, RotateCcw, Volume2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { MotionReveal } from '@/components/motion';
import { PhraseCard } from '@/components/phrase-card';
import { PronunciationRecorder } from '@/components/pronunciation-recorder';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { useSpeakText } from '@/hooks/use-speak-text';
import { reviewCardMode } from '@/lib/learning';
import { observe } from '@/lib/observability';
import { phraseCardLines } from '@/lib/phrase-card-lines';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { hasOfflineSpeech, stopSpeaking } from '@/lib/speech';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import { makeStyles, radius, spacing, useSharedStyles, useTheme } from '@/theme';

/** Discrete segments stay legible up to this many cards; longer sessions fall back to one bar. */
const MAX_PROGRESS_SEGMENTS = 12;
const UP_NEXT_LIMIT = 4;

function SegmentedProgress({ index, total }: { index: number; total: number }) {
  const styles = useStyles();
  if (total > MAX_PROGRESS_SEGMENTS) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.track} testID="review-progress-bar">
        <View style={[styles.trackFill, { width: `${(index + 1) / total * 100}%` }]} />
      </View>
    );
  }
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.segments} testID="review-progress-segments">
      {Array.from({ length: total }, (_, position) => (
        <View key={position} style={[styles.segment, position <= index && styles.segmentDone]} testID={position <= index ? 'review-progress-segment-done' : 'review-progress-segment'} />
      ))}
    </View>
  );
}

function MasteryDots({ mastery }: { mastery: number }) {
  const styles = useStyles();
  return (
    <View accessible accessibilityLabel={`Mastery ${mastery} of 5`} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 5, now: mastery }} style={styles.mastery} testID="review-mastery">
      <View style={styles.masteryDots}>
        {Array.from({ length: 5 }, (_, position) => (
          <View key={position} style={[styles.masteryDot, position < mastery && styles.masteryDotFilled]} testID={position < mastery ? 'review-mastery-dot-filled' : 'review-mastery-dot'} />
        ))}
      </View>
      <Text style={styles.masteryText}>{mastery} / 5</Text>
    </View>
  );
}

export default function ReviewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const largeTextLayout = useLargeTextLayout();
  const { aiConsent, duePhrases, learnerProfile, motionPreference = DEFAULT_MOTION_PREFERENCE, phraseReviews, phrases, reviewPhrase } = useAppState();
  const { mode: motionMode } = useMotionPreference(motionPreference);
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
        <Text style={styles.body}>Natural answers saved from scenes will become quick recall cards here.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={sharedStyles.primaryButton}><Text style={sharedStyles.primaryButtonText}>Choose a scene</Text></Pressable>
      </ScrollView>
    );
  }

  if (!phrase) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.center}>
        <View style={styles.doneMark}><Check color={colors.white} size={34} /></View>
        <Text style={sharedStyles.eyebrow}>Review complete</Text>
        <Text accessibilityRole="header" style={styles.title}>{correct} of {session.length} remembered</Text>
        <Text style={styles.body}>Bolo scheduled each phrase based on how it felt today.</Text>
        <Pressable accessibilityRole="button" onPress={finishReview} style={sharedStyles.primaryButton}><Text style={sharedStyles.primaryButtonText}>Done</Text></Pressable>
      </ScrollView>
    );
  }

  // Keep reference audio out of the microphone while a practice clip is recording or being checked.
  const listenEnabled = canListen && !recorderBusy;
  const listenHint = canListen ? undefined : 'Agree to connected AI processing to enable Listen.';
  // Name the Listen controls with the same script-safe lines PhraseCard shows,
  // so a Latin-script learner never meets Devanagari through a screen reader.
  const answerLines = phraseCardLines({ devanagari: phrase.hi, romanized: phrase.latin, scriptPreference: learnerProfile.scriptPreference });
  const answerName = answerLines.devanagari ?? answerLines.romanized ?? 'this phrase';
  // Never pre-reveal an answer: upcoming speak-first cards show only their
  // English prompt, and upcoming listen-first cards (where English is the
  // answer) show a neutral placeholder. No Hindi script or romanization here.
  const upcoming = session.slice(index + 1, index + 1 + UP_NEXT_LIMIT).map((item, offset) => {
    const position = index + 1 + offset;
    const itemMastery = phraseReviews[item.hi]?.mastery ?? 0;
    const itemCanListen = aiConsent || hasOfflineSpeech(item.hi);
    return { key: `${position}-${item.hi}`, position, en: item.en, listenFirst: reviewCardMode(itemMastery, position, itemCanListen) === 'listen-first' };
  });
  const upcomingHidden = session.length - (index + 1) - upcoming.length;
  // Listen-first cards hide every answer cue until Reveal, so the mic (and
  // Asha's feedback about the target) only appears once the answer is shown.
  const showRecorder = !listenFirst || revealed;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screen} testID="review-scroll">
      <View style={[styles.header, largeTextLayout && styles.headerStacked]} testID="review-header">
        <Text accessibilityLabel={`Phrase ${index + 1} of ${session.length}`} style={styles.progress}>{index + 1} of {session.length}</Text>
        <SegmentedProgress index={index} total={session.length} />
        <MasteryDots mastery={mastery} />
      </View>
      <View style={styles.card}>
        <Text style={[sharedStyles.eyebrow, styles.eyebrow]}>{listenFirst ? 'Listen, then say what it means' : 'Say it in Hindi'}</Text>
        {!listenFirst || revealed ? <Text style={styles.prompt}>{phrase.en}</Text> : null}
        {revealed ? (
          <MotionReveal mode={motionMode} motionKey={`${index}-${phrase.hi}`} style={styles.answer}>
            <PhraseCard devanagari={phrase.hi} romanized={phrase.latin} scriptPreference={learnerProfile.scriptPreference} style={styles.answerCard} testID="review-answer" />
            <View style={styles.audioRow}>
              <Pressable accessibilityHint={listenHint} accessibilityLabel={`Hear ${answerName}`} accessibilityRole="button" accessibilityState={{ disabled: !listenEnabled }} disabled={!listenEnabled} onPress={() => playPhrase()} style={[styles.audioButton, !listenEnabled && styles.disabled]}><Volume2 color={colors.forest} size={18} /><Text style={styles.audioText}>Listen</Text></Pressable>
              <Pressable accessibilityHint={listenHint} accessibilityLabel={`Hear ${answerName} slowly`} accessibilityRole="button" accessibilityState={{ disabled: !listenEnabled }} disabled={!listenEnabled} onPress={() => playPhrase(0.72)} style={[styles.audioButton, !listenEnabled && styles.disabled]}><Volume2 color={colors.forest} size={18} /><Text style={styles.audioText}>Slow</Text></Pressable>
            </View>
          </MotionReveal>
        ) : null}
        {showRecorder ? (
          // Optional practice: grading never waits on a recording. The same
          // instance survives Reveal so feedback stays put; keying by card
          // remounts it so feedback never carries over to the next phrase.
          <PronunciationRecorder key={`${index}-${phrase.hi}`} idleLabel="Say it" lessonTitle="Review" onActivityChange={setRecorderBusy} target={phrase} variant="hero" />
        ) : null}
        {!revealed ? (
          <View style={[styles.pills, largeTextLayout && styles.pillsStacked]} testID="review-pills">
            <Pressable accessibilityHint={listenFirst ? undefined : 'Hearing a hint counts as Again for scheduling, even if you tap Got it.'} accessibilityLabel={listenFirst ? 'Replay phrase' : 'Hear a hint'} accessibilityRole="button" accessibilityState={{ disabled: !listenEnabled }} disabled={!listenEnabled} onPress={() => playPhrase()} style={[styles.pill, styles.pillWarm, !listenEnabled && styles.disabled]}><Volume2 color={colors.forest} size={18} /><Text style={styles.pillWarmText}>{listenFirst ? 'Replay' : 'Hear a hint'}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setRevealed(true)} style={[styles.pill, styles.pillGhost]}><Text style={styles.pillGhostText}>Show answer</Text></Pressable>
          </View>
        ) : null}
        {hintUsed && !listenFirst ? <Text style={styles.hintNote} testID="review-hint-note">Hint used, so this card counts as Again.</Text> : null}
        {audioError ? <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text> : null}
      </View>
      {revealed ? (
        <View style={styles.grades}>
          <Pressable accessibilityRole="button" onPress={() => grade(false)} style={[styles.gradeButton, styles.againButton]}><RotateCcw color={colors.danger} size={19} /><Text style={styles.againText}>Again</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => grade(true)} style={[styles.gradeButton, styles.gotItButton]}><Check color={colors.white} size={19} /><Text style={styles.gotItText}>Got it</Text></Pressable>
        </View>
      ) : null}
      {upcoming.length > 0 ? (
        <View style={styles.upNext} testID="review-up-next">
          <Text accessibilityRole="header" style={styles.upNextTitle}>Up next</Text>
          {upcoming.map((item) => (
            <View
              accessible
              accessibilityLabel={`${item.position + 1} of ${session.length}: ${item.listenFirst ? 'Listening card' : item.en}`}
              key={item.key}
              style={styles.upNextRow}
              testID={item.listenFirst ? 'review-up-next-listening' : 'review-up-next-prompt'}
            >
              {item.listenFirst ? <Volume2 color={colors.muted} size={16} /> : null}
              <Text style={[styles.upNextText, item.listenFirst && styles.upNextListening]}>{item.listenFirst ? 'Listening card' : item.en}</Text>
              <Text style={styles.upNextPosition}>{item.position + 1} of {session.length}</Text>
            </View>
          ))}
          {upcomingHidden > 0 ? <Text style={styles.upNextMore}>+{upcomingHidden} more after these</Text> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flexGrow: 1, backgroundColor: c.background, padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  center: { flexGrow: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerStacked: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  progress: { color: c.ink, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  segments: { flex: 1, flexDirection: 'row', gap: 6, minWidth: 72 },
  segment: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: c.line },
  segmentDone: { backgroundColor: c.forest },
  track: { flex: 1, height: 8, minWidth: 72, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.line },
  trackFill: { height: '100%', borderRadius: radius.pill, backgroundColor: c.forest },
  mastery: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  masteryDots: { flexDirection: 'row', gap: 3 },
  masteryDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: c.paper, borderWidth: 1, borderColor: c.line },
  masteryDotFilled: { backgroundColor: c.forest, borderColor: c.forest },
  masteryText: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  card: { backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, borderRadius: radius.xl, borderCurve: 'continuous', alignItems: 'stretch', gap: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  eyebrow: { textAlign: 'center' },
  prompt: { color: c.ink, fontSize: 29, lineHeight: 37, fontWeight: '900', textAlign: 'center' },
  answer: { gap: spacing.sm },
  answerCard: { alignSelf: 'stretch' },
  audioRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  audioButton: { minHeight: 46, borderRadius: radius.pill, backgroundColor: c.backgroundWarm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  audioText: { color: c.forestText, fontSize: 14, fontWeight: '800' },
  pills: { flexDirection: 'row', gap: spacing.sm },
  pillsStacked: { flexDirection: 'column' },
  pill: { flex: 1, minHeight: 48, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  pillWarm: { backgroundColor: c.backgroundWarm },
  pillWarmText: { color: c.forestText, fontSize: 14, fontWeight: '800' },
  pillGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.line },
  pillGhostText: { color: c.ink, fontSize: 14, fontWeight: '800' },
  hintNote: { color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  error: { color: c.danger, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  disabled: { opacity: 0.4 },
  grades: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gradeButton: { minWidth: 140, flexGrow: 1, minHeight: 54, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  againButton: { backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.dangerLine },
  gotItButton: { backgroundColor: c.forest },
  againText: { color: c.danger, fontSize: 16, fontWeight: '900' },
  gotItText: { color: c.white, fontSize: 16, fontWeight: '900' },
  upNext: { gap: spacing.sm },
  upNextTitle: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '700', paddingHorizontal: spacing.xs },
  upNextRow: { backgroundColor: c.paperRaised, borderRadius: radius.md, borderCurve: 'continuous', borderLeftWidth: 4, borderLeftColor: c.line, minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
  upNextText: { flex: 1, minWidth: 120, color: c.ink, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  upNextListening: { color: c.muted, fontStyle: 'italic', fontWeight: '500' },
  upNextPosition: { color: c.muted, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  upNextMore: { color: c.muted, fontSize: 13, lineHeight: 18, paddingHorizontal: spacing.xs },
  doneMark: { width: 72, height: 72, borderRadius: 25, backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center' },
  title: { color: c.ink, fontSize: 27, lineHeight: 34, fontWeight: '900', textAlign: 'center' },
  body: { color: c.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
}));
