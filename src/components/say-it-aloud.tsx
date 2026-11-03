import { RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import { hapticSuccess } from '@/lib/haptics';
import { deleteRecordingUri } from '@/lib/recording-file';
import { resetVoiceAudioMode, setVoiceAudioMode } from '@/lib/voice';
import { buttons, makeStyles, spacing, type } from '@/theme';

/** Microphone level (dBFS) that counts as the learner talking, not room noise. */
export const HEARD_THRESHOLD_DB = -24;
/** Consecutive loud samples before Asha counts it as said. */
export const HEARD_SAMPLES = 2;
/** How long Asha waits before gently asking again. */
export const LISTEN_TIMEOUT_MS = 8_000;
const METER_INTERVAL_MS = 100;

export type SayItAloudPhase = 'idle' | 'listening' | 'heard' | 'missed' | 'denied';

/** Counts a loud sample toward the "heard you" decision; returns the new streak. */
export function nextHeardStreak(streak: number, metering: number | undefined) {
  if (typeof metering !== 'number' || Number.isNaN(metering)) return streak;
  return metering > HEARD_THRESHOLD_DB ? streak + 1 : 0;
}

type Props = {
  /** Called once the learner has said the line. Nothing is uploaded; the sound level is read on the phone. */
  onHeard: () => void;
  /** Called when the learner cannot or would rather not say it now. */
  onSkip: () => void;
  phase: SayItAloudPhase;
  onPhase: (phase: SayItAloudPhase) => void;
};

/**
 * "Say it out loud. I'll wait." A local microphone check for a first Hindi word: it listens
 * for a short burst of sound above room noise and never sends audio anywhere.
 */
export function SayItAloud({ onHeard, onPhase, onSkip, phase }: Props) {
  const styles = useStyles();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, METER_INTERVAL_MS);
  const streakRef = useRef(0);
  const listeningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [busy, setBusy] = useState(false);

  const stopListening = useCallback(async () => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    try { await recorder.stop(); } catch { /* The native recorder may already be stopped. */ }
    try { const uri = recorder.uri; if (uri) deleteRecordingUri(uri); } catch { /* Best-effort cleanup. */ }
    await resetVoiceAudioMode().catch(() => undefined);
  }, [recorder]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopListening();
    };
  }, [stopListening]);

  // Each metering sample either extends the streak of sound or resets it.
  useEffect(() => {
    if (phase !== 'listening' || !listeningRef.current) return;
    streakRef.current = nextHeardStreak(streakRef.current, recorderState.metering);
    if (streakRef.current < HEARD_SAMPLES) return;
    void stopListening().then(() => {
      if (!mountedRef.current) return;
      hapticSuccess();
      onPhase('heard');
      onHeard();
    });
  }, [onHeard, onPhase, phase, recorderState.metering, stopListening]);

  const listen = useCallback(async () => {
    if (busy || listeningRef.current) return;
    setBusy(true);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!mountedRef.current) return;
      if (!permission.granted) { onPhase('denied'); return; }
      await setVoiceAudioMode('recording');
      await recorder.prepareToRecordAsync();
      recorder.record();
      streakRef.current = 0;
      listeningRef.current = true;
      onPhase('listening');
      timerRef.current = setTimeout(() => {
        void stopListening().then(() => { if (mountedRef.current) onPhase('missed'); });
      }, LISTEN_TIMEOUT_MS);
    } catch {
      await resetVoiceAudioMode().catch(() => undefined);
      if (mountedRef.current) onPhase('missed');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [busy, onPhase, recorder, stopListening]);

  if (Platform.OS === 'web') {
    // Browsers do not report a microphone level here, so the learner confirms it themselves.
    return phase === 'heard' ? <Text accessibilityLiveRegion="polite" style={styles.heard} testID="say-it-heard">Great. नमस्ते is hello.</Text> : (
      <Pressable accessibilityRole="button" onPress={() => { onPhase('heard'); onHeard(); }} style={styles.listenButton} testID="say-it-confirm">
        <Text style={styles.listenText}>I said it</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.stack}>
      {phase === 'heard' ? (
        <Text accessibilityLiveRegion="polite" style={styles.heard} testID="say-it-heard">Heard you! नमस्ते is hello. शाबाश।</Text>
      ) : (
        <>
          {phase === 'denied' ? (
            <Text accessibilityLiveRegion="polite" style={styles.note} testID="say-it-denied">No microphone for now, that’s fine. You can say it with Asha later.</Text>
          ) : (
            <Pressable
              accessibilityHint="Listens for your voice on this phone. Nothing is uploaded."
              accessibilityLabel={phase === 'listening' ? 'Listening' : 'Say it now'}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || phase === 'listening' }}
              disabled={busy || phase === 'listening'}
              onPress={() => { void listen(); }}
              style={[styles.listenButton, phase === 'listening' && styles.listening]}
              testID="say-it-listen"
            >
              <Text style={styles.listenText}>{phase === 'listening' ? 'Listening… go ahead' : phase === 'missed' ? 'Try once more' : 'Say it now'}</Text>
            </Pressable>
          )}
          {phase === 'missed' ? <Text accessibilityLiveRegion="polite" style={styles.note} testID="say-it-missed">I didn’t catch that. A little louder this time.</Text> : null}
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onSkip} style={styles.skip} testID="say-it-skip">
            <Text style={styles.skipText}>{phase === 'denied' ? 'Continue' : 'I’ll say it later'}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  stack: { gap: spacing.sm },
  listenButton: { ...buttons.primary, alignSelf: 'stretch' },
  listening: { opacity: 0.85 },
  listenText: buttons.primaryText,
  heard: { ...type.bodyLarge, color: c.brandText, fontWeight: '700' },
  note: { ...type.caption, color: c.muted },
  skip: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  skipText: { ...type.label, color: c.muted, textDecorationLine: 'underline' },
}));
