import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { ChevronLeft, Cloud, EyeOff, MessageCircle, Mic, Pause, Play, Square, Trash2, Type as TypeIcon, Users } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { useRealtimeConversation, type LiveTranscriptRow } from '@/hooks/use-realtime-conversation';
import { buildReplyContext, formatListeningTime, pairTranslationLines, REPLY_HELP_QUESTION, type TranslationLine } from '@/lib/live-translate';
import { endRealtimeVoiceSession } from '@/lib/voice';
import { LIVE_TRANSLATE_MODE, liveVoiceConfigError, sendMobileChat } from '@/services/bolo-api';
import { useAppState } from '@/state/app-state';
import type { StructuredPhrase } from '@/state/app-state-types';
import { buttons, hindiType, layout, makeStyles, maxContentWidth, radius, spacing, type, useTheme } from '@/theme';

const KEEP_AWAKE_TAG = 'bolo-live-translate';
/** How close to the bottom still counts as "following" the newest line. */
const FOLLOW_SLACK = 96;
const liveTranslateSession = () => ({ mode: LIVE_TRANSLATE_MODE });

export const LIVE_TRANSLATE_NOTES = [
  { icon: Mic, text: 'Your microphone stays on until you tap Stop. Leaving Bolo or locking the phone also stops it.' },
  { icon: Cloud, text: 'What it hears is sent to Bolo and OpenAI to be translated. The audio is not saved.' },
  { icon: EyeOff, text: 'The transcript is not saved either. It clears when you leave this screen.' },
  { icon: Users, text: 'Let the people talking know you are translating.' },
] as const;

type ReplyHelp =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; phrases: StructuredPhrase[]; text: string };

