import { Mic, MicOff, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { EffectiveMotion } from '@/hooks/use-motion-preference';
import { useRealtimeConversation, type LiveTranscriptRow, type RealtimeInputTranscript, type RealtimeTranscriptUpdate, type RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { hapticSelect, hapticStartRecording, hapticTap } from '@/lib/haptics';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import type { AshaResponseLanguage, ChatMessage } from '@/state/app-state-types';

type Props = {
  clientId: string;
  /** Status/helper content shown between the orb and the End chat action. */
  children?: ReactNode;
  history?: Pick<ChatMessage, 'role' | 'text'>[];
  onConnectionStart?: (signal: AbortSignal) => Pick<ChatMessage, 'role' | 'text'>[] | Promise<Pick<ChatMessage, 'role' | 'text'>[]>;
  onTranscriptSnapshot?: (rows: LiveTranscriptRow[]) => void;
  compact?: boolean;
  disabled?: boolean;
  enabled?: boolean;
  motionMode?: EffectiveMotion;
  /** A compact, single-orb treatment for dense conversation headers. */
  size?: 'regular' | 'minimal';
  onError: (message: string) => void;
  /** Every explicit End marks a boundary; only completed sessions get a recap. */
  onSessionEnded?: (completed: boolean) => void;
  onInputTranscriptComplete?: (result: RealtimeInputTranscript) => void;
  /** Shares this exact control's session teardown with the hosting screen. */
  onDisconnectReady?: (disconnect: (() => void) | null) => void;
  /** Shares this exact control's turn action with a companion UI surface. */
  onTurnActionReady?: (action: (() => void) | null) => void;
  onStatusChange?: (status: RealtimeVoiceStatus) => void;
  onTranscriptChange?: (update: RealtimeTranscriptUpdate) => void;
  onTurnComplete?: (turn: { transcript: string; reply: string; language: 'en' | 'hi' }) => void;
  responseLanguage?: AshaResponseLanguage;
};

const labels = {
  disconnected: 'Start a voice conversation',
  connecting: 'Connecting…',
  ready: 'Unmute microphone',
  recording: 'Mute microphone',
  responding: 'Unmute microphone',
} as const;

const BREATH_MS = 2_600;
const RING_MS = 1_900;
const THROB_MS = 700;

/**
 * Animates the orb by status: a slow breath while ready, rings that ripple
 * outward while recording, and a quick throb while Asha responds. All motion
 * lives on wrapper views so the Pressable keeps its static hit-target styles.
 */
function useOrbMotion(status: RealtimeVoiceStatus, motionMode: EffectiveMotion) {
  const breath = useSharedValue(1);
  const ripple = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(breath);
    cancelAnimation(ripple);
    if (motionMode === 'reduced') {
      breath.value = 1;
      ripple.value = status === 'recording' ? 0.35 : 0;
      return () => {
        cancelAnimation(breath);
        cancelAnimation(ripple);
      };
    }
    const breathPeak = motionMode === 'lively' ? 1.07 : 1.045;
    const breathMs = motionMode === 'lively' ? 2_100 : BREATH_MS;
    const ringMs = motionMode === 'lively' ? 1_450 : RING_MS;
    const throbPeak = motionMode === 'lively' ? 1.055 : 1.03;
    const throbMs = motionMode === 'lively' ? 560 : THROB_MS;
    if (status === 'ready' || status === 'connecting') {
      ripple.value = withTiming(0, { duration: 220 });
      breath.value = withRepeat(
        withSequence(
          withTiming(breathPeak, { duration: breathMs / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: breathMs / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
      return () => {
        cancelAnimation(breath);
        cancelAnimation(ripple);
      };
    }
    if (status === 'recording') {
      breath.value = withTiming(1.04, { duration: 220 });
      ripple.value = 0;
      ripple.value = withRepeat(withTiming(1, { duration: ringMs, easing: Easing.out(Easing.quad) }), -1);
      return () => {
        cancelAnimation(breath);
        cancelAnimation(ripple);
      };
    }
    if (status === 'responding') {
      ripple.value = withTiming(0, { duration: 220 });
      breath.value = withRepeat(
        withSequence(
          withTiming(throbPeak, { duration: throbMs / 2, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.99, { duration: throbMs / 2, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
      return () => {
        cancelAnimation(breath);
        cancelAnimation(ripple);
      };
    }
    breath.value = withTiming(1, { duration: 260 });
    ripple.value = withTiming(0, { duration: 260 });
    return () => {
      cancelAnimation(breath);
      cancelAnimation(ripple);
    };
  }, [breath, motionMode, ripple, status]);

  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: 0.85 * (1 - ripple.value),
    transform: [{ scale: 1 + ripple.value * 0.18 }],
  }));

  return { orbStyle, rippleStyle };
}

export function RealtimeVoiceButton({ children, clientId, history, onConnectionStart, onTranscriptSnapshot, compact = false, disabled = false, enabled = true, motionMode = 'gentle', size = 'regular', onError, onSessionEnded, onInputTranscriptComplete, onDisconnectReady, onTurnActionReady, onStatusChange, onTranscriptChange, onTurnComplete, responseLanguage = 'en' }: Props) {
  const voice = useRealtimeConversation({ clientId, enabled, history, onConnectionStart, onTranscriptSnapshot, onError, onInputTranscriptComplete, onTranscriptChange, onTurnComplete, responseLanguage });
  const onStatusChangeRef = useRef(onStatusChange);
  const endHandledRef = useRef(false);
  const blocked = disabled || voice.status === 'connecting';
  const connected = voice.status !== 'disconnected';
  const styles = useStyles();
  const { colors } = useTheme();
  const { orbStyle, rippleStyle } = useOrbMotion(voice.status, motionMode);
  const minimal = size === 'minimal';
  const voiceIconSize = minimal ? 32 : 52;

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onStatusChange?.(voice.status);
  }, [onStatusChange, voice.status]);

  useEffect(() => () => onStatusChangeRef.current?.('disconnected'), []);

  const press = useCallback(() => {
    if (blocked) return;
    if (voice.status === 'disconnected') endHandledRef.current = false;
    if (voice.microphoneEnabled) {
      hapticTap();
      void Promise.resolve().then(voice.finishTurn).catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Live voice practice failed.'));
      return;
    }
    // Starting WebRTC reconfigures the native audio session. Keep the initial
    // connection free of simultaneous UI-sound/haptic work; on iOS that can
    // deadlock RemoteIO while the peer applies its remote audio description.
    // Once connected, starting later turns is safe to acknowledge haptically.
    if (voice.status === 'ready' || voice.status === 'responding') hapticStartRecording();
    void voice.startTurn().catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Live voice practice failed.'));
  }, [blocked, onError, voice]);

  useEffect(() => {
    onTurnActionReady?.(press);
    return () => onTurnActionReady?.(null);
  }, [onTurnActionReady, press]);

  useEffect(() => {
    onDisconnectReady?.(voice.disconnect);
    return () => onDisconnectReady?.(null);
  }, [onDisconnectReady, voice.disconnect]);

  const endSession = useCallback(() => {
    if (endHandledRef.current) return;
    endHandledRef.current = true;
    const completed = voice.status !== 'connecting' && voice.status !== 'disconnected';
    hapticSelect();
    voice.disconnect();
    onSessionEnded?.(completed);
  }, [onSessionEnded, voice]);

  return (
    <>
      <View style={[styles.stage, compact && styles.stageCompact, minimal && styles.stageMinimal]} testID="realtime-voice-stage">
        <View style={[styles.ring, styles.ringOuter, compact && styles.ringOuterCompact, minimal && styles.ringOuterMinimal]} />
        <View style={[styles.ring, styles.ringMiddle, compact && styles.ringMiddleCompact, minimal && styles.ringMiddleMinimal]} />
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, styles.ringInner, compact && styles.ringInnerCompact, minimal && styles.ringInnerMinimal, voice.status === 'recording' && styles.ringInnerRecording, rippleStyle]}
        />
        <Animated.View style={orbStyle}>
          <Pressable
            accessibilityLabel={labels[voice.status]}
            accessibilityHint={connected ? 'The microphone stays on until you mute it or end the session. You can speak while Asha is speaking.' : 'Starts live conversation with your microphone on.'}
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked }}
            disabled={blocked}
            onPress={press}
            style={[styles.orb, compact && styles.orbCompact, minimal && styles.orbMinimal, connected && styles.orbActive, voice.status === 'recording' && styles.orbRecording, blocked && styles.disabled]}
            testID="realtime-voice-orb"
          >
            <View style={styles.orbHighlight} />
            {voice.status === 'ready' || voice.status === 'responding'
              ? <Mic color={colors.white} size={voiceIconSize} />
              : voice.status === 'recording'
                ? <MicOff color={colors.white} size={voiceIconSize} />
                : <Text style={[styles.orbGlyph, minimal && styles.orbGlyphMinimal]}>आ</Text>}
          </Pressable>
        </Animated.View>
      </View>
      {children}
      {connected ? (
        <View style={styles.endRow} testID="realtime-end-row">
          <Pressable accessibilityLabel="End chat" accessibilityHint="Stops the live voice session." accessibilityRole="button" onPress={endSession} style={styles.endButton}>
            <X accessible={false} color={colors.danger} size={18} />
            <Text style={styles.endButtonText}>End chat</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((c) => ({
  stage: { width: 282, height: 282, alignItems: 'center', justifyContent: 'center' },
  stageCompact: { width: 220, height: 220 },
  stageMinimal: { width: '100%', height: 104 },
  ring: { position: 'absolute', borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  ringOuter: { width: 278, height: 278 },
  ringOuterCompact: { width: 216, height: 216 },
  ringOuterMinimal: { width: 104, height: 104, opacity: 0.2 },
  ringMiddle: { width: 238, height: 238 },
  ringMiddleCompact: { width: 190, height: 190 },
  ringMiddleMinimal: { width: 96, height: 96, opacity: 0.3 },
  ringInner: { width: 204, height: 204 },
  ringInnerCompact: { width: 164, height: 164 },
  ringInnerMinimal: { width: 88, height: 88, opacity: 0.4 },
  ringInnerRecording: { borderWidth: 1.5, borderColor: c.brand },
  orb: { width: 168, height: 168, borderRadius: radius.pill, backgroundColor: c.orb, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: c.orb, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 34, elevation: 8 },
  orbCompact: { width: 148, height: 148 },
  orbMinimal: { width: 88, height: 88, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 4 },
  orbActive: { backgroundColor: c.orbActive, shadowOpacity: 0.56 },
  orbRecording: { backgroundColor: c.orbRecording },
  orbHighlight: { position: 'absolute', width: 122, height: 122, top: -34, left: -20, borderRadius: radius.pill, backgroundColor: 'rgba(255, 255, 255, 0.17)' },
  orbGlyph: { color: c.white, fontSize: 60, lineHeight: 72, fontWeight: '900' },
  orbGlyphMinimal: { fontSize: 32, lineHeight: 38 },
  endRow: { alignSelf: 'stretch', alignItems: 'center', paddingTop: spacing.sm },
  endButton: { minWidth: 140, minHeight: 48, maxWidth: '100%', borderRadius: radius.pill, backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.dangerLine, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  endButtonText: { minWidth: 0, flexShrink: 1, color: c.danger, fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.5 },
}));
