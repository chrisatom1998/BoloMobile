import { CircleStop, Gauge, Languages, Mic, MicOff, RotateCcw, Save } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAshaLiveConversation, type AshaTranscriptFragment } from '@/hooks/use-asha-live-conversation';
import type { AshaMode, AshaSessionContext } from '@/lib/asha-live-session';
import { ASHA_MODES } from '@/lib/asha-live-session';
import type { AshaNativeToolExecutor } from '@/lib/asha-native-tools';
import { displayHindiTranscript } from '@/lib/learner-phrase-display';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

type Props = {
  clientId: string;
  context: AshaSessionContext;
  disabled?: boolean;
  executeTool?: AshaNativeToolExecutor;
  initialMode?: AshaMode;
  onError: (message: string) => void;
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding') => void;
  onSavePhraseRequest?: (text: string) => void;
  onTranscriptChange?: (update: { speaker: 'you' | 'asha'; text: string }) => void;
  onTurnComplete?: (turn: { transcript: string; reply: string; language: 'hi' }) => void;
};

const MODE_LABELS: Record<AshaMode, string> = {
  'hindi-immersion': 'Hindi only',
  'hindi-english-help': 'English help',
  beginner: 'Beginner',
  conversation: 'Conversation',
  lesson: 'Lesson',
};

const STATUS_LABELS = {
  disconnected: 'Ready to start',
  connecting: 'Connecting securely…',
  listening: 'Listening',
  thinking: 'Checking lesson information…',
  speaking: 'Asha is speaking',
  reconnecting: 'Reconnecting…',
} as const;

function legacyStatus(status: keyof typeof STATUS_LABELS) {
  if (status === 'connecting' || status === 'reconnecting') return 'connecting' as const;
  if (status === 'speaking') return 'responding' as const;
  if (status === 'listening') return 'recording' as const;
  if (status === 'thinking') return 'responding' as const;
  return 'disconnected' as const;
}

