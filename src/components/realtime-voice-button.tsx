import { Mic, Send, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useRealtimeConversation, type RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { colors, radius, spacing } from '@/theme';
import type { MiraResponseLanguage } from '@/state/app-state-types';

type Props = {
  clientId: string;
  compact?: boolean;
  disabled?: boolean;
  onError: (message: string) => void;
  onStatusChange?: (status: RealtimeVoiceStatus) => void;
  onTurnComplete: (turn: { transcript: string; reply: string; language: 'en' | 'hi' }) => void;
  responseLanguage?: MiraResponseLanguage;
};

const labels = {
  disconnected: 'Start a voice conversation',
  connecting: 'Connecting…',
  ready: 'Speak',
  recording: 'Send turn',
  responding: 'Mira is speaking…',
} as const;

export function RealtimeVoiceButton({ clientId, compact = false, disabled = false, onError, onStatusChange, onTurnComplete, responseLanguage = 'en' }: Props) {
  const voice = useRealtimeConversation({ clientId, onError, onTurnComplete, responseLanguage });
  const onStatusChangeRef = useRef(onStatusChange);
  const blocked = disabled || voice.status === 'connecting' || voice.status === 'responding';
  const connected = voice.status !== 'disconnected';

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onStatusChange?.(voice.status);
  }, [onStatusChange, voice.status]);

  useEffect(() => () => onStatusChangeRef.current?.('disconnected'), []);

  const press = useCallback(() => {
    if (blocked) return;
    const action = voice.status === 'recording' ? Promise.resolve().then(voice.finishTurn) : voice.startTurn();
    void action.catch((cause: unknown) => onError(cause instanceof Error ? cause.message : 'Live voice practice failed.'));
  }, [blocked, onError, voice]);

  return (
    <View style={[styles.stage, compact && styles.stageCompact]} testID="realtime-voice-stage">
      <View style={[styles.ring, styles.ringOuter, compact && styles.ringOuterCompact]} />
      <View style={[styles.ring, styles.ringMiddle, compact && styles.ringMiddleCompact]} />
      <View style={[styles.ring, styles.ringInner, compact && styles.ringInnerCompact]} />
      <Pressable
        accessibilityLabel={labels[voice.status]}
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked }}
        disabled={blocked}
        onPress={press}
        style={[styles.orb, compact && styles.orbCompact, connected && styles.orbActive, voice.status === 'recording' && styles.orbRecording, blocked && styles.disabled]}
      >
        <View style={styles.orbHighlight} />
        {voice.status === 'ready'
          ? <Mic color={colors.white} size={52} />
          : voice.status === 'recording'
            ? <Send color={colors.white} size={52} />
            : <Text style={styles.orbGlyph}>मि</Text>}
      </Pressable>
      {connected ? (
        <Pressable accessibilityLabel="End live voice session" accessibilityRole="button" onPress={voice.disconnect} style={[styles.endButton, compact && styles.endButtonCompact]}>
          <X color={colors.white} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

const orbColor = '#E76B48';

const styles = StyleSheet.create({
  stage: { width: 282, height: 282, alignItems: 'center', justifyContent: 'center' },
  stageCompact: { width: 220, height: 220 },
  ring: { position: 'absolute', borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255, 255, 255, 0.14)' },
  ringOuter: { width: 278, height: 278 },
  ringOuterCompact: { width: 216, height: 216 },
  ringMiddle: { width: 238, height: 238 },
  ringMiddleCompact: { width: 190, height: 190 },
  ringInner: { width: 204, height: 204 },
  ringInnerCompact: { width: 164, height: 164 },
  orb: { width: 168, height: 168, borderRadius: radius.pill, backgroundColor: orbColor, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: orbColor, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 34, elevation: 8 },
  orbCompact: { width: 148, height: 148 },
  orbActive: { backgroundColor: '#D85F3D', shadowOpacity: 0.56 },
  orbRecording: { backgroundColor: '#C95335', transform: [{ scale: 1.04 }] },
  orbHighlight: { position: 'absolute', width: 122, height: 122, top: -34, left: -20, borderRadius: radius.pill, backgroundColor: 'rgba(255, 255, 255, 0.17)' },
  orbGlyph: { color: colors.white, fontSize: 60, lineHeight: 72, fontWeight: '900' },
  endButton: { position: 'absolute', right: 0, top: '50%', marginTop: -24, width: 48, height: 48, borderRadius: radius.pill, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255, 255, 255, 0.18)', alignItems: 'center', justifyContent: 'center' },
  endButtonCompact: { right: -spacing.lg },
  disabled: { opacity: 0.5 },
});
