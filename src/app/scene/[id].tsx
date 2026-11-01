import { randomUUID } from 'expo-crypto';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, Check, ChevronRight, RotateCcw, Star, Volume2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { LessonReminderOffer } from '@/components/lesson-reminder-offer';
import { MotionReveal } from '@/components/motion';
import { PronunciationRecorder } from '@/components/pronunciation-recorder';
import { isWordOrderPracticeable } from '@/components/practice-mode';
import { RecallRevealPractice } from '@/components/recall-reveal-practice';
import { TapPressable as Pressable } from '@/components/tap-pressable';
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
import { cancelPracticeReminder } from '@/lib/practice-reminder';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { hindiWordTokens } from '@/lib/contextual-word-definition';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { hasOfflineSpeech, speakText, stopSpeaking } from '@/lib/speech';
import { shuffleChoices } from '@/lib/shuffle-choices';
import { trimTerminalPunctuation } from '@/lib/text';
import { DEFAULT_MOTION_PREFERENCE, defaultReminderSettings } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import { displayFont, hindiType, makeStyles, radius, spacing, useSharedStyles, useTheme, type, buttons } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/app-error-boundary';

const ashaPortrait = require('../../../assets/images/asha-portrait.png');

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
  const insets = useSafeAreaInsets();
  const sceneId = Array.isArray(id) ? id[0] : id;
  const { aiConsent, checkpointScene, clientId, learnerProfile, updateLearnerProfile, markSceneComplete, motionPreference = DEFAULT_MOTION_PREFERENCE, phrases, reminder: storedReminder, sceneProgress, setReminder, togglePhrase } = useAppState();
  const reminder = storedReminder ?? defaultReminderSettings();
  const scriptPreference = learnerProfile?.scriptPreference ?? 'both';
  const [practiceName, setPracticeName] = useState(learnerProfile?.displayName ?? '');
  const sourceScene = useMemo(() => getScene(sceneId ?? ''), [sceneId]);
  const usesName = sourceScene?.beats.some((beat) => beat.choices.some((choice) => choice.correct && /मेरा नाम (?:\.\.\.|…)/u.test(choice.hi))) ?? false;
  // A turn that practices "My name is …" asks for the name on its own step first, so the lesson screen stays about Hindi.
  const [nameStepOpen, setNameStepOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(practiceName);
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
  const { elapsedSeconds, reset: resetTimer, touch: touchTimer } = useForegroundTimer();
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
  const [finishedSeconds, setFinishedSeconds] = useState(0);
  const [correctCount, setCorrectCount] = useState(initialAttempt?.correct ?? 0);
  const [answerCount, setAnswerCount] = useState(initialAttempt?.total ?? 0);
  const [done, setDone] = useState(false);
  const [reminderOffer, setReminderOffer] = useState<'hidden' | 'open' | 'closed'>('hidden');
  const [showHint, setShowHint] = useState(false);
  const [alreadyResolvedIncorrect, setAlreadyResolvedIncorrect] = useState(false);
  // A first wrong pick keeps the right answer hidden so "Try again" means something.
  const [answerShown, setAnswerShown] = useState(false);
  const [pronunciationBusy, setPronunciationBusy] = useState(false);

  const [wordSheet, setWordSheet] = useState<{ word: string; phrase: string } | null>(null);
  const [wordSheetVisible, setWordSheetVisible] = useState(false);
  const wordSheetSessionRef = useRef(0);
  const closingWordSessionRef = useRef(0);
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

  // Guided Starter and Beginner lessons set the scene in long Hindi narration, well above the level they teach.
  const englishFirstSetup = Boolean(guidedLesson) && (scene?.level === 'Starter' || scene?.level === 'Beginner');

  // Auto-play is ambient audio, so failures stay silent: the learner can retry with the Hear Asha button.
  // English-first lessons skip it: their above-level Hindi narration plays only when the learner taps Listen.
  useEffect(() => {
    if (englishFirstSetup) return;
    if (!autoPlayKey || npcLine === undefined || situationPromptSpeech === undefined) return;
    if (resolution !== null) return;
    if (pronunciationBusy) return;
    if (autoPlayedBeatRef.current === autoPlayKey) return;
    if (!aiConsent && !hasOfflineSpeech(npcLine)) return;
    // Marked only once playback actually starts, so a beat skipped for missing
    // consent or pronunciation activity still speaks when the effect re-runs.
    autoPlayedBeatRef.current = autoPlayKey;
    void speakText(situationPromptSpeech).catch(() => {});
  }, [aiConsent, autoPlayKey, englishFirstSetup, npcLine, pronunciationBusy, resolution, situationPromptSpeech]);

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
  const openWordSheet = (word: string) => {
    wordSheetSessionRef.current += 1;
    setWordSheet({ word, phrase: target.hi });
    setWordSheetVisible(true);
  };
  const closeWordSheet = () => {
    closingWordSessionRef.current = wordSheetSessionRef.current;
    setWordSheetVisible(false);
  };
  const finishWordSheet = () => {
    if (closingWordSessionRef.current !== wordSheetSessionRef.current) return;
    setWordSheet(null);
    setWordSheetVisible(false);
  };
  const effectivePrompt = wordOrderChoiceFallback
    ? `Choose the Hindi response that means “${target.en}”`
    : beat.prompt;
  const effectiveTip = wordOrderChoiceFallback
    ? `Look for “${target.latin},” the Hindi response for “${target.en}”`
    : beat.tip;
  const saved = phrases.some((phrase) => phrase.hi === target.hi);
  const correct = resolution === 'correct';
  // Asha only replies in Hindi to a right answer; a wrong one gets plain English, not a blanket "close".
  const feedbackReply = resolution === 'correct'
    ? picked !== null && picked >= 0 ? beat.choices[picked]?.reply ?? 'बहुत अच्छा।' : 'बहुत अच्छा।'
    : '';
  const pickedChoice = picked !== null && picked >= 0 ? beat.choices[picked] : undefined;
  const choiceAnswerHidden = resolution === 'incorrect' && effectiveMode === 'choice' && !answerShown;
  const answerVisible = resolution === 'correct' || (resolution === 'incorrect' && !choiceAnswerHidden);
  const englishMistakeFeedback = resolution === 'incorrect'
    ? pickedChoice
      ? choiceAnswerHidden
        ? `That line means “${trimTerminalPunctuation(pickedChoice.en)}.” Try once more, or show the answer.`
        : pickedChoice.feedback ?? ''
      : buildAlternateFeedback({ en: target.en, latin: target.latin })
    : '';

  function play(text: string) {
    if ((!aiConsent && !hasOfflineSpeech(text)) || pronunciationBusy) return;
    void speak(text);
  }

  function recordAnswer(isCorrect: boolean) {
    if (attemptRef.current.answeredBeatIndex === beatIndex) return;
    touchTimer();
    if (currentUsesName) updateLearnerProfile?.({ displayName: practiceName.trim() });
    const previous = attemptRef.current;
    const attempt = { ...previous, score: previous.score + (isCorrect ? 50 : 0), correct: previous.correct + Number(isCorrect), total: previous.total + 1,
      weakPhrases: isCorrect ? previous.weakPhrases : [...new Set([...previous.weakPhrases, target.hi])],
      seconds: elapsedBeforeResumeRef.current + elapsedSeconds(), answeredBeatIndex: beatIndex };
    attemptRef.current = attempt;
    setCorrectCount(attempt.correct);
    setAnswerCount(attempt.total);
    checkpointScene?.(activeScene.id, beatIndex, attempt);
  }

  function resultTitle(isCorrect: boolean) {
    if (isCorrect) return 'Natural choice!';
    if (effectiveMode === 'wordOrder') return 'Check the word order.';
    if (effectiveMode === 'recallReveal') return 'Keep practicing this phrase.';
    return answerShown ? 'Here’s the natural answer.' : 'Not that one.';
  }

  function announceResult(isCorrect: boolean, title = resultTitle(isCorrect)) {
    // Android reads the new result via focus/live updates; iOS needs an explicit announcement.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(title);
  }

  function choose(index: number) {
    if (pickedRef.current !== null || pronunciationBusy || needsName) return;
    const choice = beat.choices[index];
    if (choice === undefined) return;
    pendingResolutionScrollRef.current = true;
    pickedRef.current = index;
    setPicked(index);
    recordAnswer(choice.correct);
    // A second miss reveals the answer, so announce the title the screen is about to show.
    announceResult(choice.correct, !choice.correct && alreadyResolvedIncorrect ? 'Here’s the natural answer.' : undefined);
    if (choice.correct) {
      hapticSuccess();
      setResolution('correct');
      play(choice.reply);
    }
    else {
      hapticWarning();
      // The second miss on a turn shows the answer instead of offering a third guess.
      if (alreadyResolvedIncorrect) setAnswerShown(true);
      setResolution('incorrect');
    }
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
  }

  function tryAgain() {
    if ((effectiveMode !== 'choice' && effectiveMode !== 'wordOrder') || resolution !== 'incorrect' || answerShown || pronunciationBusy) return;
    pendingResolutionScrollRef.current = false;
    pickedRef.current = null;
    setPicked(null);
    setResolution(null);
    setAlreadyResolvedIncorrect(true);
    setShowHint(false);
    closeWordSheet();
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
      const completions = Object.values(sceneProgress ?? {}).reduce((sum, progress) => sum + (progress.completions ?? 0), 0);
      if (completions === 0 && reminder.enabled !== true && reminder.offerAnswered !== true) {
        setReminderOffer((current) => (current === 'closed' ? current : 'open'));
      }
      markSceneComplete(activeScene.id, elapsedBeforeResumeRef.current + elapsedSeconds(), {
        attemptId: attemptRef.current.id,
        score: attemptRef.current.score,
        correct: attemptRef.current.correct,
        total: attemptRef.current.total,
        weakPhrases: attemptRef.current.weakPhrases,
      });
      observe('scene_completed');
      setFinishedSeconds(elapsedBeforeResumeRef.current + elapsedSeconds());
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
    setAnswerShown(false);
    closeWordSheet();
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
    setAnswerShown(false);
    closeWordSheet();
    setCorrectCount(0);
    setAnswerCount(0);
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

  function closeLesson() {
    void stopSpeaking();
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  }

  const isGuided = Boolean(guidedLesson);
  const completionAction = guidedLesson?.nextLessonId
    ? 'Next lesson'
    : guidedLesson
      ? 'View completed plan'
      : 'Back to Today';

  if (done) {
    return (
      <ScrollView key="scene-completion" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.finish, Platform.OS === 'android' && { paddingBottom: spacing.xxl + insets.bottom }]} style={sharedStyles.screen} testID="scene-completion-scroll">
        <Stack.Screen options={{ headerShown: true, title: activeScene.title }} />
        <MotionReveal mode={motionMode} motionKey={`${activeScene.id}-complete`} style={styles.finishIntro} testID="scene-completion-motion">
          <View style={styles.finishBadge}><Star color={colors.white} fill={colors.white} size={34} /></View>
          <Text style={sharedStyles.eyebrow}>{isGuided ? 'Lesson complete' : 'Scene complete'}</Text>
          <View style={styles.finishHeading}>
            <Text accessibilityLanguage={scriptPreference === 'latin' ? undefined : "hi-IN"} style={[styles.finishHindi, scriptPreference !== 'latin' && styles.finishHindiScript]} testID="scene-completion-headline">{lessonHindiLabel('आपने कर दिखाया!', scriptPreference, 'Aapne kar dikhaya!')}</Text>
            <Text style={styles.finishGloss} testID="scene-completion-gloss">You did it!</Text>
          </View>
          <Text style={styles.finishTitle} testID="scene-completion-title">You finished “{activeScene.title}.”</Text>
          <Text style={sharedStyles.body}>The goal is not perfect recall—it’s a faster, calmer response every time.</Text>
        </MotionReveal>
        <View style={styles.finishStats}>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{correctCount}/{answerCount}</Text><Text style={styles.finishLabel}>right first try</Text></View>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{Math.max(1, Math.round(finishedSeconds / 60))} min</Text><Text style={styles.finishLabel}>practiced</Text></View>
        </View>
        {reminderOffer === 'open' ? (
          <LessonReminderOffer
            onAnswered={(next) => {
              setReminderOffer('closed');
              // If saving fails the stored reminder rolls back, so cancel the
              // notification that was just scheduled instead of orphaning it.
              // A rejected save counts as a failed one.
              void setReminder(next).catch(() => false).then(async (saved) => {
                if (!saved && next.notificationId) await cancelPracticeReminder(next);
              }).catch(() => undefined);
            }}
            reminder={reminder}
          />
        ) : null}
        <Pressable accessibilityRole="button" onPress={leaveCompletedScene} style={sharedStyles.primaryButton} testID="scene-completion-primary"><Text style={sharedStyles.primaryButtonText}>{completionAction}</Text><ChevronRight color={colors.white} size={18} /></Pressable>
        <Pressable accessibilityRole="button" onPress={replay} style={styles.secondaryButton} testID="scene-completion-secondary"><RotateCcw color={colors.ink} size={18} /><Text style={styles.secondaryText}>Practice again</Text></Pressable>
        {guidedLesson ? (
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.tertiaryButton} testID="scene-completion-tertiary">
            <Text style={styles.tertiaryText}>Back to Today</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  if (nameStepOpen || needsName) {
    const draft = nameDraft.trim();
    const saveName = () => {
      if (!draft) return;
      hapticSelect();
      setPracticeName(draft);
      updateLearnerProfile?.({ displayName: draft });
      setNameStepOpen(false);
    };
    return (
      // iOS: pad the whole step above the keyboard. Continue stays in a footer, not in the scrolling
      // content, so larger text can grow the heading without sliding the button under the keyboard.
      // Android resizes the window (softwareKeyboardLayoutMode), so no behavior there.
      <KeyboardAvoidingView
        key="scene-name-step"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={sharedStyles.screen}
        testID="scene-name-step-keyboard"
      >
        <Stack.Screen options={{ headerShown: false, title: activeScene.title }} />
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[styles.content, styles.nameStep, { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.lg }]}
          keyboardShouldPersistTaps="handled"
          style={styles.nameStepScroll}
          testID="scene-name-step"
        >
          <Pressable accessibilityLabel="Close lesson" accessibilityRole="button" onPress={closeLesson} style={styles.closeButton} testID="scene-close">
            <X color={colors.ink} size={18} strokeWidth={2.2} />
          </Pressable>
          <View style={styles.nameStepBody}>
            <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.nameStepAsha} transition={0} />
            <Text accessibilityRole="header" style={styles.nameStepTitle}>What’s your name?</Text>
            <Text style={styles.nameStepBody2}>You’ll learn to say it in Hindi.</Text>
            <TextInput
              accessibilityLabel="Your name for Hindi practice"
              autoCapitalize="words"
              autoComplete="given-name"
              autoCorrect={false}
              autoFocus
              maxLength={40}
              onChangeText={setNameDraft}
              onSubmitEditing={saveName}
              placeholder="Your name"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
              style={styles.nameInput}
              testID="scene-practice-name"
              textContentType="givenName"
              value={nameDraft}
            />
          </View>
        </ScrollView>
        <View style={[styles.nameStepFooter, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.nameStepNote}>Stays on this device.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !draft }}
            disabled={!draft}
            onPress={saveName}
            style={[sharedStyles.primaryButton, !draft && styles.disabled]}
            testID="scene-name-continue"
          >
            <Text style={sharedStyles.primaryButtonText}>Continue</Text>
            <ChevronRight color={colors.white} size={18} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
      {resolution === 'incorrect' && (effectiveMode === 'choice' || effectiveMode === 'wordOrder') && !answerShown ? (
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
      {choiceAnswerHidden ? (
        <Pressable accessibilityRole="button" onPress={() => { hapticSelect(); setAnswerShown(true); }} style={styles.secondaryButton} testID="scene-show-answer">
          <Text style={styles.secondaryText}>Show answer</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" onPress={next} style={styles.nextButton} testID="scene-continue">
          <Text style={styles.nextText}>{beatIndex === activeScene.beats.length - 1 ? 'Finish' : 'Continue'}</Text>
          <ChevronRight color={colors.white} size={18} />
        </Pressable>
      )}
    </View>
  ) : null;

  return (
    <ScrollView
      key="scene-run"
      ref={sceneScrollRef}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
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
      {/* The serif heading below names the scene, so the lesson draws its own close button instead of a nav bar. */}
      <Stack.Screen options={{ headerShown: false, title: activeScene.title }} />
      <View style={styles.header}>
        <View style={[styles.progressHeader, largeTextLayout && styles.progressHeaderLarge]} testID="scene-progress-header">
          <Pressable
            accessibilityHint="Leaves this lesson. Your progress is saved at the current turn."
            accessibilityLabel="Close lesson"
            accessibilityRole="button"
            onPress={closeLesson}
            style={styles.closeButton}
            testID="scene-close"
          >
            <X color={colors.ink} size={18} strokeWidth={2.2} />
          </Pressable>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.beatSegments}>
            {activeScene.beats.map((_, index) => {
              const filled = index < beatIndex || (index === beatIndex && (resolution !== null || alreadyResolvedIncorrect));
              return <View key={index} style={[styles.beatSegment, filled && styles.beatSegmentFilled]} testID={`scene-beat-segment-${index}`} />;
            })}
          </View>
          <Text style={styles.turn}>Turn {beatIndex + 1} of {activeScene.beats.length}</Text>
        </View>
        {/* Title and tally share one row so Asha's line and the answer fit on screen without scrolling. */}
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.sceneTitle}>{activeScene.title}</Text>
          <View style={styles.hudRow}>
            <View style={styles.hud}><Text style={styles.hudText}>{correctCount} correct</Text></View>
          </View>
        </View>
      </View>

      {incompatibleCheckpoint ? <Text style={styles.resumeNotice}>This saved lesson no longer matches its turns. Start again at turn 1 so your results stay accurate.</Text> : null}
      {legacyCheckpoint ? <Text style={styles.resumeNotice}>This older saved lesson has no answer history. Start again at turn 1 so your lesson results are complete.</Text> : null}
      {initialBeatIndex > 0 && beatIndex === initialBeatIndex && resolution === null ? <FadingNotice style={styles.resumeNoticeQuiet}>Picking up where you left off.</FadingNotice> : null}

      {!aiConsent ? (
        <View style={styles.offlineNote}>
          {/* Lessons never needed a choice here: they always run offline. One quiet line, details on request. */}
          {/* hitSlop lifts the 18pt line to a 44pt target without changing how the note looks. */}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAiDetails }} hitSlop={14} onPress={() => setShowAiDetails((shown) => !shown)} testID="scene-ai-details">
            <Text style={styles.offlineNoteText}>Works offline · <Text style={styles.offlineNoteLink}>{showAiDetails ? 'Hide Asha coaching details' : 'Add Asha coaching'}</Text></Text>
          </Pressable>
          {showAiDetails ? <AiConsentGate /> : null}
        </View>
      ) : null}
      {audioError ? <Text accessibilityRole="alert" style={styles.audioError}>{audioError}</Text> : null}

      <View style={[styles.ashaRow, largeTextLayout && styles.ashaRowLarge]} testID="scene-asha-row">
        <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.asha} transition={0} />
        <View style={[styles.bubble, largeTextLayout && styles.bubbleLarge]} testID="scene-asha-bubble">
          <View style={styles.speakerRow}>
            <Text style={styles.speakerName}>Asha</Text>
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
              hitSlop={4}
              onPress={() => play(situationPromptSpeech ?? beat.npc)}
              style={[styles.speaker, largeTextLayout && styles.speakerLarge, ((!aiConsent && !hasOfflineSpeech(beat.npc)) || pronunciationBusy) && styles.disabled]}
            >
              <Volume2 color={colors.brandText} size={16} />
              <Text style={styles.speakerText}>Listen</Text>
            </Pressable>
          </View>
          {englishFirstSetup ? (
            <>
              {/* Starter and Beginner lessons lead with the moment in English; the Hindi stays one tap of Listen away. */}
              <Text style={[styles.setupEnglish, largeTextLayout && styles.npcLarge]}>{beat.translation}</Text>
              <Text accessibilityLanguage={scriptPreference === 'latin' ? undefined : 'hi-IN'} style={[styles.setupHindi, scriptPreference !== 'latin' && styles.setupHindiScript]}>{scriptPreference === 'both'
                ? <>{beat.npc}{'\n'}<Text style={styles.setupHindi}>{romanizeDevanagari(beat.npc)}</Text></>
                : lessonHindiLabel(beat.npc, scriptPreference)}</Text>
            </>
          ) : (
            <>
              <Text accessibilityLanguage={scriptPreference === 'latin' ? undefined : 'hi-IN'} style={[styles.npc, scriptPreference !== 'latin' && styles.npcHindi, largeTextLayout && styles.npcLarge]}>{scriptPreference === 'both'
                ? <>{beat.npc}{'\n'}<Text style={styles.npcLatin}>{romanizeDevanagari(beat.npc)}</Text></>
                : lessonHindiLabel(beat.npc, scriptPreference)}</Text>
              <Text style={styles.translation}>{beat.translation}</Text>
            </>
          )}
        </View>
      </View>

      {picked !== null && beat.choices[picked] ? (
        <View style={styles.learnerRow}>
          <View style={styles.learnerBubble}>
            <Text accessibilityLanguage={scriptPreference === 'latin' ? undefined : 'hi-IN'} style={[styles.learnerText, scriptPreference !== 'latin' && styles.learnerTextHindi]}>{lessonHindiLabel(beat.choices[picked].hi, scriptPreference, beat.choices[picked].latin)}</Text>
          </View>
        </View>
      ) : null}

      {/* The tray draws under the home indicator / Android gesture bar, so it adds the bottom inset itself. */}
      <View style={[styles.sheet, { paddingBottom: Math.max(34, insets.bottom + spacing.md) }]}>
        {currentUsesName && resolution === null && practiceName.trim() ? (
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.nameRowText}>Practicing as {practiceName.trim()}</Text>
            {/* hitSlop lifts the 13pt link to a 44pt target without changing how it looks. */}
            <Pressable accessibilityLabel="Change your practice name" accessibilityRole="button" hitSlop={14} onPress={() => { setNameDraft(practiceName); setNameStepOpen(true); }} testID="scene-change-name">
              <Text style={styles.nameRowLink}>Change</Text>
            </Pressable>
          </View>
        ) : null}
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
              const revealed = picked !== null && choice.correct && answerVisible;
              const answered = picked !== null && (answerVisible || selected);
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
                {resolution === 'incorrect' && effectiveMode === 'wordOrder' ? (
                  <View style={styles.wordOrderSolution} testID="scene-word-order-solution">
                    <Text style={styles.wordOrderSolutionLabel}>NATURAL ORDER</Text>
                    {scriptPreference !== 'latin' ? <Text accessibilityLanguage="hi-IN" style={styles.wordOrderSolutionHindi}>{target.hi}</Text> : null}
                    {scriptPreference !== 'devanagari' ? <Text style={styles.wordOrderSolutionLatin}>{target.latin}</Text> : null}
                  </View>
                ) : null}
                {feedbackReply ? <Text accessibilityLanguage={scriptPreference === 'latin' ? undefined : 'hi-IN'} style={[styles.resultHindi, scriptPreference !== 'latin' && styles.resultHindiScript]}>{lessonHindiLabel(feedbackReply, scriptPreference)}</Text> : null}
              </View>
            </MotionReveal>
          </View>
        ) : null}

        {recoveryActionsFirst ? answerActions : null}

        {answerVisible ? (
          <>
            <View testID="scene-save">
              <View style={[styles.saveRow, largeTextLayout && styles.saveRowLarge]} testID="scene-save-row">
                <View style={[styles.saveCopy, largeTextLayout && styles.saveCopyLarge]}><Text style={styles.saveTitle}>Keep the natural answer</Text><Text style={styles.saveMeaning}>{target.en}</Text></View>
                <Pressable accessibilityLabel={saved ? 'Remove saved phrase' : 'Save phrase'} accessibilityRole="button" accessibilityState={{ selected: saved }} onPress={() => { if (saved) hapticSelect(); else hapticSuccess(); togglePhrase(target); }} style={[styles.saveButton, largeTextLayout && styles.saveButtonLarge, saved && styles.saveButtonActive]}>
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
                      onPress={() => openWordSheet(word)}
                      style={[styles.wordToken, !aiConsent && styles.disabled]}
                    ><Text style={[styles.wordTokenText, scriptPreference !== 'latin' && styles.wordTokenHindi]}>{lessonHindiLabel(word, scriptPreference, romanizedWord)}</Text></Pressable>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}

        {aiConsent && !needsName && answerVisible ? (
          <View testID="scene-pronunciation">
            <PronunciationRecorder key={`${activeScene.id}-${beatIndex}-${target.hi}`} lessonTitle={activeScene.title} onActivityChange={setPronunciationBusy} target={target} />
          </View>
        ) : null}
        {!recoveryActionsFirst ? answerActions : null}
      </View>
      <WordDefinitionSheet clientId={clientId} initialWord={wordSheet?.word ?? null} onClose={closeWordSheet} onDismissed={finishWordSheet} phrase={wordSheet?.phrase ?? target.hi} reducedMotion={reducedMotion} scriptPreference={learnerProfile?.scriptPreference ?? 'both'} visible={wordSheetVisible && wordSheet !== null} />
    </ScrollView>
  );
}

