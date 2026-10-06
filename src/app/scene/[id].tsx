import { randomUUID } from 'expo-crypto';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, Check, ChevronRight, RotateCcw, Star, Volume2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { MotionReveal } from '@/components/motion';
import { PronunciationRecorder } from '@/components/pronunciation-recorder';
import { isWordOrderPracticeable } from '@/components/practice-mode';
import { RecallRevealPractice } from '@/components/recall-reveal-practice';
import { WordOrderPractice } from '@/components/word-order-practice';
import { WordDefinitionSheet } from '@/components/word-definition-sheet';
import { buildAlternateFeedback } from '@/data/lesson-feedback';
import { lessonPlans } from '@/data/lesson-plans';
import { getScene, type BeatMode } from '@/data/scenes';
import { useForegroundTimer } from '@/hooks/use-foreground-timer';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { useMotionPreference } from '@/hooks/use-motion-preference';
import { useSpeakText } from '@/hooks/use-speak-text';
import { lessonHindiLabel } from '@/lib/lesson-display';
import type { SceneAttempt } from '@/state/app-state-types';
import { observe } from '@/lib/observability';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { hindiWordTokens } from '@/lib/contextual-word-definition';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { hasOfflineSpeech, speakText, stopSpeaking } from '@/lib/speech';
import { shuffleChoices } from '@/lib/shuffle-choices';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import { displayFont, hindiType, makeStyles, radius, spacing, useSharedStyles, useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/app-error-boundary';

const ashaPortrait = require('../../../assets/images/asha-portrait.png');

const ALTERNATE_INCORRECT_COACH = {
  en: 'Close—try again.',
  hi: 'करीब है—फिर से कोशिश कीजिए।',
  latin: 'Karib hai—phir se koshish kijiye.',
};

export default function SceneRoute() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  return <SceneScreen key={Array.isArray(id) ? id[0] : id} />;
}

function SceneScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const largeTextLayout = useLargeTextLayout();
  const sceneId = Array.isArray(id) ? id[0] : id;
  const { aiConsent, checkpointScene, clientId, learnerProfile, updateLearnerProfile, markSceneComplete, motionPreference = DEFAULT_MOTION_PREFERENCE, phrases, sceneProgress, togglePhrase } = useAppState();
  const scriptPreference = learnerProfile?.scriptPreference ?? 'both';
  const [practiceName, setPracticeName] = useState(learnerProfile?.displayName ?? '');
  const sourceScene = useMemo(() => getScene(sceneId ?? ''), [sceneId]);
  const usesName = sourceScene?.beats.some((beat) => beat.choices.some((choice) => choice.correct && /मेरा नाम (?:\.\.\.|…)/u.test(choice.hi))) ?? false;
  const scene = useMemo(() => {
    if (!sourceScene || !usesName || !practiceName.trim()) return sourceScene;
    // Proper names are kept exactly as entered, never guessed by transliteration.
    const personalize = (text: string) => text.replace(/\.\.\.|…/gu, practiceName.trim());
    return { ...sourceScene, beats: sourceScene.beats.map((beat) => ({ ...beat,
      prompt: personalize(beat.prompt), tip: personalize(beat.tip),
      choices: beat.choices.map((choice) => /मेरा नाम (?:\.\.\.|…)/u.test(choice.hi)
        ? { ...choice, hi: personalize(choice.hi), latin: personalize(choice.latin), en: personalize(choice.en) } : choice),
    })) };
  }, [practiceName, sourceScene, usesName]);
  const [offlineSelected, setOfflineSelected] = useState(false);
  const [showAiDetails, setShowAiDetails] = useState(false);
  const guidedLesson = useMemo(() => {
    if (!scene) return null;
    const plan = lessonPlans.find((candidate) => candidate.lessonIds.includes(scene.id));
    if (!plan) return null;
    const lessonIndex = plan.lessonIds.indexOf(scene.id);
    return {
      nextLessonId: plan.lessonIds[lessonIndex + 1],
      planId: plan.id,
    };
  }, [scene]);
  const { mode: motionMode, reducedMotion } = useMotionPreference(motionPreference);
  const { elapsedSeconds, reset: resetTimer } = useForegroundTimer();
  const { audioError, clearAudioError, speak } = useSpeakText();
  const savedProgress = scene ? sceneProgress?.[scene.id] : undefined;
  const [legacyCheckpoint] = useState(() => !savedProgress?.attempt && (savedProgress?.lastBeatIndex ?? 0) > 0);
  const savedPosition = savedProgress?.lastBeatIndex ?? 0;
  const checkpointMatchesLesson = Boolean(scene && savedProgress?.attempt
    && Number.isInteger(savedPosition) && savedPosition >= 0 && savedPosition < scene.beats.length
    && Number.isInteger(savedProgress.attempt.total)
    && savedProgress.attempt.total >= savedPosition && savedProgress.attempt.total <= savedPosition + 1);
  const [incompatibleCheckpoint] = useState(() => Boolean(savedProgress?.attempt) && !checkpointMatchesLesson);
  const [initialAttempt] = useState(() => checkpointMatchesLesson ? savedProgress?.attempt : undefined);
  const [initialBeatIndex, setInitialBeatIndex] = useState(() => scene && initialAttempt && (savedProgress?.lastBeatIndex ?? 0) < scene.beats.length ? savedProgress?.lastBeatIndex ?? 0 : 0);
  const [beatIndex, setBeatIndex] = useState(initialBeatIndex);
  const currentUsesName = sourceScene?.beats[beatIndex]?.choices.some((choice) => choice.correct && /मेरा नाम (?:\.\.\.|…)/u.test(choice.hi)) ?? false;
  const needsName = currentUsesName && !practiceName.trim();
  const [attemptId] = useState(() => randomUUID());
  const attemptRef = useRef<SceneAttempt>(initialAttempt ?? { id: attemptId, score: 0, correct: 0, total: 0, weakPhrases: [], seconds: 0, answeredBeatIndex: null });
  const elapsedBeforeResumeRef = useRef(initialAttempt?.seconds ?? 0);
  const progressBeatRef = useRef(initialBeatIndex);
  const completedRef = useRef(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [resolution, setResolution] = useState<null | 'correct' | 'incorrect'>(null);
  const [choiceNonce, setChoiceNonce] = useState(0);
  const [wordOrderRetryNonce, setWordOrderRetryNonce] = useState(0);
  const [score, setScore] = useState(initialAttempt?.score ?? 0);
  const [correctCount, setCorrectCount] = useState(initialAttempt?.correct ?? 0);
  const [answerCount, setAnswerCount] = useState(initialAttempt?.total ?? 0);
  const [answeredBeatIndex, setAnsweredBeatIndex] = useState(initialAttempt?.answeredBeatIndex ?? null);
  const [done, setDone] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [alreadyResolvedIncorrect, setAlreadyResolvedIncorrect] = useState(false);
  const [pronunciationBusy, setPronunciationBusy] = useState(false);

  const [wordDefinitionWord, setWordDefinitionWord] = useState<string | null>(null);
  const sceneScrollRef = useRef<ScrollView>(null);
  const sceneViewportHeightRef = useRef(0);
  const sceneScrollYRef = useRef(0);
  const pendingResolutionScrollRef = useRef(false);
  const pickedRef = useRef<number | null>(null);
  const advancedBeatRef = useRef<number | null>(null);
  const autoPlayedBeatRef = useRef<string | null>(null);

  const sceneExists = Boolean(sourceScene);
  useEffect(() => {
    if (sceneExists) observe('scene_started');
    return () => { void stopSpeaking(); };
  }, [sceneExists]);

  useEffect(() => {
    if (!sceneId || !sourceScene) return;
    const save = () => {
      if (completedRef.current) return;
      checkpointScene?.(sceneId, progressBeatRef.current, { ...attemptRef.current, seconds: elapsedBeforeResumeRef.current + elapsedSeconds() });
    };
    const interval = setInterval(save, 5000);
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') save(); });
    return () => { clearInterval(interval); subscription.remove(); save(); };
  }, [checkpointScene, elapsedSeconds, sceneId, sourceScene]);

  const currentBeat = scene?.beats[beatIndex];
  const currentTarget = currentBeat?.choices.find((choice) => choice.correct);
  const npcLine = currentBeat?.npc;
  const situationPromptSpeech = currentBeat
    ? aiConsent
      ? `${currentBeat.npc}\n${currentBeat.translation}`
      : currentBeat.npc
    : undefined;
  const autoPlayKey = scene && npcLine !== undefined ? `${scene.id}:${beatIndex}` : null;
  const effectiveMode = useMemo<BeatMode>(() => {
    const declaredMode = currentBeat?.mode ?? 'choice';
    if (declaredMode === 'wordOrder' && currentTarget && !isWordOrderPracticeable(currentTarget.hi)) {
      return 'choice';
    }
    return declaredMode;
  }, [currentBeat, currentTarget]);
  const wordOrderChoiceFallback = currentBeat?.mode === 'wordOrder' && effectiveMode === 'choice';
  const choicePresentation = useMemo(() => ({
    choices: currentBeat && effectiveMode === 'choice' ? shuffleChoices(currentBeat.choices) : [],
    key: `${scene?.id ?? 'missing-scene'}:${beatIndex}:${choiceNonce}`,
  }), [beatIndex, choiceNonce, currentBeat, effectiveMode, scene?.id]);

  // Auto-play is ambient audio, so failures stay silent: the learner can retry with the Hear Asha button.
  useEffect(() => {
    if (!autoPlayKey || npcLine === undefined || situationPromptSpeech === undefined) return;
    if (resolution !== null) return;
    if (pronunciationBusy) return;
    if (autoPlayedBeatRef.current === autoPlayKey) return;
    if (!aiConsent && !hasOfflineSpeech(npcLine)) return;
    // Marked only once playback actually starts, so a beat skipped for missing
    // consent or pronunciation activity still speaks when the effect re-runs.
    autoPlayedBeatRef.current = autoPlayKey;
    void speakText(situationPromptSpeech).catch(() => {});
  }, [aiConsent, autoPlayKey, npcLine, pronunciationBusy, resolution, situationPromptSpeech]);

  if (!scene || !currentBeat || !currentTarget) {
    return (
      <View style={styles.center}>
        <Text accessibilityRole="header" style={styles.finishTitle}>Lesson not found</Text>
        <Text style={styles.notFoundBody}>This lesson may have moved or been removed. Your saved progress is unchanged.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={sharedStyles.primaryButton}><Text style={sharedStyles.primaryButtonText}>Back to Today</Text></Pressable>
      </View>
    );
  }

  const activeScene = scene;
  const beat = currentBeat;
  const target = currentTarget;
  const effectivePrompt = wordOrderChoiceFallback
    ? `Choose the Hindi response that means “${target.en}”`
    : beat.prompt;
  const effectiveTip = wordOrderChoiceFallback
    ? `Look for “${target.latin},” the Hindi response for “${target.en}”`
    : beat.tip;
  const saved = phrases.some((phrase) => phrase.hi === target.hi);
  const correct = resolution === 'correct';
  const feedbackReply = picked !== null
    ? beat.choices[picked]?.reply ?? ''
    : resolution === 'correct'
      ? 'बहुत अच्छा।'
      : resolution === 'incorrect'
        ? ALTERNATE_INCORRECT_COACH.hi
        : '';
  const englishMistakeFeedback = resolution === 'incorrect'
    ? picked !== null
      ? beat.choices[picked]?.feedback ?? ''
      : buildAlternateFeedback({ en: target.en, latin: target.latin })
    : '';

  function play(text: string) {
    if ((!aiConsent && !hasOfflineSpeech(text)) || pronunciationBusy) return;
    void speak(text);
  }

  function recordAnswer(isCorrect: boolean) {
    if (attemptRef.current.answeredBeatIndex === beatIndex) return;
    if (currentUsesName) updateLearnerProfile?.({ displayName: practiceName.trim() });
    const previous = attemptRef.current;
    const attempt = { ...previous, score: previous.score + (isCorrect ? 50 : 0), correct: previous.correct + Number(isCorrect), total: previous.total + 1,
      weakPhrases: isCorrect ? previous.weakPhrases : [...new Set([...previous.weakPhrases, target.hi])],
      seconds: elapsedBeforeResumeRef.current + elapsedSeconds(), answeredBeatIndex: beatIndex };
    attemptRef.current = attempt;
    setScore(attempt.score);
    setCorrectCount(attempt.correct);
    setAnswerCount(attempt.total);
    setAnsweredBeatIndex(beatIndex);
    checkpointScene?.(activeScene.id, beatIndex, attempt);
  }

  function resultTitle(isCorrect: boolean) {
    if (isCorrect) return 'Natural choice!';
    if (effectiveMode === 'wordOrder') return 'Check the word order.';
    if (effectiveMode === 'recallReveal') return 'Keep practicing this phrase.';
    return 'Not quite—notice the pattern.';
  }

  function announceResult(isCorrect: boolean) {
    // Android reads the new result via focus/live updates; iOS needs an explicit announcement.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(resultTitle(isCorrect));
  }

  function choose(index: number) {
    if (pickedRef.current !== null || pronunciationBusy || needsName) return;
    const choice = beat.choices[index];
    if (choice === undefined) return;
    pendingResolutionScrollRef.current = true;
    pickedRef.current = index;
    setPicked(index);
    recordAnswer(choice.correct);
    announceResult(choice.correct);
    if (choice.correct) {
      hapticSuccess();
      setResolution('correct');
    }
    else {
      hapticWarning();
      setResolution('incorrect');
    }
    play(choice.reply);
  }

  function handleAlternateResult(result: 'correct' | 'incorrect') {
    if (pickedRef.current !== null || pronunciationBusy || needsName) return;
    pendingResolutionScrollRef.current = true;
    pickedRef.current = result === 'correct' ? 0 : -1;
    recordAnswer(result === 'correct');
    announceResult(result === 'correct');
    if (result === 'correct') {
      setResolution('correct');
      play('बहुत अच्छा।');
      return;
    }
    setResolution('incorrect');
    play(ALTERNATE_INCORRECT_COACH.hi);
  }

  function tryAgain() {
    if ((effectiveMode !== 'choice' && effectiveMode !== 'wordOrder') || resolution !== 'incorrect' || pronunciationBusy) return;
    pendingResolutionScrollRef.current = false;
    pickedRef.current = null;
    setPicked(null);
    setResolution(null);
    setAlreadyResolvedIncorrect(true);
    setShowHint(false);
    setWordDefinitionWord(null);
    if (effectiveMode === 'wordOrder') setWordOrderRetryNonce((value) => value + 1);
  }

  function next() {
    if (advancedBeatRef.current === beatIndex) return;
    advancedBeatRef.current = beatIndex;
    pendingResolutionScrollRef.current = false;
    void stopSpeaking();
    clearAudioError();
    if (beatIndex === activeScene.beats.length - 1) {
      completedRef.current = true;
      markSceneComplete(activeScene.id, elapsedBeforeResumeRef.current + elapsedSeconds(), {
        attemptId: attemptRef.current.id,
        score: attemptRef.current.score,
        correct: attemptRef.current.correct,
        total: attemptRef.current.total,
        weakPhrases: attemptRef.current.weakPhrases,
      });
      observe('scene_completed');
      setDone(true);
      return;
    }
    hapticSelect();
    progressBeatRef.current = beatIndex + 1;
    checkpointScene?.(activeScene.id, beatIndex + 1, { ...attemptRef.current, seconds: elapsedBeforeResumeRef.current + elapsedSeconds() });
    setBeatIndex((value) => value + 1);
    pickedRef.current = null;
    setPicked(null);
    setResolution(null);
    setShowHint(false);
    setAlreadyResolvedIncorrect(false);
    setWordDefinitionWord(null);
    setChoiceNonce((value) => value + 1);
  }

  function replay() {
    void stopSpeaking();
    clearAudioError();
    resetTimer();
    autoPlayedBeatRef.current = null;
    setInitialBeatIndex(0);
    setBeatIndex(0);
    pickedRef.current = null;
    setPicked(null);
    setResolution(null);
    setShowHint(false);
    setAlreadyResolvedIncorrect(false);
    setWordDefinitionWord(null);
    setScore(0);
    setCorrectCount(0);
    setAnswerCount(0);
    setAnsweredBeatIndex(null);
    attemptRef.current = { id: randomUUID(), score: 0, correct: 0, total: 0, weakPhrases: [], seconds: 0, answeredBeatIndex: null };
    elapsedBeforeResumeRef.current = 0;
    progressBeatRef.current = 0;
    completedRef.current = false;
    checkpointScene?.(activeScene.id, 0, attemptRef.current);
    advancedBeatRef.current = null;
    pendingResolutionScrollRef.current = false;
    setDone(false);
    setChoiceNonce((value) => value + 1);
  }

  function leaveCompletedScene() {
    if (guidedLesson?.nextLessonId) {
      router.replace({ pathname: '/scene/[id]', params: { id: guidedLesson.nextLessonId } });
      return;
    }
    if (guidedLesson) {
      router.dismissTo({ pathname: '/lesson-plans', params: { planId: guidedLesson.planId } });
      return;
    }
    router.replace('/');
  }

  const completionAction = guidedLesson?.nextLessonId
    ? 'Next lesson'
    : guidedLesson
      ? 'View completed plan'
      : 'Back to Today';

  if (done) {
    return (
      <ScrollView key="scene-completion" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.finish} style={sharedStyles.screen} testID="scene-completion-scroll">
        <Stack.Screen options={{ title: activeScene.title }} />
        <MotionReveal mode={motionMode} motionKey={`${activeScene.id}-complete`} style={styles.finishIntro} testID="scene-completion-motion">
          <View style={styles.finishBadge}><Star color={colors.white} fill={colors.white} size={34} /></View>
          <Text style={sharedStyles.eyebrow}>Scene complete</Text>
          <View style={styles.finishHeading}>
            <Text accessibilityLanguage={scriptPreference === 'latin' ? undefined : "hi-IN"} style={[styles.finishHindi, scriptPreference !== 'latin' && styles.finishHindiScript]} testID="scene-completion-headline">{lessonHindiLabel('आपने कर दिखाया!', scriptPreference, 'Aapne kar dikhaya!')}</Text>
            <Text style={styles.finishGloss} testID="scene-completion-gloss">You did it!</Text>
          </View>
          <Text style={styles.finishTitle} testID="scene-completion-title">You navigated {activeScene.title} in Hindi.</Text>
          <Text style={sharedStyles.body}>The goal is not perfect recall—it’s a faster, calmer response every time.</Text>
        </MotionReveal>
        <View style={styles.finishStats}>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{score}</Text><Text style={styles.finishLabel}>points</Text></View>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{correctCount}/{answerCount}</Text><Text style={styles.finishLabel}>correct first try</Text></View>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{answerCount}</Text><Text style={styles.finishLabel}>lesson turns</Text></View>
        </View>
        <Pressable accessibilityRole="button" onPress={leaveCompletedScene} style={sharedStyles.primaryButton} testID="scene-completion-primary"><Text style={sharedStyles.primaryButtonText}>{completionAction}</Text><ChevronRight color={colors.white} size={18} /></Pressable>
        <Pressable accessibilityRole="button" onPress={replay} style={styles.secondaryButton} testID="scene-completion-secondary"><RotateCcw color={colors.ink} size={18} /><Text style={styles.secondaryText}>Replay scene</Text></Pressable>
        {guidedLesson ? (
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.tertiaryButton} testID="scene-completion-tertiary">
            <Text style={styles.tertiaryText}>Back to Today</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  const recoveryActionsFirst = resolution === 'incorrect'
    && (effectiveMode === 'choice' || effectiveMode === 'wordOrder');
  const answerActions = resolution !== null ? (
    <View
      onLayout={(event) => {
        if (!pendingResolutionScrollRef.current) return;
        const viewportHeight = sceneViewportHeightRef.current;
        if (viewportHeight <= 0) return;
        const { height, y } = event.nativeEvent.layout;
        const nextScrollY = Math.max(0, y + height + spacing.lg - viewportHeight);
        pendingResolutionScrollRef.current = false;
        if (nextScrollY <= sceneScrollYRef.current) return;
        sceneScrollYRef.current = nextScrollY;
        sceneScrollRef.current?.scrollTo({ animated: !reducedMotion, y: nextScrollY });
      }}
      style={styles.answerActions}
      testID="scene-answer-actions"
    >
      {resolution === 'incorrect' && (effectiveMode === 'choice' || effectiveMode === 'wordOrder') ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: pronunciationBusy }}
          disabled={pronunciationBusy}
          onPress={tryAgain}
          style={[styles.tryAgainButton, pronunciationBusy && styles.disabled]}
          testID="scene-try-again"
        >
          <RotateCcw color={colors.brand} size={19} />
          <Text style={styles.tryAgainText}>Try again</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" onPress={next} style={styles.nextButton} testID="scene-continue">
        <Text style={styles.nextText}>{beatIndex === activeScene.beats.length - 1 ? 'Finish' : 'Continue'}</Text>
        <ChevronRight color={colors.ink} size={18} />
      </Pressable>
    </View>
  ) : null;

  return (
    <ScrollView
      key="scene-run"
      ref={sceneScrollRef}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      onLayout={(event) => {
        sceneViewportHeightRef.current = event.nativeEvent.layout.height;
      }}
      onScroll={(event) => {
        sceneScrollYRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
      }}
      scrollEventThrottle={16}
      style={sharedStyles.screen}
      testID="scene-scroll"
    >
      {/* The serif heading below names the scene, so the bar stays untitled. */}
      <Stack.Screen options={{ title: activeScene.title, headerTitle: '' }} />
      <View style={styles.header}>
        <View style={[styles.progressHeader, largeTextLayout && styles.progressHeaderLarge]} testID="scene-progress-header">
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.beatSegments}>
            {activeScene.beats.map((_, index) => {
              const filled = index < beatIndex || (index === beatIndex && (resolution !== null || alreadyResolvedIncorrect));
              return <View key={index} style={[styles.beatSegment, filled && styles.beatSegmentFilled]} testID={`scene-beat-segment-${index}`} />;
            })}
          </View>
          <Text style={styles.turn}>Turn {beatIndex + 1} of {activeScene.beats.length}</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.place}>{activeScene.place}</Text>
          <Text accessibilityRole="header" style={styles.sceneTitle}>{activeScene.title}</Text>
        </View>
        <View style={styles.hudRow}>
          <View style={styles.hud}><Text style={styles.hudText}>{correctCount} correct</Text></View>
          <View accessible accessibilityLabel={`${score} points`} style={styles.hud}><Star color={colors.gold} fill={colors.gold} size={15} /><Text style={styles.hudText}>{score}</Text></View>
        </View>
      </View>

      {incompatibleCheckpoint ? <Text style={styles.resumeNotice}>This saved lesson no longer matches its turns. Start again at turn 1 so your results stay accurate.</Text> : null}
      {legacyCheckpoint ? <Text style={styles.resumeNotice}>This older saved lesson has no answer history. Start again at turn 1 so your lesson results are complete.</Text> : null}
      {initialBeatIndex > 0 ? <Text accessibilityLiveRegion="polite" style={styles.resumeNotice}>Continuing at turn {initialBeatIndex + 1}.</Text> : null}

      {!aiConsent ? (
        <View style={styles.hint}>
          {!offlineSelected ? <>
            <Text style={styles.hintBody}>This lesson works offline. Connected coaching is optional.</Text>
            <Pressable accessibilityRole="button" onPress={() => setOfflineSelected(true)} style={sharedStyles.primaryButton} testID="scene-offline-continue"><Text style={sharedStyles.primaryButtonText}>Continue with offline lesson</Text></Pressable>
          </> : <Text style={styles.hintBody}>Offline lesson ready — no AI consent needed.</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAiDetails }} onPress={() => setShowAiDetails((shown) => !shown)} style={styles.tertiaryButton} testID="scene-ai-details"><Text style={styles.tertiaryText}>{showAiDetails ? 'Hide connected coaching details' : 'About optional connected coaching'}</Text></Pressable>
          {showAiDetails ? <AiConsentGate /> : null}
        </View>
      ) : null}
      {audioError ? <Text accessibilityRole="alert" style={styles.audioError}>{audioError}</Text> : null}

      <View style={[styles.ashaRow, largeTextLayout && styles.ashaRowLarge]} testID="scene-asha-row">
        <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.asha} transition={0} />
        <View style={[styles.bubble, largeTextLayout && styles.bubbleLarge]} testID="scene-asha-bubble">
          <Text style={styles.speakerName}>Asha</Text>
          <Text accessibilityLanguage={scriptPreference === 'latin' ? undefined : 'hi-IN'} style={[styles.npc, scriptPreference !== 'latin' && styles.npcHindi, largeTextLayout && styles.npcLarge]}>{scriptPreference === 'both'
            ? <>{beat.npc}{'\n'}<Text style={styles.npcLatin}>{romanizeDevanagari(beat.npc)}</Text></>
            : lessonHindiLabel(beat.npc, scriptPreference)}</Text>
          <Text style={styles.translation}>{beat.translation}</Text>
          <Pressable
            accessibilityHint={!aiConsent && !hasOfflineSpeech(beat.npc)
              ? 'Agree to connected AI processing to enable this voice.'
              : pronunciationBusy
                ? 'Finish pronunciation practice before playing another voice.'
                : aiConsent
                  ? 'Plays the Hindi situation, then its English translation.'
                  : 'Plays bundled Hindi lesson audio offline.'}
            accessibilityLabel="Hear Asha"
            accessibilityRole="button"
            accessibilityState={{ disabled: (!aiConsent && !hasOfflineSpeech(beat.npc)) || pronunciationBusy }}
            disabled={(!aiConsent && !hasOfflineSpeech(beat.npc)) || pronunciationBusy}
            onPress={() => play(situationPromptSpeech ?? beat.npc)}
            style={[styles.speaker, largeTextLayout && styles.speakerLarge, ((!aiConsent && !hasOfflineSpeech(beat.npc)) || pronunciationBusy) && styles.disabled]}
          >
            <Volume2 color={colors.brandText} size={16} />
            <Text style={styles.speakerText}>Listen</Text>
          </Pressable>
        </View>
      </View>

      {picked !== null && beat.choices[picked] ? (
        <View style={styles.learnerRow}>
          <View style={styles.learnerBubble}>
            <Text accessibilityLanguage={scriptPreference === 'latin' ? undefined : 'hi-IN'} style={[styles.learnerText, scriptPreference !== 'latin' && styles.learnerTextHindi]}>{lessonHindiLabel(beat.choices[picked].hi, scriptPreference, beat.choices[picked].latin)}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.sheet}>
        {currentUsesName ? <View style={styles.hint}>
          <Text style={styles.hintTitle}>Practice with your name</Text>
          <TextInput accessibilityLabel="Your name for Hindi practice" value={practiceName} onChangeText={setPracticeName} onBlur={() => updateLearnerProfile?.({ displayName: practiceName.trim() })} maxLength={40} editable={resolution === null && answeredBeatIndex !== beatIndex} placeholder="Enter your name" style={[styles.hintBody, { minHeight: 48 }]} testID="scene-practice-name" />
          <Text style={styles.hintBody}>Your name stays on this device unless you use connected coaching or speech.</Text>
        </View> : null}
        <View style={[styles.answerHeader, largeTextLayout && styles.answerHeaderLarge]}>
          <Text style={styles.answerTitle}>{effectivePrompt}</Text>
          {resolution === null ? (
            <Pressable
              accessibilityLabel={showHint ? 'Hide Asha’s hint' : 'Show Asha’s hint'}
              accessibilityRole="button"
              accessibilityState={{ expanded: showHint }}
              onPress={() => setShowHint((visible) => !visible)}
              style={[styles.hintButton, showHint && styles.hintButtonActive]}
            >
              <Text style={[styles.hintButtonText, showHint && styles.hintButtonTextActive]}>Hint</Text>
            </Pressable>
          ) : null}
        </View>
        {resolution === null && showHint ? <Text style={styles.hintBody}>{effectiveTip}</Text> : null}

        {effectiveMode === 'choice' ? (
          <View key={choicePresentation.key} style={styles.choices} testID="scene-choices">
            {choicePresentation.choices.map(({ item: choice, sourceIndex }) => {
              const selected = picked === sourceIndex;
              const revealed = picked !== null && choice.correct;
              const answered = picked !== null;
              const wrong = selected && !choice.correct;
              const answerStatus = revealed ? ', correct answer' : wrong ? ', your answer, incorrect' : '';
              const accessibilityLabel = answered
                ? `${lessonHindiLabel(choice.hi, scriptPreference, choice.latin)} ${choice.en}${answerStatus}`
                : lessonHindiLabel(choice.hi, scriptPreference, choice.latin);
              return (
                <Pressable
                  key={choice.hi}
                  testID={`scene-choice-${sourceIndex}`}
                  accessibilityLabel={accessibilityLabel}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: picked !== null || pronunciationBusy || needsName, selected }}
                  disabled={picked !== null || pronunciationBusy || needsName}
                  onPress={() => choose(sourceIndex)}
                  style={[styles.choice, largeTextLayout && styles.choiceLarge, wrong && styles.choiceWrong, revealed && styles.choiceCorrect]}
                >
                  <View style={[styles.choiceCopy, largeTextLayout && styles.choiceCopyLarge]} testID="scene-choice-copy">
                    {scriptPreference !== 'latin' ? <Text accessibilityLanguage="hi-IN" style={[styles.choiceHindi, revealed && styles.choiceHindiCorrect, wrong && styles.choiceHindiWrong]}>{choice.hi}</Text> : null}
                    {scriptPreference !== 'devanagari' ? <Text style={[styles.choiceRomanized, revealed && styles.choiceMetaCorrect, wrong && styles.choiceMetaWrong]}>{choice.latin}</Text> : null}
                    {answered ? <Text style={[styles.choiceMeaning, revealed && styles.choiceMetaCorrect, wrong && styles.choiceMetaWrong]}>{choice.en}</Text> : null}
                  </View>
                  {selected ? (choice.correct ? <Check color={colors.white} size={22} /> : <X color={colors.danger} size={22} />) : revealed ? <Check color={colors.white} size={22} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : effectiveMode === 'wordOrder' ? (
          <WordOrderPractice
            scriptPreference={scriptPreference}
            disabled={pronunciationBusy || resolution !== null || needsName}
            key={`word-order-${activeScene.id}-${beatIndex}-${target.hi}-${wordOrderRetryNonce}`}
            onResolve={handleAlternateResult}
            showInstructions={false}
            targetHi={target.hi}
            targetLatin={target.latin}
          />
        ) : (
          <RecallRevealPractice
            scriptPreference={scriptPreference}
            disabled={pronunciationBusy || resolution !== null || needsName}
            key={`recall-reveal-${activeScene.id}-${beatIndex}-${target.hi}`}
            onResolve={handleAlternateResult}
            targetEn={target.en}
            targetHi={target.hi}
            targetLatin={target.latin}
          />
        )}

        {resolution !== null ? (
          <View testID="scene-feedback">
            <MotionReveal mode={motionMode} motionKey={`${activeScene.id}-${beatIndex}-${resolution}`} style={[styles.result, resolution === 'incorrect' && styles.resultWrong, largeTextLayout && styles.resultLarge]} testID="scene-result">
              <View style={styles.resultCopy}>
                <Text style={[styles.resultTitle, resolution === 'incorrect' && styles.resultWrongText]}>{resultTitle(correct)}</Text>
                {englishMistakeFeedback ? <Text style={[styles.resultBody, styles.resultWrongText]} testID="scene-result-feedback">{englishMistakeFeedback}</Text> : null}
                {englishMistakeFeedback ? <Text style={styles.resultTip}>Pattern: {effectiveTip}</Text> : null}
                {resolution === 'incorrect' && effectiveMode === 'wordOrder' ? (
                  <View style={styles.wordOrderSolution} testID="scene-word-order-solution">
                    <Text style={styles.wordOrderSolutionLabel}>NATURAL ORDER</Text>
                    {scriptPreference !== 'latin' ? <Text accessibilityLanguage="hi-IN" style={styles.wordOrderSolutionHindi}>{target.hi}</Text> : null}
                    {scriptPreference !== 'devanagari' ? <Text style={styles.wordOrderSolutionLatin}>{target.latin}</Text> : null}
                  </View>
                ) : null}
                {picked === null && resolution === 'incorrect' ? (
                  <View style={styles.alternateCoachNote} testID="scene-alternate-coach-note">
                    <Text style={styles.alternateCoachLabel}>ASHA’S COACH NOTE</Text>
                    {scriptPreference !== 'latin' ? <Text accessibilityLanguage="hi-IN" style={styles.alternateCoachHindi}>{ALTERNATE_INCORRECT_COACH.hi}</Text> : null}
                    {scriptPreference !== 'devanagari' ? <Text style={styles.alternateCoachLatin}>{ALTERNATE_INCORRECT_COACH.latin}</Text> : null}
                    <Text style={styles.alternateCoachEnglish}>{ALTERNATE_INCORRECT_COACH.en}</Text>
                  </View>
                ) : feedbackReply ? <Text accessibilityLanguage={scriptPreference === 'latin' ? undefined : 'hi-IN'} style={[styles.resultHindi, scriptPreference !== 'latin' && styles.resultHindiScript]}>{lessonHindiLabel(feedbackReply, scriptPreference)}</Text> : null}
              </View>
            </MotionReveal>
          </View>
        ) : null}

        {recoveryActionsFirst ? answerActions : null}

        {resolution !== null ? (
          <>
            <View testID="scene-save">
              <View style={[styles.saveRow, largeTextLayout && styles.saveRowLarge]} testID="scene-save-row">
                <View style={[styles.saveCopy, largeTextLayout && styles.saveCopyLarge]}><Text style={styles.saveTitle}>Keep the natural answer</Text><Text style={styles.saveMeaning}>{target.en}</Text></View>
                <Pressable accessibilityLabel={saved ? 'Remove saved phrase' : 'Save phrase'} accessibilityRole="button" accessibilityState={{ selected: saved }} onPress={() => togglePhrase(target)} style={[styles.saveButton, largeTextLayout && styles.saveButtonLarge, saved && styles.saveButtonActive]}>
                  <Bookmark color={saved ? colors.white : colors.ink} fill={saved ? colors.white : 'transparent'} size={19} />
                </Pressable>
              </View>
            </View>
            <View style={styles.wordTray} testID="scene-words">
              <Text style={styles.wordTrayTitle}>Unpack the answer</Text>
              <Text style={styles.wordTrayHint}>Tap a Hindi word for its meaning in this phrase.</Text>
              <View style={styles.wordTokenWrap}>
                {hindiWordTokens(target.hi).map((word) => {
                  const romanizedWord = romanizeDevanagari(word);
                  return (
                    <Pressable
                      accessibilityHint={aiConsent ? 'Opens a contextual English explanation.' : 'Agree to connected AI processing to unpack this word.'}
                      accessibilityLabel={`Explain ${lessonHindiLabel(word, scriptPreference, romanizedWord)} in the answer`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !aiConsent }}
                      disabled={!aiConsent}
                      key={word}
                      onPress={() => setWordDefinitionWord(word)}
                      style={[styles.wordToken, !aiConsent && styles.disabled]}
                    ><Text style={[styles.wordTokenText, scriptPreference !== 'latin' && styles.wordTokenHindi]}>{lessonHindiLabel(word, scriptPreference, romanizedWord)}</Text></Pressable>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}

        {aiConsent && !needsName ? (
          <View testID="scene-pronunciation">
            <PronunciationRecorder key={`${activeScene.id}-${beatIndex}-${target.hi}`} lessonTitle={activeScene.title} onActivityChange={setPronunciationBusy} target={target} />
          </View>
        ) : null}
        {!recoveryActionsFirst ? answerActions : null}
      </View>
      {wordDefinitionWord ? <WordDefinitionSheet clientId={clientId} initialWord={wordDefinitionWord} onClose={() => setWordDefinitionWord(null)} phrase={target.hi} reducedMotion={reducedMotion} scriptPreference={learnerProfile?.scriptPreference ?? 'both'} visible /> : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 0, gap: 14 },
  center: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  header: { gap: 14 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  progressHeaderLarge: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.sm },
  beatSegments: { minWidth: 0, flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 6 },
  beatSegment: { minWidth: 0, flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: c.line },
  beatSegmentFilled: { backgroundColor: c.brand },
  turn: { color: c.muted, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  titleBlock: { gap: 2 },
  place: { color: c.muted, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase' },
  sceneTitle: { color: c.ink, fontFamily: displayFont, fontSize: 26, lineHeight: 31, fontWeight: '700', letterSpacing: -0.3 },
  hudRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  hud: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, backgroundColor: c.paperRaised, paddingHorizontal: 10 },
  hudText: { color: c.ink, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  resumeNotice: { color: c.forestText, fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  // Asha's face sits at the top of her bubble; the tightened top-left corner reads as a chat tail.
  ashaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ashaRowLarge: { flexDirection: 'column', alignItems: 'stretch' },
  asha: { width: 40, height: 40, borderRadius: radius.pill, borderColor: c.gold, borderWidth: 2, backgroundColor: c.brandSoft },
  bubble: { minWidth: 0, flex: 1, maxWidth: 300, backgroundColor: c.paperRaised, borderRadius: 22, borderTopLeftRadius: 6, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: 14, gap: spacing.xs },
  bubbleLarge: { alignSelf: 'stretch', flex: 0, maxWidth: '100%' },
  speakerName: { color: c.muted, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  npc: { color: c.ink, fontFamily: displayFont, fontSize: 22, lineHeight: 30, fontWeight: '600' },
  npcHindi: hindiType(23),
  npcLarge: {},
  npcLatin: { color: c.brandText, fontFamily: 'System', fontSize: 15, lineHeight: 22, fontWeight: '500' },
  translation: { color: c.muted, fontSize: 13, lineHeight: 18 },
  speaker: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: c.brandSoft, paddingHorizontal: spacing.md, marginTop: 2 },
  speakerLarge: { alignSelf: 'flex-end', position: 'relative' },
  speakerText: { color: c.brandText, fontSize: 13, fontWeight: '600' },
  learnerRow: { alignItems: 'flex-end' },
  learnerBubble: { maxWidth: '82%', backgroundColor: c.brand, borderRadius: 22, borderBottomRightRadius: 6, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  learnerText: { color: c.white, fontFamily: displayFont, fontSize: 18, lineHeight: 26, fontWeight: '600' },
  learnerTextHindi: hindiType(19),
  disabled: { opacity: 0.4 },
  audioError: { color: c.danger, fontSize: 13, lineHeight: 18 },
  sheet: { marginHorizontal: -spacing.lg, marginTop: spacing.xs, backgroundColor: c.paperRaised, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, borderCurve: 'continuous', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 34, gap: spacing.md, boxShadow: '0 -8px 24px rgba(23, 37, 35, 0.06)' },
  answerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  answerHeaderLarge: { flexDirection: 'column', alignItems: 'stretch' },
  answerTitle: { minWidth: 0, flex: 1, color: c.ink, fontFamily: displayFont, fontSize: 17, lineHeight: 23, fontWeight: '600' },
  hintButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.goldSoft, paddingHorizontal: spacing.md },
  hintButtonActive: { backgroundColor: c.gold },
  hintButtonText: { color: c.goldText, fontSize: 13, fontWeight: '600' },
  hintButtonTextActive: { color: c.goldDeepText },
  choices: { gap: spacing.sm },
  choice: { minHeight: 64, backgroundColor: c.paperRaised, borderColor: c.lineStrong, borderWidth: 1.5, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  choiceLarge: { alignItems: 'stretch', flexDirection: 'column' },
  choiceCorrect: { borderColor: c.forest, backgroundColor: c.forest },
  choiceWrong: { borderColor: c.danger, backgroundColor: c.dangerSoft },
  choiceCopy: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.sm, rowGap: 2 },
  choiceCopyLarge: { flex: 0, width: '100%' },
  choiceHindi: { ...hindiType(20), width: '100%', color: c.ink },
  choiceHindiCorrect: { color: c.white },
  choiceHindiWrong: { color: c.danger },
  choiceRomanized: { color: c.muted, fontSize: 13, lineHeight: 18 },
  choiceMeaning: { color: c.muted, fontSize: 13, lineHeight: 18 },
  choiceMetaCorrect: { color: c.white, opacity: 0.85 },
  choiceMetaWrong: { color: c.danger, opacity: 0.85 },
  hint: { minHeight: 48, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.goldSoft, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  hintTitle: { color: c.ink, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  hintBody: { color: c.muted, fontSize: 14, lineHeight: 20 },
  result: { borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.forestSoft, padding: spacing.lg, gap: spacing.lg },
  resultWrong: { backgroundColor: c.dangerSoft },
  resultWrongText: { color: c.danger },
  resultLarge: { alignItems: 'stretch' },
  resultCopy: { gap: spacing.xs },
  resultTitle: { color: c.forestText, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  resultBody: { color: c.ink, fontSize: 14, lineHeight: 20 },
  resultTip: { color: c.muted, fontSize: 13, lineHeight: 19 },
  wordOrderSolution: { marginTop: spacing.sm, borderTopColor: c.dangerLine, borderTopWidth: 1, paddingTop: spacing.md, gap: 2 },
  wordOrderSolutionLabel: { color: c.muted, fontSize: 10, lineHeight: 15, fontWeight: '900', letterSpacing: 1 },
  wordOrderSolutionHindi: { ...hindiType(22), color: c.ink },
  wordOrderSolutionLatin: { color: c.brandText, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  alternateCoachNote: { marginTop: spacing.sm, borderRadius: radius.sm, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, padding: spacing.md, gap: 2 },
  alternateCoachLabel: { color: c.ink, fontSize: 10, lineHeight: 15, fontWeight: '900', letterSpacing: 1 },
  alternateCoachHindi: { ...hindiType(19), color: c.ink },
  alternateCoachLatin: { color: c.brandText, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  alternateCoachEnglish: { color: c.muted, fontSize: 14, lineHeight: 20 },
  resultHindi: { color: c.ink, fontFamily: displayFont, fontSize: 18, lineHeight: 26, fontWeight: '600' },
  resultHindiScript: hindiType(19),
  answerActions: { gap: spacing.sm },
  tryAgainButton: { width: '100%', minHeight: 48, alignSelf: 'stretch', borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.brand, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tryAgainText: { color: c.brandText, fontSize: 16, fontWeight: '600' },
  nextButton: { width: '100%', minHeight: 52, alignSelf: 'stretch', borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  nextText: { color: c.ink, fontSize: 16, fontWeight: '600' },
  saveRow: { backgroundColor: c.background, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md, flexDirection: 'row', alignItems: 'center' },
  saveRowLarge: { alignItems: 'stretch', flexDirection: 'column' },
  saveCopy: { flex: 1, gap: spacing.xs },
  saveCopyLarge: { flex: 0, width: '100%' },
  saveTitle: { color: c.ink, fontSize: 15, fontWeight: '600' },
  saveMeaning: { color: c.muted, fontSize: 13 },
  saveButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  saveButtonLarge: { alignSelf: 'flex-start' },
  saveButtonActive: { backgroundColor: c.brand, borderColor: c.brand },
  wordTray: { gap: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.brandSoft, padding: spacing.lg },
  wordTrayTitle: { color: c.brandText, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  wordTrayHint: { color: c.muted, fontSize: 13, lineHeight: 19 },
  wordTokenWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wordToken: { minHeight: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  wordTokenText: { color: c.brandText, fontFamily: displayFont, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  wordTokenHindi: hindiType(18),
  finish: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg, alignItems: 'stretch' },
  finishIntro: { alignItems: 'stretch', gap: spacing.lg },
  finishBadge: { width: 74, height: 74, borderRadius: radius.pill, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  finishHeading: { alignItems: 'stretch', gap: spacing.xs },
  finishHindi: { color: c.brandDark, fontFamily: displayFont, fontSize: 28, lineHeight: 36, fontWeight: '700', textAlign: 'center' },
  finishHindiScript: hindiType(30),
  finishGloss: { color: c.muted, fontSize: 15, lineHeight: 21, fontWeight: '400', textAlign: 'center' },
  finishTitle: { color: c.ink, fontFamily: displayFont, fontSize: 26, lineHeight: 32, fontWeight: '700', textAlign: 'center' },
  notFoundBody: { color: c.muted, fontSize: 16, lineHeight: 23, textAlign: 'center', maxWidth: 320 },
  finishStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  finishStat: { minWidth: 96, flexGrow: 1, flexBasis: 96, backgroundColor: c.paperRaised, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md, alignItems: 'center', gap: 2 },
  finishValue: { color: c.ink, fontFamily: displayFont, fontSize: 24, lineHeight: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  finishLabel: { color: c.muted, fontSize: 12, textAlign: 'center' },
  secondaryButton: { minHeight: 52, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderWidth: 1, borderColor: c.line, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: c.ink, fontSize: 16, fontWeight: '600' },
  tertiaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  tertiaryText: { color: c.forestText, fontSize: 14, fontWeight: '700' },
}));
