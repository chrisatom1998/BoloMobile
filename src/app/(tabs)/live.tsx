import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { ArrowLeft, MessageCircle, Sprout, Trash2, Volume2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { ChatMessageRow } from '@/components/chat-message-row';
import { JournalDisplay, JournalKicker } from '@/components/journal-chrome';
import { LiveComposer } from '@/components/live-composer';
import { RealtimeVoiceButton } from '@/components/realtime-voice-button';
import { SegmentedControl } from '@/components/segmented-control';
import { TranscriptPhrasePicker } from '@/components/transcript-phrase-picker';
import { WordDefinitionSheet } from '@/components/word-definition-sheet';
import { useForegroundTimer } from '@/hooks/use-foreground-timer';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { RealtimeInputTranscript, RealtimeTranscriptUpdate, RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { useSpeakText } from '@/hooks/use-speak-text';
import { showAppAlert } from '@/lib/app-alert';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
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

const ashaPortrait = require('../../../assets/images/asha-portrait.png');

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
  const { fontScale, height: windowHeight, width: windowWidth } = useWindowDimensions();
  const heroContentWidth = Math.max(288, Math.min(420, windowWidth - spacing.xxl));
  const compactVoiceLayout = windowHeight < 760;
  const largeTextLayout = useLargeTextLayout();
  const { elapsedSeconds } = useForegroundTimer();
  const { addPracticeSeconds, aiConsent, appendChatMessages, chatHistory, clearChatHistory, clientId, learnerProfile, markLiveTurn, phraseReviews = {}, phrases = [], togglePhrase } = useAppState();
  const { audioError, clearAudioError, speak } = useSpeakText();
  const [responseLanguage, setResponseLanguage] = useState<AshaResponseLanguage>(learnerProfile?.responseLanguage ?? 'en');
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
  const [wordDefinitionPhrase, setWordDefinitionPhrase] = useState<string | null>(null);
  const practiced = useRef(false);
  const mountedRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);
  const realtimeStatusRef = useRef<RealtimeVoiceStatus>('disconnected');
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
  const studioPhrase = phrases[0] ?? { en: 'Less sugar, please.', hi: 'चीनी कम, कृपया।', latin: 'Cheeni kam, kripya.' };
  const studioPhraseMastery = phraseReviews[studioPhrase.hi]?.mastery ?? 0;
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
    disconnected: 'Speak with Asha',
    connecting: 'Connecting to Asha',
    ready: 'Ready when you are',
    recording: 'Asha is listening',
    responding: 'Asha is responding',
  }[realtimeStatus];
  const voiceHeroBody = {
    disconnected: 'Tap the orb, then say the phrase naturally in Hindi.',
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

  const playReply = useCallback((message: ChatMessage) => {
    if (!aiConsent || realtimeOwnsAudio) return;
    setError('');
    if (message.language === 'hi') void speak(message.text, undefined, 1, 'hi');
    else void speak(message.text);
  }, [aiConsent, realtimeOwnsAudio, speak]);

  const changeResponseLanguage = useCallback((nextLanguage: AshaResponseLanguage) => {
    if (languageControlLocked || nextLanguage === responseLanguage) return;
    void stopSpeaking();
    setLiveCaption('');
    setError('');
    clearAudioError();
    setResponseLanguage(nextLanguage);
  }, [clearAudioError, languageControlLocked, responseLanguage]);

  const clearSavedChat = useCallback(() => {
    void stopSpeaking();
    setLiveCaption('');
    selectedChatTextRef.current.clear();
    setWordDefinitionPhrase(null);
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

  const sendText = useCallback(async (raw: string) => {
    const text = raw.trim().slice(0, 500);
    if (!aiConsent || !text || busy || realtimeLocked || requestRef.current) return;
    const userMessage: ChatMessage = { id: `you-${Date.now()}`, role: 'you', text };
    scrollAfterContentChangeRef.current = true;
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
  }, [aiConsent, busy, chatHistory, clearPendingUserMessage, clientId, realtimeLocked, recordTurn, responseLanguage]);

  const submitMessage = useCallback((text: string) => {
    void sendText(text);
  }, [sendText]);

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
      // The controller map is the in-flight record, so it also guards against a
      // duplicate submission before the pending state has committed.
      if (reportControllersRef.current.has(message.id) || reported.has(message.id)) return;
      const controller = new AbortController();
      reportControllersRef.current.set(message.id, controller);
      if (mountedRef.current) setPendingReports((current) => new Set(current).add(message.id));
      try {
        await reportGeneratedMessage({ clientId, message: message.text, reason }, controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;
        setReported((current) => new Set(current).add(message.id));
        showAppAlert('Report received', 'Thank you. This reply was sent for review.');
      } catch (cause) {
        if (mountedRef.current && !controller.signal.aborted) showAppAlert('Could not send report', cause instanceof Error ? cause.message : 'Please try again.');
      } finally {
        if (reportControllersRef.current.get(message.id) === controller) reportControllersRef.current.delete(message.id);
        if (mountedRef.current) {
          setPendingReports((current) => {
            if (!current.has(message.id)) return current;
            const next = new Set(current);
            next.delete(message.id);
            return next;
          });
        }
      }
    })();
    showAppAlert('Report Asha’s reply', 'Choose the main problem.', [
      { text: 'Unsafe or inappropriate', onPress: () => submit('unsafe_or_inappropriate') },
      { text: 'Incorrect or misleading', onPress: () => submit('incorrect_or_misleading') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [clientId, reported]);

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
            <View style={[styles.voiceHero, compactVoiceLayout && styles.voiceHeroCompact, largeTextLayout && styles.voiceHeroLarge, { paddingTop: insets.top + spacing.sm }]} testID="voice-conversation-hero">
              <View style={[styles.topbar, largeTextLayout && styles.topbarLarge, largeTextLayout && { minHeight: Math.ceil(260 * fontScale) }, { width: heroContentWidth }]}>
                <View style={[styles.headerIdentity, largeTextLayout && styles.headerIdentityLarge]}>
                  <Image
                    accessible={false}
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    source={ashaPortrait}
                    style={styles.ashaPortrait}
                    testID="asha-header-portrait"
                    transition={0}
                  />
                  <View style={[styles.headerCopy, largeTextLayout && styles.headerCopyLarge]}>
                    <JournalKicker>Asha · your practice partner</JournalKicker>
                    <JournalDisplay numberOfLines={largeTextLayout ? undefined : 2} style={[styles.headerTitle, largeTextLayout && styles.headerTitleLarge]}>Let’s begin with a little courage.</JournalDisplay>
                    <Text numberOfLines={largeTextLayout ? undefined : 1} style={[styles.headerSubtitle, largeTextLayout && styles.headerSubtitleLarge]}>Conversational Hindi coach · {responseLanguageName} replies</Text>
                  </View>
                </View>
                <View style={[styles.headerActions, largeTextLayout && styles.headerActionsLarge]}>
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
              <View accessibilityLabel="Asha, your Hindi practice partner" style={[styles.portraitStage, { width: heroContentWidth }]}>
                <Image accessible={false} cachePolicy="memory-disk" contentFit="cover" source={ashaPortrait} style={styles.portraitStageImage} transition={0} />
                <View style={styles.portraitStageLabel}><Text style={styles.portraitStageLabelText}>With Asha</Text></View>
              </View>
              <SegmentedControl
                accessibilityLabel="Asha voice language"
                disabled={languageControlLocked}
                disabledHint="End the current request or live voice session to change Asha voice language."
                onValueChange={changeResponseLanguage}
                options={[
                  { accessibilityLabel: 'English', label: 'English replies', value: 'en' },
                  { accessibilityLabel: 'Hindi', label: 'Hindi replies', value: 'hi' },
                ]}
                stackedAtLargeText
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
              {realtimeStatus === 'disconnected' && !hasTranscriptMessages ? (
                <Pressable
                  accessibilityHint="Opens your saved phrases for review."
                  accessibilityLabel={`Review pronunciation reference for ${studioPhrase.hi}`}
                  accessibilityRole="button"
                  onPress={() => router.push('/phrases')}
                  style={[styles.studioPhrase, { width: heroContentWidth }]}
                >
                  <View style={styles.studioPhraseHeading}>
                    <View>
                      <Text style={styles.studioPhraseEyebrow}>Featured phrase</Text>
                      <Text style={styles.studioPhraseEnglish}>{studioPhrase.en}</Text>
                    </View>
                    <View style={styles.studioListenIcon}><Volume2 color={colors.forestText} size={18} /></View>
                  </View>
                  <View style={styles.studioPhraseLine} />
                  <Text style={styles.studioPhraseHindi}>{studioPhrase.hi}</Text>
                  <Text style={styles.studioPhraseLatin}>{studioPhrase.latin}</Text>
                  <View style={styles.studioPhraseFooter}>
                    <Text style={styles.studioPhraseCue}>Say “chee-nee kam” gently; pause after “kam.”</Text>
                    <View style={styles.studioMastery}>
                      <Sprout color={colors.forestText} size={15} />
                      <Text style={styles.studioMasteryText}>{studioPhraseMastery ? `${studioPhraseMastery}/5 roots` : 'Plant a root'}</Text>
                    </View>
                  </View>
                </Pressable>
              ) : null}
              <CaptionReveal style={[styles.captionBlock, { width: heroContentWidth }]}>
                <Text style={styles.captionLabel}>{liveCaptionLabel}</Text>
                <Text accessibilityLiveRegion="polite" style={styles.captionText}>{captionText}</Text>
              </CaptionReveal>
              {!aiConsent ? <Text style={[styles.heroConsentHint, { width: Math.min(330, heroContentWidth) }]}>Review the consent card below to enable connected coaching.</Text> : null}
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
                <AiConsentGate />
            </View>
          </View>
        )}
        onContentSizeChange={() => {
          if (!scrollAfterContentChangeRef.current || !aiConsent) return;
          scrollAfterContentChangeRef.current = false;
          listRef.current?.scrollToEnd({ animated: true });
        }}
        initialNumToRender={8}
        windowSize={7}
        renderItem={({ item }) => (
          <ChatMessageRow
            aiConsent={aiConsent}
            isPending={item.id === pendingUserMessage?.id}
            isWelcome={item.id === welcome.id}
            message={item}
            onOpenPhrasePicker={openPhrasePicker}
            onOpenWordDefinition={setWordDefinitionPhrase}
            onPlayReply={playReply}
            onReport={report}
            onSelectedText={rememberSelectedChatText}
            realtimeOwnsAudio={realtimeOwnsAudio}
            reported={reported.has(item.id)}
            reporting={pendingReports.has(item.id)}
            styles={styles}
          />
        )}
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
        {audioError ? <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text> : null}
        {aiConsent ? (
          <>
            <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examples}>
              {['Order tea', 'Ask the price', 'Be polite', 'Correct my Hindi'].map((example) => (
                <PressableFeedback
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || realtimeLocked }}
                  isDisabled={busy || realtimeLocked}
                  key={example}
                  onPress={() => submitMessage(example)}
                  style={[styles.example, (busy || realtimeLocked) && styles.disabled]}
                >
                  <Text style={styles.exampleText}>{example}</Text>
                </PressableFeedback>
              ))}
            </ScrollView>
            <LiveComposer disabled={busy || realtimeLocked} onSend={submitMessage} styles={styles} />
          </>
        ) : (
          <Text accessibilityLabel="Review the consent card above to enable connected coaching." style={styles.consentHint}>
            {largeTextLayout ? 'Review consent above to enable coaching.' : 'Review the consent card above to enable connected coaching.'}
          </Text>
        )}
      </View>
      {phraseMessage ? <TranscriptPhrasePicker aiConsent={aiConsent} clientId={clientId} message={phraseMessage.message} onClose={() => setPhraseMessage(null)} onSave={saveTranscriptPhrase} selectedText={phraseMessage.selectedText} sourceText={phraseMessage.sourceText} /> : null}
      {wordDefinitionPhrase ? <WordDefinitionSheet clientId={clientId} onClose={() => setWordDefinitionPhrase(null)} phrase={wordDefinitionPhrase} visible /> : null}
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
  voiceHeroLarge: { minHeight: 0, overflow: 'visible' },
  topbar: { minHeight: 86, alignSelf: 'center', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-start', paddingRight: 158, position: 'relative' },
  topbarLarge: { alignItems: 'stretch', flexDirection: 'column', gap: spacing.md, minHeight: 0, paddingRight: 0 },
  headerIdentity: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headerIdentityLarge: { flex: 0 },
  ashaPortrait: { width: 1, height: 1, opacity: 0, flexShrink: 0, borderRadius: radius.pill, backgroundColor: c.brandSoft },
  headerCopy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 2, overflow: 'hidden' },
  headerCopyLarge: { overflow: 'visible' },
  headerTitle: { alignSelf: 'stretch', marginTop: spacing.xs, maxWidth: 260, fontSize: 29, lineHeight: 35, textAlign: 'left' },
  headerTitleLarge: { maxWidth: '100%' },
  headerSubtitle: { minWidth: 0, alignSelf: 'stretch', flexShrink: 1, color: c.muted, fontSize: 11, lineHeight: 15, textAlign: 'left' },
  headerSubtitleLarge: { flexShrink: 0 },
  headerActions: { position: 'absolute', right: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerActionsLarge: { alignSelf: 'flex-end', flexWrap: 'wrap', justifyContent: 'flex-end', position: 'relative', right: undefined },
  privateBadge: { minHeight: 32, borderRadius: radius.pill, backgroundColor: c.forestSoft, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10 },
  privateDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: c.forest },
  privateText: { color: c.forestText, fontSize: 11, fontWeight: '900' },
  headerButton: { width: 36, height: 36, borderRadius: radius.pill, borderCurve: 'continuous', borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center' },
  chatButton: { width: 36, height: 36, borderRadius: radius.pill, borderCurve: 'continuous', borderColor: c.line, borderWidth: StyleSheet.hairlineWidth, backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center' },
  languageSelector: { alignSelf: 'center' },
  portraitStage: { alignSelf: 'center', height: 174, overflow: 'hidden', borderRadius: 25, borderCurve: 'continuous', backgroundColor: c.brandSoft },
  portraitStageImage: { width: '100%', height: '100%' },
  portraitStageLabel: { position: 'absolute', top: spacing.md, left: spacing.md, borderRadius: radius.pill, backgroundColor: c.paperRaised, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  portraitStageLabelText: { color: c.brandText, fontSize: 10, fontWeight: '900', letterSpacing: 0.75, textTransform: 'uppercase' },
  voiceStage: { alignSelf: 'center', minHeight: 178, borderRadius: 28, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs, padding: spacing.md, overflow: 'hidden', boxShadow: '0 8px 18px rgba(35, 39, 35, 0.07)' },
  voiceStageCompact: { minHeight: 160, paddingVertical: spacing.sm },
  liveVoiceBadge: { minHeight: 27, borderRadius: radius.pill, backgroundColor: c.forestSoft, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm },
  liveVoiceDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: c.forest },
  liveVoiceText: { color: c.forestText, fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
  heroCopy: { minWidth: 0, alignSelf: 'stretch', alignItems: 'center', gap: 3 },
  heroTitle: { minWidth: 0, flexShrink: 1, color: c.ink, fontFamily: 'Georgia', fontSize: 21, lineHeight: 27, fontWeight: '700', textAlign: 'center' },
  heroBody: { minWidth: 0, maxWidth: 310, flexShrink: 1, color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  captionBlock: { minHeight: 94, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 20, borderCurve: 'continuous', borderColor: c.line, borderWidth: 1, backgroundColor: c.paperRaised, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  captionLabel: { color: c.forestText, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  captionText: { minWidth: 0, alignSelf: 'stretch', color: c.ink, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  heroConsentHint: { minWidth: 0, alignSelf: 'center', flexShrink: 1, color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  studioPhrase: { alignSelf: 'center', gap: spacing.sm, borderTopColor: c.lineStrong, borderBottomColor: c.lineStrong, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: spacing.md },
  studioPhraseHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  studioPhraseEyebrow: { color: c.brandText, fontSize: 10, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase' },
  studioPhraseEnglish: { color: c.ink, fontFamily: 'Georgia', fontSize: 20, lineHeight: 26, fontWeight: '700' },
  studioListenIcon: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: c.forestSoft, alignItems: 'center', justifyContent: 'center' },
  studioPhraseLine: { height: 1, backgroundColor: c.line },
  studioPhraseHindi: { color: c.ink, fontFamily: 'Georgia', fontSize: 24, lineHeight: 32, fontWeight: '700' },
  studioPhraseLatin: { color: c.brandText, fontSize: 14, fontWeight: '900' },
  studioPhraseFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  studioPhraseCue: { minWidth: 0, flex: 1, color: c.muted, fontSize: 12, lineHeight: 17 },
  studioMastery: { minHeight: 28, borderRadius: radius.pill, backgroundColor: c.goldSoft, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm },
  studioMasteryText: { color: c.forestText, fontSize: 11, fontWeight: '900' },
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
