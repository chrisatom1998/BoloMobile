import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, Check, ChevronRight, Lightbulb, RotateCcw, Star, Volume2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { observe } from '@/lib/observability';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { hindiWordTokens } from '@/lib/contextual-word-definition';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { hasOfflineSpeech, speakText, stopSpeaking } from '@/lib/speech';
import { shuffleChoices } from '@/lib/shuffle-choices';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import { makeStyles, radius, spacing, useSharedStyles, useTheme } from '@/theme';

const ALTERNATE_INCORRECT_COACH = {
  en: 'Close—try again.',
  hi: 'करीब है—फिर से कोशिश कीजिए।',
  latin: 'Karib hai—phir se koshish kijiye.',
};

export default function SceneScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const largeTextLayout = useLargeTextLayout();
  const insets = useSafeAreaInsets();
  const sceneId = Array.isArray(id) ? id[0] : id;
  const scene = useMemo(() => getScene(sceneId ?? ''), [sceneId]);
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
  const { aiConsent, checkpointScene, clientId, learnerProfile, markSceneComplete, motionPreference = DEFAULT_MOTION_PREFERENCE, phrases, sceneProgress, togglePhrase } = useAppState();
  const { mode: motionMode, reducedMotion } = useMotionPreference(motionPreference);
  const { elapsedSeconds, reset: resetTimer } = useForegroundTimer();
  const { audioError, clearAudioError, speak } = useSpeakText();
  const savedBeatIndex = scene ? sceneProgress?.[scene.id]?.lastBeatIndex ?? 0 : 0;
  // Snapshot where this run started: score/correct only count beats answered after
  // the checkpoint, so completion totals must exclude the beats skipped by resume.
  const [initialBeatIndex, setInitialBeatIndex] = useState(() => scene && savedBeatIndex < scene.beats.length ? savedBeatIndex : 0);
  const [beatIndex, setBeatIndex] = useState(initialBeatIndex);
  const [picked, setPicked] = useState<number | null>(null);
  const [resolution, setResolution] = useState<null | 'correct' | 'incorrect'>(null);
  const [choiceNonce, setChoiceNonce] = useState(0);
  const [wordOrderRetryNonce, setWordOrderRetryNonce] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [alreadyResolvedIncorrect, setAlreadyResolvedIncorrect] = useState(false);
  const [pronunciationBusy, setPronunciationBusy] = useState(false);
  const [weakPhrases, setWeakPhrases] = useState<string[]>([]);
  const [wordDefinitionWord, setWordDefinitionWord] = useState<string | null>(null);
  const sceneScrollRef = useRef<ScrollView>(null);
  const sceneViewportHeightRef = useRef(0);
  const sceneScrollYRef = useRef(0);
  // The answer actions live inside the bottom sheet, so their layout y is relative to it.
  const sheetOffsetYRef = useRef(0);
  const pendingResolutionScrollRef = useRef(false);
  const pickedRef = useRef<number | null>(null);
  const advancedBeatRef = useRef<number | null>(null);
  const autoPlayedBeatRef = useRef<string | null>(null);

  useEffect(() => {
    observe('scene_started');
    return () => { void stopSpeaking(); };
  }, []);

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
        <Text style={styles.finishTitle}>Scene not found</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.finishPrimary}><Text style={styles.finishPrimaryText}>Back to scenes</Text></Pressable>
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

  function choose(index: number) {
    if (pickedRef.current !== null || pronunciationBusy) return;
    const choice = beat.choices[index];
    if (choice === undefined) return;
    pendingResolutionScrollRef.current = true;
    pickedRef.current = index;
    setPicked(index);
    if (choice.correct) {
      hapticSuccess();
      if (!alreadyResolvedIncorrect) {
        setScore((value) => value + 50);
        setCorrectCount((value) => value + 1);
      }
      setResolution('correct');
    }
    else {
      hapticWarning();
      setWeakPhrases((current) => [...new Set([...current, target.hi])]);
      setResolution('incorrect');
    }
    play(choice.reply);
  }

  function handleAlternateResult(result: 'correct' | 'incorrect') {
    if (pickedRef.current !== null || pronunciationBusy) return;
    pendingResolutionScrollRef.current = true;
    pickedRef.current = result === 'correct' ? 0 : -1;
    if (result === 'correct') {
      if (!alreadyResolvedIncorrect) {
        setScore((value) => value + 50);
        setCorrectCount((value) => value + 1);
      }
      setResolution('correct');
      play('बहुत अच्छा।');
      return;
    }
    setWeakPhrases((current) => [...new Set([...current, target.hi])]);
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
      markSceneComplete(activeScene.id, elapsedSeconds(), {
        score,
        correct: correctCount,
        total: activeScene.beats.length - initialBeatIndex,
        weakPhrases,
      });
      observe('scene_completed');
      setDone(true);
      return;
    }
    hapticSelect();
    checkpointScene?.(activeScene.id, beatIndex + 1);
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
    setWeakPhrases([]);
    advancedBeatRef.current = null;
    pendingResolutionScrollRef.current = false;
    setDone(false);
    setChoiceNonce((value) => value + 1);
  }

  function closeLesson() {
    void stopSpeaking();
    if (router.canGoBack?.()) {
      router.back();
      return;
    }
    router.replace('/');
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
    const runTotal = activeScene.beats.length - initialBeatIndex;
    return (
      <ScrollView
        key="scene-completion"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.finish, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxl }]}
        style={sharedStyles.screen}
        testID="scene-completion-scroll"
      >
        <Stack.Screen options={{ headerShown: false, title: activeScene.title }} />
        <MotionReveal mode={motionMode} motionKey={`${activeScene.id}-complete`} style={styles.finishIntro} testID="scene-completion-motion">
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.finishBadge}>
            <Star color={colors.white} fill={colors.white} size={34} />
          </View>
          <Text style={styles.finishEyebrow}>Scene complete</Text>
          <View style={styles.finishHeading}>
            <Text accessibilityLanguage="hi-IN" style={styles.finishHindi} testID="scene-completion-headline">आपने कर दिखाया!</Text>
            <Text style={styles.finishGloss} testID="scene-completion-gloss">Aapne kar dikhaya! · You did it!</Text>
          </View>
          <Text accessibilityRole="header" style={styles.finishTitle} testID="scene-completion-title">You navigated {activeScene.title} in Hindi.</Text>
          <Text style={styles.finishBody}>The goal is not perfect recall—it’s a faster, calmer response every time.</Text>
        </MotionReveal>
        <View style={styles.finishStats}>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{score}</Text><Text style={styles.finishLabel}>scene score</Text></View>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{correctCount}/{runTotal}</Text><Text style={styles.finishLabel}>correct this run</Text></View>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{runTotal}</Text><Text style={styles.finishLabel}>turns this run</Text></View>
        </View>
        <Pressable accessibilityRole="button" onPress={leaveCompletedScene} style={styles.finishPrimary} testID="scene-completion-primary">
          <Text style={styles.finishPrimaryText}>{completionAction}</Text>
          <ChevronRight color={colors.ink} size={18} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={replay} style={styles.secondaryButton} testID="scene-completion-secondary">
          <RotateCcw color={colors.ink} size={18} />
          <Text style={styles.secondaryText}>Replay scene</Text>
        </Pressable>
        {guidedLesson ? (
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={styles.tertiaryButton} testID="scene-completion-tertiary">
            <Text style={styles.tertiaryText}>Back to Today</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  const beatCount = activeScene.beats.length;
  const listenUnavailable = (!aiConsent && !hasOfflineSpeech(beat.npc)) || pronunciationBusy;
  const pickedChoice = picked !== null ? beat.choices[picked] : undefined;
  // The learner's own turn joins the conversation once it has been answered.
  const learnerLine = pickedChoice
    ? pickedChoice.hi
    : resolution === 'correct'
      ? target.hi
      : null;
  // Alternate-mode misses show Asha's coach note in the sheet instead of a chat reply.
  const npcReply = feedbackReply && !(picked === null && resolution === 'incorrect') ? feedbackReply : null;

  const recoveryActionsFirst = resolution === 'incorrect'
    && (effectiveMode === 'choice' || effectiveMode === 'wordOrder');
  const answerActions = resolution !== null ? (
    <View
      onLayout={(event) => {
        if (!pendingResolutionScrollRef.current) return;
        const viewportHeight = sceneViewportHeightRef.current;
        if (viewportHeight <= 0) return;
        const { height, y } = event.nativeEvent.layout;
        const nextScrollY = Math.max(0, sheetOffsetYRef.current + y + height + spacing.lg - viewportHeight);
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
          <RotateCcw color={colors.brandText} size={19} />
          <Text style={styles.tryAgainText}>Try again</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" onPress={next} style={styles.nextButton} testID="scene-continue">
        <Text style={styles.nextText}>{beatIndex === beatCount - 1 ? 'Finish' : 'Continue'}</Text>
        <ChevronRight color={colors.ink} size={18} />
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={sharedStyles.screen}>
      <Stack.Screen options={{ headerShown: false, title: activeScene.title }} />
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerTop}>
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
          <View
            accessible
            accessibilityLabel={`Turn ${beatIndex + 1} of ${beatCount}`}
            accessibilityRole="progressbar"
            accessibilityValue={{ max: beatCount, min: 1, now: beatIndex + 1 }}
            style={styles.progressGroup}
            testID="scene-progress"
          >
            <View style={styles.segments}>
              {activeScene.beats.map((_, index) => (
                <View
                  // Beats have no stable id; their position is their identity.
                  key={`beat-${index}`}
                  style={[styles.segment, index <= beatIndex && styles.segmentActive]}
                  testID={index <= beatIndex ? 'scene-progress-segment-active' : 'scene-progress-segment'}
                />
              ))}
            </View>
            <Text style={styles.counter}>{beatIndex + 1}/{beatCount}</Text>
          </View>
        </View>
        <View style={[styles.titleRow, largeTextLayout && styles.titleRowLarge]} testID="scene-progress-header">
          <View style={styles.titleCopy}>
            <Text style={styles.place}>{activeScene.place}</Text>
            <Text accessibilityRole="header" style={styles.title}>{activeScene.title}</Text>
          </View>
          <View accessible accessibilityLabel={`${score} points, ${correctCount} correct`} style={styles.scoreChip} testID="scene-score">
            <View style={styles.scoreValueRow}>
              <Star color={colors.gold} fill={colors.gold} size={15} />
              <Text style={styles.scoreValue}>{score}</Text>
            </View>
            <Text style={styles.scoreLabel}>{correctCount} correct</Text>
          </View>
        </View>
      </View>

      <ScrollView
        key="scene-run"
        ref={sceneScrollRef}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onLayout={(event) => {
          sceneViewportHeightRef.current = event.nativeEvent.layout.height;
        }}
        onScroll={(event) => {
          sceneScrollYRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        style={styles.scroll}
        testID="scene-scroll"
      >
        <View style={styles.conversation}>
          {initialBeatIndex > 0 ? <Text accessibilityLiveRegion="polite" style={styles.resumeNotice}>Continuing at turn {initialBeatIndex + 1}.</Text> : null}

          {!aiConsent ? <AiConsentGate /> : null}
          {audioError ? <Text accessibilityRole="alert" style={styles.audioError}>{audioError}</Text> : null}

          <View style={[styles.npcRow, largeTextLayout && styles.npcRowLarge]} testID="scene-asha-row">
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.avatar}>
              <Text style={styles.avatarText}>आ</Text>
            </View>
            <View style={[styles.npcBubble, largeTextLayout && styles.npcBubbleLarge]} testID="scene-asha-bubble">
              <Text style={styles.speakerLabel}>Asha</Text>
              <Text accessibilityLanguage="hi-IN" style={styles.npcHindi}>{beat.npc}</Text>
              <Text style={styles.npcLatin}>{romanizeDevanagari(beat.npc)}</Text>
              <Text style={styles.npcEnglish}>{beat.translation}</Text>
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
                accessibilityState={{ disabled: listenUnavailable }}
                disabled={listenUnavailable}
                onPress={() => play(situationPromptSpeech ?? beat.npc)}
                style={[styles.listen, largeTextLayout && styles.listenLarge, listenUnavailable && styles.disabled]}
              >
                <Volume2 color={colors.brandText} size={15} />
                <Text style={styles.listenText}>Listen</Text>
              </Pressable>
            </View>
          </View>

          {learnerLine ? (
            <View style={styles.learnerRow} testID="scene-learner-reply">
              <View style={[styles.learnerBubble, largeTextLayout && styles.learnerBubbleLarge]}>
                <Text accessibilityLanguage="hi-IN" style={styles.learnerHindi}>{learnerLine}</Text>
              </View>
            </View>
          ) : null}

          {npcReply ? (
            <View style={[styles.npcRow, largeTextLayout && styles.npcRowLarge]} testID="scene-npc-reply">
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.avatar}>
                <Text style={styles.avatarText}>आ</Text>
              </View>
              <View style={[styles.npcBubble, styles.npcReplyBubble, largeTextLayout && styles.npcBubbleLarge]}>
                <Text accessibilityLanguage="hi-IN" style={styles.npcReplyHindi}>{npcReply}</Text>
                <Text style={styles.npcReplyLatin}>{romanizeDevanagari(npcReply)}</Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.sheetSpacer} />

        <View
          onLayout={(event) => {
            sheetOffsetYRef.current = event.nativeEvent.layout.y;
          }}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}
          testID="scene-sheet"
        >
          <View style={[styles.promptRow, largeTextLayout && styles.promptRowLarge]}>
            <View style={styles.promptCopy}>
              <Text style={styles.promptEyebrow}>Your response</Text>
              <Text style={styles.prompt}>{effectivePrompt}</Text>
            </View>
            {resolution === null ? (
              <Pressable
                accessibilityLabel={showHint ? 'Hide Asha’s hint' : 'Show Asha’s hint'}
                accessibilityRole="button"
                accessibilityState={{ expanded: showHint }}
                onPress={() => setShowHint((visible) => !visible)}
                style={[styles.hintButton, showHint && styles.hintButtonActive]}
                testID="scene-hint-toggle"
              >
                <Lightbulb color={colors.ink} size={20} />
              </Pressable>
            ) : null}
          </View>
          {resolution === null && showHint ? (
            <View style={styles.hintBox} testID="scene-hint">
              <Text style={styles.hintLabel}>Asha’s hint</Text>
              <Text style={styles.hintBody}>{effectiveTip}</Text>
            </View>
          ) : null}

          {effectiveMode === 'choice' ? (
            <View key={choicePresentation.key} style={styles.choices} testID="scene-choices">
              {choicePresentation.choices.map(({ item: choice, sourceIndex }) => {
                const selected = picked === sourceIndex;
                const answered = picked !== null;
                const revealed = answered && choice.correct;
                const tone = selected
                  ? choice.correct ? 'correct' : 'wrong'
                  : revealed ? 'correct' : 'idle';
                const badge = selected
                  ? choice.correct ? 'Correct' : 'Try again'
                  : revealed ? 'Answer' : null;
                const accessibilityLabel = answered
                  ? `${choice.hi} ${choice.latin} ${choice.en}`
                  : `${choice.hi} ${choice.latin}`;
                return (
                  <Pressable
                    key={choice.hi}
                    accessibilityLabel={accessibilityLabel}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: picked !== null || pronunciationBusy, selected }}
                    accessibilityValue={badge ? { text: badge === 'Try again' ? 'Not quite' : badge === 'Answer' ? 'Natural answer' : badge } : undefined}
                    disabled={picked !== null || pronunciationBusy}
                    onPress={() => choose(sourceIndex)}
                    style={[
                      styles.choice,
                      largeTextLayout && styles.choiceLarge,
                      tone === 'correct' && styles.choiceCorrect,
                      tone === 'wrong' && styles.choiceWrong,
                    ]}
                  >
                    <View style={[styles.choiceCopy, largeTextLayout && styles.choiceCopyLarge]} testID="scene-choice-copy">
                      <Text accessibilityLanguage="hi-IN" style={[styles.choiceHindi, tone === 'correct' && styles.toneCorrectText, tone === 'wrong' && styles.toneWrongText]}>{choice.hi}</Text>
                      <View style={styles.choiceMeta} testID="scene-choice-meta">
                        <Text style={[styles.choiceMetaText, tone === 'correct' && styles.toneCorrectText, tone === 'wrong' && styles.toneWrongText]}>{choice.latin}</Text>
                        {answered ? (
                          <>
                            <Text style={[styles.choiceMetaText, tone === 'correct' && styles.toneCorrectText, tone === 'wrong' && styles.toneWrongText]}>·</Text>
                            <Text style={[styles.choiceMetaText, tone === 'correct' && styles.toneCorrectText, tone === 'wrong' && styles.toneWrongText]}>{choice.en}</Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                    {badge ? (
                      <View style={styles.badge}>
                        {tone === 'wrong' ? <X color={colors.danger} size={13} strokeWidth={3} /> : <Check color={colors.forestText} size={13} strokeWidth={3} />}
                        <Text style={[styles.badgeText, tone === 'wrong' ? styles.toneWrongText : styles.toneCorrectText]}>{badge}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : effectiveMode === 'wordOrder' ? (
            <WordOrderPractice
              disabled={pronunciationBusy || resolution !== null}
              key={`word-order-${activeScene.id}-${beatIndex}-${target.hi}-${wordOrderRetryNonce}`}
              onResolve={handleAlternateResult}
              showInstructions={false}
              targetHi={target.hi}
              targetLatin={target.latin}
            />
          ) : (
            <RecallRevealPractice
              disabled={pronunciationBusy || resolution !== null}
              key={`recall-reveal-${activeScene.id}-${beatIndex}-${target.hi}`}
              onResolve={handleAlternateResult}
              targetEn={target.en}
              targetHi={target.hi}
              targetLatin={target.latin}
            />
          )}

          {resolution !== null ? (
            <View testID="scene-feedback">
              <MotionReveal
                mode={motionMode}
                motionKey={`${activeScene.id}-${beatIndex}-${resolution}`}
                style={[styles.result, correct ? styles.resultCorrect : styles.resultIncorrect, largeTextLayout && styles.resultLarge]}
                testID="scene-result"
              >
                <View style={styles.resultTitleRow}>
                  {correct ? <Check color={colors.forestText} size={18} strokeWidth={2.6} /> : <X color={colors.danger} size={18} strokeWidth={2.6} />}
                  <Text accessibilityLiveRegion="polite" style={[styles.resultTitle, correct ? styles.toneCorrectText : styles.toneWrongText]}>{correct
                    ? 'Natural choice!'
                    : effectiveMode === 'wordOrder'
                      ? 'Check the word order.'
                      : effectiveMode === 'recallReveal'
                        ? 'Keep practicing this phrase.'
                        : 'Not quite—notice the pattern.'}</Text>
                </View>
                {englishMistakeFeedback ? <Text style={styles.resultBody} testID="scene-result-feedback">{englishMistakeFeedback}</Text> : null}
                {englishMistakeFeedback ? <Text style={styles.resultTip}>Pattern: {effectiveTip}</Text> : null}
                {resolution === 'incorrect' && effectiveMode === 'wordOrder' ? (
                  <View style={styles.resultInset} testID="scene-word-order-solution">
                    <Text style={styles.resultInsetLabel}>NATURAL ORDER</Text>
                    <Text accessibilityLanguage="hi-IN" style={styles.resultInsetHindi}>{target.hi}</Text>
                    <Text style={styles.resultInsetLatin}>{target.latin}</Text>
                  </View>
                ) : null}
                {picked === null && resolution === 'incorrect' ? (
                  <View style={styles.resultInset} testID="scene-alternate-coach-note">
                    <Text style={styles.resultInsetLabel}>ASHA’S COACH NOTE</Text>
                    <Text accessibilityLanguage="hi-IN" style={styles.resultInsetHindi}>{ALTERNATE_INCORRECT_COACH.hi}</Text>
                    <Text style={styles.resultInsetLatin}>{ALTERNATE_INCORRECT_COACH.latin}</Text>
                    <Text style={styles.resultInsetEnglish}>{ALTERNATE_INCORRECT_COACH.en}</Text>
                  </View>
                ) : null}
              </MotionReveal>
            </View>
          ) : null}

          {recoveryActionsFirst ? answerActions : null}

          {resolution !== null ? (
            <>
              <View testID="scene-save">
                <View style={[styles.saveRow, largeTextLayout && styles.saveRowLarge]} testID="scene-save-row">
                  <View style={[styles.saveCopy, largeTextLayout && styles.saveCopyLarge]}>
                    <Text style={styles.saveTitle}>Keep the natural answer</Text>
                    <Text style={styles.saveMeaning}>{target.en}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel={saved ? 'Remove saved phrase' : 'Save phrase'}
                    accessibilityRole="button"
                    accessibilityState={{ selected: saved }}
                    onPress={() => togglePhrase(target)}
                    style={[styles.saveButton, largeTextLayout && styles.saveButtonLarge, saved && styles.saveButtonActive]}
                  >
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
                        accessibilityLabel={`Explain ${romanizedWord} in the answer`}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !aiConsent }}
                        disabled={!aiConsent}
                        key={word}
                        onPress={() => setWordDefinitionWord(word)}
                        style={[styles.wordToken, !aiConsent && styles.disabled]}
                      ><Text style={styles.wordTokenText}>{romanizedWord}</Text></Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}

          {aiConsent ? (
            <View testID="scene-pronunciation">
              <PronunciationRecorder key={`${activeScene.id}-${beatIndex}-${target.hi}`} lessonTitle={activeScene.title} onActivityChange={setPronunciationBusy} target={target} />
            </View>
          ) : null}
          {!recoveryActionsFirst ? answerActions : null}
        </View>
      </ScrollView>
      {wordDefinitionWord ? <WordDefinitionSheet clientId={clientId} initialWord={wordDefinitionWord} onClose={() => setWordDefinitionWord(null)} phrase={target.hi} reducedMotion={reducedMotion} scriptPreference={learnerProfile?.scriptPreference ?? 'both'} visible /> : null}
    </View>
  );
}

const SERIF = 'Georgia';

const useStyles = makeStyles((c) => ({
  center: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  disabled: { opacity: 0.4 },

  header: { backgroundColor: c.background, paddingHorizontal: 20, paddingBottom: 14, gap: 14 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  closeButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
  progressGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  segments: { flex: 1, flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: c.line },
  segmentActive: { backgroundColor: c.brand },
  counter: { color: c.muted, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  titleRowLarge: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.sm },
  titleCopy: { flexShrink: 1, gap: 2 },
  place: { color: c.muted, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: c.ink, fontFamily: SERIF, fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.3 },
  scoreChip: { alignItems: 'flex-end', gap: 1, paddingBottom: 3 },
  scoreValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreValue: { color: c.ink, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  scoreLabel: { color: c.muted, fontSize: 12, fontWeight: '600' },

  scroll: { flex: 1 },
  content: { flexGrow: 1 },
  conversation: { paddingHorizontal: 20, paddingTop: spacing.xs, paddingBottom: spacing.lg, gap: 14 },
  sheetSpacer: { flexGrow: 1 },
  resumeNotice: { color: c.forestText, fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  audioError: { color: c.danger, fontSize: 13, lineHeight: 18 },

  npcRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  npcRowLarge: { alignItems: 'flex-start', flexDirection: 'column' },
  avatar: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: c.ink, fontFamily: SERIF, fontSize: 16, fontWeight: '700' },
  npcBubble: { flexShrink: 1, maxWidth: 300, backgroundColor: c.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomRightRadius: 22, borderBottomLeftRadius: 6, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: 14, gap: spacing.xs },
  npcBubbleLarge: { alignSelf: 'stretch', flex: 0, maxWidth: undefined },
  speakerLabel: { color: c.muted, fontSize: 12, fontWeight: '600' },
  npcHindi: { color: c.ink, fontFamily: SERIF, fontSize: 22, lineHeight: 30, fontWeight: '700' },
  npcLatin: { color: c.brand, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  npcEnglish: { color: c.muted, fontSize: 13, lineHeight: 18 },
  listen: { alignSelf: 'flex-start', marginTop: spacing.xs, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.brandSoft, borderRadius: radius.pill, paddingHorizontal: 14 },
  listenLarge: { alignSelf: 'stretch', justifyContent: 'center' },
  listenText: { color: c.brandText, fontSize: 13, fontWeight: '600' },
  npcReplyBubble: { paddingVertical: spacing.md, gap: 2 },
  npcReplyHindi: { color: c.ink, fontFamily: SERIF, fontSize: 18, lineHeight: 26, fontWeight: '700' },
  npcReplyLatin: { color: c.brand, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  learnerRow: { alignItems: 'flex-end' },
  learnerBubble: { maxWidth: 280, backgroundColor: c.brand, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomRightRadius: 6, borderBottomLeftRadius: 22, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  learnerBubbleLarge: { maxWidth: undefined, alignSelf: 'stretch' },
  learnerHindi: { color: c.white, fontFamily: SERIF, fontSize: 18, lineHeight: 26, fontWeight: '700' },

  sheet: { backgroundColor: c.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderCurve: 'continuous', paddingHorizontal: 20, paddingTop: 20, gap: spacing.md, boxShadow: '0 -8px 24px rgba(23, 37, 35, 0.06)' },
  promptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  promptRowLarge: { alignItems: 'flex-start', flexDirection: 'column' },
  promptCopy: { flexShrink: 1, gap: 2 },
  promptEyebrow: { color: c.brandText, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  prompt: { color: c.ink, fontFamily: SERIF, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  hintButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.goldSoft, alignItems: 'center', justifyContent: 'center' },
  hintButtonActive: { backgroundColor: c.gold },
  hintBox: { backgroundColor: c.goldSoft, borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: 10, gap: 2 },
  hintLabel: { color: c.ink, fontSize: 12, fontWeight: '700' },
  hintBody: { color: c.ink, fontSize: 14, lineHeight: 20 },

  choices: { gap: 10 },
  choice: { width: '100%', minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: 18, borderCurve: 'continuous', backgroundColor: c.background, borderWidth: 2, borderColor: 'transparent' },
  choiceLarge: { alignItems: 'stretch', flexDirection: 'column' },
  choiceCorrect: { backgroundColor: c.successSoft, borderColor: c.forest },
  choiceWrong: { backgroundColor: c.dangerSoft, borderColor: c.danger },
  choiceCopy: { flex: 1, gap: 2 },
  choiceCopyLarge: { flex: 0, width: '100%' },
  choiceHindi: { color: c.ink, fontFamily: SERIF, fontSize: 18, lineHeight: 26, fontWeight: '700' },
  choiceMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, rowGap: 2 },
  choiceMetaText: { color: c.muted, fontSize: 13, lineHeight: 18 },
  toneCorrectText: { color: c.forestText },
  toneWrongText: { color: c.danger },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'center' },
  badgeText: { fontSize: 12, fontWeight: '700' },

  result: { borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 6 },
  resultCorrect: { backgroundColor: c.successSoft },
  resultIncorrect: { backgroundColor: c.dangerSoft },
  resultLarge: { alignItems: 'stretch' },
  resultTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultTitle: { flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  resultBody: { color: c.danger, fontSize: 14, lineHeight: 20 },
  resultTip: { color: c.ink, fontSize: 14, lineHeight: 20 },
  resultInset: { marginTop: spacing.xs, borderRadius: radius.sm, borderCurve: 'continuous', backgroundColor: c.white, padding: spacing.md, gap: 2 },
  resultInsetLabel: { color: c.muted, fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 1 },
  resultInsetHindi: { color: c.ink, fontFamily: SERIF, fontSize: 19, lineHeight: 27, fontWeight: '700' },
  resultInsetLatin: { color: c.brand, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  resultInsetEnglish: { color: c.muted, fontSize: 13, lineHeight: 18 },

  answerActions: { gap: spacing.sm },
  tryAgainButton: { width: '100%', minHeight: 52, alignSelf: 'stretch', borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.white, borderColor: c.brand, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tryAgainText: { color: c.brandText, fontSize: 16, fontWeight: '600' },
  nextButton: { width: '100%', minHeight: 52, alignSelf: 'stretch', borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  nextText: { color: c.ink, fontSize: 16, fontWeight: '600' },

  saveRow: { backgroundColor: c.background, borderRadius: 18, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md, flexDirection: 'row', alignItems: 'center' },
  saveRowLarge: { alignItems: 'stretch', flexDirection: 'column' },
  saveCopy: { flex: 1, gap: 2 },
  saveCopyLarge: { flex: 0, width: '100%' },
  saveTitle: { color: c.ink, fontSize: 15, fontWeight: '700' },
  saveMeaning: { color: c.muted, fontSize: 13, lineHeight: 18 },
  saveButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
  saveButtonLarge: { alignSelf: 'flex-start' },
  saveButtonActive: { backgroundColor: c.brand, borderColor: c.brand },
  wordTray: { gap: spacing.sm, borderRadius: 18, borderCurve: 'continuous', backgroundColor: c.brandSoft, padding: spacing.lg },
  wordTrayTitle: { color: c.brandText, fontFamily: SERIF, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  wordTrayHint: { color: c.brandText, fontSize: 13, lineHeight: 18 },
  wordTokenWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wordToken: { minHeight: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  wordTokenText: { color: c.brandText, fontSize: 16, lineHeight: 22, fontWeight: '700' },

  finish: { paddingHorizontal: spacing.xl, gap: spacing.lg, alignItems: 'stretch' },
  finishIntro: { alignItems: 'stretch', gap: spacing.md },
  finishBadge: { width: 80, height: 80, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  finishEyebrow: { color: c.brandText, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
  finishHeading: { alignItems: 'stretch', gap: spacing.xs },
  finishHindi: { color: c.brandText, fontFamily: SERIF, fontSize: 30, lineHeight: 40, fontWeight: '700', textAlign: 'center' },
  finishGloss: { color: c.muted, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  finishTitle: { color: c.ink, fontFamily: SERIF, fontSize: 24, lineHeight: 30, fontWeight: '700', textAlign: 'center' },
  finishBody: { color: c.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  finishStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  finishStat: { minWidth: 96, flexGrow: 1, flexBasis: 96, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, borderCurve: 'continuous', padding: spacing.md, alignItems: 'center', gap: 2 },
  finishValue: { color: c.ink, fontFamily: SERIF, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  finishLabel: { color: c.muted, fontSize: 12, textAlign: 'center' },
  finishPrimary: { minHeight: 52, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  finishPrimaryText: { color: c.ink, fontSize: 16, fontWeight: '600' },
  secondaryButton: { minHeight: 52, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.white, borderWidth: 1, borderColor: c.line, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  secondaryText: { color: c.ink, fontSize: 16, fontWeight: '600' },
  tertiaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  tertiaryText: { color: c.forestText, fontSize: 14, fontWeight: '700' },
}));
