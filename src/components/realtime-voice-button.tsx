import { Mic, Send, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
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

import { useRealtimeConversation, type RealtimeInputTranscript, type RealtimeTranscriptUpdate, type RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { hapticSelect, hapticStartRecording, hapticTap } from '@/lib/haptics';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import type { AshaResponseLanguage } from '@/state/app-state-types';

type Props = {
  clientId: string;
  compact?: boolean;
  disabled?: boolean;
  /** A compact, single-orb treatment for dense conversation headers. */
  size?: 'regular' | 'minimal';
  onError: (message: string) => void;
  onInputTranscriptComplete?: (result: RealtimeInputTranscript) => void;
  /** Shares this exact control's turn action with a companion UI surface. */
  onTurnActionReady?: (action: (() => void) | null) => void;
  onStatusChange?: (status: RealtimeVoiceStatus) => void;
  onTranscriptChange?: (update: RealtimeTranscriptUpdate) => void;
  onTurnComplete: (turn: { transcript: string; reply: string; language: 'en' | 'hi' }) => void;
  responseLanguage?: AshaResponseLanguage;
};

const labels = {
  disconnected: 'Start a voice conversation',
  connecting: 'Connecting…',
  ready: 'Speak',
  recording: 'Send turn',
  responding: 'Asha is speaking…',
} as const;

const BREATH_MS = 2_600;
const RING_MS = 1_900;
const THROB_MS = 700;

/**
 * Animates the orb by status: a slow breath while ready, rings that ripple
 * outward while recording, and a quick throb while Asha responds. All motion
 * lives on wrapper views so the Pressable keeps its static hit-target styles.
 */
function useOrbMotion(status: RealtimeVoiceStatus) {
  const reducedMotion = useReducedMotion();
  const breath = useSharedValue(1);
  const ripple = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(breath);
    cancelAnimation(ripple);
    if (reducedMotion) {
      breath.value = withTiming(1, { duration: 180 });
      ripple.value = withTiming(status === 'recording' ? 1 : 0, { duration: 180 });
      return;
    }
    if (status === 'ready' || status === 'connecting') {
      ripple.value = withTiming(0, { duration: 220 });
      breath.value = withRepeat(
        withSequence(
          withTiming(1.045, { duration: BREATH_MS / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: BREATH_MS / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
      return;
    }
    if (status === 'recording') {
      breath.value = withTiming(1.04, { duration: 220 });
      ripple.value = 0;
      ripple.value = withRepeat(withTiming(1, { duration: RING_MS, easing: Easing.out(Easing.quad) }), -1);
      return;
    }
    if (status === 'responding') {
      ripple.value = withTiming(0, { duration: 220 });
      breath.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: THROB_MS / 2, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.99, { duration: THROB_MS / 2, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
      return;
    }
    breath.value = withTiming(1, { duration: 260 });
    ripple.value = withTiming(0, { duration: 260 });
    return undefined;
  }, [breath, reducedMotion, ripple, status]);

  useEffect(() => () => {
    cancelAnimation(breath);
    cancelAnimation(ripple);
  }, [breath, ripple]);

  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.value }] }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: 0.85 - ripple.value * 0.65,
    transform: [{ scale: 1 + ripple.value * 0.18 }],
  }));

  return { orbStyle, rippleStyle };
}

