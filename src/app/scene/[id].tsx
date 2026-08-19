import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, Check, ChevronRight, RotateCcw, Star, Volume2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { MotionProgress, MotionReveal } from '@/components/motion';
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
        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={sharedStyles.primaryButton}><Text style={sharedStyles.primaryButtonText}>Back to scenes</Text></Pressable>
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
            <Text accessibilityLanguage="hi-IN" style={styles.finishHindi} testID="scene-completion-headline">आपने कर दिखाया!</Text>
            <Text style={styles.finishGloss} testID="scene-completion-gloss">Aapne kar dikhaya! · You did it!</Text>
          </View>
          <Text style={styles.finishTitle} testID="scene-completion-title">You navigated {activeScene.title} in Hindi.</Text>
          <Text style={sharedStyles.body}>The goal is not perfect recall—it’s a faster, calmer response every time.</Text>
        </MotionReveal>
        <View style={styles.finishStats}>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{score}</Text><Text style={styles.finishLabel}>scene score</Text></View>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{correctCount}/{activeScene.beats.length - initialBeatIndex}</Text><Text style={styles.finishLabel}>correct this run</Text></View>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{activeScene.beats.length - initialBeatIndex}</Text><Text style={styles.finishLabel}>turns this run</Text></View>
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
        <ChevronRight color={colors.white} size={18} />
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
      <Stack.Screen options={{ title: activeScene.title }} />
      <View style={[styles.progressHeader, largeTextLayout && styles.progressHeaderLarge]} testID="scene-progress-header">
        <View style={styles.hud}><Text style={styles.hudText}>{correctCount} correct</Text></View>
        <Text style={styles.turn}>Turn {beatIndex + 1} of {activeScene.beats.length}</Text>
        <View style={styles.hud}><Star color={colors.gold} fill={colors.gold} size={17} /><Text style={styles.hudText}>{score}</Text></View>
      </View>
      <View style={styles.track}><MotionProgress color={activeScene.color} mode={motionMode} percent={(beatIndex + Number(resolution !== null || alreadyResolvedIncorrect)) / activeScene.beats.length * 100} style={styles.trackFill} testID="scene-progress-motion" /></View>

      {initialBeatIndex > 0 ? <Text accessibilityLiveRegion="polite" style={styles.resumeNotice}>Continuing at turn {initialBeatIndex + 1}.</Text> : null}

      {!aiConsent ? <AiConsentGate /> : null}
      {audioError ? <Text accessibilityRole="alert" style={styles.audioError}>{audioError}</Text> : null}

      <View style={[styles.world, { borderColor: activeScene.color }]}> 
        <View style={[styles.worldTop, largeTextLayout && styles.worldTopLarge]}><Text style={styles.emoji}>{activeScene.emoji}</Text><Text style={styles.place}>{activeScene.place}</Text></View>
        <View style={[styles.ashaRow, largeTextLayout && styles.ashaRowLarge]} testID="scene-asha-row">
          <View style={styles.asha}><Text style={styles.ashaText}>आ</Text></View>
          <View style={[styles.bubble, largeTextLayout && styles.bubbleLarge]} testID="scene-asha-bubble">
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
            ><Volume2 color={colors.ink} size={18} /></Pressable>
            <Text style={[styles.npc, largeTextLayout && styles.npcLarge]}>{beat.npc}</Text>
            <Text style={styles.translation}>{beat.translation}</Text>
          </View>
        </View>
      </View>

      <View style={styles.answerHeader}>
        <View>
          <Text style={sharedStyles.eyebrow}>Your response</Text>
          <Text style={styles.answerTitle}>{effectivePrompt}</Text>
        </View>
      </View>
      {effectiveMode === 'choice' ? (
        <View key={choicePresentation.key} style={styles.choices} testID="scene-choices">
          {choicePresentation.choices.map(({ item: choice, sourceIndex }, displayIndex) => {
            const selected = picked === sourceIndex;
            const revealed = picked !== null && choice.correct;
            const answered = picked !== null;
            const accessibilityLabel = answered
              ? `${choice.hi} ${choice.latin} ${choice.en}`
              : `${choice.hi} ${choice.latin}`;
            return (
              <Pressable
                key={choice.hi}
                accessibilityLabel={accessibilityLabel}
                accessibilityRole="button"
                accessibilityState={{ disabled: picked !== null || pronunciationBusy, selected }}
                disabled={picked !== null || pronunciationBusy}
                onPress={() => choose(sourceIndex)}
                style={[styles.choice, largeTextLayout && styles.choiceLarge, selected && (choice.correct ? styles.choiceCorrect : styles.choiceWrong), revealed && styles.choiceCorrect]}
              >
                <View style={styles.choiceNumber}><Text style={styles.choiceNumberText}>{displayIndex + 1}</Text></View>
                <View style={[styles.choiceCopy, largeTextLayout && styles.choiceCopyLarge]} testID="scene-choice-copy">
                  <Text style={styles.choiceHindi}>{choice.hi}</Text>
                  <Text style={styles.choiceRomanized}>{choice.latin}</Text>
                  {answered ? <Text style={styles.choiceMeaning}>{choice.en}</Text> : null}
                </View>
                {selected ? (choice.correct ? <Check color={colors.success} size={22} /> : <X color={colors.danger} size={22} />) : null}
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

      {resolution === null ? (
        <Pressable
          accessibilityLabel={showHint ? 'Hide Asha’s hint' : 'Show Asha’s hint'}
          accessibilityRole="button"
          accessibilityState={{ expanded: showHint }}
          onPress={() => setShowHint((visible) => !visible)}
          style={styles.hint}
        >
          <Text style={styles.hintTitle}>{showHint ? 'Hide Asha’s hint' : 'Need a hint?'}</Text>
          {showHint ? <Text style={styles.hintBody}>{effectiveTip}</Text> : null}
        </Pressable>
      ) : (
        <View testID="scene-feedback">
          <MotionReveal mode={motionMode} motionKey={`${activeScene.id}-${beatIndex}-${resolution}`} style={[styles.result, largeTextLayout && styles.resultLarge]} testID="scene-result">
            <View style={styles.resultCopy}>
              <Text style={styles.resultTitle}>{correct
                ? 'Natural choice!'
                : effectiveMode === 'wordOrder'
                  ? 'Check the word order.'
                  : effectiveMode === 'recallReveal'
                    ? 'Keep practicing this phrase.'
                    : 'Not quite—notice the pattern.'}</Text>
              {englishMistakeFeedback ? <Text style={styles.resultBody} testID="scene-result-feedback">{englishMistakeFeedback}</Text> : null}
              {englishMistakeFeedback ? <Text style={styles.resultTip}>Pattern: {effectiveTip}</Text> : null}
              {resolution === 'incorrect' && effectiveMode === 'wordOrder' ? (
                <View style={styles.wordOrderSolution} testID="scene-word-order-solution">
                  <Text style={styles.wordOrderSolutionLabel}>NATURAL ORDER</Text>
                  <Text style={styles.wordOrderSolutionHindi}>{target.hi}</Text>
                  <Text style={styles.wordOrderSolutionLatin}>{target.latin}</Text>
                </View>
              ) : null}
              {picked === null && resolution === 'incorrect' ? (
                <View style={styles.alternateCoachNote} testID="scene-alternate-coach-note">
                  <Text style={styles.alternateCoachLabel}>ASHA’S COACH NOTE</Text>
                  <Text style={styles.alternateCoachHindi}>{ALTERNATE_INCORRECT_COACH.hi}</Text>
                  <Text style={styles.alternateCoachLatin}>{ALTERNATE_INCORRECT_COACH.latin}</Text>
                  <Text style={styles.alternateCoachEnglish}>{ALTERNATE_INCORRECT_COACH.en}</Text>
                </View>
              ) : feedbackReply ? <Text style={styles.resultHindi}>{feedbackReply}</Text> : null}
            </View>
          </MotionReveal>
        </View>
      )}

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
      {wordDefinitionWord ? <WordDefinitionSheet clientId={clientId} initialWord={wordDefinitionWord} onClose={() => setWordDefinitionWord(null)} phrase={target.hi} reducedMotion={reducedMotion} scriptPreference={learnerProfile?.scriptPreference ?? 'both'} visible /> : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  center: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressHeaderLarge: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.xs },
  hud: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hudText: { color: c.ink, fontWeight: '900' },
  turn: { color: c.muted, fontSize: 13, fontWeight: '800' },
  track: { height: 7, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.line },
  trackFill: { height: '100%', borderRadius: radius.pill },
  resumeNotice: { color: c.forestText, fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  world: { backgroundColor: c.paper, borderColor: c.line, borderWidth: 2, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md, gap: spacing.md },
  worldTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  worldTopLarge: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.xs },
  emoji: { fontSize: 30 },
  place: { color: c.muted, fontSize: 12, fontWeight: '700' },
  ashaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  ashaRowLarge: { flexDirection: 'column' },
  asha: { width: 52, height: 52, borderRadius: 18, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center' },
  ashaText: { color: c.white, fontSize: 24, fontWeight: '900' },
  bubble: { flex: 1, backgroundColor: c.background, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md, gap: spacing.xs },
  bubbleLarge: { alignSelf: 'stretch', flex: 0 },
  speaker: { position: 'absolute', zIndex: 1, right: spacing.sm, top: spacing.sm, width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center' },
  speakerLarge: { alignSelf: 'flex-end', position: 'relative', right: undefined, top: undefined },
  disabled: { opacity: 0.4 },
  audioError: { color: c.danger, fontSize: 13, lineHeight: 18 },
  npc: { color: c.ink, fontSize: 21, lineHeight: 29, fontWeight: '800', paddingRight: 48 },
  npcLarge: { paddingRight: 0 },
  translation: { color: c.muted, fontSize: 14, lineHeight: 20 },
  answerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  answerTitle: { color: c.ink, fontSize: 22, lineHeight: 29, fontWeight: '900', marginTop: spacing.xs },
  choices: { gap: spacing.sm },
  choice: { minHeight: 82, backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  choiceLarge: { alignItems: 'stretch', flexDirection: 'column' },
  choiceCorrect: { borderColor: c.success, backgroundColor: c.successSoft },
  choiceWrong: { borderColor: c.danger, backgroundColor: c.dangerSoft },
  choiceNumber: { minWidth: 30, minHeight: 30, borderRadius: radius.pill, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xs },
  choiceNumberText: { color: c.muted, fontWeight: '800' },
  choiceCopy: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.sm, rowGap: 3 },
  choiceCopyLarge: { flex: 0, width: '100%' },
  choiceHindi: { color: c.ink, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  choiceRomanized: { color: c.forestText, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  choiceMeaning: { color: c.muted, fontSize: 12, lineHeight: 17 },
  hint: { minHeight: 48, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.goldSoft, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  hintTitle: { color: c.ink, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  hintBody: { color: c.muted, fontSize: 14, lineHeight: 20 },
  result: { borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.night, padding: spacing.lg, gap: spacing.lg },
  resultLarge: { alignItems: 'stretch' },
  resultCopy: { gap: spacing.xs },
  resultTitle: { color: c.white, fontSize: 17, fontWeight: '900' },
  resultBody: { color: c.white, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  resultTip: { color: c.heroSubtle, fontSize: 14, lineHeight: 20 },
  wordOrderSolution: { marginTop: spacing.sm, borderTopColor: c.heroSubtle, borderTopWidth: 1, paddingTop: spacing.md, gap: 2 },
  wordOrderSolutionLabel: { color: c.heroSubtle, fontSize: 10, lineHeight: 15, fontWeight: '900', letterSpacing: 1 },
  wordOrderSolutionHindi: { color: c.white, fontSize: 21, lineHeight: 29, fontWeight: '900' },
  wordOrderSolutionLatin: { color: c.heroSubtle, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  alternateCoachNote: { marginTop: spacing.sm, borderRadius: radius.sm, borderCurve: 'continuous', backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, padding: spacing.md, gap: 2 },
  alternateCoachLabel: { color: c.ink, fontSize: 10, lineHeight: 15, fontWeight: '900', letterSpacing: 1 },
  alternateCoachHindi: { color: c.ink, fontSize: 18, lineHeight: 26, fontWeight: '800' },
  alternateCoachLatin: { color: c.forestText, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  alternateCoachEnglish: { color: c.muted, fontSize: 14, lineHeight: 20 },
  resultHindi: { color: c.heroSubtle, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  answerActions: { gap: spacing.sm },
  tryAgainButton: { width: '100%', minHeight: 48, alignSelf: 'stretch', borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.paper, borderColor: c.brand, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  tryAgainText: { color: c.brandText, fontSize: 16, fontWeight: '900' },
  nextButton: { width: '100%', minHeight: 52, alignSelf: 'stretch', borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  nextText: { color: c.white, fontSize: 16, fontWeight: '900' },
  saveRow: { backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md, flexDirection: 'row', alignItems: 'center' },
  saveRowLarge: { alignItems: 'stretch', flexDirection: 'column' },
  saveCopy: { flex: 1, gap: spacing.xs },
  saveCopyLarge: { flex: 0, width: '100%' },
  saveTitle: { color: c.ink, fontSize: 15, fontWeight: '900' },
  saveMeaning: { color: c.muted, fontSize: 13 },
  saveButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
  saveButtonLarge: { alignSelf: 'flex-start' },
  saveButtonActive: { backgroundColor: c.brand },
  wordTray: { gap: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous', borderColor: c.brand, borderWidth: 1, backgroundColor: c.brandSoft, padding: spacing.lg },
  wordTrayTitle: { color: c.brandText, fontSize: 17, lineHeight: 23, fontWeight: '900' },
  wordTrayHint: { color: c.muted, fontSize: 14, lineHeight: 20 },
  wordTokenWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wordToken: { minHeight: 48, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.brand, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  wordTokenText: { color: c.brandText, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  finish: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg, alignItems: 'stretch' },
  finishIntro: { alignItems: 'stretch', gap: spacing.lg },
  finishBadge: { width: 74, height: 74, borderRadius: 26, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  finishHeading: { alignItems: 'stretch', gap: spacing.xs },
  finishHindi: { color: c.brandDark, fontSize: 28, lineHeight: 36, fontWeight: '900', textAlign: 'center' },
  finishGloss: { color: c.muted, fontSize: 15, lineHeight: 21, fontWeight: '400', textAlign: 'center' },
  finishTitle: { color: c.ink, fontSize: 26, lineHeight: 32, fontWeight: '900', textAlign: 'center' },
  finishStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  finishStat: { minWidth: 96, flexGrow: 1, flexBasis: 96, backgroundColor: c.paper, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md, alignItems: 'center', gap: 2 },
  finishValue: { color: c.ink, fontSize: 20, fontWeight: '900' },
  finishLabel: { color: c.muted, fontSize: 11, textAlign: 'center' },
  secondaryButton: { minHeight: 52, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.paper, borderWidth: 1, borderColor: c.line, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: c.ink, fontSize: 16, fontWeight: '800' },
  tertiaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  tertiaryText: { color: c.forestText, fontSize: 14, fontWeight: '800' },
}));