export function AshaLivePanel({
  clientId,
  context,
  disabled = false,
  executeTool,
  initialMode = 'hindi-english-help',
  onError,
  onSavePhraseRequest,
  onStatusChange,
  onTranscriptChange,
  onTurnComplete,
}: Props) {
  const [mode, setMode] = useState<AshaMode>(initialMode);
  const [fragments, setFragments] = useState<AshaTranscriptFragment[]>([]);
  const [showRomanization, setShowRomanization] = useState(true);
  const [showEnglishMeaning, setShowEnglishMeaning] = useState(false);
  const [recap, setRecap] = useState<string | null>(null);
  const fragmentsRef = useRef<AshaTranscriptFragment[]>([]);
  const styles = useStyles();
  const { colors } = useTheme();

  const recordFragment = useCallback((fragment: AshaTranscriptFragment) => {
    const next = [...fragmentsRef.current, fragment];
    fragmentsRef.current = next;
    setFragments(next);
    const fullText = next.filter((item) => item.speaker === fragment.speaker).map((item) => item.text).join('');
    onTranscriptChange?.({ speaker: fragment.speaker, text: fullText });
  }, [onTranscriptChange]);

  const voice = useAshaLiveConversation({ clientId, context, executeTool, mode, onError, onTranscript: recordFragment });
  const connected = voice.status !== 'disconnected' && voice.status !== 'connecting';

  useEffect(() => {
    onStatusChange?.(legacyStatus(voice.status));
  }, [onStatusChange, voice.status]);

  const start = useCallback(async () => {
    setRecap(null);
    fragmentsRef.current = [];
    setFragments([]);
    try {
      await voice.connect();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Asha could not start the live conversation.';
      onError(message);
    }
  }, [onError, voice]);

  const end = useCallback(async () => {
    const completed = fragmentsRef.current;
    const learnerText = completed.filter((item) => item.speaker === 'you').map((item) => item.text).join('').trim();
    const ashaText = completed.filter((item) => item.speaker === 'asha').map((item) => item.text).join('').trim();
    const backendRecap = await voice.createRecap();
    await voice.disconnect();
    if (learnerText || ashaText) {
      if (backendRecap && typeof backendRecap === 'object') {
        const value = backendRecap as Record<string, unknown>;
        const practiced = Array.isArray(value.practicedPhrases) ? value.practicedPhrases.filter((item): item is string => typeof item === 'string') : [];
        const corrections = Array.isArray(value.corrections) ? value.corrections.filter((item): item is string => typeof item === 'string') : [];
        const progress = typeof value.progress === 'string' ? value.progress : 'Only confirmed progress updates were kept.';
        setRecap([
          `Practiced phrases: ${practiced.join(' · ') || learnerText || 'None recorded'}`,
          `Useful corrections: ${corrections.join(' · ') || 'None recorded'}`,
          `Progress: ${progress}`,
        ].join('\n'));
      } else {
        setRecap([
          `Practiced phrases: ${learnerText || 'None recorded'}`,
          'Useful corrections: recap unavailable',
          'Progress: only backend-confirmed updates were kept.',
        ].join('\n'));
      }
      if (learnerText && ashaText) onTurnComplete?.({ transcript: learnerText, reply: ashaText, language: 'hi' });
    }
  }, [onTurnComplete, voice]);

  const clearTranscript = useCallback(() => {
    fragmentsRef.current = [];
    setFragments([]);
    setRecap(null);
    onTranscriptChange?.({ speaker: 'you', text: '' });
    onTranscriptChange?.({ speaker: 'asha', text: '' });
  }, [onTranscriptChange]);

  const transcriptRows = useMemo(() => {
    const grouped = fragments.reduce<AshaTranscriptFragment[]>((rows, fragment) => {
      const previous = rows.at(-1);
      const isContiguous = previous?.speaker === fragment.speaker
        && (previous.endMs === undefined || fragment.startMs === undefined || fragment.startMs - previous.endMs <= 1_500);
      if (previous && isContiguous) {
        rows[rows.length - 1] = {
          ...previous,
          endMs: fragment.endMs ?? previous.endMs,
          eventId: `${previous.eventId}:${fragment.eventId}`,
          text: `${previous.text}${fragment.text}`,
        };
      } else rows.push(fragment);
      return rows;
    }, []);
    return grouped.map((fragment) => {
      const devanagari = fragment.text;
      const hasHindi = /[\u0900-\u097f]/u.test(devanagari);
      const romanization = fragment.speaker === 'asha' && hasHindi && showRomanization
        ? displayHindiTranscript(devanagari)
        : '';
      return { ...fragment, devanagari, romanization };
    });
  }, [fragments, showRomanization]);

  return (
    <View style={styles.container} testID="asha-live-panel">
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, connected && styles.statusDotActive]} />
        <Text accessibilityLiveRegion="polite" style={styles.statusText}>{STATUS_LABELS[voice.status]}</Text>
        {voice.backendLoading ? <Text style={styles.backendLabel}>Lesson tools loading</Text> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeRow}>
        {ASHA_MODES.map((item) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: connected, selected: mode === item }}
            disabled={connected}
            key={item}
            onPress={() => setMode(item)}
            style={[styles.modeChip, mode === item && styles.modeChipSelected, connected && styles.disabled]}
          >
            <Text style={[styles.modeText, mode === item && styles.modeTextSelected]}>{MODE_LABELS[item]}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!connected ? (
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || voice.status === 'connecting' }} disabled={disabled || voice.status === 'connecting'} onPress={() => void start()} style={[styles.primaryButton, disabled && styles.disabled]} testID="asha-start-conversation">
          <Mic color={colors.white} size={20} />
          <Text style={styles.primaryButtonText}>Start Conversation</Text>
        </Pressable>
      ) : (
        <View style={styles.controlRow}>
          <Pressable accessibilityLabel={voice.muted ? 'Unmute microphone' : 'Mute microphone'} accessibilityRole="button" onPress={voice.toggleMute} style={styles.controlButton} testID="asha-mute">
            {voice.muted ? <MicOff color={colors.ink} size={19} /> : <Mic color={colors.ink} size={19} />}
            <Text style={styles.controlText}>{voice.muted ? 'Unmute' : 'Mute'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={voice.interrupt} style={styles.controlButton} testID="asha-interrupt">
            <CircleStop color={colors.gold} size={19} />
            <Text style={styles.controlText}>Interrupt</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void end()} style={[styles.controlButton, styles.endButton]} testID="asha-end-chat">
            <CircleStop color={colors.danger} size={19} />
            <Text style={styles.controlText}>End Chat</Text>
          </Pressable>
        </View>
      )}

      {connected ? (
        <View style={styles.actionRow}>
          <Pressable onPress={() => {
            const latest = [...transcriptRows].reverse().find((item) => item.speaker === 'asha')?.text;
            if (latest) onSavePhraseRequest?.(latest);
            else onError('Wait for an Asha phrase before saving.');
          }} style={styles.actionButton}><Save color={colors.muted} size={16} /><Text style={styles.actionText}>Save Phrase</Text></Pressable>
          <Pressable onPress={() => voice.sendGuidance('Repeat your latest Hindi reply once, clearly.')} style={styles.actionButton}><RotateCcw color={colors.muted} size={16} /><Text style={styles.actionText}>Hear Again</Text></Pressable>
          <Pressable onPress={() => voice.sendGuidance('Speak more slowly from now on, with short sentences and thinking pauses.')} style={styles.actionButton}><Gauge color={colors.muted} size={16} /><Text style={styles.actionText}>Speak Slower</Text></Pressable>
          <Pressable onPress={() => voice.sendGuidance('Briefly explain the difficult part in English, then return to Hindi.')} style={styles.actionButton}><Languages color={colors.muted} size={16} /><Text style={styles.actionText}>Explain</Text></Pressable>
        </View>
      ) : null}

      <View style={styles.displayRow}>
        <Pressable onPress={() => setShowRomanization((value) => !value)} style={styles.displayButton}><Text style={styles.displayText}>{showRomanization ? 'Hide' : 'Show'} Romanization</Text></Pressable>
        <Pressable onPress={() => {
          const next = !showEnglishMeaning;
          setShowEnglishMeaning(next);
          if (connected && next) voice.sendGuidance('Include one short English meaning after each Hindi reply until the learner asks to stop.');
        }} style={styles.displayButton}><Text style={styles.displayText}>{showEnglishMeaning ? 'Hide' : 'Show'} English meaning</Text></Pressable>
      </View>
      {showEnglishMeaning ? <Text style={styles.meaningHint}>Short English meanings are included in Asha’s visible live captions.</Text> : null}

      {transcriptRows.length ? (
        <View style={styles.transcript}>
          {transcriptRows.slice(-12).map((row) => (
            <View key={row.eventId} style={styles.transcriptRow}>
              <Text style={styles.speaker}>{row.speaker === 'you' ? 'You' : 'Asha'}</Text>
              <Text selectable style={styles.devanagari}>{row.devanagari}</Text>
              {row.romanization && row.romanization !== row.devanagari ? <Text selectable style={styles.romanization}>{row.romanization}</Text> : null}
            </View>
          ))}
          <Pressable accessibilityRole="button" onPress={clearTranscript} style={styles.clearButton}><Text style={styles.clearText}>Delete transcript</Text></Pressable>
        </View>
      ) : null}

      {recap ? <View style={styles.recap}><Text style={styles.recapTitle}>Session recap</Text><Text selectable style={styles.recapText}>{recap}</Text></View> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: { width: '100%', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.paperRaised, borderWidth: 1, borderColor: c.line },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  statusDot: { width: 9, height: 9, borderRadius: radius.pill, backgroundColor: c.muted },
  statusDotActive: { backgroundColor: c.success },
  statusText: { color: c.ink, fontWeight: '700', flexGrow: 1 },
  backendLabel: { color: c.brand, fontSize: 12, fontWeight: '700' },
  modeRow: { gap: spacing.xs },
  modeChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line },
  modeChipSelected: { backgroundColor: c.brandSoft, borderColor: c.brand },
  modeText: { color: c.muted, fontSize: 12, fontWeight: '700' },
  modeTextSelected: { color: c.brand },
  primaryButton: { minHeight: 48, borderRadius: radius.lg, backgroundColor: c.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  primaryButtonText: { color: c.white, fontWeight: '800' },
  controlRow: { flexDirection: 'row', gap: spacing.sm },
  controlButton: { flex: 1, minHeight: 48, borderRadius: radius.lg, backgroundColor: c.paper, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.xs },
  endButton: { borderColor: c.dangerLine, backgroundColor: c.dangerSoft },
  controlText: { color: c.ink, fontWeight: '700', fontSize: 12 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actionButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: c.paper, borderWidth: 1, borderColor: c.line },
  actionText: { color: c.muted, fontSize: 12, fontWeight: '700' },
  displayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  displayButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  displayText: { color: c.brand, fontSize: 12, fontWeight: '700' },
  meaningHint: { color: c.muted, fontSize: 12, lineHeight: 18 },
  transcript: { gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.line },
  transcriptRow: { gap: 2 },
  speaker: { color: c.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  devanagari: { color: c.ink, fontSize: 16, lineHeight: 24 },
  romanization: { color: c.muted, fontSize: 13, fontStyle: 'italic' },
  clearButton: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  clearText: { color: c.danger, fontSize: 12, fontWeight: '700' },
  recap: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.brandSoft },
  recapTitle: { color: c.brand, fontWeight: '800' },
  recapText: { color: c.ink, fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.45 },
}));
