import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, Check, ChevronRight, Heart, RotateCcw, Star, Volume2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { PronunciationRecorder } from '@/components/pronunciation-recorder';
import { WordDefinitionSheet } from '@/components/word-definition-sheet';
import { getScene } from '@/data/scenes';
import { useForegroundTimer } from '@/hooks/use-foreground-timer';
import { useSpeakText } from '@/hooks/use-speak-text';
import { observe } from '@/lib/observability';
import { hapticSelect, hapticSuccess, hapticWarning } from '@/lib/haptics';
import { hindiWordTokens } from '@/lib/contextual-word-definition';
import { hasOfflineSpeech, stopSpeaking } from '@/lib/speech';
import { useAppState } from '@/state/app-state';
import { makeStyles, radius, spacing, useSharedStyles, useTheme } from '@/theme';

export default function SceneScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const scene = useMemo(() => getScene(id), [id]);
  const { aiConsent, checkpointScene, clientId, learnerProfile, markSceneComplete, phrases, sceneProgress, togglePhrase } = useAppState();
  const { elapsedSeconds, reset: resetTimer } = useForegroundTimer();
  const { audioError, clearAudioError, speak } = useSpeakText();
  const savedBeatIndex = scene ? sceneProgress?.[scene.id]?.lastBeatIndex ?? 0 : 0;
  // Snapshot where this run started: score/correct only count beats answered after
  // the checkpoint, so completion totals must exclude the beats skipped by resume.
  const [initialBeatIndex, setInitialBeatIndex] = useState(() => scene && savedBeatIndex < scene.beats.length ? savedBeatIndex : 0);
  const [beatIndex, setBeatIndex] = useState(initialBeatIndex);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [done, setDone] = useState(false);
  const [pronunciationBusy, setPronunciationBusy] = useState(false);
  const [weakPhrases, setWeakPhrases] = useState<string[]>([]);
  const [wordDefinitionWord, setWordDefinitionWord] = useState<string | null>(null);
  const advancingRef = useRef(false);

  useEffect(() => {
    observe('scene_started');
    return () => { void stopSpeaking(); };
  }, []);

  const currentBeat = scene?.beats[beatIndex];
  const currentTarget = currentBeat?.choices.find((choice) => choice.correct);

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
  const saved = phrases.some((phrase) => phrase.hi === target.hi);
  const correct = picked !== null && beat.choices[picked]?.correct === true;

  function play(text: string) {
    if ((!aiConsent && !hasOfflineSpeech(text)) || pronunciationBusy) return;
    void speak(text);
  }

  function choose(index: number) {
    if (picked !== null || pronunciationBusy) return;
    const choice = beat.choices[index];
    if (choice === undefined) return;
    setPicked(index);
    if (choice.correct) {
      hapticSuccess();
      setScore((value) => value + 50);
      setCorrectCount((value) => value + 1);
    }
    else {
      hapticWarning();
      setHearts((value) => Math.max(0, value - 1));
      setWeakPhrases((current) => [...new Set([...current, target.hi])]);
    }
    play(choice.reply);
  }

  function next() {
    if (advancingRef.current || picked === null) return;
    advancingRef.current = true;
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
      advancingRef.current = false;
      return;
    }
    hapticSelect();
    checkpointScene?.(activeScene.id, beatIndex + 1);
    setBeatIndex((value) => value + 1);
    setPicked(null);
    setWordDefinitionWord(null);
    requestAnimationFrame(() => { advancingRef.current = false; });
  }

  function replay() {
    void stopSpeaking();
    clearAudioError();
    resetTimer();
    setInitialBeatIndex(0);
    setBeatIndex(0);
    setPicked(null);
    setWordDefinitionWord(null);
    setScore(0);
    setCorrectCount(0);
    setHearts(3);
    setWeakPhrases([]);
    setDone(false);
  }

  if (done) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.finish} style={sharedStyles.screen}>
        <Stack.Screen options={{ title: activeScene.title }} />
        <View style={styles.finishBadge}><Star color={colors.white} fill={colors.white} size={34} /></View>
        <Text style={sharedStyles.eyebrow}>Scene complete</Text>
        <Text style={styles.finishHindi}>आपने कर दिखाया!</Text>
        <Text style={styles.finishTitle}>You navigated {activeScene.title} in Hindi.</Text>
        <Text style={sharedStyles.body}>The goal is not perfect recall—it’s a faster, calmer response every time.</Text>
        <View style={styles.finishStats}>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{score}</Text><Text style={styles.finishLabel}>scene score</Text></View>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{hearts}/3</Text><Text style={styles.finishLabel}>confidence</Text></View>
          <View style={styles.finishStat}><Text style={styles.finishValue}>{activeScene.beats.length - initialBeatIndex}</Text><Text style={styles.finishLabel}>turns this run</Text></View>
        </View>
        <Pressable accessibilityRole="button" onPress={replay} style={styles.secondaryButton}><RotateCcw color={colors.ink} size={18} /><Text style={styles.secondaryText}>Replay scene</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={sharedStyles.primaryButton}><Text style={sharedStyles.primaryButtonText}>Choose another scene</Text><ChevronRight color={colors.white} size={18} /></Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={sharedStyles.screen}>
      <Stack.Screen options={{ title: activeScene.title }} />
      <View style={styles.progressHeader}>
        <View style={styles.hud}><Heart color={colors.danger} fill={colors.danger} size={17} /><Text style={styles.hudText}>{hearts}</Text></View>
        <Text style={styles.turn}>Turn {beatIndex + 1} of {activeScene.beats.length}</Text>
        <View style={styles.hud}><Star color={colors.gold} fill={colors.gold} size={17} /><Text style={styles.hudText}>{score}</Text></View>
      </View>
      <View style={styles.track}><View style={[styles.trackFill, { width: `${(beatIndex + Number(picked !== null)) / activeScene.beats.length * 100}%`, backgroundColor: activeScene.color }]} /></View>

      {initialBeatIndex > 0 ? <Text accessibilityLiveRegion="polite" style={styles.resumeNotice}>Resuming from turn {initialBeatIndex + 1}. Your score below reflects this run.</Text> : null}

      {!aiConsent ? <AiConsentGate /> : null}
      {audioError ? <Text accessibilityRole="alert" style={styles.audioError}>{audioError}</Text> : null}

      <View style={[styles.world, { borderColor: activeScene.color }]}> 
        <View style={styles.worldTop}><Text style={styles.emoji}>{activeScene.emoji}</Text><Text style={styles.place}>{activeScene.place}</Text></View>
        <View style={styles.ashaRow}>
          <View style={styles.asha}><Text style={styles.ashaText}>आ</Text></View>
          <View style={styles.bubble}>
            <Pressable
              accessibilityHint={!aiConsent && !hasOfflineSpeech(beat.npc) ? 'Agree to connected AI processing to enable this voice.' : pronunciationBusy ? 'Finish pronunciation practice before playing another voice.' : 'Bundled lesson audio works offline.'}
              accessibilityLabel="Hear Asha"
              accessibilityRole="button"
              accessibilityState={{ disabled: (!aiConsent && !hasOfflineSpeech(beat.npc)) || pronunciationBusy }}
              disabled={(!aiConsent && !hasOfflineSpeech(beat.npc)) || pronunciationBusy}
              onPress={() => play(beat.npc)}
              style={[styles.speaker, ((!aiConsent && !hasOfflineSpeech(beat.npc)) || pronunciationBusy) && styles.disabled]}
            ><Volume2 color={colors.ink} size={18} /></Pressable>
            <Text style={styles.npc}>{beat.npc}</Text>
            <Text style={styles.translation}>{beat.translation}</Text>
          </View>
        </View>
        <Text style={styles.prompt}>{beat.prompt}</Text>
      </View>

      <View style={styles.answerHeader}><View><Text style={sharedStyles.eyebrow}>Your response</Text><Text style={styles.answerTitle}>What do you say?</Text></View></View>
      <View style={styles.choices}>
        {beat.choices.map((choice, index) => {
          const selected = picked === index;
          const revealed = picked !== null && choice.correct;
          return (
            <Pressable
              key={choice.hi}
              accessibilityLabel={`${choice.hi}. ${choice.latin}. ${choice.en}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: picked !== null || pronunciationBusy, selected }}
              disabled={picked !== null || pronunciationBusy}
              onPress={() => choose(index)}
              style={[styles.choice, selected && (choice.correct ? styles.choiceCorrect : styles.choiceWrong), revealed && styles.choiceCorrect]}
            >
              <View style={styles.choiceNumber}><Text style={styles.choiceNumberText}>{index + 1}</Text></View>
              <View style={styles.choiceCopy}>
                {learnerProfile?.scriptPreference !== 'latin' ? <Text style={styles.choiceHindi}>{choice.hi}</Text> : null}
                <Text style={styles.choiceMeaning}>{learnerProfile?.scriptPreference === 'devanagari' ? choice.en : `${choice.latin} · ${choice.en}`}</Text>
              </View>
              {selected ? (choice.correct ? <Check color={colors.success} size={22} /> : <X color={colors.danger} size={22} />) : null}
            </Pressable>
          );
        })}
      </View>

      {picked === null ? (
        <View style={styles.hint}><Text style={styles.hintTitle}>Asha’s hint</Text><Text style={styles.hintBody}>{beat.tip}</Text></View>
      ) : (
        <View style={styles.result}>
          <View style={styles.resultCopy}><Text style={styles.resultTitle}>{correct ? 'Natural choice!' : 'Not quite—notice the pattern.'}</Text><Text style={styles.resultHindi}>{beat.choices[picked]?.reply}</Text></View>
          <Pressable accessibilityRole="button" onPress={next} style={styles.nextButton}><Text style={styles.nextText}>{beatIndex === activeScene.beats.length - 1 ? 'Finish' : 'Continue'}</Text><ChevronRight color={colors.white} size={18} /></Pressable>
        </View>
      )}

      {picked !== null ? (
        <>
          <View style={styles.saveRow}>
            <View style={styles.saveCopy}><Text style={styles.saveTitle}>Keep the natural answer</Text><Text style={styles.saveMeaning}>{target.en}</Text></View>
            <Pressable accessibilityLabel={saved ? 'Remove saved phrase' : 'Save phrase'} accessibilityRole="button" accessibilityState={{ selected: saved }} onPress={() => togglePhrase(target)} style={[styles.saveButton, saved && styles.saveButtonActive]}>
              <Bookmark color={saved ? colors.white : colors.ink} fill={saved ? colors.white : 'transparent'} size={19} />
            </Pressable>
          </View>
          <View style={styles.wordTray}>
            <Text style={styles.wordTrayTitle}>Unpack the answer</Text>
            <Text style={styles.wordTrayHint}>Tap a Hindi word for its meaning in this phrase.</Text>
            <View style={styles.wordTokenWrap}>
              {hindiWordTokens(target.hi).map((word) => (
                <Pressable
                  accessibilityHint={aiConsent ? 'Opens a contextual English explanation.' : 'Agree to connected AI processing to unpack this word.'}
                  accessibilityLabel={`Explain ${word} in the answer`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !aiConsent }}
                  disabled={!aiConsent}
                  key={word}
                  onPress={() => setWordDefinitionWord(word)}
                  style={[styles.wordToken, !aiConsent && styles.disabled]}
                ><Text style={styles.wordTokenText}>{word}</Text></Pressable>
              ))}
            </View>
          </View>
        </>
      ) : null}

      {aiConsent ? <PronunciationRecorder key={`${activeScene.id}-${beatIndex}-${target.hi}`} lessonTitle={activeScene.title} onActivityChange={setPronunciationBusy} target={target} /> : null}
      {wordDefinitionWord ? <WordDefinitionSheet clientId={clientId} initialWord={wordDefinitionWord} onClose={() => setWordDefinitionWord(null)} phrase={target.hi} scriptPreference={learnerProfile.scriptPreference} visible /> : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  center: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hud: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hudText: { color: c.ink, fontWeight: '900' },
  turn: { color: c.muted, fontSize: 13, fontWeight: '800' },
  track: { height: 7, borderRadius: radius.pill, overflow: 'hidden', backgroundColor: c.line },
  trackFill: { height: '100%', borderRadius: radius.pill },
  resumeNotice: { color: c.forestText, fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  world: { backgroundColor: c.paper, borderColor: c.line, borderWidth: 2, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.lg },
  worldTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  emoji: { fontSize: 30 },
  place: { color: c.muted, fontSize: 12, fontWeight: '700' },
  ashaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  asha: { width: 52, height: 52, borderRadius: 18, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center' },
  ashaText: { color: c.white, fontSize: 24, fontWeight: '900' },
  bubble: { flex: 1, backgroundColor: c.background, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md, gap: spacing.xs },
  speaker: { position: 'absolute', zIndex: 1, right: spacing.sm, top: spacing.sm, width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  audioError: { color: c.danger, fontSize: 13, lineHeight: 18 },
  npc: { color: c.ink, fontSize: 21, lineHeight: 29, fontWeight: '800', paddingRight: 48 },
  translation: { color: c.muted, fontSize: 14, lineHeight: 20 },
  prompt: { color: c.ink, fontSize: 18, lineHeight: 25, fontWeight: '800' },
  answerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  answerTitle: { color: c.ink, fontSize: 26, fontWeight: '900', marginTop: spacing.xs },
  choices: { gap: spacing.sm },
  choice: { minHeight: 82, backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  choiceCorrect: { borderColor: c.success, backgroundColor: c.successSoft },
  choiceWrong: { borderColor: c.danger, backgroundColor: c.dangerSoft },
  choiceNumber: { minWidth: 30, minHeight: 30, borderRadius: radius.pill, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xs },
  choiceNumberText: { color: c.muted, fontWeight: '800' },
  choiceCopy: { flex: 1, gap: 3 },
  choiceHindi: { color: c.ink, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  choiceMeaning: { color: c.muted, fontSize: 12, lineHeight: 17 },
  hint: { borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.goldSoft, padding: spacing.lg, gap: spacing.xs },
  hintTitle: { color: c.ink, fontSize: 14, fontWeight: '900' },
  hintBody: { color: c.muted, fontSize: 14, lineHeight: 20 },
  result: { borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.night, padding: spacing.lg, gap: spacing.lg },
  resultCopy: { gap: spacing.xs },
  resultTitle: { color: c.white, fontSize: 17, fontWeight: '900' },
  resultHindi: { color: c.heroSubtle, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  nextButton: { alignSelf: 'flex-end', minHeight: 44, borderRadius: radius.pill, backgroundColor: c.brand, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  nextText: { color: c.white, fontWeight: '900' },
  saveRow: { backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md, flexDirection: 'row', alignItems: 'center' },
  saveCopy: { flex: 1, gap: spacing.xs },
  saveTitle: { color: c.ink, fontSize: 15, fontWeight: '900' },
  saveMeaning: { color: c.muted, fontSize: 13 },
  saveButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
  saveButtonActive: { backgroundColor: c.brand },
  wordTray: { gap: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous', borderColor: c.brand, borderWidth: 1, backgroundColor: c.brandSoft, padding: spacing.lg },
  wordTrayTitle: { color: c.brandText, fontSize: 17, lineHeight: 23, fontWeight: '900' },
  wordTrayHint: { color: c.muted, fontSize: 14, lineHeight: 20 },
  wordTokenWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wordToken: { minHeight: 48, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.brand, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  wordTokenText: { color: c.brandText, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  finish: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg, alignItems: 'stretch' },
  finishBadge: { width: 74, height: 74, borderRadius: 26, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  finishHindi: { color: c.brandDark, fontSize: 28, lineHeight: 36, fontWeight: '900', textAlign: 'center' },
  finishTitle: { color: c.ink, fontSize: 26, lineHeight: 32, fontWeight: '900', textAlign: 'center' },
  finishStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  finishStat: { minWidth: 96, flexGrow: 1, flexBasis: 96, backgroundColor: c.paper, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md, alignItems: 'center', gap: 2 },
  finishValue: { color: c.ink, fontSize: 20, fontWeight: '900' },
  finishLabel: { color: c.muted, fontSize: 11, textAlign: 'center' },
  secondaryButton: { minHeight: 52, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.paper, borderWidth: 1, borderColor: c.line, flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: c.ink, fontSize: 16, fontWeight: '800' },
}));