/** A one-line status that is read out, then fades away after 3 s so it does not linger above the turn. */
function FadingNotice({ children, style }: { children: string; style: StyleProp<TextStyle> }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const animation = Animated.timing(opacity, { toValue: 0, duration: 400, delay: 3000, useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) setGone(true); });
    return () => animation.stop();
  }, [opacity]);
  if (gone) return null;
  return <Animated.Text accessibilityLiveRegion="polite" style={[style, { opacity }]}>{children}</Animated.Text>;
}

const useStyles = makeStyles((c) => ({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 0, gap: spacing.lg },
  center: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  header: { gap: spacing.md },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  closeButton: { width: 44, height: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
  progressHeaderLarge: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.sm },
  beatSegments: { minWidth: 0, flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  beatSegment: { minWidth: 0, flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: c.line },
  beatSegmentFilled: { backgroundColor: c.brand },
  turn: { ...type.caption, color: c.muted, fontVariant: ['lining-nums', 'tabular-nums'], fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: spacing.md, rowGap: spacing.xs },
  sceneTitle: { ...type.title, flexShrink: 1, color: c.ink },
  hudRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  hud: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radius.pill, backgroundColor: c.paperRaised, paddingHorizontal: spacing.md },
  hudText: { ...type.caption, color: c.ink, fontVariant: ['lining-nums', 'tabular-nums'], fontWeight: '600' },
  resumeNotice: { ...type.caption, color: c.brandText, textAlign: 'left', fontWeight: '600' },
  resumeNoticeQuiet: { ...type.caption, color: c.muted, textAlign: 'left' },
  // Asha's face sits at the top of her bubble; the tightened top-left corner reads as a chat tail.
  ashaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  ashaRowLarge: { flexDirection: 'column', alignItems: 'stretch' },
  asha: { width: 40, height: 40, borderRadius: radius.pill, borderColor: c.gold, borderWidth: 2, backgroundColor: c.brandSoft },
  bubble: { minWidth: 0, flex: 1, maxWidth: 300, backgroundColor: c.paperRaised, borderRadius: radius.xl, borderTopLeftRadius: 6, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  bubbleLarge: { alignSelf: 'stretch', flex: 0, maxWidth: '100%' },
  speakerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  speakerName: { ...type.caption, color: c.muted, fontWeight: '600' },
  npc: { ...type.headline, color: c.ink, fontWeight: '600' },
  npcHindi: hindiType(20),
  npcLarge: {},
  npcLatin: { ...type.label, fontFamily: 'System', color: c.brandText },
  translation: { ...type.bodyLarge, color: c.muted },
  speaker: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.pill, backgroundColor: c.brandSoft, paddingHorizontal: spacing.md },
  speakerLarge: { alignSelf: 'flex-end', position: 'relative' },
  speakerText: { ...type.caption, color: c.brandText, fontWeight: '600' },
  learnerRow: { alignItems: 'flex-end' },
  learnerBubble: { maxWidth: '82%', backgroundColor: c.brand, borderRadius: radius.xl, borderBottomRightRadius: 6, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, // Small radius on one corner draws the speech-bubble tail.
  learnerText: { ...type.headline, color: c.white, fontWeight: '600' },
  learnerTextHindi: hindiType(20),
  disabled: { opacity: 0.4 },
  audioError: { ...type.caption, color: c.danger },
  sheet: { marginHorizontal: -spacing.lg, marginTop: spacing.xs, backgroundColor: c.paperRaised, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, borderCurve: 'continuous', paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md, boxShadow: '0 -8px 24px rgba(23, 37, 35, 0.06)' },
  answerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  answerHeaderLarge: { flexDirection: 'column', alignItems: 'stretch' },
  answerTitle: { ...type.bodyLarge, minWidth: 0, flex: 1, color: c.ink, fontFamily: displayFont, fontWeight: '600' },
  hintButton: { ...buttons.secondary, minWidth: 44, minHeight: 44, borderRadius: radius.pill, paddingHorizontal: spacing.md },
  hintButtonActive: { backgroundColor: c.ink, borderColor: c.ink },
  hintButtonText: { ...type.caption, color: c.ink, fontWeight: '600' },
  hintButtonTextActive: { color: c.white },
  choices: { gap: spacing.sm },
  choice: { minHeight: 64, backgroundColor: c.paperRaised, borderColor: c.lineStrong, borderWidth: 1.5, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  choiceLarge: { alignItems: 'stretch', flexDirection: 'column' },
  choiceCorrect: { borderColor: c.forest, backgroundColor: c.forest },
  choiceWrong: { borderColor: c.danger, backgroundColor: c.dangerSoft },
  choiceCopy: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.sm, rowGap: spacing.xs },
  choiceCopyLarge: { flex: 0, width: '100%' },
  choiceHindi: { ...hindiType(20), width: '100%', color: c.ink },
  choiceHindiCorrect: { color: c.white },
  choiceHindiWrong: { color: c.danger },
  choiceRomanized: { ...type.caption, color: c.muted },
  choiceMeaning: { ...type.caption, color: c.muted },
  choiceMetaCorrect: { color: c.white, opacity: 0.85 },
  choiceMetaWrong: { color: c.danger, opacity: 0.85 },
  offlineNote: { gap: spacing.sm },
  offlineNoteText: { ...type.caption, color: c.muted },
  offlineNoteLink: { color: c.brandText, fontWeight: '700' },
  setupEnglish: { ...type.label, color: c.ink },
  setupHindi: { ...type.caption, color: c.muted },
  setupHindiScript: { ...hindiType(17), color: c.muted },
  nameStep: { flexGrow: 1 },
  nameStepScroll: { flex: 1 },
  nameStepFooter: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  nameStepBody: { flex: 1, justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  nameStepAsha: { width: 64, height: 64, borderRadius: radius.pill, borderColor: c.gold, borderWidth: 2, backgroundColor: c.brandSoft },
  nameStepTitle: { ...type.display, color: c.ink },
  nameStepBody2: { ...type.body, color: c.muted },
  nameStepNote: { ...type.caption, color: c.muted },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  nameRowText: { ...type.caption, flexShrink: 1, color: c.muted, fontWeight: '600' },
  nameRowLink: { ...type.caption, color: c.brandText, fontWeight: '700' },
  nameInput: { ...type.headline, minHeight: 52, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderWidth: 1, borderColor: c.inputBorder, paddingHorizontal: spacing.md, color: c.ink },
  hintBody: { ...type.caption, color: c.muted },
  result: { borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.forestSoft, padding: spacing.lg, gap: spacing.lg },
  resultWrong: { backgroundColor: c.dangerSoft },
  resultWrongText: { color: c.danger },
  resultLarge: { alignItems: 'stretch' },
  resultCopy: { gap: spacing.xs },
  resultTitle: { ...type.label, color: c.forestText, fontWeight: '700' },
  resultBody: { ...type.caption, color: c.ink },
  wordOrderSolution: { marginTop: spacing.sm, borderTopColor: c.dangerLine, borderTopWidth: 1, paddingTop: spacing.md, gap: spacing.xs },
  wordOrderSolutionLabel: { ...type.eyebrow, color: c.muted },
  wordOrderSolutionHindi: { ...hindiType(20), color: c.ink },
  wordOrderSolutionLatin: { ...type.label, color: c.brandText },
  resultHindi: { ...type.headline, color: c.ink, fontWeight: '600' },
  resultHindiScript: hindiType(20),
  answerActions: { gap: spacing.sm },
  tryAgainButton: { width: '100%', minHeight: 48, alignSelf: 'stretch', borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.brand, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tryAgainText: { ...type.label, color: c.brandText },
  nextButton: { ...buttons.primary, width: '100%', alignSelf: 'stretch' },
  nextText: buttons.primaryText,
  saveRow: { backgroundColor: c.background, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md, flexDirection: 'row', alignItems: 'center' },
  saveRowLarge: { alignItems: 'stretch', flexDirection: 'column' },
  saveCopy: { flex: 1, gap: spacing.xs },
  saveCopyLarge: { flex: 0, width: '100%' },
  saveTitle: { ...type.label, color: c.ink },
  saveMeaning: { ...type.caption, color: c.muted },
  saveButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  saveButtonLarge: { alignSelf: 'flex-start' },
  saveButtonActive: { backgroundColor: c.brand, borderColor: c.brand },
  wordTray: { gap: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.brandSoft, padding: spacing.lg },
  wordTrayTitle: { ...type.label, color: c.brandText, fontWeight: '700' },
  wordTrayHint: { ...type.caption, color: c.muted },
  wordTokenWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wordToken: { minHeight: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  wordTokenText: { ...type.bodyLarge, color: c.brandText, fontFamily: displayFont, fontWeight: '600' },
  wordTokenHindi: hindiType(17),
  finish: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg, alignItems: 'stretch' },
  finishIntro: { alignItems: 'stretch', gap: spacing.lg },
  finishBadge: { width: 74, height: 74, borderRadius: radius.pill, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  finishHeading: { alignItems: 'stretch', gap: spacing.xs },
  finishHindi: { ...type.display, color: c.brandDark, textAlign: 'center' },
  finishHindiScript: hindiType(28),
  finishGloss: { ...type.body, color: c.muted, textAlign: 'center' },
  finishTitle: { ...type.title, color: c.ink, textAlign: 'center' },
  notFoundBody: { ...type.body, color: c.muted, textAlign: 'center', maxWidth: 320 },
  finishStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  finishStat: { minWidth: 96, flexGrow: 1, flexBasis: 96, backgroundColor: c.paperRaised, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md, alignItems: 'center', gap: spacing.xs },
  finishValue: { ...type.title, color: c.ink, fontVariant: ['lining-nums', 'tabular-nums'] },
  finishLabel: { ...type.caption, color: c.muted, textAlign: 'center' },
  secondaryButton: { minHeight: 52, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderWidth: 1, borderColor: c.line, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...type.label, color: c.ink },
  tertiaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  tertiaryText: { ...type.label, color: c.brandText },
}));
