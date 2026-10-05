import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { setStatusBarStyle } from 'expo-status-bar';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { Lock, MessageCircle, Sprout, Trash2, Volume2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { ChatMessageRow } from '@/components/chat-message-row';
import { JournalDisplay } from '@/components/journal-chrome';
import { LiveComposer } from '@/components/live-composer';
import { RealtimeVoiceButton } from '@/components/realtime-voice-button';
import { SegmentedControl } from '@/components/segmented-control';
import { TranscriptPhrasePicker } from '@/components/transcript-phrase-picker';
import { WordDefinitionSheet } from '@/components/word-definition-sheet';
import { useForegroundTimer } from '@/hooks/use-foreground-timer';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { type EffectiveMotion, useMotionPreference } from '@/hooks/use-motion-preference';
import type { LiveTranscriptRow, RealtimeTranscriptUpdate, RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { useSpeakText } from '@/hooks/use-speak-text';
import { showAppAlert } from '@/lib/app-alert';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { observe } from '@/lib/observability';
import { preloadSpeech, speakText, stopSpeaking } from '@/lib/speech';
import { DEFAULT_MOTION_PREFERENCE } from '@/lib/storage';
import { reportGeneratedMessage, sendMobileChat, type ReportReason } from '@/services/bolo-api';
import { useAppState } from '@/state/app-state';
import type { ChatMessage, AshaResponseLanguage, SavedPhrase } from '@/state/app-state-types';
import { displayFont, makeStyles, radius, spacing, useTheme } from '@/theme';

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
  const [wordSheetKey, setWordSheetKey] = useState(0);
  const liveSnapshotIdsRef = useRef<string[]>([]);
  const practiced = useRef(false);
  const mountedRef = useRef(true);
  // Tabs stay mounted, so a typed reply can resolve after blur; it must not play then.
  const screenFocusedRef = useRef(true);
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

  const startTranscriptTurn = useCallback(() => {
    if (transcriptTurnDisabled) return;
    transcriptTurnActionRef.current?.();
  }, [transcriptTurnDisabled]);

  const clearPendingUserMessage = useCallback((expectedId: string) => {
    setPendingUserMessage((current) => current?.id === expectedId ? null : current);
  }, []);

  // Only the dark Asha screen uses light status-bar text; every other screen
  // relies on the root layout's dark style, so restore it on blur.
  useFocusEffect(useCallback(() => {
    setStatusBarStyle('light', true);
    return () => setStatusBarStyle('dark', true);
  }, []));

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    screenFocusedRef.current = true;
    practiced.current = false;
    backgroundCheckpointedRef.current = false;
    resetPracticeTimer();
    return () => {
      setScreenFocused(false);
      screenFocusedRef.current = false;
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
    setWordSheetKey((key) => key + 1);
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

  const sendText = useCallback(async (raw: string): Promise<boolean> => {
    const text = raw.trim().slice(0, 500);
    if (!aiConsent || !text || busy || realtimeLocked || requestRef.current) return false;
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
        return false;
      }
      clearPendingUserMessage(userMessage.id);
      recordTurn({ transcript: userMessage.text, reply: result.reply, language: result.language });
      if (realtimeStatusRef.current === 'disconnected' && screenFocusedRef.current) {
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
      return true;
    } catch (cause) {
      if (mountedRef.current) clearPendingUserMessage(userMessage.id);
      if (mountedRef.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Asha could not answer right now.');
      }
      return false;
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (mountedRef.current) setBusy(false);
      }
    }
  }, [aiConsent, busy, chatHistory, clearPendingUserMessage, clientId, realtimeLocked, recordTurn, responseLanguage]);

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

  const featuredPhrase = realtimeStatus === 'disconnected' && !hasTranscriptMessages ? (
    <View style={styles.featuredPhraseSection} testID="featured-phrase-section">
      <Pressable
        accessibilityHint="Plays this Hindi phrase."
        accessibilityLabel={`Review pronunciation reference for ${studioPhrase.hi}`}
        accessibilityRole="button"
        onPress={() => { void speak(studioPhrase.hi); }}
        style={[styles.studioPhrase, { width: heroContentWidth }]}
      >
        <View style={styles.studioPhraseHeading}>
          <View style={styles.studioPhraseCopy}>
            <Text style={styles.studioPhraseEyebrow}>Featured phrase</Text>
            <Text style={styles.studioPhraseEnglish}>{studioPhrase.en}</Text>
          </View>
          <View style={styles.studioListenIcon}><Volume2 color={colors.ink} size={18} /></View>
        </View>
        <Text accessibilityLanguage="hi-IN" style={styles.studioPhraseHindi}>{studioPhrase.hi}</Text>
        <Text style={styles.studioPhraseLatin}>{studioPhrase.latin}</Text>
        <View style={styles.studioPhraseFooter}>
          <Text style={styles.studioPhraseCue}>Say “{studioPhrase.latin}” naturally; keep the rhythm relaxed.</Text>
          <View style={styles.studioMastery}>
            <Sprout color={colors.goldText} size={15} />
            <Text style={styles.studioMasteryText}>{studioPhraseMastery ? `${studioPhraseMastery}/5 roots` : 'Plant a root'}</Text>
          </View>
        </View>
      </Pressable>
    </View>
  ) : null;

  const statusKicker = aiConsent
    ? { disconnected: 'READY', connecting: 'CONNECTING', ready: 'MUTED', recording: 'LISTENING', responding: 'SPEAKING' }[realtimeStatus]
    : 'LIVE VOICE';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
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
            <View style={[styles.voiceHero, compactVoiceLayout && styles.voiceHeroCompact, largeTextLayout && styles.voiceHeroLarge, !aiConsent && styles.voiceHeroConsent, { paddingTop: insets.top + spacing.xl }]} testID="voice-conversation-hero">
              <View style={[styles.topbar, reflowHeaderLayout && styles.topbarLarge, { width: heroContentWidth }]} testID="asha-header-topbar">
                <View style={[styles.headerIdentity, reflowHeaderLayout && styles.headerIdentityLarge]}>
                  <View style={[styles.headerCopy, reflowHeaderLayout && styles.headerCopyStacked]}>
                    <JournalDisplay numberOfLines={reflowHeaderLayout ? undefined : 2} style={[styles.headerTitle, reflowHeaderLayout && styles.headerTitleStacked]}>Speak with Asha</JournalDisplay>
                    <Text numberOfLines={reflowHeaderLayout ? undefined : 1} style={[styles.headerSubtitle, reflowHeaderLayout && styles.headerSubtitleStacked]}>Private Hindi coach · {responseLanguageName} replies</Text>
                  </View>
                </View>
                <View style={[styles.headerActions, reflowHeaderLayout && styles.headerActionsStacked]}>
                  <View accessibilityLabel="Private conversation" style={styles.privateBadge}>
                    <Lock color={colors.brandSoft} size={14} strokeWidth={2} />
                    <Text style={styles.privateText}>Private</Text>
                  </View>
                </View>
              </View>
              {!aiConsent ? (
                <View style={[styles.heroConsent, { width: heroContentWidth }]} testID="live-consent-section">
                  <AiConsentGate actionLabel="Enable live practice" title="Before your first live conversation" />
                </View>
              ) : null}
              <View style={styles.liveControls} testID="live-voice-controls">
                <SegmentedControl
                  accessibilityLabel="Asha voice language"
                  disabled={!aiConsent || languageControlLocked}
                  disabledHint={!aiConsent
                    ? 'Enable live practice above to choose Asha’s reply language.'
                    : 'End the current request or live voice session to change Asha voice language.'}
                  onValueChange={changeResponseLanguage}
                  options={[
                    { accessibilityLabel: 'English', label: 'English replies', value: 'en' },
                    { accessibilityLabel: 'Hindi', label: 'Hindi replies', value: 'hi' },
                  ]}
                  stackedAtLargeText
                  style={[styles.languageSelector, { width: heroContentWidth }]}
                  tone="dark"
                  value={responseLanguage}
                />
                <View style={[styles.voiceStage, compactVoiceLayout && styles.voiceStageCompact, { width: heroContentWidth }]}>
                  <View style={[styles.portraitStage, compactVoiceLayout && styles.portraitStageCompact]}>
                    <View pointerEvents="none" style={[styles.portraitRing, styles.portraitRingOuter, compactVoiceLayout && styles.portraitRingOuterCompact]} />
                    <View pointerEvents="none" style={[styles.portraitRing, styles.portraitRingInner, compactVoiceLayout && styles.portraitRingInnerCompact]} />
                    <Image
                      accessible={false}
                      cachePolicy="memory-disk"
                      contentFit="cover"
                      source={ashaPortrait}
                      style={[styles.ashaPortrait, compactVoiceLayout && styles.ashaPortraitCompact]}
                      testID="asha-header-portrait"
                      transition={0}
                    />
                  </View>
                  <View style={styles.heroCopy}>
                    <View style={styles.statusRow}>
                      <View style={[styles.statusDot, realtimeStatus === 'recording' && styles.statusDotLive]} />
                      <Text style={styles.liveVoiceText}>{statusKicker}</Text>
                    </View>
                    <Text accessibilityLiveRegion="polite" style={styles.heroTitle}>{aiConsent ? voiceHeroTitle : 'Live voice unlocks here'}</Text>
                    <Text style={styles.heroBody}>{aiConsent ? voiceHeroBody : 'Enable live practice above to use voice coaching.'}</Text>
                  </View>
                  <View style={styles.orbRow}>
                    {aiConsent ? (
                      <Pressable accessibilityLabel="Open chat history" accessibilityRole="button" onPress={scrollToChat} style={styles.chatButton}>
                        <MessageCircle color={colors.white} size={20} />
                      </Pressable>
                    ) : null}
                    <RealtimeVoiceButton key={`${screenFocused && aiConsent ? 'enabled' : 'disabled'}-${clientId}`} clientId={clientId} compact={compactVoiceLayout} disabled={!aiConsent || !screenFocused || busy} motionMode={motionMode} onError={showRealtimeError} history={chatHistory} onTranscriptSnapshot={recordLiveSnapshot} onStatusChange={updateRealtimeStatus} onTranscriptChange={updateLiveTranscript} onTurnActionReady={bindTranscriptTurnAction} responseLanguage={responseLanguage} size="minimal" tone="dark" />
                  </View>
                </View>
                <CaptionReveal key={motionMode === 'lively' ? realtimeStatus : 'caption'} mode={motionMode} style={[styles.captionBlock, { width: heroContentWidth }]}>
                  <View style={[styles.captionCard, styles.captionCardYou]}>
                    <View style={styles.captionLabelBadge} testID="live-caption-label-badge">
                      <Text style={styles.captionLabel}>You</Text>
                    </View>
                    <Text accessibilityLiveRegion="polite" style={styles.captionText} testID="live-input-caption">{aiConsent ? romanizeDevanagari(liveUserTranscript) || 'Your words appear here as you speak.' : 'Enable live practice to see captions.'}</Text>
                  </View>
                  <View style={[styles.captionCard, styles.captionCardAsha]}>
                    <View style={styles.captionLabelBadge}>
                      <Text style={[styles.captionLabel, styles.captionLabelAsha]}>Asha</Text>
                    </View>
                    <Text accessibilityLiveRegion="polite" style={[styles.captionText, styles.captionTextAsha]} testID="live-output-caption">{aiConsent ? romanizeDevanagari(liveAshaTranscript) || 'Asha’s words appear here as she speaks.' : 'Enable live practice to see captions.'}</Text>
                  </View>
                </CaptionReveal>
              </View>
            </View>

            {aiConsent ? <View style={[styles.askSection, compactVoiceLayout && styles.askSectionCompact]} testID="ask-asha-sheet">
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
                      <Trash2 color={colors.dangerSoft} size={17} />
                    </Pressable>
                  ) : null}
                </View>
            </View> : null}
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

      {aiConsent ? <View style={[styles.composer, { paddingBottom: Math.max(spacing.md, insets.bottom + 52) }]}>
        {busy ? <Text accessibilityLiveRegion="polite" style={styles.requestStatus}>{'Asha is thinking…'}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {audioError ? <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text> : null}
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examples}>
          {['Order tea', 'Ask the price', 'Be polite', 'Correct my Hindi'].map((example) => (
            <PressableFeedback
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || realtimeLocked }}
              isDisabled={busy || realtimeLocked}
              key={example}
              onPress={() => { void sendText(example); }}
              style={[styles.example, (busy || realtimeLocked) && styles.disabled]}
            >
              <Text style={styles.exampleText}>{example}</Text>
            </PressableFeedback>
          ))}
        </ScrollView>
        <LiveComposer disabled={busy || realtimeLocked} onSend={sendText} styles={styles} />
      </View> : null}
      {phraseMessage ? <TranscriptPhrasePicker aiConsent={aiConsent} clientId={clientId} message={phraseMessage.message} onClose={() => setPhraseMessage(null)} onSave={saveTranscriptPhrase} reducedMotion={reducedMotion} selectedText={phraseMessage.selectedText} sourceText={phraseMessage.sourceText} /> : null}
      {aiConsent ? <WordDefinitionSheet key={wordSheetKey} clientId={clientId} onClose={() => setWordDefinitionPhrase(null)} phrase={wordDefinitionPhrase ?? ''} reducedMotion={reducedMotion} scriptPreference={learnerProfile?.scriptPreference ?? 'both'} visible={!!wordDefinitionPhrase} /> : null}
    </KeyboardAvoidingView>
  );
}