export default function LiveTranslateScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { aiConsent, clientId } = useAppState();
  const configError = liveVoiceConfigError();

  const [rows, setRows] = useState<LiveTranscriptRow[]>([]);
  // Lines from earlier listening sessions on this visit. Each new session starts a fresh transcript.
  const [earlier, setEarlier] = useState<TranslationLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bigText, setBigText] = useState(false);
  const [replies, setReplies] = useState<Record<string, ReplyHelp>>({});
  const [elapsedMs, setElapsedMs] = useState(0);
  const rowsRef = useRef(rows);
  /** Ids of transcript rows removed by Clear while the session kept listening. */
  const clearedRef = useRef(new Set<string>());
  const scrollRef = useRef<ScrollView>(null);
  const followingRef = useRef(true);
  const replyRequestsRef = useRef(new Map<string, AbortController>());

  const current = useMemo(() => pairTranslationLines(rows), [rows]);
  const lines = useMemo(() => [...earlier, ...current], [earlier, current]);

  const archiveCurrent = useCallback(() => {
    const finished = pairTranslationLines(rowsRef.current).filter((line) => line.hindi || line.english);
    rowsRef.current = [];
    // A new connection starts a fresh transcript with new ids.
    clearedRef.current.clear();
    setRows([]);
    if (finished.length) setEarlier((previous) => [...previous, ...finished.map((line) => ({ ...line, pending: false }))].slice(-200));
  }, []);

  const voice = useRealtimeConversation({
    clientId,
    enabled: aiConsent,
    responseLanguage: 'en',
    liveSession: liveTranslateSession,
    muteAssistantAudio: true,
    onConnectionStart: archiveCurrent,
    onError: setError,
    onTranscriptSnapshot: (snapshot) => {
      // The session keeps its whole history, so lines removed by Clear are filtered out again.
      const kept = clearedRef.current.size ? snapshot.filter((row) => !clearedRef.current.has(row.id)) : snapshot;
      rowsRef.current = kept;
      setRows(kept);
    },
  });
  const { disconnect, finishTurn, microphoneEnabled, startTurn, status } = voice;
  const connected = status !== 'disconnected';
  const connecting = status === 'connecting';
  const listening = connected && microphoneEnabled;

  // A night surface needs light status bar text. The Asha tab resets the bar to dark as it
  // loses focus, which can land after this screen mounts, so apply it again on the next frame.
  useFocusEffect(useCallback(() => {
    setStatusBarStyle('light', true);
    const frame = requestAnimationFrame(() => setStatusBarStyle('light', true));
    return () => { cancelAnimationFrame(frame); setStatusBarStyle('dark', true); };
  }, []));

  // A phone left on the table must not auto-lock: locking ends the session.
  useEffect(() => {
    if (!connected) return undefined;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => { void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined); };
  }, [connected]);

  useEffect(() => {
    if (!connected || connecting) return undefined;
    const began = Date.now();
    const tick = () => setElapsedMs(Date.now() - began);
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [connected, connecting]);

  useEffect(() => {
    const requests = replyRequestsRef.current;
    return () => { requests.forEach((controller) => controller.abort()); requests.clear(); };
  }, []);

  const start = useCallback(() => {
    setError(null);
    followingRef.current = true;
    // A call with Asha owns the microphone. End it before this session listens.
    endRealtimeVoiceSession();
    startTurn().catch((cause: unknown) => {
      setError(cause instanceof Error && cause.message ? cause.message : 'Live Translate could not start. Please try again.');
    });
  }, [startTurn]);
  const resume = useCallback(() => {
    setError(null);
    startTurn().catch((cause: unknown) => {
      setError(cause instanceof Error && cause.message ? cause.message : 'Live Translate could not resume. Stop and start again.');
    });
  }, [startTurn]);
  const pause = useCallback(() => { finishTurn().catch(() => undefined); }, [finishTurn]);
  const stop = useCallback(() => disconnect('user_ended'), [disconnect]);

  const clear = useCallback(() => {
    replyRequestsRef.current.forEach((controller) => controller.abort());
    replyRequestsRef.current.clear();
    rowsRef.current.forEach((row) => clearedRef.current.add(row.id));
    rowsRef.current = [];
    setRows([]);
    setEarlier([]);
    setReplies({});
  }, []);

  const askHowToReply = useCallback((line: TranslationLine) => {
    if (replyRequestsRef.current.has(line.id)) return;
    const controller = new AbortController();
    replyRequestsRef.current.set(line.id, controller);
    setReplies((previous) => ({ ...previous, [line.id]: { status: 'loading' } }));
    sendMobileChat({ clientId, messages: [{ id: `translate-${line.id}`, role: 'you', text: buildReplyContext(line) }], responseLanguage: 'en', structuredReply: true, text: REPLY_HELP_QUESTION }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setReplies((previous) => ({ ...previous, [line.id]: { status: 'done', phrases: result.structured?.phrases?.slice(0, 2) ?? [], text: result.reply.trim() } }));
      })
      .catch(() => {
        if (!controller.signal.aborted) setReplies((previous) => ({ ...previous, [line.id]: { status: 'error' } }));
      })
      .finally(() => { replyRequestsRef.current.delete(line.id); });
  }, [clientId]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    followingRef.current = contentSize.height - contentOffset.y - layoutMeasurement.height < FOLLOW_SLACK;
  }, []);
  const followNewest = useCallback(() => {
    if (followingRef.current) scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const statusLabel = connecting ? 'Connecting' : listening
    ? `Listening · ${formatListeningTime(elapsedMs)}`
    : connected ? 'Paused' : null;
  const hasLines = lines.length > 0;
  const showIntro = !connected && !hasLines;

  const renderReply = (line: TranslationLine) => {
    const reply = replies[line.id];
    if (!reply) {
      return line.pending || !line.english ? null : (
        <Pressable accessibilityHint="Asks Asha for a short Hindi reply you could say back." accessibilityRole="button" onPress={() => askHowToReply(line)} style={styles.replyChip} testID="translate-ask-reply">
          <MessageCircle color={colors.brandText} size={16} />
          <Text style={styles.replyChipText}>Ask Asha how to reply</Text>
        </Pressable>
      );
    }
    if (reply.status === 'loading') {
      return (
        <View accessibilityLiveRegion="polite" style={styles.replyBox}>
          <ActivityIndicator color={colors.brand} size="small" />
          <Text style={styles.replyMeta}>Asha is thinking of a reply…</Text>
        </View>
      );
    }
    if (reply.status === 'error') {
      return (
        <Pressable accessibilityRole="button" onPress={() => { setReplies(({ [line.id]: _removed, ...rest }) => rest); askHowToReply(line); }} style={styles.replyChip}>
          <Text style={styles.replyChipText}>Asha could not answer. Try again</Text>
        </Pressable>
      );
    }
    return (
      <View accessibilityLiveRegion="polite" style={styles.replyAnswer} testID="translate-reply">
        <Text style={styles.replyEyebrow}>You could say</Text>
        {reply.phrases.length ? reply.phrases.map((phrase) => (
          <View key={phrase.devanagari + phrase.romanized} style={styles.replyPhrase}>
            <Text style={styles.replyRoman}>{phrase.romanized}</Text>
            <Text style={styles.replyHindi}>{phrase.devanagari}</Text>
            <Text style={styles.replyMeta}>{phrase.english}</Text>
          </View>
        )) : <Text style={styles.replyText}>{reply.text}</Text>}
      </View>
    );
  };

  const cards = (
    <ScrollView
      contentContainerStyle={styles.feed}
      onContentSizeChange={followNewest}
      onScroll={onScroll}
      ref={scrollRef}
      scrollEventThrottle={64}
      style={styles.fill}
      testID="translate-feed"
    >
      {lines.map((line) => (
        <View key={line.id} style={[styles.card, line.pending && styles.cardPending]} testID="translate-line">
          {line.hindi ? <Text style={styles.cardHindi}>{line.hindi}</Text> : null}
          {line.english ? <Text accessibilityLiveRegion="polite" style={styles.cardEnglish}>{line.english}</Text> : null}
          {line.pending ? <Text style={styles.cardPendingText}>{connected ? 'Translating…' : 'Not translated'}</Text> : null}
          {line.note ? <View style={styles.note}><Text style={styles.noteText}>{line.note}</Text></View> : null}
          {renderReply(line)}
        </View>
      ))}
      {connected && !hasLines ? (
        <Text style={styles.waiting}>{connecting ? 'Connecting…' : listening ? 'Listening for Hindi. Translations will appear here.' : 'Paused. Tap Resume to keep listening.'}</Text>
      ) : null}
    </ScrollView>
  );

  const translated = lines.filter((line) => line.english);
  const newest = lines[lines.length - 1];
  const subtitles = (
    <View style={styles.subtitles} testID="translate-big-text">
      {translated.filter((line) => line.id !== newest?.id).slice(-2).map((line) => (
        <Text key={line.id} numberOfLines={3} style={styles.subtitleOld}>{line.english}</Text>
      ))}
      {newest ? (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.subtitleNew}>{newest.english || 'Translating…'}</Text>
          {newest.hindi ? <Text style={styles.subtitleHindi}>{newest.hindi}</Text> : null}
        </>
      ) : (
        <Text style={styles.waiting}>{listening ? 'Listening for Hindi…' : connecting ? 'Connecting…' : 'Nothing translated yet.'}</Text>
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false, contentStyle: { backgroundColor: colors.night } }} />
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Asha" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.iconButton} testID="translate-back">
          <ChevronLeft color={colors.white} size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Asha</Text>
          <Text accessibilityRole="header" style={styles.title}>Live Translate</Text>
        </View>
        {hasLines || connected ? (
          <Pressable accessibilityLabel={bigText ? 'Show transcript cards' : 'Show big text'} accessibilityRole="button" accessibilityState={{ selected: bigText }} hitSlop={8} onPress={() => setBigText((value) => !value)} style={[styles.iconButton, bigText && styles.iconButtonOn]} testID="translate-big-text-toggle">
            <TypeIcon color={bigText ? colors.ink : colors.white} size={20} />
          </Pressable>
        ) : null}
      </View>

      {statusLabel || (hasLines && !connected) ? (
        <View style={styles.statusRow}>
          {statusLabel ? (
            <View accessibilityLiveRegion="polite" style={styles.pill} testID="translate-status">
              <View style={[styles.dot, !listening && styles.dotIdle]} />
              <Text style={styles.pillText}>{statusLabel}</Text>
            </View>
          ) : <Text style={styles.stoppedText}>Stopped</Text>}
          {hasLines ? (
            <Pressable accessibilityLabel="Clear transcript" accessibilityRole="button" onPress={clear} style={styles.clearButton} testID="translate-clear">
              <Trash2 color={colors.gold} size={16} />
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error ? <View style={styles.errorCard}><Text accessibilityRole="alert" style={styles.errorCardText} testID="translate-error">{error}</Text></View> : null}

      {showIntro ? (
        <ScrollView contentContainerStyle={styles.intro} style={styles.fill}>
          <Text style={styles.introLead}>Hear Hindi around you, read it in English.</Text>
          {aiConsent ? (
            <View style={styles.introCard}>
              <Text style={styles.introEyebrow}>Before you start</Text>
              <Text style={styles.introTitle}>Asha will listen to the room</Text>
              {LIVE_TRANSLATE_NOTES.map(({ icon: Icon, text }) => (
                <View key={text} style={styles.noteRow}>
                  <View style={styles.noteIcon}><Icon color={colors.brand} size={16} /></View>
                  <Text style={styles.noteRowText}>{text}</Text>
                </View>
              ))}
            </View>
          ) : <AiConsentGate title="Before using Live Translate" />}
          {configError ? <Text style={styles.error}>{configError}</Text> : null}
        </ScrollView>
      ) : bigText ? subtitles : cards}

      {aiConsent ? (
        <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {connected ? (
            <>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: connecting }} disabled={connecting} onPress={listening ? pause : resume} style={[styles.secondaryAction, connecting && styles.disabled]} testID="translate-pause">
                {listening ? <Pause color={colors.white} size={18} /> : <Play color={colors.white} size={18} />}
                <Text style={styles.secondaryActionText}>{listening ? 'Pause' : 'Resume'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={stop} style={[buttons.primary, styles.primaryAction]} testID="translate-stop">
                <Square color={colors.white} fill={colors.white} size={14} />
                <Text style={buttons.primaryText}>{connecting ? 'Cancel' : 'Stop'}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: configError !== null }} disabled={configError !== null} onPress={start} style={[buttons.primary, styles.primaryAction, configError !== null && styles.disabled]} testID="translate-start">
              <Mic color={colors.white} size={18} />
              <Text style={buttons.primaryText}>{hasLines ? 'Listen again' : 'Start listening'}</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.night },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  headerCopy: { flex: 1 },
  eyebrow: { ...type.eyebrow, color: c.gold },
  title: { ...type.title, color: c.white },
  iconButton: { width: layout.touchTarget, height: layout.touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.nightSurface, borderWidth: 1, borderColor: c.nightLine },
  iconButtonOn: { backgroundColor: c.gold, borderColor: c.gold },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: layout.touchTarget, paddingHorizontal: spacing.gutter },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: c.nightSurface, borderWidth: 1, borderColor: c.nightLine },
  pillText: { ...type.caption, fontWeight: '700', color: c.white, fontVariant: ['lining-nums', 'tabular-nums'] },
  dot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.pill, backgroundColor: c.orb },
  dotIdle: { backgroundColor: c.heroSubtle },
  stoppedText: { ...type.caption, fontWeight: '700', color: c.heroSubtle },
  clearButton: { minHeight: layout.touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  clearText: { ...type.caption, fontWeight: '600', color: c.gold },
  error: { ...type.caption, color: c.dangerSoft, paddingHorizontal: spacing.gutter, paddingVertical: spacing.sm },
  errorCard: { marginHorizontal: spacing.gutter, marginVertical: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.dangerLine },
  errorCardText: { ...type.body, color: c.danger },
  feed: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', gap: spacing.md, paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  card: { backgroundColor: c.paper, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs, borderWidth: 2, borderColor: c.paper },
  cardPending: { borderColor: c.gold, borderStyle: 'dashed' },
  cardHindi: { ...hindiType(17), color: c.muted },
  cardEnglish: { ...type.bodyLarge, color: c.ink },
  cardPendingText: { ...type.caption, fontWeight: '700', color: c.goldText },
  note: { backgroundColor: c.goldSoft, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.xs },
  noteText: { ...type.caption, color: c.goldText },
  replyChip: { minHeight: layout.touchTarget, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, marginTop: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.paperRaised },
  replyChipText: { ...type.caption, fontWeight: '600', color: c.brandText },
  replyBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, minHeight: layout.touchTarget },
  replyAnswer: { marginTop: spacing.xs, padding: spacing.md, gap: spacing.sm, borderRadius: radius.md, backgroundColor: c.brandSoft },
  replyEyebrow: { ...type.eyebrow, color: c.brandText },
  replyPhrase: { gap: 2 },
  replyRoman: { ...type.label, color: c.ink },
  replyHindi: { ...hindiType(17), color: c.ink },
  replyMeta: { ...type.caption, color: c.muted },
  replyText: { ...type.body, color: c.ink },
  waiting: { ...type.body, color: c.heroSubtle, textAlign: 'center', paddingVertical: spacing.xxl },
  subtitles: { flex: 1, justifyContent: 'flex-end', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  subtitleOld: { ...type.headline, fontWeight: '400', color: c.heroSubtle, opacity: 0.6 },
  subtitleNew: { ...type.display, color: c.white },
  subtitleHindi: { ...hindiType(20), color: c.gold },
  intro: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', gap: spacing.lg, paddingHorizontal: spacing.gutter, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  introLead: { ...type.bodyLarge, color: c.heroSubtle },
  introCard: { backgroundColor: c.paper, borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.gutter, gap: spacing.md },
  introEyebrow: { ...type.eyebrow, color: c.brandText },
  introTitle: { ...type.title, color: c.ink },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  noteIcon: { width: spacing.xxl, height: spacing.xxl, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.brandSoft },
  noteRowText: { ...type.body, flex: 1, color: c.ink },
  actions: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.gutter, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: c.nightLine, backgroundColor: c.night },
  primaryAction: { flex: 1, borderRadius: radius.pill },
  secondaryAction: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, borderRadius: radius.pill, borderWidth: 1, borderColor: c.nightLine },
  secondaryActionText: { ...type.label, color: c.white },
  disabled: { opacity: 0.5 },
}));
