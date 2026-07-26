import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Mic, Square } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';

import { hapticStartRecording, hapticTap, hapticWarning } from '@/lib/haptics';
import { stopSpeaking } from '@/lib/speech';
import { resetVoiceAudioMode, setVoiceAudioMode } from '@/lib/voice';
import { deleteRecordingUri, readRecordingUri } from '@/lib/recording-file';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

const MAX_RECORDING_MS = 15_000;
const MAX_BASE64_CHARACTERS = 6_000_000;
const FOREGROUND_EXIT_MESSAGE = 'Pronunciation recording stopped when Bolo left the foreground. Record again when you return.';

type Props = {
  disabled?: boolean;
  idleLabel?: string;
  onActivityChange?: (active: boolean) => void;
  onRecordingReady: (recording: { audioBase64: string; mimeType: string }) => Promise<void>;
};

export function VoiceTurnButton({ disabled = false, idleLabel = 'Speak', onActivityChange, onRecordingReady }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const mountedRef = useRef(true);
  const onActivityChangeRef = useRef(onActivityChange);
  const appStateRef = useRef(AppState.currentState);
  const lifecycleRef = useRef(0);
  const foregroundWaiterRef = useRef<((active: boolean) => void) | null>(null);
  const recordingRef = useRef(false);
  const startingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);

  const waitForForeground = useCallback((lifecycle: number) => {
    if (!mountedRef.current || lifecycleRef.current !== lifecycle || appStateRef.current === 'background') {
      return Promise.resolve(false);
    }
    if (appStateRef.current !== 'inactive') return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      foregroundWaiterRef.current = resolve;
    });
  }, []);

  const discardActiveRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    try {
      await recorder.stop();
    } catch {
      // The native recorder may already have stopped as the app left the foreground.
    } finally {
      try {
        const uri = recorder.uri;
        if (uri) deleteRecordingUri(uri);
      } catch {
        // Cache cleanup is best-effort while the app is transitioning state.
      } finally {
        await resetVoiceAudioMode().catch(() => undefined);
        if (mountedRef.current) {
          setRecording(false);
          setError(FOREGROUND_EXIT_MESSAGE);
        }
      }
    }
  }, [recorder]);

  const finish = useCallback(async () => {
    if (!recordingRef.current) return;
    hapticTap();
    recordingRef.current = false;
    setRecording(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setBusy(true);
    setError('');
    let recordingUri: string | null = null;
    try {
      try {
        await recorder.stop();
      } finally {
        await resetVoiceAudioMode().catch(() => undefined);
      }
      const uri = recorder.uri;
      if (!uri) throw new Error('The recording did not produce an audio file.');
      recordingUri = uri;
      const { audioBase64, mimeType } = await readRecordingUri(uri, 'audio/mp4');
      if (audioBase64.length > MAX_BASE64_CHARACTERS) throw new Error('That recording is too long. Try a shorter turn.');
      if (!mountedRef.current) return;
      await onRecordingReady({ audioBase64, mimeType });
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'Bolo could not process that recording.');
    } finally {
      try {
        const uri = recordingUri ?? recorder.uri;
        if (uri) deleteRecordingUri(uri);
      } catch {
        // A failed cache deletion must not leave the recording control busy.
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    }
  }, [onRecordingReady, recorder]);

  const start = useCallback(async () => {
    if (disabled || busy || recordingRef.current || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError('');
    const lifecycle = lifecycleRef.current;
    let releaseRecordingMode = false;
    const isCurrentAttempt = () => mountedRef.current && lifecycleRef.current === lifecycle;
    try {
      await stopSpeaking();
      if (!isCurrentAttempt()) return;
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Microphone access is required. Enable it in your device settings and try again.');
      if (!isCurrentAttempt() || !await waitForForeground(lifecycle)) return;
      await setVoiceAudioMode('recording');
      releaseRecordingMode = true;
      if (!isCurrentAttempt() || !await waitForForeground(lifecycle)) return;
      await recorder.prepareToRecordAsync();
      if (!isCurrentAttempt() || !await waitForForeground(lifecycle)) return;
      recorder.record();
      releaseRecordingMode = false;
      recordingRef.current = true;
      hapticStartRecording();
      setRecording(true);
      timerRef.current = setTimeout(() => void finish(), MAX_RECORDING_MS);
    } catch (cause) {
      recordingRef.current = false;
      if (mountedRef.current) setRecording(false);
      await resetVoiceAudioMode().catch(() => undefined);
      if (mountedRef.current) {
        hapticWarning();
        setError(cause instanceof Error ? cause.message : 'Recording could not start.');
      }
    } finally {
      if (releaseRecordingMode) {
        await resetVoiceAudioMode().catch(() => undefined);
      }
      startingRef.current = false;
      if (mountedRef.current) setStarting(false);
    }
  }, [busy, disabled, finish, recorder, waitForForeground]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifecycleRef.current += 1;
      foregroundWaiterRef.current?.(false);
      foregroundWaiterRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      startingRef.current = false;
      const shouldStop = recordingRef.current;
      recordingRef.current = false;
      void (async () => {
        try {
          if (shouldStop) await recorder.stop();
          const uri = recorder.uri;
          if (uri) deleteRecordingUri(uri);
        } catch {
          // Native cleanup is best-effort during unmount.
        } finally {
          await resetVoiceAudioMode().catch(() => undefined);
        }
      })();
    };
  }, [recorder]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        foregroundWaiterRef.current?.(true);
        foregroundWaiterRef.current = null;
        return;
      }
      if (nextState === 'background') {
        lifecycleRef.current += 1;
        foregroundWaiterRef.current?.(false);
        foregroundWaiterRef.current = null;
        if (startingRef.current && mountedRef.current) setError(FOREGROUND_EXIT_MESSAGE);
      }
      if (nextState === 'background' && recordingRef.current) void discardActiveRecording();
    });
    return () => subscription.remove();
  }, [discardActiveRecording]);

  const isRecording = recording || recorderState.isRecording;
  const active = starting || busy || isRecording;

  useEffect(() => {
    onActivityChangeRef.current = onActivityChange;
  }, [onActivityChange]);

  useEffect(() => {
    onActivityChangeRef.current?.(active);
  }, [active]);

  useEffect(() => () => onActivityChangeRef.current?.(false), []);

  const label = starting ? 'Starting…' : busy ? 'Asha is thinking…' : isRecording ? `Stop · ${Math.max(1, Math.ceil(recorderState.durationMillis / 1000))}s` : idleLabel;
  const unavailable = disabled || busy || starting;
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isRecording ? 'Stop recording' : idleLabel}
        accessibilityState={{ disabled: unavailable }}
        disabled={unavailable}
        onPress={isRecording ? () => void finish() : () => void start()}
        style={[styles.button, isRecording && styles.recording, unavailable && styles.disabled]}
      >
        {isRecording ? <Square color={colors.white} fill={colors.white} size={17} /> : <Mic color={colors.white} size={19} />}
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrapper: { gap: spacing.sm },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    backgroundColor: c.forest,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  recording: { backgroundColor: c.dangerSurface },
  disabled: { opacity: 0.5 },
  label: { color: c.white, fontSize: 15, fontWeight: '800' },
  error: { color: c.danger, fontSize: 13, lineHeight: 18 },
}));
