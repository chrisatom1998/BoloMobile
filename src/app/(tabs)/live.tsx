import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { ArrowLeft, BookmarkPlus, Flag, MessageCircle, Send, Trash2, Volume2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type NativeSyntheticEvent, type StyleProp, type TextInputSelectionChangeEventData, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { RealtimeVoiceButton } from '@/components/realtime-voice-button';
import { SegmentedControl } from '@/components/segmented-control';
import { TranscriptPhrasePicker } from '@/components/transcript-phrase-picker';
import { useForegroundTimer } from '@/hooks/use-foreground-timer';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { RealtimeInputTranscript, RealtimeTranscriptUpdate, RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { showAppAlert } from '@/lib/app-alert';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { observe } from '@/lib/observability';
import { preloadSpeech, speakText, stopSpeaking } from '@/lib/speech';
import { sourceTextForDisplayedSelection } from '@/lib/transcript-selection';
import { reportGeneratedMessage, sendMobileChat, type ReportReason } from '@/services/bolo-api';
import { useAppState } from '@/state/app-state';
import type { ChatMessage, AshaResponseLanguage, SavedPhrase } from '@/state/app-state-types';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

const welcome: ChatMessage = {
  id: 'welcome',
  role: 'asha',
  text: 'Hi! Tell me what you would like to practice. Choose English or Hindi for my replies above.',
};

const MAX_ACCESSIBLE_REPLY_CHARACTERS = 56;
const ashaPortrait = require('../../../assets/images/asha-portrait.png');

function messageActionExcerpt(text: string) {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= MAX_ACCESSIBLE_REPLY_CHARACTERS) return normalized;
  return `${normalized.slice(0, MAX_ACCESSIBLE_REPLY_CHARACTERS).trimEnd()}\u2026`;
}

function SelectableChatText({
  accessibilityLabel,
  accessibilityLiveRegion,
  onSelectedText,
  sourceText,
  style,
  text,
}: {
  accessibilityLabel: string;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  onSelectedText: (selection: { sourceText: string; text: string }) => void;
  sourceText: string;
  style: StyleProp<TextStyle>;
  text: string;
}) {
  const [measurement, setMeasurement] = useState<{ height?: number; text: string }>({ text });
  // A new or recycled message must measure at its natural height before the
  // measured value is pinned; a one-line initial height clips long turns.
  const height = measurement.text === text ? measurement.height : undefined;

  const selectionChanged = useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { end, start } = event.nativeEvent.selection;
    if (end <= start) return;
    const excerpt = text.slice(start, end).trim();
    if (!excerpt) return;
    onSelectedText({
      sourceText: sourceTextForDisplayedSelection({ displayText: text, end, sourceText, start }),
      text: excerpt,
    });
  }, [onSelectedText, sourceText, text]);

  return (
    <TextInput
      accessibilityHint="Highlight any words, then use Save selection below."
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion={accessibilityLiveRegion}
      contextMenuHidden={false}
      multiline
      onContentSizeChange={(event) => {
        const nextHeight = Math.max(23, Math.ceil(event.nativeEvent.contentSize.height));
        setMeasurement((current) => current.text === text && current.height === nextHeight ? current : { height: nextHeight, text });
      }}
      onSelectionChange={selectionChanged}
      readOnly
      scrollEnabled={false}
      style={[style, { minHeight: 23 }, height === undefined ? undefined : { height }]}
      value={text}
    />
  );
}

function CaptionReveal({ children, style }: { children: ReactNode; style: StyleProp<ViewStyle> }) {
  const [progress] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      progress.stopAnimation();
      progress.setValue(1);
    }
    else Animated.timing(progress, { duration: 260, toValue: 1, useNativeDriver: true }).start();
  }, [progress, reducedMotion]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

