import { CircleStop, Gauge, Languages, Mic, MicOff, RotateCcw, Save } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAshaLiveConversation, type AshaLiveStatus, type AshaTranscriptFragment } from '@/hooks/use-asha-live-conversation';
import type { AshaMode, AshaSessionContext } from '@/lib/asha-live-session';
import { ASHA_MODES } from '@/lib/asha-live-session';
import type { AshaNativeToolExecutor } from '@/lib/asha-native-tools';
import { hapticSelect, hapticTap } from '@/lib/haptics';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

type LegacyStatus = 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding';

type Props = {
  clientId: string;
  compact?: boolean;
  context: AshaSessionContext;
  disabled?: boolean;
  enabled?: boolean;
  executeTool?: AshaNativeToolExecutor;
  initialMode?: AshaMode;
  onError: (message: string) => void;
  onSavePhraseRequest?: (text: string) => void;
  onStatusChange?: (status: LegacyStatus) => void;
  onTranscriptChange?: (update: { speaker: 'you' | 'asha'; text: string }) => void;
  onTurnActionReady?: (action: (() => void) | null) => void;
  onTurnComplete?: (turn: { transcript: string; reply: string; language: 'hi' }) => void;
  size?: 'regular' | 'minimal';
};

const MODE_LABELS: Record<AshaMode, string> = {
  'hindi-immersion': 'Hindi only',
  'hindi-english-help': 'English help',
  beginner: 'Beginner',
  conversation: 'Conversation',
  lesson: 'Lesson',
};

const STATUS_LABELS: Record<AshaLiveStatus, string> = {
  disconnected: '',
  connecting: 'Connecting…',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Asha is speaking',
  reconnecting: 'Reconnecting…',
};

function legacyStatus(status: AshaLiveStatus): LegacyStatus {
  if (status === 'connecting' || status === 'reconnecting') return 'connecting';
  if (status === 'speaking' || status === 'thinking') return 'responding';
  if (status === 'listening') return 'recording';
  return 'disconnected';
}

function groupedRows(fragments: AshaTranscriptFragment[]) {
  return fragments.reduce<AshaTranscriptFragment[]>((rows, fragment) => {
    const previous = rows.at(-1);
    const contiguous = previous?.speaker === fragment.speaker
      && (previous.endMs === undefined || fragment.startMs === undefined || fragment.startMs - previous.endMs <= 1_500);
    if (previous && contiguous) {
      rows[rows.length - 1] = { ...previous, endMs: fragment.endMs ?? previous.endMs, eventId: `${previous.eventId}:${fragment.eventId}`, text: `${previous.text}${fragment.text}` };
    } else rows.push(fragment);
    return rows;
  }, []);
}