export const createLiveStyles = (c: ReturnType<typeof useTheme>['colors']) => ({
  screen: { flex: 1, backgroundColor: c.night },
  list: { flex: 1, backgroundColor: c.night },
  listContent: { backgroundColor: c.night, paddingBottom: spacing.lg },
  voiceHero: {
    minHeight: 492,
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: c.night,
    overflow: 'hidden',
  },
  voiceHeroCompact: { gap: spacing.xs, minHeight: 430, paddingBottom: spacing.md },
  voiceHeroLarge: { minHeight: 0, overflow: 'visible' },
  voiceHeroConsent: { minHeight: 0, overflow: 'visible', paddingBottom: spacing.xl },
  topbar: { minHeight: 48, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  topbarLarge: { alignItems: 'stretch', flexDirection: 'column', gap: spacing.md, minHeight: 0, paddingRight: 0 },
  headerIdentity: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headerIdentityLarge: { flex: 0 },
  headerCopy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 2, overflow: 'hidden' },
  headerCopyStacked: { overflow: 'visible' },
  headerTitle: { alignSelf: 'stretch', color: c.white, maxWidth: 260, fontSize: 28, lineHeight: 34, textAlign: 'left' },
  headerTitleStacked: { maxWidth: '100%' },
  headerSubtitle: { minWidth: 0, alignSelf: 'stretch', flexShrink: 1, color: c.heroSubtle, fontSize: 13, lineHeight: 18, textAlign: 'left' },
  headerSubtitleStacked: { flexShrink: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerActionsStacked: { alignSelf: 'flex-start', flexWrap: 'wrap' },
  privateBadge: { minHeight: 36, borderRadius: radius.pill, borderColor: c.nightLine, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md },
  privateText: { color: c.brandSoft, fontSize: 13, fontWeight: '600' },
  chatButton: { position: 'absolute', left: 0, top: 26, width: 52, height: 52, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.nightSurface, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  languageSelector: { alignSelf: 'center' },
  heroConsent: { alignSelf: 'center' },
  liveControls: { alignSelf: 'center', alignItems: 'center', gap: 10 },
  voiceStage: { alignSelf: 'center', alignItems: 'center', gap: 10 },
  voiceStageCompact: { gap: spacing.sm },
  portraitStage: { width: 144, height: 144, alignItems: 'center', justifyContent: 'center' },
  portraitStageCompact: { width: 124, height: 124 },
  portraitRing: { position: 'absolute', borderRadius: radius.pill, borderWidth: 2 },
  portraitRingOuter: { width: 144, height: 144, borderColor: 'rgba(231, 172, 61, 0.25)' },
  portraitRingOuterCompact: { width: 124, height: 124 },
  portraitRingInner: { width: 128, height: 128, borderColor: 'rgba(231, 172, 61, 0.5)' },
  portraitRingInnerCompact: { width: 110, height: 110 },
  ashaPortrait: { width: 112, height: 112, borderRadius: radius.pill, borderColor: c.gold, borderWidth: 3, backgroundColor: c.nightSurface },
  ashaPortraitCompact: { width: 96, height: 96 },
  heroCopy: { minWidth: 0, alignSelf: 'stretch', alignItems: 'center', gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: c.gold, opacity: 0.6 },
  statusDotLive: { opacity: 1 },
  liveVoiceText: { color: c.gold, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1 },
  heroTitle: { minWidth: 0, maxWidth: 300, flexShrink: 1, color: c.white, fontFamily: displayFont, fontSize: 20, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  heroBody: { minWidth: 0, maxWidth: 310, flexShrink: 1, color: c.heroSubtle, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  orbRow: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  captionBlock: { alignSelf: 'center', gap: 10 },
  captionCard: { alignSelf: 'stretch', gap: spacing.xs, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: spacing.md },
  captionCardYou: { backgroundColor: c.nightSurface },
  captionCardAsha: { backgroundColor: c.paperRaised },
  captionLabelBadge: { minHeight: 30, alignSelf: 'flex-start', justifyContent: 'center', overflow: 'visible', paddingVertical: 5 },
  captionLabel: { color: c.heroSubtle, fontSize: 12, lineHeight: 18, fontWeight: '800', letterSpacing: 0.25 },
  captionLabelAsha: { color: c.brand },
  captionText: { minWidth: 0, alignSelf: 'stretch', color: c.white, fontSize: 16, lineHeight: 23 },
  captionTextAsha: { color: c.ink },
  studioPhrase: { alignSelf: 'center', gap: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.nightSurface, padding: spacing.lg },
  studioPhraseHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  studioPhraseCopy: { minWidth: 0, flex: 1, gap: 2 },
  studioPhraseEyebrow: { color: c.gold, fontSize: 11, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase' },
  studioPhraseEnglish: { color: c.white, fontFamily: displayFont, fontSize: 19, lineHeight: 25, fontWeight: '600' },
  studioListenIcon: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  studioPhraseHindi: { color: c.white, fontFamily: displayFont, fontSize: 24, lineHeight: 32, fontWeight: '600' },
  studioPhraseLatin: { color: c.gold, fontSize: 14, fontWeight: '600' },
  studioPhraseFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  studioPhraseCue: { minWidth: 0, flex: 1, color: c.heroSubtle, fontSize: 12, lineHeight: 17 },
  studioMastery: { minHeight: 28, borderRadius: radius.pill, backgroundColor: c.goldSoft, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm },
  studioMasteryText: { color: c.goldText, fontSize: 11, fontWeight: '700' },
  featuredPhraseSection: { alignItems: 'center', backgroundColor: c.night, paddingHorizontal: 20, paddingTop: spacing.md, paddingBottom: spacing.xl },
  askSection: { minHeight: 116, alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm, marginTop: -1, position: 'relative', zIndex: 2, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderCurve: 'continuous', backgroundColor: c.night, borderTopColor: c.nightLine, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: spacing.lg },
  askSectionCompact: { gap: spacing.xs, paddingTop: spacing.xs },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: radius.pill, backgroundColor: c.nightLine },
  askHeadingRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'relative', gap: spacing.md },
  askHeadingCopy: { minWidth: 0, alignItems: 'center', gap: 3 },
  askHeadingCopyCompact: { gap: 0 },
  askEyebrow: { color: c.gold, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
  askTitle: { color: c.white, fontFamily: displayFont, fontSize: 20, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  clearChatButton: { position: 'absolute', right: 0, width: 44, height: 44, minHeight: 44, flexShrink: 0, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.nightSurface, alignItems: 'center', justifyContent: 'center' },
  messageRow: { alignItems: 'flex-start', backgroundColor: c.night, paddingHorizontal: 20, marginBottom: spacing.sm },
  messageRowYou: { alignItems: 'flex-end' },
  message: { maxWidth: '88%', borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: spacing.md, gap: spacing.xs },
  ashaMessage: { backgroundColor: c.paperRaised },
  userMessage: { backgroundColor: c.nightSurface },
  messageIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  messageLabel: { color: c.brand, fontSize: 12, fontWeight: '600' },
  messageText: { alignSelf: 'stretch', color: c.ink, fontSize: 16, lineHeight: 23, margin: 0, padding: 0 },
  userText: { color: c.white },
  messageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingTop: spacing.xs },
  smallAction: { minHeight: 44, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', paddingHorizontal: spacing.sm },
  smallActionText: { color: c.muted, fontSize: 12, fontWeight: '700' },
  transcriptFooter: { backgroundColor: c.night, paddingHorizontal: 20, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  transcriptTurnCard: { borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.nightSurface, gap: spacing.sm, padding: spacing.md },
  transcriptTurnEyebrow: { color: c.gold, fontSize: 11, fontWeight: '600', letterSpacing: 0.75, textTransform: 'uppercase' },
  transcriptTurnButton: { minHeight: 52, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  transcriptTurnButtonText: { color: c.ink, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  composer: { backgroundColor: c.nightSurface, borderTopColor: c.nightLine, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: spacing.md, gap: spacing.sm },
  examples: { justifyContent: 'center', gap: spacing.sm, paddingRight: spacing.xl },
  example: { minHeight: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: 'transparent', borderColor: c.nightLine, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  exampleText: { color: c.white, fontSize: 14, textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: 52, maxHeight: 110, borderRadius: 18, borderCurve: 'continuous', backgroundColor: c.night, borderColor: c.nightLine, borderWidth: StyleSheet.hairlineWidth, color: c.white, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15 },
  inputDisabled: { backgroundColor: c.nightSurface, color: c.heroSubtle, opacity: 0.65 },
  sendButton: { width: 48, height: 48, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  requestStatus: { color: c.gold, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  error: { color: c.dangerSoft, fontSize: 13, lineHeight: 18 },
} as const);

const useStyles = makeStyles(createLiveStyles);