export default function LiveScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const heroContentWidth = Math.max(288, Math.min(420, windowWidth - spacing.xxl));
  const compactVoiceLayout = windowHeight < 760;
  const { elapsedSeconds } = useForegroundTimer();
  const { addPracticeSeconds, aiConsent, appendChatMessages, chatHistory, clearChatHistory, clientId, learnerProfile, markLiveTurn, phrases, togglePhrase } = useAppState();
  const [responseLanguage, setResponseLanguage] = useState<AshaResponseLanguage>(learnerProfile?.responseLanguage ?? 'en');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<ChatMessage | null>(null);
  const [error, setError] = useState('');
  const [liveCaption, setLiveCaption] = useState('');
  const [liveAshaTranscript, setLiveAshaTranscript] = useState('');
  const [liveUserTranscript, setLiveUserTranscript] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeVoiceStatus>('disconnected');
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [pendingReports, setPendingReports] = useState<Set<string>>(new Set());
  const [phraseMessage, setPhraseMessage] = useState<{ message: ChatMessage; selectedText?: string; sourceText?: string } | null>(null);
  const practiced = useRef(false);
  const mountedRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);
  const realtimeStatusRef = useRef<RealtimeVoiceStatus>('disconnected');
  const pendingReportIdsRef = useRef<Set<string>>(new Set());
  const reportedIdsRef = useRef<Set<string>>(new Set());
  const reportControllersRef = useRef<Map<string, AbortController>>(new Map());
  const selectedChatTextRef = useRef<Map<string, { sourceText: string; text: string }>>(new Map());
  const transcriptTurnActionRef = useRef<(() => void) | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const scrollAfterContentChangeRef = useRef(false);
  const visibleMessages = useMemo(
    () => pendingUserMessage ? [welcome, ...chatHistory, pendingUserMessage] : [welcome, ...chatHistory],
    [chatHistory, pendingUserMessage],
  );
  const realtimeLocked = realtimeStatus === 'connecting' || realtimeStatus === 'recording' || realtimeStatus === 'responding';
  const realtimeOwnsAudio = realtimeStatus !== 'disconnected';
  const hasTranscriptMessages = chatHistory.length > 0 || pendingUserMessage !== null;
  const transcriptTurnDisabled = !aiConsent || busy || realtimeStatus === 'connecting' || realtimeStatus === 'responding';
  const transcriptTurnLabel = {
    disconnected: 'Connect with Asha',
    connecting: 'Connecting to Asha…',
    ready: 'Start next Asha turn',
    recording: 'Send this turn',
    responding: 'Asha is responding…',
  }[realtimeStatus];
  const transcriptTurnHint = !aiConsent
    ? 'Review consent to enable connected voice coaching.'
    : busy
      ? 'Wait while Asha finishes the current reply.'
      : realtimeStatus === 'connecting'
        ? 'The live voice session is connecting.'
        : realtimeStatus === 'responding'
          ? 'Wait while Asha finishes speaking.'
          : realtimeStatus === 'recording'
            ? 'Sends the turn currently being recorded.'
            : realtimeStatus === 'ready'
              ? 'Starts your next voice turn with Asha.'
              : 'Connects to Asha for your next voice turn.';
  const languageControlLocked = busy || realtimeOwnsAudio;
  const responseLanguageName = responseLanguage === 'hi' ? 'Hindi' : 'English';
  const voiceHeroTitle = {
    disconnected: 'Tap to connect',
    connecting: 'Connecting to Asha',
    ready: 'Ready when you are',
    recording: 'Asha is listening',
    responding: 'Asha is responding',
  }[realtimeStatus];
  const voiceHeroBody = {
    disconnected: '',
    connecting: 'Opening a private live voice session…',
    ready: 'Tap the orb, then speak your Hindi naturally.',
    recording: 'Tap the orb again when you finish your turn.',
    responding: `Your ${responseLanguageName} reply is on the way.`,
  }[realtimeStatus];
  const liveCaptionText = realtimeStatus === 'connecting'
    ? 'Connecting to Asha…'
    : realtimeStatus === 'recording'
      ? liveUserTranscript || 'Listening to your Hindi…'
      : realtimeStatus === 'responding'
        ? liveAshaTranscript || liveUserTranscript || `Asha is preparing your ${responseLanguageName} reply…`
        : liveCaption || (realtimeStatus === 'ready' ? 'Captions appear after your first turn.' : '');
  const visibleLiveCaptionText = romanizeDevanagari(liveCaptionText);
  const hasLiveCaption = realtimeOwnsAudio || liveCaptionText !== '';
  const liveCaptionLabel = !hasLiveCaption
    ? 'LIVE'
    : realtimeStatus === 'recording'
    ? 'Your transcript'
    : realtimeStatus === 'responding' && !liveAshaTranscript && liveUserTranscript
      ? 'You said'
      : 'Live Asha caption';
  const captionText = hasLiveCaption
    ? visibleLiveCaptionText
    : 'Tap the orb, then speak naturally.';

  const scrollToChat = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const bindTranscriptTurnAction = useCallback((action: (() => void) | null) => {
    transcriptTurnActionRef.current = action;
  }, []);

  const startTranscriptTurn = useCallback(() => {
    if (transcriptTurnDisabled) return;
    transcriptTurnActionRef.current?.();
  }, [transcriptTurnDisabled]);

  const clearPendingUserMessage = useCallback((expectedId: string) => {
    setPendingUserMessage((current) => current?.id === expectedId ? null : current);
  }, []);

  useEffect(() => {
    return () => {
      if (practiced.current) addPracticeSeconds(elapsedSeconds());
    };
  }, [addPracticeSeconds, elapsedSeconds]);

  useEffect(() => {
    mountedRef.current = true;
    const reportControllers = reportControllersRef.current;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      reportControllers.forEach((controller) => controller.abort());
      reportControllers.clear();
      void stopSpeaking();
    };
  }, []);

  const recordTurn = useCallback((result: { transcript: string; reply: string; language: 'en' | 'hi' }) => {
    if (!mountedRef.current) return;
    scrollAfterContentChangeRef.current = true;
    const now = Date.now();
    void (result.language === 'hi' ? preloadSpeech(result.reply, 'hi') : preloadSpeech(result.reply));
    const additions: ChatMessage[] = [];
    if (result.transcript.trim()) additions.push({ id: `you-${now}`, role: 'you', text: result.transcript.trim() });
    additions.push({ id: `asha-${now}`, role: 'asha', text: result.reply.trim(), language: result.language });
    appendChatMessages(additions);
    if (!practiced.current) {
      practiced.current = true;
      markLiveTurn();
    }
  }, [appendChatMessages, markLiveTurn]);

  const recordRealtimeInputTranscript = useCallback((result: RealtimeInputTranscript) => {
    if (!mountedRef.current || !result.transcript.trim()) return;
    appendChatMessages([{ id: `you-voice-${result.itemId}`, role: 'you', text: result.transcript.trim() }]);
  }, [appendChatMessages]);

  const recordRealtimeReply = useCallback((result: { reply: string; language: 'en' | 'hi' }) => {
    if (!mountedRef.current) return;
    scrollAfterContentChangeRef.current = true;
    const now = Date.now();
    void (result.language === 'hi' ? preloadSpeech(result.reply, 'hi') : preloadSpeech(result.reply));
    appendChatMessages([{ id: `asha-${now}`, role: 'asha', text: result.reply.trim(), language: result.language }]);
    if (!practiced.current) {
      practiced.current = true;
      markLiveTurn();
    }
  }, [appendChatMessages, markLiveTurn]);

  const playReply = useCallback(async (text: string, language?: AshaResponseLanguage) => {
    if (!aiConsent || realtimeOwnsAudio) return;
    setError('');
    try {
      if (language === 'hi') await speakText(text, undefined, 1, 'hi');
      else await speakText(text);
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'Bolo could not play the AI voice.');
    }
  }, [aiConsent, realtimeOwnsAudio]);

  const changeResponseLanguage = useCallback((nextLanguage: AshaResponseLanguage) => {
    if (languageControlLocked || nextLanguage === responseLanguage) return;
    void stopSpeaking();
    setLiveCaption('');
    setError('');
    setResponseLanguage(nextLanguage);
  }, [languageControlLocked, responseLanguage]);

  const clearSavedChat = useCallback(() => {
    void stopSpeaking();
    setLiveCaption('');
    selectedChatTextRef.current.clear();
    clearChatHistory();
  }, [clearChatHistory]);

  const rememberSelectedChatText = useCallback((messageId: string, selection: { sourceText: string; text: string }) => {
    selectedChatTextRef.current.set(messageId, selection);
  }, []);

  const openPhrasePicker = useCallback((message: ChatMessage) => {
    const selection = selectedChatTextRef.current.get(message.id);
    setPhraseMessage({ message, selectedText: selection?.text, sourceText: selection?.sourceText || message.text });
  }, []);

  const confirmClearChat = useCallback(() => {
    if (busy || realtimeLocked || chatHistory.length === 0) return;
    showAppAlert(
      'Clear Asha chat?',
      'This removes the saved typed and voice chat from this device. Reports you already submitted are not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear chat', style: 'destructive', onPress: clearSavedChat },
      ],
    );
  }, [busy, chatHistory.length, clearSavedChat, realtimeLocked]);

  const sendText = useCallback(async (forced?: string) => {
    const text = (forced ?? input).trim().slice(0, 500);
    if (!aiConsent || !text || busy || realtimeLocked || requestRef.current) return;
    const userMessage: ChatMessage = { id: `you-${Date.now()}`, role: 'you', text };
    scrollAfterContentChangeRef.current = true;
    setInput('');
    setPendingUserMessage(userMessage);
    setBusy(true);
    setError('');
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const result = await sendMobileChat({ text, messages: chatHistory, clientId, responseLanguage }, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) {
        if (mountedRef.current) clearPendingUserMessage(userMessage.id);
        return;
      }
      clearPendingUserMessage(userMessage.id);
      recordTurn({ transcript: userMessage.text, reply: result.reply, language: result.language });
      if (realtimeStatusRef.current === 'disconnected') {
        try {
          if (result.language === 'hi') await speakText(result.reply, controller.signal, 1, 'hi');
          else await speakText(result.reply, controller.signal);
        } catch (cause) {
          if (mountedRef.current && !controller.signal.aborted) {
            const reason = cause instanceof Error ? cause.message : 'Bolo could not play the AI voice.';
            setError(`Asha replied, but the voice audio could not play. ${reason}`);
          }
        }
      }
    } catch (cause) {
      if (mountedRef.current) clearPendingUserMessage(userMessage.id);
      if (mountedRef.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Asha could not answer right now.');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (mountedRef.current) setBusy(false);
      }
    }
  }, [aiConsent, busy, chatHistory, clearPendingUserMessage, clientId, input, realtimeLocked, recordTurn, responseLanguage]);

  const updateRealtimeStatus = useCallback((status: RealtimeVoiceStatus) => {
    realtimeStatusRef.current = status;
    setRealtimeStatus(status);
    if (status === 'recording') {
      setError('');
      setLiveAshaTranscript('');
      setLiveUserTranscript('');
    }
    if (status === 'ready') observe('voice_connection_succeeded');
  }, []);
  const showRealtimeError = useCallback((message: string) => {
    observe('voice_connection_failed');
    setError(message);
  }, []);
  const updateLiveTranscript = useCallback((update: RealtimeTranscriptUpdate) => {
    if (update.speaker === 'asha') setLiveAshaTranscript(update.text);
    else setLiveUserTranscript(update.text);
  }, []);
  const completeRealtimeTurn = useCallback((turn: { transcript: string; reply: string; language: 'en' | 'hi' }) => {
    setError('');
    setLiveCaption(turn.reply.trim());
    setLiveAshaTranscript(turn.reply.trim());
    setLiveUserTranscript(turn.transcript.trim());
    recordRealtimeReply(turn);
  }, [recordRealtimeReply]);

  const report = useCallback((message: ChatMessage) => {
    const submit = (reason: ReportReason) => void (async () => {
      if (pendingReportIdsRef.current.has(message.id) || reportedIdsRef.current.has(message.id)) return;
      const controller = new AbortController();
      reportControllersRef.current.set(message.id, controller);
      const withPending = new Set(pendingReportIdsRef.current).add(message.id);
      pendingReportIdsRef.current = withPending;
      if (mountedRef.current) setPendingReports(withPending);
      try {
        await reportGeneratedMessage({ clientId, message: message.text, reason }, controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;
        const withReported = new Set(reportedIdsRef.current).add(message.id);
        reportedIdsRef.current = withReported;
        setReported(withReported);
        showAppAlert('Report received', 'Thank you. This reply was sent for review.');
      } catch (cause) {
        if (mountedRef.current && !controller.signal.aborted) showAppAlert('Could not send report', cause instanceof Error ? cause.message : 'Please try again.');
      } finally {
        if (reportControllersRef.current.get(message.id) === controller) reportControllersRef.current.delete(message.id);
        const withoutPending = new Set(pendingReportIdsRef.current);
        withoutPending.delete(message.id);
        pendingReportIdsRef.current = withoutPending;
        if (mountedRef.current) setPendingReports(withoutPending);
      }
    })();
    showAppAlert('Report Asha’s reply', 'Choose the main problem.', [
      { text: 'Unsafe or inappropriate', onPress: () => submit('unsafe_or_inappropriate') },
      { text: 'Incorrect or misleading', onPress: () => submit('incorrect_or_misleading') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [clientId]);

  const saveTranscriptPhrase = useCallback((phrase: SavedPhrase) => {
    const alreadySaved = phrases.some((saved) => saved.hi.trim().toLocaleLowerCase() === phrase.hi.trim().toLocaleLowerCase());
    if (!alreadySaved) togglePhrase(phrase);
    setPhraseMessage(null);
    showAppAlert(alreadySaved ? 'Phrase already saved' : 'Phrase saved', `${phrase.latin} — ${phrase.en}`);
  }, [phrases, togglePhrase]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <StatusBar style="dark" />
      <FlatList
        ref={listRef}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.listContent}
        data={visibleMessages}
        keyExtractor={(message) => message.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        testID="live-chat-list"
        ListHeaderComponent={(
          <View>
            <View style={[styles.voiceHero, compactVoiceLayout && styles.voiceHeroCompact, { paddingTop: insets.top + spacing.sm }]} testID="voice-conversation-hero">
              <View style={[styles.topbar, { width: heroContentWidth }]}>
                <View style={styles.headerIdentity}>
                  <Image
                    accessible={false}
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    source={ashaPortrait}
                    style={styles.ashaPortrait}
                    testID="asha-header-portrait"
                    transition={0}
                  />
                  <View style={styles.headerCopy}>
                    <Text numberOfLines={1} style={styles.headerEyebrow}>Your Hindi coach</Text>
                    <Text style={styles.headerTitle}>Asha</Text>
                    <Text numberOfLines={1} style={styles.headerSubtitle}>Conversational Hindi coach · {responseLanguageName} replies</Text>
                  </View>
                </View>
                <View style={styles.headerActions}>
                  <View accessibilityLabel="Private conversation" style={styles.privateBadge}>
                    <View style={styles.privateDot} />
                    <Text style={styles.privateText}>Private</Text>
                  </View>
                  <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={router.back} style={styles.headerButton}>
                    <ArrowLeft color={colors.ink} size={19} />
                  </Pressable>
                  <Pressable accessibilityLabel="Open chat history" accessibilityRole="button" onPress={scrollToChat} style={styles.chatButton}>
                    <MessageCircle color={colors.ink} size={19} />
                  </Pressable>
                </View>
              </View>

              <>
                  <SegmentedControl
                    accessibilityLabel="Asha voice language"
                    disabled={languageControlLocked}
                    disabledHint="End the current request or live voice session to change Asha voice language."
                    onValueChange={changeResponseLanguage}
                    options={[
                      { accessibilityLabel: 'English', label: 'English replies', value: 'en' },
                      { accessibilityLabel: 'Hindi', label: 'Hindi replies', value: 'hi' },
                    ]}
                    style={[styles.languageSelector, { width: heroContentWidth }]}
                    value={responseLanguage}
                  />
                  <View style={[styles.voiceStage, compactVoiceLayout && styles.voiceStageCompact, { width: heroContentWidth }]}> 
                    <View style={styles.liveVoiceBadge}>
                      <View style={styles.liveVoiceDot} />
                      <Text style={styles.liveVoiceText}>Live voice</Text>
                    </View>
                    <RealtimeVoiceButton clientId={clientId} compact={compactVoiceLayout} disabled={busy || !aiConsent} onError={showRealtimeError} onInputTranscriptComplete={recordRealtimeInputTranscript} onStatusChange={updateRealtimeStatus} onTranscriptChange={updateLiveTranscript} onTurnActionReady={bindTranscriptTurnAction} onTurnComplete={completeRealtimeTurn} responseLanguage={responseLanguage} size="minimal" />
                    <View style={styles.heroCopy}>
                      <Text accessibilityLiveRegion="polite" style={styles.heroTitle}>{voiceHeroTitle}</Text>
                      {voiceHeroBody ? <Text style={styles.heroBody}>{voiceHeroBody}</Text> : null}
                    </View>
                  </View>
                  <CaptionReveal style={[styles.captionBlock, { width: heroContentWidth }]}>
                    <Text style={styles.captionLabel}>{liveCaptionLabel}</Text>
                    <Text accessibilityLiveRegion="polite" style={styles.captionText}>{captionText}</Text>
                  </CaptionReveal>
                  {!aiConsent ? <Text style={[styles.heroConsentHint, { width: Math.min(330, heroContentWidth) }]}>Review the consent card below to enable connected coaching.</Text> : null}
              </>
            </View>

            <View style={[styles.askSection, compactVoiceLayout && styles.askSectionCompact]} testID="ask-asha-sheet">
                <View style={styles.sheetHandle} testID="ask-asha-sheet-handle" />
                <View style={styles.askHeadingRow}>
                  <View style={[styles.askHeadingCopy, compactVoiceLayout && styles.askHeadingCopyCompact]} testID="ask-asha-heading">
                    <Text style={styles.askEyebrow}>Ask Asha</Text>
                    <Text style={styles.askTitle}>How do I say…?</Text>
                  </View>
                  {chatHistory.length > 0 ? (
                    <Pressable
                      accessibilityHint="Removes typed and voice chat saved on this device."
                      accessibilityLabel="Clear Asha chat history"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy || realtimeLocked }}
                      disabled={busy || realtimeLocked}
                      onPress={confirmClearChat}
                      style={[styles.clearChatButton, (busy || realtimeLocked) && styles.disabled]}
                    >
                      <Trash2 color={colors.danger} size={17} />
                    </Pressable>
                  ) : null}
                </View>
                <AiConsentGate><View /></AiConsentGate>
            </View>
          </View>
        )}
        onContentSizeChange={() => {
          if (!scrollAfterContentChangeRef.current || !aiConsent) return;
          scrollAfterContentChangeRef.current = false;
          listRef.current?.scrollToEnd({ animated: true });
        }}
        renderItem={({ item }) => {
          const displayText = romanizeDevanagari(item.text);
          return (
            <View style={[styles.messageRow, item.role === 'you' && styles.messageRowYou]}>
              <View style={[styles.message, item.role === 'you' ? styles.userMessage : styles.ashaMessage]}>
                <View style={styles.messageIdentity}>
                  <View style={[styles.messageAvatar, item.role === 'you' && styles.messageAvatarYou]}>
                    <Text style={[styles.messageAvatarText, item.role === 'you' && styles.messageAvatarTextYou]}>{item.role === 'you' ? 'Y' : 'आ'}</Text>
                  </View>
                  <Text style={[styles.messageLabel, item.role === 'you' && styles.userText]}>{item.role === 'you' ? 'You' : 'Asha'}</Text>
                </View>
                <SelectableChatText
                  accessibilityLabel={`Selectable chat text: ${messageActionExcerpt(displayText)}`}
                  accessibilityLiveRegion={item.role === 'asha' && item.id !== welcome.id ? 'polite' : 'none'}
                  onSelectedText={(selection) => rememberSelectedChatText(item.id, selection)}
                  sourceText={item.text}
                  style={[styles.messageText, item.role === 'you' && styles.userText]}
                  text={displayText}
                />
                {item.role === 'asha' || item.id !== welcome.id ? (
                  <View style={styles.messageActions}>
                    {item.id !== welcome.id ? <Pressable accessibilityHint="Saves the words you highlighted. If nothing is highlighted, opens the full message for trimming." accessibilityLabel={`Save transcript phrase: ${messageActionExcerpt(displayText)}`} accessibilityRole="button" onPress={() => openPhrasePicker(item)} style={styles.smallAction}><BookmarkPlus color={item.role === 'you' ? colors.white : colors.forest} size={16} /><Text style={[styles.smallActionText, item.role === 'you' && styles.userText]}>Save selection</Text></Pressable> : null}
                    {item.role === 'asha' ? (
                      <>
                        <Pressable accessibilityHint={!aiConsent ? 'Agree to connected AI processing to enable Listen.' : realtimeOwnsAudio ? 'End realtime voice before playing another voice.' : undefined} accessibilityLabel={`Read reply aloud: ${messageActionExcerpt(displayText)}`} accessibilityRole="button" accessibilityState={{ disabled: !aiConsent || realtimeOwnsAudio }} disabled={!aiConsent || realtimeOwnsAudio} onPress={() => void playReply(item.text, item.language)} style={[styles.smallAction, (!aiConsent || realtimeOwnsAudio) && styles.disabled]}><Volume2 color={colors.forest} size={16} /><Text style={styles.smallActionText}>Listen</Text></Pressable>
                        {item.id !== welcome.id ? <Pressable accessibilityLabel={`Report reply: ${messageActionExcerpt(displayText)}`} accessibilityRole="button" accessibilityState={{ disabled: reported.has(item.id) || pendingReports.has(item.id) }} disabled={reported.has(item.id) || pendingReports.has(item.id)} onPress={() => report(item)} style={[styles.smallAction, (reported.has(item.id) || pendingReports.has(item.id)) && styles.disabled]}><Flag color={reported.has(item.id) ? colors.success : colors.muted} size={15} /><Text style={styles.smallActionText}>{reported.has(item.id) ? 'Reported' : pendingReports.has(item.id) ? 'Reporting\u2026' : 'Report'}</Text></Pressable> : null}
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
        ListFooterComponent={hasTranscriptMessages ? (
          <View style={styles.transcriptFooter}>
            <View style={styles.transcriptTurnCard}>
              <Text style={styles.transcriptTurnEyebrow}>Next voice turn</Text>
              <PressableFeedback
                accessibilityHint={transcriptTurnHint}
                accessibilityLabel={transcriptTurnLabel}
                accessibilityRole="button"
                accessibilityState={{ disabled: transcriptTurnDisabled }}
                isDisabled={transcriptTurnDisabled}
                onPress={startTranscriptTurn}
                style={[styles.transcriptTurnButton, transcriptTurnDisabled && styles.disabled]}
              >
                <Text style={styles.transcriptTurnButtonText}>{transcriptTurnLabel}</Text>
              </PressableFeedback>
            </View>
          </View>
        ) : null}
      />

      <View style={[styles.composer, { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.xs) }]}>
        {busy ? <Text accessibilityLiveRegion="polite" style={styles.requestStatus}>{'Asha is thinking\u2026'}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {aiConsent ? (
          <>
            <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examples}>
              {['Order tea', 'Ask the price', 'Be polite', 'Correct my Hindi'].map((example) => (
                <PressableFeedback
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || realtimeLocked }}
                  isDisabled={busy || realtimeLocked}
                  key={example}
                  onPress={() => void sendText(example)}
                  style={[styles.example, (busy || realtimeLocked) && styles.disabled]}
                >
                  <Text style={styles.exampleText}>{example}</Text>
                </PressableFeedback>
              ))}
            </ScrollView>
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="Message Asha"
                testID="message-asha-input"
                editable={!busy && !realtimeLocked}
                maxLength={500}
                multiline
                onChangeText={setInput}
                onSubmitEditing={() => void sendText()}
                placeholder="Ask in English or Hindi…"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={input}
              />
              <Pressable accessibilityLabel="Send message" accessibilityRole="button" testID="send-asha-message" accessibilityState={{ disabled: busy || realtimeLocked || !input.trim() }} disabled={busy || realtimeLocked || !input.trim()} onPress={() => void sendText()} style={[styles.sendButton, (busy || realtimeLocked || !input.trim()) && styles.disabled]}><Send color={colors.white} size={20} /></Pressable>
            </View>
          </>
        ) : <Text style={styles.consentHint}>Review the consent card above to enable connected coaching.</Text>}
      </View>
      {phraseMessage ? <TranscriptPhrasePicker aiConsent={aiConsent} clientId={clientId} message={phraseMessage.message} onClose={() => setPhraseMessage(null)} onSave={saveTranscriptPhrase} selectedText={phraseMessage.selectedText} sourceText={phraseMessage.sourceText} /> : null}
    </KeyboardAvoidingView>
  );
}

export const createLiveStyles = (c: ReturnType<typeof useTheme>['colors']) => ({
  screen: { flex: 1, backgroundColor: c.background },
  list: { flex: 1, backgroundColor: c.background },
  listContent: { backgroundColor: c.background, paddingBottom: spacing.lg },
  voiceHero: {
    minHeight: 492,
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: c.background,
    overflow: 'hidden',
  },
  voiceHeroCompact: { gap: spacing.xs, minHeight: 430, paddingBottom: spacing.md },
  topbar: { minHeight: 72, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', paddingRight: 158, position: 'relative' },
  headerIdentity: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ashaPortrait: { width: 36, height: 36, flexShrink: 0, borderRadius: 13, borderCurve: 'continuous', backgroundColor: c.brandSoft, borderColor: c.brand, borderWidth: StyleSheet.hairlineWidth },
  headerCopy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 2, overflow: 'hidden' },
  headerEyebrow: { alignSelf: 'stretch', color: c.brandText, fontSize: 11, fontWeight: '900', letterSpacing: 0.75, textTransform: 'uppercase', textAlign: 'left' },
  headerTitle: { alignSelf: 'stretch', color: c.ink, fontSize: 29, lineHeight: 34, fontWeight: '900', textAlign: 'left' },
  headerSubtitle: { minWidth: 0, alignSelf: 'stretch', flexShrink: 1, color: c.muted, fontSize: 11, lineHeight: 15, textAlign: 'left' },
  headerActions: { position: 'absolute', right: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  privateBadge: { minHeight: 32, borderRadius: radius.pill, backgroundColor: c.forestSoft, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10 },
  privateDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: c.forest },
  privateText: { color: c.forestText, fontSize: 11, fontWeight: '900' },
  headerButton: { width: 36, height: 36, borderRadius: radius.pill, borderCurve: 'continuous', borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center' },
  chatButton: { width: 36, height: 36, borderRadius: radius.pill, borderCurve: 'continuous', borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center' },
  languageSelector: { alignSelf: 'center' },
  voiceStage: { alignSelf: 'center', minHeight: 318, borderRadius: 28, borderCurve: 'continuous', backgroundColor: c.heroBase, alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, padding: spacing.lg, overflow: 'hidden' },
  voiceStageCompact: { minHeight: 270, paddingVertical: spacing.md },
  liveVoiceBadge: { minHeight: 27, borderRadius: radius.pill, backgroundColor: c.heroRaised, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm },
  liveVoiceDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: '#45D1B3' },
  liveVoiceText: { color: '#73E1CA', fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  heroCopy: { minWidth: 0, alignSelf: 'stretch', alignItems: 'center', gap: 3 },
  heroTitle: { minWidth: 0, flexShrink: 1, color: c.white, fontSize: 22, lineHeight: 28, fontWeight: '900', textAlign: 'center' },
  heroBody: { minWidth: 0, maxWidth: 310, flexShrink: 1, color: c.heroMuted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  captionBlock: { minHeight: 94, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 20, borderCurve: 'continuous', borderColor: c.line, borderWidth: 1, backgroundColor: c.paperRaised, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  captionLabel: { color: c.forestText, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  captionText: { minWidth: 0, alignSelf: 'stretch', color: c.ink, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  heroConsentHint: { minWidth: 0, alignSelf: 'center', flexShrink: 1, color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  askSection: { minHeight: 116, alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm, marginTop: -1, position: 'relative', zIndex: 2, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderCurve: 'continuous', backgroundColor: c.paper, paddingHorizontal: 20, paddingTop: 10, paddingBottom: spacing.lg },
  askSectionCompact: { gap: spacing.xs, paddingTop: spacing.xs },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: radius.pill, backgroundColor: c.lineStrong },
  askHeadingRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'relative', gap: spacing.md },
  askHeadingCopy: { minWidth: 0, alignItems: 'center', gap: 3 },
  askHeadingCopyCompact: { gap: 0 },
  askEyebrow: { color: c.brandDark, fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
  askTitle: { color: c.ink, fontSize: 19, lineHeight: 24, fontWeight: '900', textAlign: 'center' },
  clearChatButton: { position: 'absolute', right: 0, width: 44, height: 44, minHeight: 44, flexShrink: 0, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  messageRow: { alignItems: 'flex-start', backgroundColor: c.paper, paddingHorizontal: 20, marginBottom: spacing.sm },
  messageRowYou: { alignItems: 'flex-end' },
  message: { maxWidth: '88%', borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.xs, shadowColor: c.black, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.04 * c.shadowOpacityScale, shadowRadius: 10, elevation: 1 * c.shadowOpacityScale },
  ashaMessage: { backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth },
  userMessage: { backgroundColor: c.night },
  messageIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  messageAvatar: { width: 23, height: 23, borderRadius: radius.pill, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  messageAvatarYou: { backgroundColor: 'rgba(255,255,255,0.16)' },
  messageAvatarText: { color: c.brandText, fontSize: 12, lineHeight: 15, fontWeight: '900' },
  messageAvatarTextYou: { color: c.white, fontSize: 10 },
  messageLabel: { color: c.brandDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  messageText: { alignSelf: 'stretch', color: c.ink, fontSize: 16, lineHeight: 23, margin: 0, padding: 0 },
  userText: { color: c.white },
  messageActions: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs },
  smallAction: { minHeight: 44, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', paddingHorizontal: spacing.sm },
  smallActionText: { color: c.muted, fontSize: 12, fontWeight: '700' },
  transcriptFooter: { backgroundColor: c.paper, paddingHorizontal: 20, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  transcriptTurnCard: { borderRadius: radius.lg, borderCurve: 'continuous', borderColor: c.line, borderWidth: 1, backgroundColor: c.backgroundWarm, gap: spacing.sm, padding: spacing.md },
  transcriptTurnEyebrow: { color: c.brandText, fontSize: 11, fontWeight: '900', letterSpacing: 0.75, textTransform: 'uppercase' },
  transcriptTurnButton: { minHeight: 52, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  transcriptTurnButtonText: { color: c.white, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  composer: { backgroundColor: c.paperRaised, borderTopColor: c.line, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: spacing.md, gap: spacing.sm },
  examples: { justifyContent: 'center', gap: spacing.sm, paddingRight: spacing.md },
  example: { minHeight: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paper, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 11 },
  exampleText: { color: c.ink, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: 52, maxHeight: 110, borderRadius: 18, borderCurve: 'continuous', backgroundColor: c.backgroundWarm, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, color: c.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15 },
  sendButton: { width: 48, height: 48, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  requestStatus: { color: c.forest, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  error: { color: c.danger, fontSize: 13, lineHeight: 18 },
  consentHint: { minWidth: 0, alignSelf: 'stretch', flexShrink: 1, color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'center', padding: spacing.md },
} as const);

const useStyles = makeStyles(createLiveStyles);
