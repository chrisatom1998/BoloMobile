import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, BookmarkPlus, Flag, MessageCircle, Send, Trash2, Volume2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type NativeSyntheticEvent, type StyleProp, type TextInputSelectionChangeEventData, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { RealtimeVoiceButton } from '@/components/realtime-voice-button';
import { TranscriptPhrasePicker } from '@/components/transcript-phrase-picker';
import { useForegroundTimer } from '@/hooks/use-foreground-timer';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { RealtimeInputTranscript, RealtimeTranscriptUpdate, RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { showAppAlert } from '@/lib/app-alert';
import { observe } from '@/lib/observability';
import { preloadSpeech, speakText, stopSpeaking } from '@/lib/speech';
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

function messageActionExcerpt(text: string) {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= MAX_ACCESSIBLE_REPLY_CHARACTERS) return normalized;
  return `${normalized.slice(0, MAX_ACCESSIBLE_REPLY_CHARACTERS).trimEnd()}\u2026`;
}

function SelectableChatText({
  accessibilityLabel,
  accessibilityLiveRegion,
  onSelectedText,
  style,
  text,
}: {
  accessibilityLabel: string;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  onSelectedText: (text: string) => void;
  style: StyleProp<TextStyle>;
  text: string;
}) {
  const [height, setHeight] = useState(23);

  const selectionChanged = useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { end, start } = event.nativeEvent.selection;
    if (end <= start) return;
    const excerpt = text.slice(start, end).trim();
    if (excerpt) onSelectedText(excerpt);
  }, [onSelectedText, text]);

  return (
    <TextInput
      accessibilityHint="Highlight any words, then use Save selection below."
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion={accessibilityLiveRegion}
      contextMenuHidden={false}
      multiline
      onContentSizeChange={(event) => setHeight(Math.max(23, Math.ceil(event.nativeEvent.contentSize.height)))}
      onSelectionChange={selectionChanged}
      readOnly
      scrollEnabled={false}
      style={[style, { height }]}
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
  const [phraseMessage, setPhraseMessage] = useState<{ message: ChatMessage; selectedText?: string } | null>(null);
  const practiced = useRef(false);
  const mountedRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);
  const realtimeStatusRef = useRef<RealtimeVoiceStatus>('disconnected');
  const pendingReportIdsRef = useRef<Set<string>>(new Set());
  const reportedIdsRef = useRef<Set<string>>(new Set());
  const reportControllersRef = useRef<Map<string, AbortController>>(new Map());
  const selectedChatTextRef = useRef<Map<string, string>>(new Map());
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const scrollAfterContentChangeRef = useRef(false);
  const visibleMessages = useMemo(
    () => pendingUserMessage ? [welcome, ...chatHistory, pendingUserMessage] : [welcome, ...chatHistory],
    [chatHistory, pendingUserMessage],
  );
  const realtimeLocked = realtimeStatus === 'connecting' || realtimeStatus === 'recording' || realtimeStatus === 'responding';
  const realtimeOwnsAudio = realtimeStatus !== 'disconnected';
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
      ? 'Listening to your Hindi…'
      : realtimeStatus === 'responding'
        ? liveAshaTranscript || liveUserTranscript || `Asha is preparing your ${responseLanguageName} reply…`
        : liveCaption || (realtimeStatus === 'ready' ? 'Captions appear after your first turn.' : '');
  const liveCaptionLabel = realtimeStatus === 'recording'
    ? 'Your transcript'
    : realtimeStatus === 'responding' && !liveAshaTranscript && liveUserTranscript
      ? 'You said'
      : 'Live Asha caption';

  const scrollToChat = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

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
    void preloadSpeech(result.reply);
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
    void preloadSpeech(result.reply);
    appendChatMessages([{ id: `asha-${now}`, role: 'asha', text: result.reply.trim(), language: result.language }]);
    if (!practiced.current) {
      practiced.current = true;
      markLiveTurn();
    }
  }, [appendChatMessages, markLiveTurn]);

  const playReply = useCallback(async (text: string) => {
    if (!aiConsent || realtimeOwnsAudio) return;
    setError('');
    try {
      await speakText(text);
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

  const rememberSelectedChatText = useCallback((messageId: string, selectedText: string) => {
    selectedChatTextRef.current.set(messageId, selectedText);
  }, []);

  const openPhrasePicker = useCallback((message: ChatMessage) => {
    setPhraseMessage({ message, selectedText: selectedChatTextRef.current.get(message.id) });
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
          await speakText(result.reply, controller.signal);
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
      <StatusBar style="light" />
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
                <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={router.back} style={styles.headerButton}>
                  <ArrowLeft color={colors.white} size={25} />
                </Pressable>
                <View style={styles.headerCopy}>
                  <Text style={styles.headerTitle}>Asha</Text>
                  <Text numberOfLines={1} style={styles.headerSubtitle}>Conversational Hindi coach · {responseLanguageName} replies</Text>
                </View>
                <Pressable accessibilityLabel="Open chat history" accessibilityRole="button" onPress={scrollToChat} style={styles.chatButton}>
                  <MessageCircle color={colors.ink} size={22} />
                </Pressable>
              </View>

              <>
                  <View accessibilityLabel="Asha response language" accessibilityRole="radiogroup" style={[styles.languageSelector, { width: heroContentWidth }]}>
                    <Text style={styles.languageSelectorLabel}>Asha speaks</Text>
                    <View style={styles.languageOptions}>
                      {([['en', 'English', 'English'], ['hi', 'हिन्दी', 'Hindi']] as const).map(([value, label, accessibleName]) => {
                        const selected = responseLanguage === value;
                        return (
                          <Pressable
                            key={value}
                            accessibilityHint={languageControlLocked ? 'End the current request or live voice session to change Asha voice language.' : undefined}
                            accessibilityLabel={`Asha voice language: ${accessibleName}`}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected, disabled: languageControlLocked }}
                            disabled={languageControlLocked}
                            onPress={() => changeResponseLanguage(value)}
                            style={[styles.languageButton, selected && styles.languageButtonSelected, languageControlLocked && styles.disabled]}
                          >
                            <Text style={[styles.languageButtonText, selected && styles.languageButtonTextSelected]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <RealtimeVoiceButton clientId={clientId} compact={compactVoiceLayout} disabled={busy || !aiConsent} onError={showRealtimeError} onInputTranscriptComplete={recordRealtimeInputTranscript} onStatusChange={updateRealtimeStatus} onTranscriptChange={updateLiveTranscript} onTurnComplete={completeRealtimeTurn} responseLanguage={responseLanguage} />
                  <View style={[styles.heroCopy, { width: heroContentWidth }]}>
                    <Text accessibilityLiveRegion="polite" style={styles.heroTitle}>{voiceHeroTitle}</Text>
                    {voiceHeroBody ? <Text style={styles.heroBody}>{voiceHeroBody}</Text> : null}
                  </View>
                  {realtimeOwnsAudio || liveCaptionText !== '' ? (
                    <CaptionReveal style={[styles.captionBlock, { width: heroContentWidth }]}>
                      <Text style={styles.captionLabel}>{liveCaptionLabel}</Text>
                      <Text accessibilityLiveRegion="polite" style={styles.captionText}>{liveCaptionText}</Text>
                    </CaptionReveal>
                  ) : null}
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
                <Text style={styles.askBody}>Your recent practice stays here on this device.</Text>
                <AiConsentGate><View /></AiConsentGate>
            </View>
          </View>
        )}
        onContentSizeChange={() => {
          if (!scrollAfterContentChangeRef.current || !aiConsent) return;
          scrollAfterContentChangeRef.current = false;
          listRef.current?.scrollToEnd({ animated: true });
        }}
        renderItem={({ item }) => (
          <View style={[styles.messageRow, item.role === 'you' && styles.messageRowYou]}>
            <View style={[styles.message, item.role === 'you' ? styles.userMessage : styles.ashaMessage]}>
              <Text style={[styles.messageLabel, item.role === 'you' && styles.userText]}>{item.role === 'you' ? 'You' : 'Asha'}</Text>
              <SelectableChatText
                accessibilityLabel={`Selectable chat text: ${messageActionExcerpt(item.text)}`}
                accessibilityLiveRegion={item.role === 'asha' && item.id !== welcome.id ? 'polite' : 'none'}
                onSelectedText={(selectedText) => rememberSelectedChatText(item.id, selectedText)}
                style={[styles.messageText, item.role === 'you' && styles.userText]}
                text={item.text}
              />
              {item.role === 'asha' || item.id !== welcome.id ? (
                <View style={styles.messageActions}>
                  {item.id !== welcome.id ? <Pressable accessibilityHint="Saves the words you highlighted. If nothing is highlighted, opens the full message for trimming." accessibilityLabel={`Save transcript phrase: ${messageActionExcerpt(item.text)}`} accessibilityRole="button" onPress={() => openPhrasePicker(item)} style={styles.smallAction}><BookmarkPlus color={item.role === 'you' ? colors.white : colors.forest} size={16} /><Text style={[styles.smallActionText, item.role === 'you' && styles.userText]}>Save selection</Text></Pressable> : null}
                  {item.role === 'asha' ? (
                    <>
                      <Pressable accessibilityHint={!aiConsent ? 'Agree to connected AI processing to enable Listen.' : realtimeOwnsAudio ? 'End realtime voice before playing another voice.' : undefined} accessibilityLabel={`Read reply aloud: ${messageActionExcerpt(item.text)}`} accessibilityRole="button" accessibilityState={{ disabled: !aiConsent || realtimeOwnsAudio }} disabled={!aiConsent || realtimeOwnsAudio} onPress={() => void playReply(item.text)} style={[styles.smallAction, (!aiConsent || realtimeOwnsAudio) && styles.disabled]}><Volume2 color={colors.forest} size={16} /><Text style={styles.smallActionText}>Listen</Text></Pressable>
                      {item.id !== welcome.id ? <Pressable accessibilityLabel={`Report reply: ${messageActionExcerpt(item.text)}`} accessibilityRole="button" accessibilityState={{ disabled: reported.has(item.id) || pendingReports.has(item.id) }} disabled={reported.has(item.id) || pendingReports.has(item.id)} onPress={() => report(item)} style={[styles.smallAction, (reported.has(item.id) || pendingReports.has(item.id)) && styles.disabled]}><Flag color={reported.has(item.id) ? colors.success : colors.muted} size={15} /><Text style={styles.smallActionText}>{reported.has(item.id) ? 'Reported' : pendingReports.has(item.id) ? 'Reporting\u2026' : 'Report'}</Text></Pressable> : null}
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        )}
      />

      <View style={[styles.composer, { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.xs) }]}>
        {busy ? <Text accessibilityLiveRegion="polite" style={styles.requestStatus}>{'Asha is thinking\u2026'}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {aiConsent ? (
          <>
            <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examples}>
              {['Correct my Hindi', 'How do I say thank you?', 'Practice a short dialogue'].map((example) => <Pressable key={example} accessibilityRole="button" accessibilityState={{ disabled: busy || realtimeLocked }} disabled={busy || realtimeLocked} onPress={() => void sendText(example)} style={[styles.example, (busy || realtimeLocked) && styles.disabled]}><Text style={styles.exampleText}>{example}</Text></Pressable>)}
            </ScrollView>
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="Message Asha"
                editable={!busy && !realtimeLocked}
                maxLength={500}
                multiline
                onChangeText={setInput}
                onSubmitEditing={() => void sendText()}
                placeholder="Type a message…"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={input}
              />
              <Pressable accessibilityLabel="Send message" accessibilityRole="button" accessibilityState={{ disabled: busy || realtimeLocked || !input.trim() }} disabled={busy || realtimeLocked || !input.trim()} onPress={() => void sendText()} style={[styles.sendButton, (busy || realtimeLocked || !input.trim()) && styles.disabled]}><Send color={colors.white} size={20} /></Pressable>
            </View>
          </>
        ) : <Text style={styles.consentHint}>Review the consent card above to enable connected coaching.</Text>}
      </View>
      {phraseMessage ? <TranscriptPhrasePicker aiConsent={aiConsent} clientId={clientId} message={phraseMessage.message} onClose={() => setPhraseMessage(null)} onSave={saveTranscriptPhrase} selectedText={phraseMessage.selectedText} /> : null}
    </KeyboardAvoidingView>
  );
}

export const createLiveStyles = (c: ReturnType<typeof useTheme>['colors']) => ({
  screen: { flex: 1, backgroundColor: c.heroBase },
  list: { flex: 1, backgroundColor: c.background },
  listContent: { backgroundColor: c.background, paddingBottom: spacing.lg },
  voiceHero: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl + spacing.xl,
    backgroundColor: c.heroBase,
    overflow: 'hidden',
  },
  voiceHeroCompact: { gap: spacing.xs, paddingBottom: spacing.xxl + spacing.lg },
  topbar: { position: 'relative', minHeight: 58, alignSelf: 'center', alignItems: 'stretch', justifyContent: 'center' },
  headerButton: { position: 'absolute', left: 0, top: 3, width: 52, height: 52, borderRadius: 17, borderCurve: 'continuous', backgroundColor: c.heroRaised, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  headerCopy: { minWidth: 0, alignSelf: 'stretch', justifyContent: 'center', gap: 2, overflow: 'hidden', marginHorizontal: 64 },
  headerTitle: { color: c.white, fontSize: 20, fontWeight: '900' },
  headerSubtitle: { minWidth: 0, flexShrink: 1, color: c.heroMuted, fontSize: 12, lineHeight: 16 },
  chatButton: { position: 'absolute', right: 0, top: 3, width: 52, height: 52, borderRadius: 17, borderCurve: 'continuous', backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  languageSelector: { minHeight: 50, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  languageSelectorLabel: { color: c.heroMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  languageOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, borderRadius: radius.pill, backgroundColor: c.heroRaised, padding: 4 },
  languageButton: { minWidth: 86, minHeight: 44, borderRadius: radius.pill, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  languageButtonSelected: { backgroundColor: c.paper },
  languageButtonText: { color: c.heroMuted, fontSize: 14, fontWeight: '800' },
  languageButtonTextSelected: { color: c.ink },
  heroCopy: { minWidth: 0, alignSelf: 'center', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  heroTitle: { minWidth: 0, flexShrink: 1, color: c.white, fontSize: 24, lineHeight: 30, fontWeight: '900', textAlign: 'center' },
  heroBody: { minWidth: 0, maxWidth: 350, flexShrink: 1, color: c.heroMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  captionBlock: { alignSelf: 'center', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  captionLabel: { color: c.heroMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  captionText: { color: c.white, fontSize: 20, lineHeight: 27, fontWeight: '700', textAlign: 'center' },
  heroConsentHint: { minWidth: 0, alignSelf: 'center', flexShrink: 1, color: c.heroMuted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  askSection: { minHeight: 176, alignSelf: 'stretch', gap: spacing.md, marginTop: -(spacing.xxl + spacing.lg), position: 'relative', zIndex: 2, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderCurve: 'continuous', backgroundColor: c.background, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  askSectionCompact: { gap: spacing.xs, paddingTop: spacing.xs },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: radius.pill, backgroundColor: c.lineStrong },
  askHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  askHeadingCopy: { minWidth: 0, flex: 1, gap: spacing.sm },
  askHeadingCopyCompact: { gap: 0 },
  askEyebrow: { color: c.brandDark, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  askTitle: { color: c.ink, fontSize: 31, lineHeight: 37, fontWeight: '500' },
  askBody: { maxWidth: 520, color: c.muted, fontSize: 14, lineHeight: 21 },
  clearChatButton: { width: 44, height: 44, minHeight: 44, flexShrink: 0, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  messageRow: { alignItems: 'flex-start', backgroundColor: c.background, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  messageRowYou: { alignItems: 'flex-end' },
  message: { maxWidth: '88%', borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.xs, shadowColor: c.black, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.04 * c.shadowOpacityScale, shadowRadius: 10, elevation: 1 * c.shadowOpacityScale },
  ashaMessage: { backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth },
  userMessage: { backgroundColor: c.night },
  messageLabel: { color: c.brandDark, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  messageText: { alignSelf: 'stretch', color: c.ink, fontSize: 16, lineHeight: 23, margin: 0, padding: 0 },
  userText: { color: c.white },
  messageActions: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs },
  smallAction: { minHeight: 44, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', paddingHorizontal: spacing.sm },
  smallActionText: { color: c.muted, fontSize: 12, fontWeight: '700' },
  composer: { backgroundColor: c.paperRaised, borderTopColor: c.line, borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.sm, shadowColor: c.black, shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.08 * c.shadowOpacityScale, shadowRadius: 18, elevation: 8 * c.shadowOpacityScale },
  examples: { gap: spacing.sm, paddingRight: spacing.md },
  example: { minHeight: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.backgroundWarm, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  exampleText: { color: c.ink, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: 52, maxHeight: 110, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.backgroundWarm, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, color: c.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16 },
  sendButton: { width: 52, height: 52, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  requestStatus: { color: c.forest, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  error: { color: c.danger, fontSize: 13, lineHeight: 18 },
  consentHint: { minWidth: 0, alignSelf: 'stretch', flexShrink: 1, color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'center', padding: spacing.md },
} as const);

const useStyles = makeStyles(createLiveStyles);
