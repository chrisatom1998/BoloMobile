import { Volume2 } from 'lucide-react-native';
import { useState } from 'react';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';

import { PronunciationRecorder } from '@/components/pronunciation-recorder';
import { RecallRevealPractice } from '@/components/recall-reveal-practice';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import type { LessonPilot } from '@/data/lesson-pilot';
import { lessonHindiLabel } from '@/lib/lesson-display';
import { hasOfflineSpeech } from '@/lib/speech';
import { useAppState } from '@/state/app-state';
import type { SavedPhrase, ScriptPreference } from '@/state/app-state-types';
import { buttons, hindiType, makeStyles, radius, spacing, type, useTheme } from '@/theme';

function PhraseText({ phrase, script }: { phrase: SavedPhrase; script: ScriptPreference }) {
  const styles = useStyles();
  return (
    <View style={styles.phrase}>
      {script !== 'latin' ? <Text accessibilityLanguage="hi-IN" style={styles.hindi}>{phrase.hi}</Text> : null}
      {script !== 'devanagari' ? <Text style={styles.latin}>{phrase.latin}</Text> : null}
      <Text style={styles.body}>{phrase.en}</Text>
    </View>
  );
}

function Listen({ label, phrase, onPlay, disabled = false }: { label: string; phrase: string; onPlay: (phrase: string) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => onPlay(phrase)} style={[buttons.secondary, disabled && styles.disabled]}>
      <Volume2 color={colors.ink} size={18} />
      <Text style={buttons.secondaryText}>{label}</Text>
    </Pressable>
  );
}

type PracticeProps = {
  pilot: LessonPilot;
  target: SavedPhrase;
  script: ScriptPreference;
  onPlay: (text: string) => void;
};

export function LessonPilotModel({ pilot, target, script, onPlay }: PracticeProps) {
  const styles = useStyles();
  const model = pilot.model ?? target;
  return (
    <View style={styles.panel} testID="lesson-pilot-model">
      <Text accessibilityRole="header" style={styles.title}>{pilot.goal}</Text>
      <PhraseText phrase={model} script={script} />
      {pilot.model ? <Text style={styles.body}>Use your own name when you practice.</Text> : null}
      <Listen label="Hear the example" phrase={model.hi} onPlay={onPlay} />
    </View>
  );
}

