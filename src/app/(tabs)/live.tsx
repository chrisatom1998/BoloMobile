import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { Keyboard, KeyboardOff, Lock, MessageCircle, Sprout, Trash2, Volume2, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { ChatMessageRow } from '@/components/chat-message-row';
import { LiveComposer } from '@/components/live-composer';
import { RealtimeVoiceButton } from '@/components/realtime-voice-button';
import { TranscriptPhrasePicker } from '@/components/transcript-phrase-picker';
import { WordDefinitionSheet } from '@/components/word-definition-sheet';
import { useForegroundTimer } from '@/hooks/use-foreground-timer';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { type EffectiveMotion, useMotionPreference } from '@/hooks/use-motion-preference';
import type { LiveTranscriptRow, RealtimeTranscriptUpdate, RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { useSpeakText } from '@/hooks/use-speak-text';
import { showAppAlert } from '@/lib/app-alert';
import { hapticSelect } from '@/lib/haptics';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { observe } from '@/lib/observability';
import { preloadSpeech, speakText, stopSpeaking } from '@/lib/speech';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
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

function CaptionReveal({ children, mode, style }: { children: ReactNode; mode: EffectiveMotion; style: StyleProp<ViewStyle> }) {
  const [progress] = useState(() => new Animated.Value(mode === 'reduced' ? 1 : 0));

  useEffect(() => {
    progress.stopAnimation();
    if (mode === 'reduced') {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    if (mode === 'lively') {
      const animation = Animated.spring(progress, { damping: 16, mass: 0.8, stiffness: 150, toValue: 1, useNativeDriver: true });
      animation.start();
      return () => animation.stop();
    }
    const animation = Animated.timing(progress, { duration: 180, toValue: 1, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [mode, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [mode === 'lively' ? 16 : 6, 0], extrapolate: 'clamp' });
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
  const reflowHeaderLayout = largeTextLayout || fontScale >= 1.2 || windowWidth <= 430;
  const { elapsedSeconds, reset: resetPracticeTimer } = useForegroundTimer();
  const { addPracticeSeconds, aiConsent, appendChatMessages, replaceLiveChatSnapshot, chatHistory, clearChatHistory, clientId, learnerProfile, markLiveTurn, motionPreference = DEFAULT_MOTION_PREFERENCE, phraseReviews = {}, phrases = [], togglePhrase, updateLearnerProfile } = useAppState();
  const { mode: motionMode, reducedMotion } = useMotionPreference(motionPreference);
  const { audioError, clearAudioError, speak } = useSpeakText();
  const responseLanguage: AshaResponseLanguage = learnerProfile.responseLanguage;
  const [busy, setBusy] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<ChatMessage | null>(null);
  const [error, setError] = useState('');
  const [liveAshaTranscript, setLiveAshaTranscript] = useState('');
  const [liveUserTranscript, setLiveUserTranscript] = useState('');
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeVoiceStatus>('disconnected');
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [pendingReports, setPendingReports] = useState<Set<string>>(new Set());
  const [phraseMessage, setPhraseMessage] = useState<{ message: ChatMessage; selectedText?: string; sourceText?: string } | null>(null);
  const [wordDefinitionPhrase, setWordDefinitionPhrase] = useState<string | null>(null);
  const [screenFocused, setScreenFocused] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDraft, setComposerDraft] = useState<{ seed: number; text: string }>({ seed: 0, text: '' });
  const disconnectRef = useRef<(() => void) | null>(null);
  const liveSnapshotIdsRef = useRef<string[]>([]);
  const practiced = useRef(false);
  const mountedRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);
  const realtimeStatusRef = useRef<RealtimeVoiceStatus>('disconnected');
  const reportControllersRef = useRef<Map<string, AbortController>>(new Map());
  const selectedChatTextRef = useRef<Map<string, { sourceText: string; text: string }>>(new Map());
  const selectionClearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const transcriptTurnActionRef = useRef<(() => void) | null>(null);
  const backgroundCheckpointedRef = useRef(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const scrollAfterContentChangeRef = useRef(false);
  const visibleMessages = useMemo(
    () => pendingUserMessage ? [welcome, ...chatHistory, pendingUserMessage] : [welcome, ...chatHistory],
    [chatHistory, pendingUserMessage],
  );
  const realtimeLocked = realtimeStatus !== 'disconnected';
  const realtimeOwnsAudio = realtimeLocked;
  const replyPlaybackLocked = busy || realtimeOwnsAudio;
  const hasTranscriptMessages = chatHistory.length > 0 || pendingUserMessage !== null;
  const studioPhrase = phrases[0] ?? { en: 'Less sugar, please.', hi: 'चीनी कम, कृपया।', latin: 'Cheeni kam, kripya.' };
  const studioPhraseMastery = phraseReviews[studioPhrase.hi]?.mastery ?? 0;
  const transcriptTurnDisabled = !aiConsent || !screenFocused || busy || realtimeStatus === 'connecting';
  const transcriptTurnLabel = {
    disconnected: 'Connect with Asha',
    connecting: 'Connecting to Asha…',
    ready: 'Unmute microphone',
    recording: 'Mute microphone',
    responding: 'Unmute microphone',
  }[realtimeStatus];
  const transcriptTurnHint = realtimeStatus === 'recording'
    ? 'Mutes your microphone. Asha can continue speaking.'
    : 'Opens your microphone for continuous conversation. You can speak while Asha is speaking.';
  const responseLanguageName = responseLanguage === 'hi' ? 'Hindi' : 'English';
  const languageControlLocked = busy || realtimeOwnsAudio;
  const voiceHeroTitle = {
    disconnected: 'Ready when you are',
    connecting: 'Connecting to Asha',
    ready: 'Your microphone is muted',
    recording: 'Your microphone is on',
    responding: 'Asha is speaking',
  }[realtimeStatus];
  const voiceStatusLine = aiConsent ? {
    disconnected: 'Tap to talk',
    connecting: 'Connecting',
    ready: 'Mic muted',
    recording: 'Listening',
    responding: 'Speaking',
  }[realtimeStatus] : 'Consent needed';
  const voiceHeroBody = {
    disconnected: 'Tap the orb to start talking with Asha.',
    connecting: 'Opening a private live voice session…',
    ready: 'Tap the orb to unmute and join the conversation.',
    recording: 'Speak naturally, even while Asha talks. Tap to mute.',
    responding: 'Your mic is muted. Tap the orb to speak at any time.',
  }[realtimeStatus];

  const scrollToChat = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: !reducedMotion });
  }, [reducedMotion]);

  const bindTranscriptTurnAction = useCallback((action: (() => void) | null) => {
    transcriptTurnActionRef.current = action;
  }, []);

  const bindDisconnect = useCallback((disconnect: (() => void) | null) => {
    disconnectRef.current = disconnect;
  }, []);

  const startTranscriptTurn = useCallback(() => {
    if (transcriptTurnDisabled) return;
    transcriptTurnActionRef.current?.();
  }, [transcriptTurnDisabled]);

  const clearPendingUserMessage = useCallback((expectedId: string) => {
    setPendingUserMessage((current) => current?.id === expectedId ? null : current);
  }, []);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    practiced.current = false;
    backgroundCheckpointedRef.current = false;
    resetPracticeTimer();
    return () => {
      setScreenFocused(false);
      if (practiced.current) addPracticeSeconds(elapsedSeconds());
      void stopSpeaking();
    };
  }, [addPracticeSeconds, elapsedSeconds, resetPracticeTimer]));

  // Tabs stay mounted and iOS can kill a backgrounded app without running the
  // focus cleanup. Persist the active portion of a real practice visit before
  // backgrounding, then reset so a later blur cannot count it twice.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        backgroundCheckpointedRef.current = false;
        return;
      }
      if (nextState !== 'background' || !practiced.current || backgroundCheckpointedRef.current) return;
      backgroundCheckpointedRef.current = true;
      addPracticeSeconds(elapsedSeconds());
      resetPracticeTimer();
    });
    return () => subscription?.remove();
  }, [addPracticeSeconds, elapsedSeconds, resetPracticeTimer]);

  useEffect(() => {
    mountedRef.current = true;
    const reportControllers = reportControllersRef.current;
    const selectionClearTimers = selectionClearTimersRef.current;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      reportControllers.forEach((controller) => controller.abort());
      reportControllers.clear();
      selectionClearTimers.forEach(clearTimeout);
      selectionClearTimers.clear();
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

  const recordLiveSnapshot = useCallback((rows: LiveTranscriptRow[]) => {
    if (!mountedRef.current) return;
    const messages: ChatMessage[] = rows.filter((row) => row.text.trim()).map((row) => ({
      id: row.id,
      role: row.speaker,
      text: row.text,
      ...(row.speaker === 'asha' ? { language: responseLanguage } : {}),
    }));
    // The whole snapshot is revisable: late timestamped deltas can merge two
    // provisional rows. Remove prior snapshot IDs so no stale row survives.
    replaceLiveChatSnapshot(liveSnapshotIdsRef.current, messages);
    liveSnapshotIdsRef.current = messages.map((message) => message.id);
    scrollAfterContentChangeRef.current = true;
    setLiveUserTranscript([...messages].reverse().find((row) => row.role === 'you')?.text ?? '');
    setLiveAshaTranscript([...messages].reverse().find((row) => row.role === 'asha')?.text ?? '');
    if (messages.some((row) => row.role === 'you') && !practiced.current) {
      practiced.current = true;
      markLiveTurn();
    }
  }, [markLiveTurn, replaceLiveChatSnapshot, responseLanguage]);

  const playReply = useCallback((message: ChatMessage) => {
    if (!aiConsent || replyPlaybackLocked) return;
    setError('');
    if (message.language === 'hi') void speak(message.text, undefined, 1, 'hi', 'playback', true);
    else void speak(message.text, undefined, 1, undefined, 'playback', true);
  }, [aiConsent, replyPlaybackLocked, speak]);

  const changeResponseLanguage = useCallback((nextLanguage: AshaResponseLanguage) => {
    if (languageControlLocked || nextLanguage === responseLanguage) return;
    void stopSpeaking();
    setLiveUserTranscript('');
    setLiveAshaTranscript('');
    setError('');
    clearAudioError();
    updateLearnerProfile({ responseLanguage: nextLanguage });
  }, [clearAudioError, languageControlLocked, responseLanguage, updateLearnerProfile]);

  const clearSavedChat = useCallback(() => {
    void stopSpeaking();
    setLiveUserTranscript('');
    setLiveAshaTranscript('');
    selectedChatTextRef.current.clear();
    setWordDefinitionPhrase(null);
    clearChatHistory();
  }, [clearChatHistory]);

  const rememberSelectedChatText = useCallback((messageId: string, selection: { sourceText: string; text: string }) => {
    const pendingClear = selectionClearTimersRef.current.get(messageId);
    if (pendingClear) clearTimeout(pendingClear);
    selectionClearTimersRef.current.delete(messageId);
    selectedChatTextRef.current.set(messageId, selection);
  }, []);

  const forgetSelectedChatText = useCallback((messageId: string) => {
    const pendingClear = selectionClearTimersRef.current.get(messageId);
    if (pendingClear) clearTimeout(pendingClear);
    const timer = setTimeout(() => {
      selectedChatTextRef.current.delete(messageId);
      selectionClearTimersRef.current.delete(messageId);
    }, 250);
    selectionClearTimersRef.current.set(messageId, timer);
  }, []);

  const openPhrasePicker = useCallback((message: ChatMessage) => {
    const selection = selectedChatTextRef.current.get(message.id);
    const pendingClear = selectionClearTimersRef.current.get(message.id);
    if (pendingClear) clearTimeout(pendingClear);
    selectionClearTimersRef.current.delete(message.id);
    selectedChatTextRef.current.delete(message.id);
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
          if (result.language === 'hi') await speakText(result.reply, controller.signal, 1, 'hi', 'playback', true);
          else await speakText(result.reply, controller.signal, 1, undefined, 'playback', true);
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
    const previous = realtimeStatusRef.current;
    realtimeStatusRef.current = status;
    setRealtimeStatus(status);
    if (status === 'recording') setError('');
    if (status === 'connecting' && previous === 'disconnected') {
      setError('');
      liveSnapshotIdsRef.current = [];
      setLiveAshaTranscript('');
      setLiveUserTranscript('');
    }
    if (previous === 'connecting' && status !== 'connecting' && status !== 'disconnected') observe('voice_connection_succeeded');
  }, []);
  const showRealtimeError = useCallback((message: string) => {
    // Turn-level errors (unreadable audio, transcription) also arrive here; only
    // count failures that happen while a connection attempt is in flight.
    if (realtimeStatusRef.current === 'connecting') observe('voice_connection_failed');
    setError(message);
  }, []);
  const updateLiveTranscript = useCallback((update: RealtimeTranscriptUpdate) => {
    if (update.speaker === 'asha') setLiveAshaTranscript(update.text);
    else setLiveUserTranscript(update.text);
  }, []);
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
    setTimeout(() => showAppAlert(alreadySaved ? 'Phrase already saved' : 'Phrase saved', `${phrase.latin} — ${phrase.en}`), 0);
  }, [phrases, togglePhrase]);

  const endLiveSession = useCallback(() => {
    if (!disconnectRef.current) return;
    hapticSelect();
    disconnectRef.current();
  }, []);

  const openComposerWith = useCallback((text: string) => {
    setComposerDraft({ seed: Date.now(), text });
    setComposerOpen(true);
  }, []);

  const toggleComposer = useCallback(() => {
    setComposerDraft((current) => ({ seed: current.seed + 1, text: '' }));
    setComposerOpen((open) => !open);
  }, []);

  const featuredPhrase = realtimeStatus === 'disconnected' && !hasTranscriptMessages ? (
    <View style={styles.featuredPhraseSection} testID="featured-phrase-section">
      <Pressable
        accessibilityHint={aiConsent && !realtimeOwnsAudio ? 'Plays this Hindi phrase.' : 'Opens your saved phrases for review.'}
        accessibilityLabel={`Review pronunciation reference for ${studioPhrase.hi}`}
        accessibilityRole="button"
        onPress={() => {
          if (aiConsent && !realtimeOwnsAudio) void speak(studioPhrase.hi);
          else router.push('/phrases');
        }}
        style={[styles.studioPhrase, { width: heroContentWidth }]}
      >
        <View style={styles.studioPhraseHeading}>
          <View style={styles.studioPhraseHeadingCopy}>
            <Text style={styles.studioPhraseEyebrow}>Featured phrase</Text>
            <Text style={styles.studioPhraseEnglish}>{studioPhrase.en}</Text>
          </View>
          <View style={styles.studioListenIcon}><Volume2 color={colors.ink} size={18} /></View>
        </View>
        <View style={styles.studioPhraseLine} />
        <Text style={styles.studioPhraseHindi}>{studioPhrase.hi}</Text>
        <Text style={styles.studioPhraseLatin}>{studioPhrase.latin}</Text>
        <View style={styles.studioPhraseFooter}>
          <Text style={styles.studioPhraseCue}>Say “{studioPhrase.latin}” naturally; keep the rhythm relaxed.</Text>
          <View style={styles.studioMastery}>
            <Sprout color={colors.gold} size={15} />
            <Text style={styles.studioMasteryText}>{studioPhraseMastery ? `${studioPhraseMastery}/5 roots` : 'Plant a root'}</Text>
          </View>
        </View>
      </Pressable>
    </View>
  ) : null;

  const portraitStageSize = compactVoiceLayout ? 152 : 200;
  const portraitRingInset = compactVoiceLayout ? 12 : 16;
  const portraitSize = compactVoiceLayout ? 112 : 148;
  const chipsDisabled = busy || realtimeLocked;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <StatusBar style="light" />
      <FlatList
        ref={listRef}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.listContent}
        data={aiConsent ? visibleMessages : []}
        keyExtractor={(message) => message.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        testID="live-chat-list"
        ListHeaderComponent={(
          <View>
            <View style={[styles.voiceHero, compactVoiceLayout && styles.voiceHeroCompact, largeTextLayout && styles.voiceHeroLarge, !aiConsent && styles.voiceHeroConsent, { paddingTop: insets.top + spacing.lg }]} testID="voice-conversation-hero">
              <View style={[styles.topbar, reflowHeaderLayout && styles.topbarLarge, { width: heroContentWidth }]} testID="asha-header-topbar">
                <View style={[styles.headerCopy, reflowHeaderLayout && styles.headerCopyStacked]}>
                  <Text accessibilityRole="header" numberOfLines={reflowHeaderLayout ? undefined : 1} style={styles.headerTitle}>Asha</Text>
                  <Text numberOfLines={reflowHeaderLayout ? undefined : 1} style={[styles.headerSubtitle, reflowHeaderLayout && styles.headerSubtitleStacked]}>Private Hindi coach · {responseLanguageName} replies</Text>
                </View>
                <View style={[styles.headerActions, reflowHeaderLayout && styles.headerActionsStacked]}>
                  <View accessibilityLabel="Private conversation" accessible style={styles.privateBadge}>
                    <Lock color={colors.brandSoft} size={14} />
                    <Text style={styles.privateText}>Private</Text>
                  </View>
                  {aiConsent ? (
                    <Pressable accessibilityLabel="Open chat history" accessibilityRole="button" onPress={scrollToChat} style={styles.chatButton}>
                      <MessageCircle color={colors.white} size={19} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={[styles.voiceStage, { width: heroContentWidth }]}>
                <View style={[styles.portraitStage, { height: portraitStageSize, width: portraitStageSize }]} testID="asha-portrait-stage">
                  <View pointerEvents="none" style={[styles.portraitRing, styles.portraitRingOuter]} />
                  <View pointerEvents="none" style={[styles.portraitRing, styles.portraitRingInner, { bottom: portraitRingInset, left: portraitRingInset, right: portraitRingInset, top: portraitRingInset }]} />
                  <Image
                    accessible={false}
                    cachePolicy="memory-disk"
                    contentFit="cover"
                    source={ashaPortrait}
                    style={[styles.ashaPortrait, { borderRadius: portraitSize / 2, height: portraitSize, width: portraitSize }]}
                    testID="asha-header-portrait"
                    transition={0}
                  />
                </View>
                <View style={styles.heroCopy}>
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.statusLine} testID="live-status-line">
                    <View style={[styles.statusDot, realtimeStatus === 'disconnected' && styles.statusDotIdle]} />
                    <Text style={styles.statusText}>{voiceStatusLine}</Text>
                  </View>
                  <Text accessibilityLiveRegion="polite" style={styles.heroTitle}>{aiConsent ? voiceHeroTitle : 'Live voice unlocks here'}</Text>
                  <Text style={styles.heroBody}>{aiConsent ? voiceHeroBody : 'Enable live practice below to use voice coaching.'}</Text>
                </View>
              </View>

              {!aiConsent ? (
                <View style={[styles.heroConsent, { width: heroContentWidth }]} testID="live-consent-section">
                  <AiConsentGate actionLabel="Enable live practice" title="Before your first live conversation" />
                </View>
              ) : null}

              <View
                accessibilityLabel="Asha voice language"
                accessibilityRole="tablist"
                style={[styles.languageSelector, reflowHeaderLayout && styles.languageSelectorStacked, { width: heroContentWidth }]}
                testID="live-language-selector"
              >
                {([
                  { label: 'English replies', name: 'English', value: 'en' },
                  { label: 'Hindi replies', name: 'Hindi', value: 'hi' },
                ] as const).map((option) => {
                  const selected = responseLanguage === option.value;
                  const disabled = !aiConsent || languageControlLocked;
                  return (
                    <Pressable
                      accessibilityHint={disabled
                        ? (!aiConsent
                          ? 'Enable live practice above to choose Asha’s reply language.'
                          : 'End the current request or live voice session to change Asha voice language.')
                        : undefined}
                      accessibilityLabel={`Asha voice language: ${option.name}`}
                      accessibilityRole="tab"
                      accessibilityState={{ disabled, selected }}
                      disabled={disabled}
                      key={option.value}
                      onPress={() => changeResponseLanguage(option.value)}
                      style={[styles.languageOption, reflowHeaderLayout && styles.languageOptionStacked, selected && styles.languageOptionSelected, disabled && styles.languageOptionDisabled]}
                    >
                      <Text style={[styles.languageOptionText, selected && styles.languageOptionTextSelected]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <CaptionReveal key={motionMode === 'lively' ? realtimeStatus : 'caption'} mode={motionMode} style={[styles.captionBlock, { width: heroContentWidth }]}>
                <View style={styles.captionPanelYou} testID="live-caption-you">
                  <View style={styles.captionLabelBadge} testID="live-caption-label-badge">
                    <Text style={styles.captionLabel}>You</Text>
                  </View>
                  <Text accessibilityLiveRegion="polite" style={[styles.captionText, !liveUserTranscript && styles.captionPlaceholder]} testID="live-input-caption">{aiConsent ? romanizeDevanagari(liveUserTranscript) || 'Your words appear here as you speak.' : 'Enable live practice to see captions.'}</Text>
                </View>
                <View style={styles.captionPanelAsha} testID="live-caption-asha">
                  <View style={styles.captionLabelBadge}>
                    <Text style={[styles.captionLabel, styles.captionLabelAsha]}>Asha</Text>
                  </View>
                  <Text accessibilityLiveRegion="polite" style={[styles.captionTextAsha, responseLanguage === 'hi' && Boolean(liveAshaTranscript) && styles.captionTextAshaHindi, !liveAshaTranscript && styles.captionPlaceholderAsha]} testID="live-output-caption">{aiConsent ? romanizeDevanagari(liveAshaTranscript) || 'Asha’s words appear here as she speaks.' : 'Enable live practice to see captions.'}</Text>
                </View>
              </CaptionReveal>
            </View>

            {aiConsent ? (
              <View style={[styles.askSection, compactVoiceLayout && styles.askSectionCompact]} testID="ask-asha-sheet">
                <View style={styles.askHeadingRow}>
                  <View style={[styles.askHeadingCopy, compactVoiceLayout && styles.askHeadingCopyCompact]} testID="ask-asha-heading">
                    <Text style={styles.askEyebrow}>Ask Asha</Text>
                    <Text accessibilityRole="header" style={styles.askTitle}>Conversation</Text>
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
                      <Trash2 color={errorOnDark} size={17} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        )}
        onContentSizeChange={() => {
          if (!scrollAfterContentChangeRef.current || !aiConsent) return;
          scrollAfterContentChangeRef.current = false;
          listRef.current?.scrollToEnd({ animated: !reducedMotion });
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
            onSelectionCollapsed={forgetSelectedChatText}
            playbackLocked={replyPlaybackLocked}
            reported={reported.has(item.id)}
            reporting={pendingReports.has(item.id)}
            styles={styles}
          />
        )}
        ListFooterComponent={aiConsent ? (
          <>
            {hasTranscriptMessages ? (
              <View style={styles.transcriptFooter}>
                <View style={styles.transcriptTurnCard}>
                  <Text style={styles.transcriptTurnEyebrow}>Live microphone</Text>
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
            {featuredPhrase}
          </>
        ) : null}
      />

      <View style={[styles.composer, { paddingBottom: Math.max(spacing.md, insets.bottom + 52) }]} testID="live-dock">
        {busy ? <Text accessibilityLiveRegion="polite" style={styles.requestStatus}>{'Asha is thinking…'}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {audioError ? <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text> : null}
        {aiConsent ? (
          <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examples}>
            <PressableFeedback
              accessibilityHint="Opens the message box so you can ask Asha how to say something."
              accessibilityRole="button"
              accessibilityState={{ disabled: chipsDisabled }}
              isDisabled={chipsDisabled}
              onPress={() => openComposerWith('How do I say ')}
              style={[styles.example, chipsDisabled && styles.disabled]}
              testID="live-how-do-i-say"
            >
              <Text style={styles.exampleText}>How do I say…?</Text>
            </PressableFeedback>
            {['Order tea', 'Ask the price', 'Be polite', 'Correct my Hindi'].map((example) => (
              <PressableFeedback
                accessibilityRole="button"
                accessibilityState={{ disabled: chipsDisabled }}
                isDisabled={chipsDisabled}
                key={example}
                onPress={() => submitMessage(example)}
                style={[styles.example, chipsDisabled && styles.disabled]}
              >
                <Text style={styles.exampleText}>{example}</Text>
              </PressableFeedback>
            ))}
          </ScrollView>
        ) : null}
        {aiConsent && composerOpen ? (
          <LiveComposer autoFocus disabled={busy || realtimeLocked} initialText={composerDraft.text} key={composerDraft.seed} onSend={submitMessage} styles={styles} />
        ) : null}
        <View style={styles.controlRow} testID="live-voice-controls">
          {aiConsent ? (
            <Pressable
              accessibilityHint={composerOpen ? 'Hides the message box.' : 'Opens a message box to type to Asha instead of speaking.'}
              accessibilityLabel={composerOpen ? 'Hide message box' : 'Type instead'}
              accessibilityRole="button"
              accessibilityState={{ expanded: composerOpen }}
              onPress={toggleComposer}
              style={[styles.secondaryControl, composerOpen && styles.secondaryControlActive]}
              testID="live-composer-toggle"
            >
              {composerOpen ? <KeyboardOff color={colors.ink} size={20} /> : <Keyboard color={colors.white} size={20} />}
            </Pressable>
          ) : <View style={styles.secondaryControlSpacer} />}
          <RealtimeVoiceButton key={`${screenFocused && aiConsent ? 'enabled' : 'disabled'}-${clientId}`} clientId={clientId} disabled={!aiConsent || !screenFocused || busy} motionMode={motionMode} onError={showRealtimeError} history={chatHistory} onDisconnectReady={bindDisconnect} onTranscriptSnapshot={recordLiveSnapshot} onStatusChange={updateRealtimeStatus} onTranscriptChange={updateLiveTranscript} onTurnActionReady={bindTranscriptTurnAction} responseLanguage={responseLanguage} size="hero" />
          {realtimeLocked ? (
            <Pressable
              accessibilityHint="Closes the live voice connection and releases the microphone."
              accessibilityLabel="End live voice session"
              accessibilityRole="button"
              onPress={endLiveSession}
              style={styles.secondaryControl}
              testID="live-end-session"
            >
              <X color={colors.white} size={20} />
            </Pressable>
          ) : <View style={styles.secondaryControlSpacer} />}
        </View>
      </View>
      {phraseMessage ? <TranscriptPhrasePicker aiConsent={aiConsent} clientId={clientId} message={phraseMessage.message} onClose={() => setPhraseMessage(null)} onSave={saveTranscriptPhrase} reducedMotion={reducedMotion} selectedText={phraseMessage.selectedText} sourceText={phraseMessage.sourceText} /> : null}
      {wordDefinitionPhrase ? <WordDefinitionSheet clientId={clientId} onClose={() => setWordDefinitionPhrase(null)} phrase={wordDefinitionPhrase} reducedMotion={reducedMotion} scriptPreference={learnerProfile?.scriptPreference ?? 'both'} visible /> : null}
    </KeyboardAvoidingView>
  );
}

/** Local dark-surface tokens for the focused Asha screen (derived from the night palette). */
const darkPanel = '#1E302D';
const darkLine = '#34504B';
const goldRingFaint = 'rgba(231, 172, 61, 0.25)';
const goldRingStrong = 'rgba(231, 172, 61, 0.5)';
/** A light coral that keeps error copy above 4.5:1 on the night ground and dark panels. */
const errorOnDark = '#FFB4A6';

export const createLiveStyles = (c: ReturnType<typeof useTheme>['colors']) => ({
  screen: { flex: 1, backgroundColor: c.night },
  list: { flex: 1, backgroundColor: c.night },
  listContent: { backgroundColor: c.night, paddingBottom: spacing.lg },
  voiceHero: {
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: c.night,
  },
  voiceHeroCompact: { gap: spacing.xs, paddingBottom: spacing.md },
  voiceHeroLarge: { overflow: 'visible' },
  voiceHeroConsent: { overflow: 'visible', paddingBottom: spacing.xl },
  topbar: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingRight: 0 },
  topbarLarge: { alignItems: 'stretch', flexDirection: 'column', gap: spacing.md, paddingRight: 0 },
  headerCopy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 2 },
  headerCopyStacked: { flex: 0 },
  headerTitle: { color: c.white, fontFamily: 'Georgia', fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.3 },
  headerSubtitle: { minWidth: 0, alignSelf: 'stretch', flexShrink: 1, color: c.heroSubtle, fontSize: 13, lineHeight: 18 },
  headerSubtitleStacked: { flexShrink: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerActionsStacked: { alignSelf: 'flex-start', flexWrap: 'wrap' },
  privateBadge: { minHeight: 32, borderRadius: radius.pill, borderColor: darkLine, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  privateText: { color: c.brandSoft, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  chatButton: { width: 44, height: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: darkPanel, alignItems: 'center', justifyContent: 'center' },
  voiceStage: { alignSelf: 'center', alignItems: 'center', gap: spacing.lg },
  portraitStage: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  portraitRing: { position: 'absolute', borderRadius: radius.pill, borderWidth: 2 },
  portraitRingOuter: { top: 0, right: 0, bottom: 0, left: 0, borderColor: goldRingFaint },
  portraitRingInner: { borderColor: goldRingStrong },
  ashaPortrait: { borderWidth: 3, borderColor: c.gold, backgroundColor: darkPanel },
  heroCopy: { minWidth: 0, alignSelf: 'stretch', alignItems: 'center', gap: 6 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: c.gold },
  statusDotIdle: { backgroundColor: 'transparent', borderColor: c.gold, borderWidth: 1.5 },
  statusText: { color: c.gold, fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  heroTitle: { minWidth: 0, maxWidth: 320, flexShrink: 1, color: c.white, fontFamily: 'Georgia', fontSize: 22, lineHeight: 28, fontWeight: '700', textAlign: 'center' },
  heroBody: { minWidth: 0, maxWidth: 310, flexShrink: 1, color: c.heroSubtle, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  heroConsent: { alignSelf: 'center' },
  languageSelector: { alignSelf: 'center', flexDirection: 'row', gap: spacing.sm, borderRadius: radius.pill, borderColor: darkLine, borderWidth: 1, padding: 4 },
  languageSelectorStacked: { flexDirection: 'column', borderRadius: radius.lg },
  languageOption: { minHeight: 44, flex: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  languageOptionStacked: { flex: 0, alignSelf: 'stretch', paddingVertical: spacing.sm },
  languageOptionSelected: { backgroundColor: c.gold },
  languageOptionDisabled: { opacity: 0.55 },
  languageOptionText: { color: c.white, fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  languageOptionTextSelected: { color: c.ink, fontWeight: '800' },
  captionBlock: { alignSelf: 'center', gap: 10 },
  captionPanelYou: { borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: darkPanel, paddingHorizontal: 14, paddingVertical: spacing.md, gap: spacing.xs },
  captionPanelAsha: { borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.white, paddingHorizontal: 14, paddingVertical: spacing.md, gap: spacing.xs },
  captionLabelBadge: { minHeight: 18, alignSelf: 'flex-start', justifyContent: 'center', overflow: 'visible', paddingVertical: 0 },
  captionLabel: { color: c.heroSubtle, fontSize: 12, lineHeight: 18, fontWeight: '800', letterSpacing: 0.25 },
  captionLabelAsha: { color: c.brand },
  captionText: { minWidth: 0, alignSelf: 'stretch', color: c.white, fontSize: 16, lineHeight: 22 },
  captionPlaceholder: { color: c.heroSubtle, fontSize: 14, lineHeight: 20 },
  captionTextAsha: { minWidth: 0, alignSelf: 'stretch', color: c.ink, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  captionTextAshaHindi: { fontFamily: 'Georgia', fontSize: 18, lineHeight: 25, fontWeight: '700' },
  captionPlaceholderAsha: { color: c.muted, fontSize: 14, lineHeight: 20, fontWeight: '400' },
  studioPhrase: { alignSelf: 'center', gap: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: darkPanel, padding: spacing.lg },
  studioPhraseHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  studioPhraseHeadingCopy: { minWidth: 0, flex: 1 },
  studioPhraseEyebrow: { color: c.gold, fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase' },
  studioPhraseEnglish: { color: c.white, fontFamily: 'Georgia', fontSize: 20, lineHeight: 26, fontWeight: '700' },
  studioListenIcon: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  studioPhraseLine: { height: 1, backgroundColor: darkLine },
  studioPhraseHindi: { color: c.white, fontFamily: 'Georgia', fontSize: 24, lineHeight: 32, fontWeight: '700' },
  studioPhraseLatin: { color: c.gold, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  studioPhraseFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  studioPhraseCue: { minWidth: 0, flex: 1, color: c.heroSubtle, fontSize: 13, lineHeight: 18 },
  studioMastery: { minHeight: 28, borderRadius: radius.pill, borderColor: darkLine, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm },
  studioMasteryText: { color: c.white, fontSize: 12, fontWeight: '700' },
  featuredPhraseSection: { alignItems: 'center', backgroundColor: c.night, paddingHorizontal: 20, paddingTop: spacing.md, paddingBottom: spacing.xl },
  askSection: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm, borderTopColor: darkLine, borderTopWidth: StyleSheet.hairlineWidth, backgroundColor: c.night, paddingHorizontal: 20, paddingTop: spacing.lg, paddingBottom: spacing.md },
  askSectionCompact: { gap: spacing.xs, paddingTop: spacing.sm },
  askHeadingRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  askHeadingCopy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 2 },
  askHeadingCopyCompact: { gap: 0 },
  askEyebrow: { color: c.gold, fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  askTitle: { color: c.white, fontFamily: 'Georgia', fontSize: 20, lineHeight: 26, fontWeight: '700' },
  clearChatButton: { width: 44, height: 44, minHeight: 44, flexShrink: 0, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: darkPanel, alignItems: 'center', justifyContent: 'center' },
  messageRow: { alignItems: 'flex-start', backgroundColor: c.night, paddingHorizontal: 20, marginBottom: spacing.sm },
  messageRowYou: { alignItems: 'flex-end' },
  message: { maxWidth: '88%', borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.xs },
  ashaMessage: { backgroundColor: c.paperRaised },
  userMessage: { backgroundColor: darkPanel },
  messageIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  messageAvatar: { width: 23, height: 23, borderRadius: radius.pill, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  messageAvatarYou: { backgroundColor: 'rgba(255,255,255,0.16)' },
  messageAvatarText: { color: c.brandText, fontSize: 12, lineHeight: 15, fontWeight: '900' },
  messageAvatarTextYou: { color: c.white, fontSize: 10 },
  messageLabel: { color: c.brand, fontSize: 12, fontWeight: '800' },
  messageText: { alignSelf: 'stretch', color: c.ink, fontSize: 16, lineHeight: 23, margin: 0, padding: 0 },
  userText: { color: c.white },
  messageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingTop: spacing.xs },
  smallAction: { minHeight: 44, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', paddingHorizontal: spacing.sm },
  smallActionText: { color: c.muted, fontSize: 12, fontWeight: '700' },
  transcriptFooter: { backgroundColor: c.night, paddingHorizontal: 20, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  transcriptTurnCard: { borderRadius: radius.lg, borderCurve: 'continuous', borderColor: darkLine, borderWidth: 1, backgroundColor: darkPanel, gap: spacing.sm, padding: spacing.md },
  transcriptTurnEyebrow: { color: c.gold, fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 0.75, textTransform: 'uppercase' },
  transcriptTurnButton: { minHeight: 52, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  transcriptTurnButtonText: { color: c.ink, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  composer: { backgroundColor: c.night, borderTopColor: darkLine, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: spacing.md, gap: spacing.md },
  examples: { justifyContent: 'center', gap: spacing.sm, paddingRight: spacing.xl },
  example: { minHeight: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: 'transparent', borderColor: darkLine, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  exampleText: { color: c.white, fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'center' },
  controlRow: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  secondaryControl: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: darkPanel, alignItems: 'center', justifyContent: 'center' },
  secondaryControlActive: { backgroundColor: c.gold },
  secondaryControlSpacer: { width: 52, height: 52 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: 52, maxHeight: 110, borderRadius: 18, borderCurve: 'continuous', backgroundColor: darkPanel, borderColor: darkLine, borderWidth: 1, color: c.white, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15 },
  inputDisabled: { opacity: 0.55 },
  sendButton: { width: 52, height: 52, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  requestStatus: { color: c.gold, fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  error: { color: errorOnDark, fontSize: 13, lineHeight: 18 },
} as const);

const useStyles = makeStyles(createLiveStyles);