export function RealtimeVoiceButton({ clientId, compact = false, disabled = false, size = 'regular', onError, onInputTranscriptComplete, onTurnActionReady, onStatusChange, onTranscriptChange, onTurnComplete, responseLanguage = 'en' }: Props) {
  const voice = useRealtimeConversation({ clientId, onError, onInputTranscriptComplete, onTranscriptChange, onTurnComplete, responseLanguage });
  const onStatusChangeRef = useRef(onStatusChange);
  const blocked = disabled || voice.status === 'connecting' || voice.status === 'responding';
  const connected = voice.status !== 'disconnected';
  const styles = useStyles();
  const { colors } = useTheme();
  const { orbStyle, rippleStyle } = useOrbMotion(voice.status);
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
    if (voice.status === 'recording') {
      hapticTap();
      void Promise.resolve().then(voice.finishTurn).catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Live voice practice failed.'));
      return;
    }
    // Starting WebRTC reconfigures the native audio session. Keep the initial
    // connection free of simultaneous UI-sound/haptic work; on iOS that can
    // deadlock RemoteIO while the peer applies its remote audio description.
    // Once connected, starting later turns is safe to acknowledge haptically.
    if (voice.status === 'ready') hapticStartRecording();
    void voice.startTurn().catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Live voice practice failed.'));
  }, [blocked, onError, voice]);

  useEffect(() => {
    onTurnActionReady?.(press);
    return () => onTurnActionReady?.(null);
  }, [onTurnActionReady, press]);

  const endSession = useCallback(() => {
    hapticSelect();
    voice.disconnect();
  }, [voice]);

  return (
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
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked }}
          disabled={blocked}
          onPress={press}
          style={[styles.orb, compact && styles.orbCompact, minimal && styles.orbMinimal, connected && styles.orbActive, voice.status === 'recording' && styles.orbRecording, blocked && styles.disabled]}
          testID="realtime-voice-orb"
        >
          <View style={styles.orbHighlight} />
          {voice.status === 'ready'
            ? <Mic color={colors.white} size={voiceIconSize} />
            : voice.status === 'recording'
              ? <Send color={colors.white} size={voiceIconSize} />
              : <Text style={[styles.orbGlyph, minimal && styles.orbGlyphMinimal]}>आ</Text>}
        </Pressable>
      </Animated.View>
      {connected ? (
        <Pressable accessibilityLabel="End live voice session" accessibilityRole="button" onPress={endSession} style={[styles.endButton, compact && styles.endButtonCompact, minimal && styles.endButtonMinimal]}>
          <X color={colors.white} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  stage: { width: 282, height: 282, alignItems: 'center', justifyContent: 'center' },
  stageCompact: { width: 220, height: 220 },
  stageMinimal: { width: 144, height: 104 },
  ring: { position: 'absolute', borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  ringOuter: { width: 278, height: 278 },
  ringOuterCompact: { width: 216, height: 216 },
  ringOuterMinimal: { width: 96, height: 96, opacity: 0.8 },
  ringMiddle: { width: 238, height: 238 },
  ringMiddleCompact: { width: 190, height: 190 },
  ringMiddleMinimal: { width: 88, height: 88, opacity: 0.85 },
  ringInner: { width: 204, height: 204 },
  ringInnerCompact: { width: 164, height: 164 },
  ringInnerMinimal: { width: 80, height: 80, opacity: 0.9 },
  ringInnerRecording: { borderWidth: 1.5, borderColor: c.brand },
  orb: { width: 168, height: 168, borderRadius: radius.pill, backgroundColor: c.orb, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: c.orb, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 34, elevation: 8 },
  orbCompact: { width: 148, height: 148 },
  orbMinimal: { width: 88, height: 88, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 4 },
  orbActive: { backgroundColor: c.orbActive, shadowOpacity: 0.56 },
  orbRecording: { backgroundColor: c.orbRecording },
  orbHighlight: { position: 'absolute', width: 122, height: 122, top: -34, left: -20, borderRadius: radius.pill, backgroundColor: 'rgba(255, 255, 255, 0.17)' },
  orbGlyph: { color: c.white, fontSize: 60, lineHeight: 72, fontWeight: '900' },
  orbGlyphMinimal: { fontSize: 32, lineHeight: 38 },
  endButton: { position: 'absolute', right: 0, top: '50%', marginTop: -24, width: 48, height: 48, borderRadius: radius.pill, backgroundColor: c.danger, borderWidth: 1, borderColor: c.danger, alignItems: 'center', justifyContent: 'center' },
  endButtonCompact: { right: -spacing.lg },
  endButtonMinimal: { right: -32, top: '50%', marginTop: -24 },
  disabled: { opacity: 0.5 },
}));