export function LessonPilotRecap({
  pilot, target, script, onPlay, onStopAudio, onRecordingChange, recording, lessonTitle, missed,
}: PracticeProps & {
  onStopAudio: () => void;
  onRecordingChange: (active: boolean) => void;
  recording: boolean;
  lessonTitle: string;
  missed: SavedPhrase[];
}) {
  const styles = useStyles();
  const { aiConsent, scheduleLessonReview } = useAppState();
  const [practice, setPractice] = useState<'retry' | 'roleplay' | null>(null);
  const [retryIndex, setRetryIndex] = useState(0);
  const [turnIndex, setTurnIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [schedule, setSchedule] = useState<'idle' | 'saving' | 'scheduled' | 'full' | 'failed'>('idle');
  const turn = pilot.roleplay.turns[turnIndex];
  const answer = turn?.answer === 'lesson' ? target : turn?.answer;
  const retry = missed[retryIndex];

  function start(kind: 'retry' | 'roleplay') {
    onStopAudio();
    setPractice(kind);
    setRetryIndex(0);
    setTurnIndex(0);
    setRevealed(false);
  }

  function nextTurn() {
    onStopAudio();
    setTurnIndex(turnIndex + 1);
    setRevealed(false);
  }

  function revealReply(phrase: SavedPhrase) {
    setRevealed(true);
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(lessonHindiLabel(phrase.hi, script, phrase.latin));
  }

  async function scheduleReview() {
    if (schedule === 'saving' || schedule === 'scheduled') return;
    setSchedule('saving');
    try {
      setSchedule(await scheduleLessonReview([target, ...missed]));
    } catch {
      setSchedule('failed');
    }
  }

  return (
    <View style={styles.panel} testID="lesson-pilot-recap">
      <Text accessibilityRole="header" style={styles.title}>{pilot.takeaway}</Text>
      {!practice ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => start('roleplay')} style={buttons.secondary}>
            <Text style={buttons.secondaryText}>Roleplay with Asha</Text>
          </Pressable>
          {missed.length ? (
            <Pressable accessibilityRole="button" onPress={() => start('retry')} style={buttons.secondary}>
              <Text style={buttons.secondaryText}>Retry missed phrases</Text>
            </Pressable>
          ) : null}
          {schedule === 'scheduled' ? (
            <Text accessibilityLiveRegion="polite" style={styles.body}>Saved in Review for tomorrow or sooner.</Text>
          ) : (
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: schedule === 'saving' }} disabled={schedule === 'saving'} onPress={scheduleReview} style={buttons.quiet}>
              <Text style={buttons.quietText}>{schedule === 'saving' ? 'Saving…' : 'Add to tomorrow’s review'}</Text>
            </Pressable>
          )}
          {schedule === 'full' ? <Text accessibilityRole="alert" style={styles.body}>Your phrasebook is full. Remove a phrase to make room, then try again.</Text> : null}
          {schedule === 'failed' ? <Text accessibilityRole="alert" style={styles.body}>Couldn’t save this review. Try again.</Text> : null}
        </>
      ) : null}
      {practice === 'retry' ? (
        retry ? (
          <RecallRevealPractice key={retry.hi} scriptPreference={script} targetHi={retry.hi} targetLatin={retry.latin} targetEn={retry.en} onResolve={() => setRetryIndex(retryIndex + 1)} />
        ) : <Text accessibilityLiveRegion="polite" style={styles.body}>You retried every missed phrase.</Text>
      ) : null}
      {practice === 'roleplay' ? (
        turn && answer ? (
          <>
            <Text style={styles.body}>{pilot.roleplay.setting}</Text>
            <Text accessibilityRole="header" style={styles.title}>Asha · Turn {turnIndex + 1} of {pilot.roleplay.turns.length}</Text>
            <PhraseText phrase={turn} script={script} />
            <Listen label="Hear Asha’s line" phrase={turn.hi} onPlay={onPlay} disabled={recording} />
            <Text style={styles.latin}>{turn.prompt}</Text>
            {aiConsent ? <PronunciationRecorder key={turnIndex} compact lessonTitle={lessonTitle} onActivityChange={onRecordingChange} target={answer} /> : null}
            {!revealed ? (
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: recording }} disabled={recording} onPress={() => revealReply(answer)} style={[buttons.secondary, recording && styles.disabled]}>
                <Text style={buttons.secondaryText}>Show a reply</Text>
              </Pressable>
            ) : (
              <View style={styles.phrase} accessibilityLiveRegion="polite">
                <PhraseText phrase={answer} script={script} />
                {hasOfflineSpeech(answer.hi) || aiConsent ? <Listen label="Hear the reply" phrase={answer.hi} onPlay={onPlay} disabled={recording} /> : null}
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: recording }} disabled={recording} onPress={nextTurn} style={[buttons.secondary, recording && styles.disabled]}>
                  <Text style={buttons.secondaryText}>{turnIndex === 0 ? 'Next turn' : 'Finish roleplay'}</Text>
                </Pressable>
              </View>
            )}
          </>
        ) : <Text accessibilityLiveRegion="polite" style={styles.body}>Conversation complete.</Text>
      ) : null}
      {practice ? (
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: recording }} disabled={recording} onPress={() => { onStopAudio(); setPractice(null); }} style={[buttons.quiet, recording && styles.disabled]}>
          <Text style={buttons.quietText}>Back to lesson summary</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  panel: { padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: c.line, borderRadius: radius.lg, backgroundColor: c.paperRaised },
  phrase: { gap: spacing.sm },
  title: { ...type.headline, color: c.ink },
  hindi: { ...hindiType(28), color: c.ink },
  latin: { ...type.label, color: c.ink },
  body: { ...type.body, color: c.ink },
  disabled: { opacity: 0.5 },
}));
