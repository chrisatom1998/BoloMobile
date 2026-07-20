import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
  type AudioStreamBuffer,
} from 'expo-audio';
import { Mic, Square } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';

import { hapticStartRecording, hapticTap } from '@/lib/haptics';
import { stopSpeaking } from '@/lib/speech';
import { translateHindiAudio } from '@/services/bolo-api';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

const SEGMENT_MS = 3_600;
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 4_000;
const MAX_CONSECUTIVE_FAILURES = 4;
const MAX_PENDING_SEGMENTS = 10;
const MAX_BASE64_CHARACTERS = 5_000_000;
const PCM_SAMPLE_RATE = 16_000;
const PCM_CHANNELS = 1;
const WAV_HEADER_BYTES = 44;
const MAX_PCM_BYTES_PER_SEGMENT = Math.floor(MAX_BASE64_CHARACTERS * 3 / 4) - WAV_HEADER_BYTES;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const OVERLOAD_MESSAGE = 'Live translation fell too far behind. Pause, check your connection, then start again.';
const FOREGROUND_EXIT_MESSAGE = 'Live translation stopped when Bolo left the foreground. Start again when you return.';

type Props = {
  disabled?: boolean;
  onStatusChange?: (status: LiveTranslationStatus) => void;
  onTranslation: (english: string) => void;
};

export type LiveTranslationStatus = 'idle' | 'starting' | 'active';

type PcmSegment = {
  channels: number;
  chunks: Uint8Array[];
  pcmBytes: number;
  sampleRate: number;
};

function bytesToBase64(bytes: Uint8Array) {
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const value = (first << 16) | (second << 8) | third;
    encoded += BASE64_ALPHABET[(value >> 18) & 63];
    encoded += BASE64_ALPHABET[(value >> 12) & 63];
    encoded += index + 1 < bytes.length ? BASE64_ALPHABET[(value >> 6) & 63] : '=';
    encoded += index + 2 < bytes.length ? BASE64_ALPHABET[value & 63] : '=';
  }
  return encoded;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
}

