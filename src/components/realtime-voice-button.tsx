import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { Mic, MicOff, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
import type { AshaSessionEndReason, AshaSessionEvent } from '@/lib/asha-session-log';
import { boloApiErrorKind, type BoloApiErrorKind } from '@/services/bolo-api';
import { useRealtimeConversation, type LiveSessionSetup, type LiveTranscriptRow, type RealtimeInputTranscript, type RealtimeTranscriptUpdate, type RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { hapticSelect, hapticStartRecording, hapticTap } from '@/lib/haptics';
import { ensureLiveMicrophone, type LiveMicrophonePhase } from '@/lib/live-microphone';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import type { AshaResponseLanguage, ChatMessage } from '@/state/app-state-types';

type Props = {
  clientId: string;
  history?: Pick<ChatMessage, 'role' | 'text'>[];
  /** Startup-only mode, lesson context, and client tools for each new session. */
  liveSession?: () => LiveSessionSetup | null;
  /** Awaited once before a new connection; not called when muting or unmuting. */
  onConnectionStart?: (signal: AbortSignal) => void | Promise<void>;
  onTranscriptSnapshot?: (rows: LiveTranscriptRow[]) => void;
  compact?: boolean;
  disabled?: boolean;
  enabled?: boolean;
  motionMode?: EffectiveMotion;
  /**
   * `minimal` is a compact, single-orb treatment for dense conversation headers.
   * `portrait` makes `children` (Asha's portrait) the tap-to-talk control itself,
   * with the status rings and pulses applied around it instead of a separate orb.
   * `avatar` is that same control at the compact header size, without the rings.
   */
  size?: 'regular' | 'minimal' | 'portrait' | 'avatar';
  /** The face rendered inside the control when `size` is `portrait`. */
  children?: ReactNode;
  /** `dark` renders the saffron orb for the night-coloured Asha screen. Styling only. */
  tone?: 'light' | 'dark';
  /** `details.kind` carries the typed Bolo API failure so screens never classify by message text. */
  onError: (message: string, details?: RealtimeErrorDetails) => void;
  /** False while the hosting screen is out of view; a microphone check still pending then never starts a session. */
  active?: boolean;
  /** Reports the pre-prompt explainer and a denial that should offer Settings. */
  onMicrophonePhase?: (phase: LiveMicrophonePhase) => void;
  onInputTranscriptComplete?: (result: RealtimeInputTranscript) => void;
  /** Session start, ready, and end for the on-device session log. Only used when this control owns the session. */
  onSessionEvent?: (event: AshaSessionEvent) => void;
  /** Shares this exact control's session teardown with the hosting screen. */
  onDisconnectReady?: (disconnect: ((reason?: AshaSessionEndReason) => void) | null) => void;
  /** Shares this exact control's turn action with a companion UI surface. */
  onTurnActionReady?: (action: (() => void) | null) => void;
  onStatusChange?: (status: RealtimeVoiceStatus) => void;
  onTranscriptChange?: (update: RealtimeTranscriptUpdate) => void;
  onTurnComplete?: (turn: { transcript: string; reply: string; language: 'en' | 'hi' }) => void;
  responseLanguage?: AshaResponseLanguage;
  /**
   * When set, this control renders an existing session instead of owning one.
   * Floating Asha keeps that session above the navigator.
   */
  voice?: RealtimeVoiceControls;
};

export type RealtimeErrorDetails = { kind?: BoloApiErrorKind };

export type RealtimeVoiceControls = {
  disconnect: (reason?: AshaSessionEndReason) => void;
  finishTurn: () => void | Promise<void>;
  startTurn: () => Promise<void>;
  status: RealtimeVoiceStatus;
  microphoneEnabled: boolean;
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
 * Reduce Motion holds the listening ring at rest. Ring opacity is
 * `0.85 * (1 - ripple)`, so any ripple above 0 makes the ring dimmer exactly
 * when it should show that the microphone is on. The recording border carries
 * that state instead.
 */
export function reducedMotionRipple(_status: RealtimeVoiceStatus) {
  return 0;
}

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
      ripple.value = reducedMotionRipple(status);
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

/** Keeps the typed API failure next to its message; non-API errors (microphone, peer, startup) carry no kind. */
function errorDetails(cause: unknown): RealtimeErrorDetails {
  const kind = boloApiErrorKind(cause);
  return kind ? { kind } : {};
}

function OwnedRealtimeVoiceButton(props: Props) {
  const { clientId, enabled = true, history, liveSession, onConnectionStart, onError, onInputTranscriptComplete, onSessionEvent, onTranscriptChange, onTranscriptSnapshot, onTurnComplete, responseLanguage = 'en' } = props;
  const voice = useRealtimeConversation({ clientId, enabled, history, liveSession, onConnectionStart, onError, onInputTranscriptComplete, onSessionEvent, onTranscriptChange, onTranscriptSnapshot, onTurnComplete, responseLanguage });
  return <RealtimeVoiceButtonView {...props} owned voice={voice} />;
}

export function RealtimeVoiceButton(props: Props) {
  if (props.voice) return <RealtimeVoiceButtonView {...props} owned={false} voice={props.voice} />;
  return <OwnedRealtimeVoiceButton {...props} />;
}

function RealtimeVoiceButtonView({ active = true, children, compact = false, disabled = false, motionMode = 'gentle', onDisconnectReady, onError, onMicrophonePhase, onStatusChange, onTurnActionReady, owned, size = 'regular', tone = 'light', voice }: Props & { owned: boolean; voice: RealtimeVoiceControls }) {
  const onStatusChangeRef = useRef(onStatusChange);
  const onMicrophonePhaseRef = useRef(onMicrophonePhase);
  const ensuringRef = useRef(false);
  // Bumped whenever a pending start must not go ahead: the screen leaves view,
  // the control is disabled, or it unmounts.
  const startAttemptRef = useRef(0);
  const blocked = disabled || voice.status === 'connecting';
  const connected = voice.status !== 'disconnected';
  const styles = useStyles();
  const { colors } = useTheme();
  const { orbStyle, rippleStyle } = useOrbMotion(voice.status, motionMode);
  const minimal = size === 'minimal';
  const portrait = size === 'portrait';
  const avatar = size === 'avatar';
  const dark = tone === 'dark';
  const voiceIconSize = minimal ? 32 : 52;
  const iconColor = dark ? colors.ink : colors.white;

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onMicrophonePhaseRef.current = onMicrophonePhase;
  }, [onMicrophonePhase]);

  useEffect(() => {
    if (active && !disabled) return undefined;
    startAttemptRef.current += 1;
    return undefined;
  }, [active, disabled]);

  useEffect(() => () => {
    startAttemptRef.current += 1;
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void getRecordingPermissionsAsync().then((permission) => {
        if (permission.granted) onMicrophonePhaseRef.current?.('idle');
      }).catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    onStatusChange?.(voice.status);
  }, [onStatusChange, voice.status]);

  useEffect(() => {
    if (!owned) return undefined;
    return () => onStatusChangeRef.current?.('disconnected');
  }, [owned]);

  const press = useCallback(() => {
    if (blocked) return;
    if (voice.microphoneEnabled) {
      hapticTap();
      void Promise.resolve().then(voice.finishTurn).catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Live voice practice failed.', errorDetails(cause)));
      return;
    }
    // Starting WebRTC reconfigures the native audio session. Keep the initial
    // connection free of simultaneous UI-sound/haptic work; on iOS that can
    // deadlock RemoteIO while the peer applies its remote audio description.
    // Once connected, starting later turns is safe to acknowledge haptically.
    if (voice.status === 'ready' || voice.status === 'responding') hapticStartRecording();
    return (async () => {
      if (voice.status === 'disconnected') {
        if (ensuringRef.current) return;
        ensuringRef.current = true;
        const attempt = ++startAttemptRef.current;
        try {
          const allowed = await ensureLiveMicrophone({
            getPermission: () => getRecordingPermissionsAsync(),
            requestPermission: () => requestRecordingPermissionsAsync(),
            onPhase: (phase) => onMicrophonePhaseRef.current?.(phase),
          });
          if (!allowed) return;
          // The learner left the screen or the control was disabled while the
          // permission check ran; starting now would open the mic off-screen.
          if (attempt !== startAttemptRef.current) {
            onMicrophonePhaseRef.current?.('idle');
            return;
          }
        } finally {
          ensuringRef.current = false;
        }
      }
      await voice.startTurn();
    })().catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Live voice practice failed.', errorDetails(cause)));
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
    hapticSelect();
    voice.disconnect();
  }, [voice]);

  const accessibilityHint = connected ? 'The microphone stays on until you mute it or end the session. You can speak while Asha is speaking.' : 'Starts live conversation with your microphone on.';

  if (avatar) {
    const avatarButton = (
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={voice.status === 'disconnected' ? 'Talk to Asha' : labels[voice.status]}
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked }}
        disabled={blocked}
        onPress={press}
        style={[styles.avatarButton, blocked && styles.disabled]}
        testID="realtime-voice-orb"
      >
        {children}
      </Pressable>
    );
    if (!connected) return avatarButton;
    // Muting keeps the call open, so the compact header still needs its own way to hang up.
    return (
      <View style={styles.avatarRow}>
        {avatarButton}
        <Pressable accessibilityLabel="End live voice session" accessibilityRole="button" onPress={endSession} style={styles.avatarEndButton} testID="realtime-voice-end">
          <X color={colors.white} size={18} />
        </Pressable>
      </View>
    );
  }

  if (portrait) {
    const recording = voice.status === 'recording';
    const StatusIcon = recording ? MicOff : Mic;
    return (
      <View style={[styles.stage, styles.stagePortrait, compact && styles.stagePortraitCompact]} testID="realtime-voice-stage">
        <View pointerEvents="none" style={[styles.ring, styles.portraitRingOuter, compact && styles.portraitRingOuterCompact, connected && styles.portraitRingConnected]} />
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, styles.portraitRingInner, compact && styles.portraitRingInnerCompact, recording && styles.portraitRingRecording, rippleStyle]}
          testID="realtime-voice-portrait-ring"
        />
        <Animated.View style={orbStyle}>
          <Pressable
            accessibilityLabel={voice.status === 'disconnected' ? 'Talk to Asha' : labels[voice.status]}
            accessibilityHint={accessibilityHint}
            accessibilityRole="button"
            accessibilityState={{ disabled: blocked }}
            disabled={blocked}
            onPress={press}
            style={[styles.portraitButton, compact && styles.portraitButtonCompact, blocked && styles.disabled]}
            testID="realtime-voice-orb"
          >
            {children}
            <View
              pointerEvents="none"
              style={[styles.portraitBadge, compact && styles.portraitBadgeCompact, recording && styles.portraitBadgeRecording, voice.status === 'connecting' && styles.portraitBadgeConnecting]}
              testID="realtime-voice-portrait-badge"
            >
              <StatusIcon color={recording ? colors.white : colors.ink} size={compact ? 15 : 17} strokeWidth={2.4} />
            </View>
          </Pressable>
        </Animated.View>
        {connected ? (
          <Pressable accessibilityLabel="End live voice session" accessibilityRole="button" onPress={endSession} style={[styles.endButton, styles.endButtonDark, styles.endButtonPortrait]}>
            <X color={colors.white} size={18} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.stage, compact && styles.stageCompact, minimal && styles.stageMinimal]} testID="realtime-voice-stage">
      <View style={[styles.ring, styles.ringOuter, compact && styles.ringOuterCompact, minimal && styles.ringOuterMinimal, dark && styles.ringDark]} />
      <View style={[styles.ring, styles.ringMiddle, compact && styles.ringMiddleCompact, minimal && styles.ringMiddleMinimal, dark && styles.ringDark]} />
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, styles.ringInner, compact && styles.ringInnerCompact, minimal && styles.ringInnerMinimal, dark && styles.ringDark, voice.status === 'recording' && (dark ? styles.ringInnerRecordingDark : styles.ringInnerRecording), rippleStyle]}
      />
      <Animated.View style={orbStyle}>
        <Pressable
          accessibilityLabel={labels[voice.status]}
          accessibilityHint={accessibilityHint}
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked }}
          disabled={blocked}
          onPress={press}
          style={[styles.orb, compact && styles.orbCompact, minimal && styles.orbMinimal, dark && styles.orbDark, connected && (dark ? styles.orbDarkActive : styles.orbActive), voice.status === 'recording' && (dark ? styles.orbDarkRecording : styles.orbRecording), blocked && styles.disabled]}
          testID="realtime-voice-orb"
        >
          <View style={styles.orbHighlight} />
          {voice.status === 'ready' || voice.status === 'responding'
            ? <Mic color={iconColor} size={voiceIconSize} />
            : voice.status === 'recording'
              ? <MicOff color={iconColor} size={voiceIconSize} />
              : <Text style={[styles.orbGlyph, minimal && styles.orbGlyphMinimal, dark && styles.orbGlyphDark]}>आ</Text>}
        </Pressable>
      </Animated.View>
      {connected ? (
        <Pressable accessibilityLabel="End live voice session" accessibilityRole="button" onPress={endSession} style={[styles.endButton, compact && styles.endButtonCompact, minimal && styles.endButtonMinimal, dark && (minimal ? styles.endButtonDarkMinimal : styles.endButtonDark)]}>
          <X color={dark ? colors.white : colors.danger} size={18} />
        </Pressable>
      ) : null}
    </View>
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
  orbHighlight: { position: 'absolute', width: 122, height: 122, top: -34, left: -20, borderRadius: radius.pill, backgroundColor: c.orbHighlight },
  orbGlyph: { color: c.white, fontSize: 60, lineHeight: 72, fontWeight: '700' },  // Exception to the type scale: decorative orb glyph.
  orbGlyphMinimal: { fontSize: 32, lineHeight: 38 },  // Exception: decorative orb glyph.
  endButton: { position: 'absolute', right: 0, top: '50%', marginTop: -24, width: 48, height: 48, borderRadius: radius.pill, backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.dangerLine, alignItems: 'center', justifyContent: 'center' },
  endButtonCompact: { right: -spacing.lg },
  endButtonMinimal: { right: 0, top: 28, marginTop: 0 },
  ringDark: { borderColor: c.orbRingDark },
  ringInnerRecordingDark: { borderWidth: 1.5, borderColor: c.gold },
  orbDark: { backgroundColor: c.gold, shadowColor: c.gold, shadowOpacity: 0.3 },
  orbDarkActive: { backgroundColor: c.gold, shadowOpacity: 0.5 },
  orbDarkRecording: { backgroundColor: c.goldBright },
  orbGlyphDark: { color: c.ink },
  endButtonDark: { width: 52, height: 52, marginTop: -26, backgroundColor: c.nightSurface, borderColor: c.nightLine }, // Negative margins centre the button on the orb.
  // Same center as the 44pt minimal button (top 28 + 22), sized up to 52pt.
  endButtonDarkMinimal: { width: 52, height: 52, top: 24, backgroundColor: c.nightSurface, borderColor: c.nightLine },
  avatarButton: { width: layout.touchTarget, height: layout.touchTarget, borderRadius: radius.pill, overflow: 'hidden' },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatarEndButton: { width: layout.touchTarget, height: layout.touchTarget, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.nightSurface, borderColor: c.nightLine, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // Portrait variant: the 112pt (96pt compact) portrait is the control; rings sit around it.
  stagePortrait: { width: '100%', height: 144 },
  stagePortraitCompact: { height: 124 },
  portraitRingOuter: { width: 144, height: 144, borderWidth: 2, borderColor: c.portraitRingFaint },
  portraitRingOuterCompact: { width: 124, height: 124 },
  portraitRingConnected: { borderColor: c.portraitRing },
  portraitRingInner: { width: 128, height: 128, borderWidth: 2, borderColor: c.portraitRing },
  portraitRingInnerCompact: { width: 110, height: 110 },
  portraitRingRecording: { borderWidth: 3, borderColor: c.gold },
  portraitButton: { width: 112, height: 112, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  portraitButtonCompact: { width: 96, height: 96 },
  portraitBadge: { position: 'absolute', right: 0, bottom: 0, width: 34, height: 34, borderRadius: radius.pill, borderWidth: 3, borderColor: c.night, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  portraitBadgeCompact: { width: 30, height: 30 },
  portraitBadgeRecording: { backgroundColor: c.orbRecording },
  portraitBadgeConnecting: { backgroundColor: c.heroSubtle },
  endButtonPortrait: { right: 0 },
  disabled: { opacity: 0.5 },
}));