export function AshaLivePanel({ clientId, compact = false, context, disabled = false, enabled = true, executeTool, initialMode = 'hindi-english-help', onError, onSavePhraseRequest, onStatusChange, onTranscriptChange, onTurnActionReady, onTurnComplete, size = 'regular' }: Props) {
  const [mode, setMode] = useState<AshaMode>(initialMode);
  const [fragments, setFragments] = useState<AshaTranscriptFragment[]>([]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [recap, setRecap] = useState<string | null>(null);
  const fragmentsRef = useRef<AshaTranscriptFragment[]>([]);
  const styles = useStyles();
  const { colors } = useTheme();

  const recordFragment = useCallback((fragment: AshaTranscriptFragment) => {
    const next = [...fragmentsRef.current, fragment];
    fragmentsRef.current = next;
    setFragments(next);
    const latest = [...groupedRows(next)].reverse().find((row) => row.speaker === fragment.speaker);
    if (latest) onTranscriptChange?.({ speaker: fragment.speaker, text: latest.text });
  }, [onTranscriptChange]);

  const voice = useAshaLiveConversation({ clientId, context, executeTool, mode, onError, onTranscript: recordFragment });
  const disconnectVoice = voice.disconnect;
  const voiceStatus = voice.status;
  const status = legacyStatus(voice.status);
  const connected = voice.status !== 'disconnected' && voice.status !== 'connecting' && voice.status !== 'reconnecting';
  const blocked = disabled || !enabled || voice.status === 'connecting' || voice.status === 'reconnecting';
  const minimal = size === 'minimal';
  const rows = useMemo(() => groupedRows(fragments), [fragments]);

  useEffect(() => onStatusChange?.(status), [onStatusChange, status]);
  useEffect(() => () => onStatusChange?.('disconnected'), [onStatusChange]);
  useEffect(() => {
    if (!enabled && voiceStatus !== 'disconnected') void disconnectVoice();
  }, [disconnectVoice, enabled, voiceStatus]);

  const start = useCallback(async () => {
    fragmentsRef.current = [];
    setFragments([]);
    setRecap(null);
    try {
      await voice.connect();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Asha could not start the live conversation.');
    }
  }, [onError, voice]);

  const pressOrb = useCallback(() => {
    if (blocked) return;
    if (!connected) {
      void start();
      return;
    }
    hapticTap();
    voice.toggleMute();
  }, [blocked, connected, start, voice]);

  useEffect(() => {
    onTurnActionReady?.(pressOrb);
    return () => onTurnActionReady?.(null);
  }, [onTurnActionReady, pressOrb]);

  const end = useCallback(async () => {
    hapticSelect();
    const completed = groupedRows(fragmentsRef.current);
    const learnerText = completed.filter((item) => item.speaker === 'you').map((item) => item.text).join(' ').trim();
    const ashaText = completed.filter((item) => item.speaker === 'asha').map((item) => item.text).join(' ').trim();
    const backendRecap = await voice.createRecap();
    await voice.disconnect();
    if (backendRecap && typeof backendRecap === 'object') {
      const value = backendRecap as Record<string, unknown>;
      const practiced = Array.isArray(value.practicedPhrases) ? value.practicedPhrases.filter((item): item is string => typeof item === 'string') : [];
      const corrections = Array.isArray(value.corrections) ? value.corrections.filter((item): item is string => typeof item === 'string') : [];
      const progress = typeof value.progress === 'string' ? value.progress : 'Only confirmed progress updates were kept.';
      setRecap(`Practiced: ${practiced.join(' · ') || learnerText || 'No phrase recorded'}\nCorrections: ${corrections.join(' · ') || 'None'}\n${progress}`);
    } else if (learnerText || ashaText) {
      setRecap(`Practiced: ${learnerText || 'No phrase recorded'}\nOnly backend-confirmed progress was kept.`);
    }
    if (learnerText && ashaText) onTurnComplete?.({ transcript: learnerText, reply: ashaText, language: 'hi' });
  }, [onTurnComplete, voice]);

  const latestAsha = [...rows].reverse().find((row) => row.speaker === 'asha')?.text;
  const compactStatus = voice.backendLoading
    ? 'Checking lesson information…'
    : STATUS_LABELS[voice.status] || MODE_LABELS[mode];

  return (
    <View style={styles.container} testID="asha-live-panel">
      <View style={[styles.stage, compact && styles.stageCompact, minimal && styles.stageMinimal]}>
        <View style={[styles.ring, styles.ringOuter, minimal && styles.ringOuterMinimal]} />
        <View style={[styles.ring, styles.ringMiddle, minimal && styles.ringMiddleMinimal]} />
        <View style={[styles.ring, styles.ringInner, minimal && styles.ringInnerMinimal, connected && styles.ringActive]} />
        <Pressable
          accessibilityHint={connected ? 'Mutes or unmutes your microphone. You may interrupt Asha from conversation options.' : 'Starts a private live conversation with Asha.'}
          accessibilityLabel={!connected ? 'Start a voice conversation' : voice.muted ? 'Unmute microphone' : 'Mute microphone'}
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked }}
          disabled={blocked}
          onPress={pressOrb}
          style={[styles.orb, minimal && styles.orbMinimal, connected && styles.orbActive, voice.muted && styles.orbMuted, blocked && styles.disabled]}
          testID="realtime-voice-orb"
        >
          <View style={styles.orbHighlight} />
          {!connected ? <Text style={[styles.orbGlyph, minimal && styles.orbGlyphMinimal]}>आ</Text> : voice.muted ? <MicOff color={colors.white} size={minimal ? 32 : 48} /> : <Mic color={colors.white} size={minimal ? 32 : 48} />}
        </Pressable>
        {connected ? <Pressable accessibilityLabel="End live voice session" accessibilityRole="button" onPress={() => void end()} style={[styles.endButton, minimal && styles.endButtonMinimal]} testID="asha-end-chat"><CircleStop color={colors.danger} size={18} /></Pressable> : null}
      </View>

      <View style={styles.summaryRow}>
        <Text accessibilityLiveRegion="polite" style={styles.statusText}>{compactStatus}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: optionsOpen }} onPress={() => setOptionsOpen((value) => !value)} style={styles.optionsButton} testID="asha-conversation-options">
          <Languages color={colors.muted} size={16} />
          <Text style={styles.optionsButtonText}>{optionsOpen ? 'Hide options' : 'Conversation options'}</Text>
        </Pressable>
      </View>

      {optionsOpen ? <View style={styles.optionsPanel} testID="asha-options-panel">
        <Text style={styles.optionsHeading}>Conversation mode</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>
          {ASHA_MODES.map((item) => <Pressable accessibilityRole="button" accessibilityState={{ disabled: connected, selected: mode === item }} disabled={connected} key={item} onPress={() => setMode(item)} style={[styles.modeChip, mode === item && styles.modeChipSelected, connected && styles.disabled]}><Text style={[styles.modeText, mode === item && styles.modeTextSelected]}>{MODE_LABELS[item]}</Text></Pressable>)}
        </ScrollView>
        {connected ? <View style={styles.actionRow}>
          <Action icon={<CircleStop color={colors.gold} size={17} />} label="Interrupt" onPress={voice.interrupt} />
          <Action icon={<Save color={colors.muted} size={17} />} label="Save phrase" onPress={() => latestAsha ? onSavePhraseRequest?.(latestAsha) : onError('Wait for an Asha phrase before saving.')} />
          <Action icon={<RotateCcw color={colors.muted} size={17} />} label="Hear again" onPress={() => voice.sendGuidance('Repeat your latest Hindi reply once, clearly.')} />
          <Action icon={<Gauge color={colors.muted} size={17} />} label="Speak slower" onPress={() => voice.sendGuidance('Speak more slowly from now on, using short sentences and generous thinking pauses.')} />
          <Action icon={<Languages color={colors.muted} size={17} />} label="Explain" onPress={() => voice.sendGuidance('Briefly explain the difficult part in English, then return to Hindi.')} />
        </View> : <Text style={styles.optionsHint}>Choose a mode before starting. You can also ask Asha naturally while speaking.</Text>}
      </View> : null}

      {recap ? <View style={styles.recap}><Text style={styles.recapTitle}>Session recap</Text><Text selectable style={styles.recapText}>{recap}</Text></View> : null}
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  const styles = useStyles();
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.actionButton}>{icon}<Text style={styles.actionText}>{label}</Text></Pressable>;
}