function encodeWavSegment(segment: PcmSegment) {
  const encodedLength = Math.ceil((WAV_HEADER_BYTES + segment.pcmBytes) / 3) * 4;
  if (encodedLength > MAX_BASE64_CHARACTERS) throw new Error('The audio segment was too large to translate.');
  if (segment.pcmBytes % 2 !== 0) throw new Error('The microphone produced malformed audio.');

  const wav = new Uint8Array(WAV_HEADER_BYTES + segment.pcmBytes);
  const view = new DataView(wav.buffer);
  const bytesPerSample = 2;
  const blockAlign = segment.channels * bytesPerSample;
  writeAscii(wav, 0, 'RIFF');
  view.setUint32(4, 36 + segment.pcmBytes, true);
  writeAscii(wav, 8, 'WAVE');
  writeAscii(wav, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, segment.channels, true);
  view.setUint32(24, segment.sampleRate, true);
  view.setUint32(28, segment.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(wav, 36, 'data');
  view.setUint32(40, segment.pcmBytes, true);

  let offset = WAV_HEADER_BYTES;
  for (const chunk of segment.chunks) {
    wav.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytesToBase64(wav);
}

export function LiveTranslationRecorder({ disabled = false, onStatusChange, onTranslation }: Props) {
  const mountedRef = useRef(true);
  const activeRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const lifecycleRef = useRef(0);
  const foregroundWaiterRef = useRef<((active: boolean) => void) | null>(null);
  const runRef = useRef(0);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryResolveRef = useRef<(() => void) | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const processingRef = useRef(false);
  const processingSegmentRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const currentChunksRef = useRef<Uint8Array[]>([]);
  const currentPcmBytesRef = useRef(0);
  const currentFormatRef = useRef<{ channels: number; sampleRate: number } | null>(null);
  const queueRef = useRef<PcmSegment[]>([]);
  const stopRef = useRef<(message: string) => void>(() => undefined);
  const onStatusChangeRef = useRef(onStatusChange);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [pendingSegments, setPendingSegments] = useState(0);
  const [error, setError] = useState('');
  const status: LiveTranslationStatus = active ? 'active' : starting ? 'starting' : 'idle';

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => () => onStatusChangeRef.current?.('idle'), []);

  const waitForForeground = useCallback((lifecycle: number) => {
    if (!mountedRef.current || lifecycleRef.current !== lifecycle || appStateRef.current === 'background') {
      return Promise.resolve(false);
    }
    if (appStateRef.current !== 'inactive') return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      foregroundWaiterRef.current = resolve;
    });
  }, []);

  const updatePendingSegments = useCallback(() => {
    if (mountedRef.current) {
      setPendingSegments(queueRef.current.length + (processingSegmentRef.current ? 1 : 0));
    }
  }, []);

  const handleAudioBuffer = useCallback((buffer: AudioStreamBuffer) => {
    if (!activeRef.current || buffer.data.byteLength === 0) return;
    const format = currentFormatRef.current;
    if (format && (format.channels !== buffer.channels || format.sampleRate !== buffer.sampleRate)) {
      stopRef.current('The microphone format changed unexpectedly. Start live translation again.');
      return;
    }
    currentFormatRef.current = format ?? { channels: buffer.channels, sampleRate: buffer.sampleRate };
    const ownedBytes = new Uint8Array(buffer.data).slice();
    currentChunksRef.current.push(ownedBytes);
    currentPcmBytesRef.current += ownedBytes.byteLength;
    if (currentPcmBytesRef.current > MAX_PCM_BYTES_PER_SEGMENT) {
      stopRef.current(OVERLOAD_MESSAGE);
    }
  }, []);

  const { stream } = useAudioStream({
    channels: PCM_CHANNELS,
    encoding: 'int16',
    onBuffer: handleAudioBuffer,
    sampleRate: PCM_SAMPLE_RATE,
  });

  const stop = useCallback(async (message = '') => {
    activeRef.current = false;
    runRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    segmentTimerRef.current = null;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    retryResolveRef.current?.();
    retryResolveRef.current = null;
    queueRef.current = [];
    currentChunksRef.current = [];
    currentPcmBytesRef.current = 0;
    currentFormatRef.current = null;
    processingSegmentRef.current = false;
    try {
      stream?.stop();
    } catch {
      // The native stream may already have been released during unmount.
    } finally {
      await setAudioModeAsync({
        allowsBackgroundRecording: false,
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      }).catch(() => undefined);
      if (mountedRef.current) {
        setActive(false);
        setPendingSegments(0);
        setError(message);
      }
    }
  }, [stream]);
  stopRef.current = (message) => void stop(message);

  function waitForRetry(run: number, delay: number) {
    return new Promise<void>((resolve) => {
      if (!activeRef.current || run !== runRef.current) {
        resolve();
        return;
      }
      retryResolveRef.current = resolve;
      retryTimerRef.current = setTimeout(() => {
        retryResolveRef.current = null;
        retryTimerRef.current = null;
        resolve();
      }, delay);
    });
  }

  async function drainQueue(run: number) {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (activeRef.current && run === runRef.current && queueRef.current.length > 0) {
        const segment = queueRef.current.shift();
        if (!segment) break;
        processingSegmentRef.current = true;
        updatePendingSegments();
        let failed = false;
        try {
          const audioBase64 = encodeWavSegment(segment);
          if (!activeRef.current || run !== runRef.current) return;
          const controller = new AbortController();
          requestRef.current = controller;
          const result = await translateHindiAudio({
            audioBase64,
            mimeType: 'audio/wav',
          }, controller.signal).finally(() => {
            if (requestRef.current === controller) requestRef.current = null;
          });
          consecutiveFailuresRef.current = 0;
          if (mountedRef.current) setError('');
          if (activeRef.current && run === runRef.current && result.english.trim()) {
            onTranslation(result.english.trim());
          }
        } catch (cause) {
          if (!activeRef.current || run !== runRef.current) return;
          failed = true;
          consecutiveFailuresRef.current += 1;
          if (mountedRef.current) {
            setError(cause instanceof Error ? cause.message : 'Bolo could not translate that audio.');
          }
        } finally {
          processingSegmentRef.current = false;
          updatePendingSegments();
        }

        if (!failed) continue;
        if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          await stop('Live translation stopped after repeated errors. Check your connection, then start again.');
          return;
        }
        queueRef.current.unshift(segment);
        updatePendingSegments();
        const delay = Math.min(
          RETRY_BASE_MS * (2 ** (consecutiveFailuresRef.current - 1)),
          RETRY_MAX_MS,
        );
        await waitForRetry(run, delay);
      }
    } finally {
      processingRef.current = false;
      processingSegmentRef.current = false;
      updatePendingSegments();
      if (activeRef.current && queueRef.current.length > 0) {
        void drainQueue(runRef.current);
      }
    }
  }

  function scheduleSegment(run: number) {
    if (!activeRef.current || run !== runRef.current) return;
    segmentTimerRef.current = setTimeout(() => {
      segmentTimerRef.current = null;
      flushSegment(run);
      scheduleSegment(run);
    }, SEGMENT_MS);
  }

  function flushSegment(run: number) {
    if (!activeRef.current || run !== runRef.current) return;
    const chunks = currentChunksRef.current;
    const pcmBytes = currentPcmBytesRef.current;
    const format = currentFormatRef.current;
    currentChunksRef.current = [];
    currentPcmBytesRef.current = 0;
    currentFormatRef.current = null;
    if (chunks.length === 0 || pcmBytes === 0 || !format) return;

    const pendingCount = queueRef.current.length + (processingSegmentRef.current ? 1 : 0);
    if (pendingCount >= MAX_PENDING_SEGMENTS) {
      void stop(OVERLOAD_MESSAGE);
      return;
    }
    queueRef.current.push({ ...format, chunks, pcmBytes });
    updatePendingSegments();
    void drainQueue(run);
  }

  async function start() {
    if (disabled || activeRef.current || startingRef.current) return;
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
      if (!permission.granted) throw new Error('Microphone access is required for live translation.');
      if (!isCurrentAttempt() || !await waitForForeground(lifecycle)) return;
      await setAudioModeAsync({
        allowsBackgroundRecording: false,
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      releaseRecordingMode = true;
      if (!isCurrentAttempt() || !await waitForForeground(lifecycle)) return;
      if (!stream) throw new Error('Live translation is not available on this device.');

      const run = runRef.current + 1;
      runRef.current = run;
      consecutiveFailuresRef.current = 0;
      queueRef.current = [];
      currentChunksRef.current = [];
      currentPcmBytesRef.current = 0;
      currentFormatRef.current = null;
      activeRef.current = true;
      await stream.start();
      if (!activeRef.current || run !== runRef.current || !isCurrentAttempt()) {
        stream.stop();
        return;
      }
      releaseRecordingMode = false;
      hapticStartRecording();
      setActive(true);
      setPendingSegments(0);
      scheduleSegment(run);
    } catch (cause) {
      if (activeRef.current) {
        await stop(cause instanceof Error ? cause.message : 'Live translation could not start.');
      } else {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
        if (mountedRef.current) {
          setError(cause instanceof Error ? cause.message : 'Live translation could not start.');
        }
      }
    } finally {
      if (releaseRecordingMode) {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      }
      startingRef.current = false;
      if (mountedRef.current) setStarting(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
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
      if (activeRef.current) void stop(FOREGROUND_EXIT_MESSAGE);
    });
    return () => {
      mountedRef.current = false;
      lifecycleRef.current += 1;
      foregroundWaiterRef.current?.(false);
      foregroundWaiterRef.current = null;
      subscription?.remove();
      void stop();
    };
  }, [stop]);

  const unavailable = disabled || starting;
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? 'Stop live translation' : starting ? 'Starting live translation' : 'Start live translation'}
        accessibilityState={{ busy: starting, disabled: unavailable }}
        disabled={unavailable}
        onPress={active ? () => { hapticTap(); void stop(); } : () => void start()}
        style={[styles.button, active && styles.stopButton, unavailable && styles.disabled]}
      >
        {active ? <Square color={colors.white} fill={colors.white} size={17} /> : <Mic color={colors.white} size={19} />}
        <Text style={styles.label}>{active ? 'Stop translation' : starting ? 'Starting\u2026' : 'Start live translation'}</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {active
          ? pendingSegments > 0 ? `Listening and translating ${pendingSegments} segment${pendingSegments === 1 ? '' : 's'}\u2026` : 'Listening for Hindi\u2026'
          : starting ? 'Starting live translation\u2026' : 'Ready for Hindi speech'}
      </Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrapper: { gap: spacing.sm },
  button: { minHeight: 52, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.forest, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  stopButton: { backgroundColor: c.dangerSurface },
  disabled: { opacity: 0.5 },
  label: { color: c.white, fontSize: 15, fontWeight: '800' },
  status: { color: c.muted, fontSize: 13, textAlign: 'center' },
  error: { color: c.danger, fontSize: 13, lineHeight: 18, textAlign: 'center' },
}));