const useStyles = makeStyles((c) => ({
  container: { width: '100%', alignItems: 'center', gap: spacing.sm },
  stage: { width: 282, height: 282, alignItems: 'center', justifyContent: 'center' },
  stageCompact: { width: 220, height: 220 },
  stageMinimal: { width: '100%', height: 104 },
  ring: { position: 'absolute', borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  ringOuter: { width: 278, height: 278 },
  ringMiddle: { width: 238, height: 238 },
  ringInner: { width: 204, height: 204 },
  ringOuterMinimal: { width: 104, height: 104, opacity: 0.2 },
  ringMiddleMinimal: { width: 96, height: 96, opacity: 0.3 },
  ringInnerMinimal: { width: 88, height: 88, opacity: 0.4 },
  ringActive: { borderWidth: 1.5, borderColor: c.brand },
  orb: { width: 168, height: 168, borderRadius: radius.pill, backgroundColor: c.orb, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: c.orb, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 34, elevation: 8 },
  orbMinimal: { width: 88, height: 88, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 4 },
  orbActive: { backgroundColor: c.orbActive, shadowOpacity: 0.56 },
  orbMuted: { backgroundColor: c.orbRecording },
  orbHighlight: { position: 'absolute', width: 122, height: 122, top: -34, left: -20, borderRadius: radius.pill, backgroundColor: 'rgba(255, 255, 255, 0.17)' },
  orbGlyph: { color: c.white, fontSize: 60, lineHeight: 72, fontWeight: '900' },
  orbGlyphMinimal: { fontSize: 32, lineHeight: 38 },
  endButton: { position: 'absolute', right: 0, top: '50%', marginTop: -24, width: 48, height: 48, borderRadius: radius.pill, backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.dangerLine, alignItems: 'center', justifyContent: 'center' },
  endButtonMinimal: { right: 0, top: 28, marginTop: 0 },
  summaryRow: { width: '100%', minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  statusText: { color: c.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', flexShrink: 1 },
  optionsButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.pill },
  optionsButtonText: { color: c.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  optionsPanel: { width: '100%', gap: spacing.sm, paddingTop: spacing.xs },
  optionsHeading: { color: c.ink, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  modeRow: { gap: spacing.xs, paddingRight: spacing.sm },
  modeChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line },
  modeChipSelected: { backgroundColor: c.brandSoft, borderColor: c.brand },
  modeText: { color: c.muted, fontSize: 12, fontWeight: '700' },
  modeTextSelected: { color: c.brand },
  optionsHint: { color: c.muted, fontSize: 12, lineHeight: 18 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actionButton: { minHeight: 44, flexGrow: 1, flexBasis: '30%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.paperRaised },
  actionText: { color: c.ink, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  recap: { width: '100%', gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.paperRaised },
  recapTitle: { color: c.ink, fontWeight: '800' },
  recapText: { color: c.muted, lineHeight: 20 },
  disabled: { opacity: 0.5 },
}));
