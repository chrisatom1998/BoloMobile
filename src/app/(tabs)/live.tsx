import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { setStatusBarStyle } from 'expo-status-bar';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { AlertCircle, History, Lock, MessageCircle, Mic, MicOff, Sprout, Trash2, Volume2, X } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, AppState, Dimensions, FlatList, Keyboard, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { AshaMinimizeButton, AshaMinimizedCover, AshaSwipeToMinimize } from '@/components/asha-minimize-control';
import { AshaTypingRow, ChatMessageRow } from '@/components/chat-message-row';
import { JournalDisplay } from '@/components/journal-chrome';
import { LiveComposer } from '@/components/live-composer';
import { QueuedReportRow } from '@/components/queued-report-row';
import { RealtimeVoiceButton, type RealtimeErrorDetails } from '@/components/realtime-voice-button';
import { SegmentedControl } from '@/components/segmented-control';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { TranscriptPhrasePicker } from '@/components/transcript-phrase-picker';
import { WordDefinitionSheet } from '@/components/word-definition-sheet';
import { useAshaLiveSession } from '@/hooks/use-asha-live-session';
import { useForegroundTimer } from '@/hooks/use-foreground-timer';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { type EffectiveMotion, useMotionPreference } from '@/hooks/use-motion-preference';
import type { LiveTranscriptRow, RealtimeTranscriptUpdate, RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { useSpeakText } from '@/hooks/use-speak-text';
import { showAppAlert } from '@/lib/app-alert';
import { ashaSessionLogEnabled, type AshaSessionEndReason, type AshaSessionEvent } from '@/lib/asha-session-log';
import { clearAshaSessionContent, ensureAshaSessionLogLoaded, findAshaSessionIdForRow, logAshaSessionEvent, logAshaSessionSnapshot, registerLiveCallEnder } from '@/lib/asha-session-log-store';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { hapticTap } from '@/lib/haptics';
import { LIVE_MIC_PERMISSION_MESSAGE } from '@/lib/live-permission';
import { observe } from '@/lib/observability';
import { preloadSpeech, speakText, stopSpeaking } from '@/lib/speech';
import { DEFAULT_MOTION_PREFERENCE, SAVED_PHRASES_FULL_MESSAGE, SAVED_PHRASES_FULL_TITLE } from '@/lib/storage';
import { classifyOutboxError, outboxRetryAfterMs, syncOutbox, useSyncOutbox, type OutboxEntry } from '@/lib/sync-outbox';
import { reportGeneratedMessage, sendMobileChat, type ReportReason } from '@/services/bolo-api';
import { isFloatingAshaMinimized, useAshaVoiceSession } from '@/state/asha-voice-session';
import { useAppState } from '@/state/app-state';
import type { ChatMessage, AshaResponseLanguage, SavedPhrase } from '@/state/app-state-types';
import { displayFont, hindiType, makeStyles, maxContentWidth, radius, spacing, useTheme } from '@/theme';

const welcome: ChatMessage = {
  id: 'welcome',
  role: 'asha',
  text: 'Hi! Tell me what you would like to practice. Choose English or Hindi for my replies above.',
};

const ashaPortrait = require('../../../assets/images/asha-portrait.png');
const tailFollowThreshold = 48;
/** Shown instead of the generic network error when a live call cannot even start. */
export const LIVE_OFFLINE_MESSAGE = 'Live voice needs an internet connection. Lessons and saved phrases work offline.';
/** The learner's explicit Clear removes saved transcripts but keeps queued reports and their retries. */
export const CLEAR_CHAT_CONFIRMATION = 'Clear all saved chat transcripts? Saved phrases and progress will remain. Pending reports will still be sent under your existing AI consent.';
type InterruptedReason = Extract<AshaSessionEndReason, 'connection_lost' | 'backgrounded'>;
const interruptedCopy: Record<InterruptedReason, string> = {
  connection_lost: 'Connection lost. This conversation is saved on your device.',
  backgrounded: 'The session ended when you left Bolo. This conversation is saved on your device.',
};

function sharesSpeaker(left: ChatMessage | undefined, right: ChatMessage | undefined) {
  if (!left || !right || left.id === welcome.id || right.id === welcome.id) return false;
  return left.role === right.role;
}

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
  // 390 and wider fit the title and Private badge on one row. Narrower phones stack them.
  const reflowHeaderLayout = largeTextLayout || fontScale >= 1.2 || windowWidth < 390;
  const { elapsedSeconds, reset: resetPracticeTimer } = useForegroundTimer();
  const { addPracticeSeconds, aiConsent, appendChatMessages, replaceLiveChatSnapshot, chatHistory, clearChatHistory, clientId, learnerProfile, markLiveTurn, motionPreference = DEFAULT_MOTION_PREFERENCE, phraseReviews = {}, phrases = [], togglePhrase, updateLearnerProfile } = useAppState();
  const { mode: motionMode, reducedMotion } = useMotionPreference(motionPreference);
  const floatingAsha = useAshaVoiceSession();
  const floatingAshaRef = useRef(floatingAsha);
  useEffect(() => {
    floatingAshaRef.current = floatingAsha;
  }, [floatingAsha]);
  const liveSession = useAshaLiveSession();
  const { audioError, clearAudioError, speak } = useSpeakText();
  const responseLanguage: AshaResponseLanguage = learnerProfile.responseLanguage;
  const [busy, setBusy] = useState(false);
  const [clearingChat, setClearingChat] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<ChatMessage | null>(null);
  const [error, setError] = useState('');
  const [liveAshaTranscript, setLiveAshaTranscript] = useState('');
  const [liveUserTranscript, setLiveUserTranscript] = useState('');
  const [latestCaptionSpeaker, setLatestCaptionSpeaker] = useState<'you' | 'asha' | null>(null);
  const resumedStatus = floatingAsha.available ? floatingAsha.status : 'disconnected';
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeVoiceStatus>(resumedStatus);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [pendingReports, setPendingReports] = useState<Set<string>>(new Set());
  const [interruptedReason, setInterruptedReason] = useState<InterruptedReason | null>(null);
  const outboxEntries = useSyncOutbox();
  // Reports waiting in the sync outbox, by the reply they belong to.
  const queuedReports = useMemo(() => {
    const byMessage = new Map<string, OutboxEntry>();
    for (const entry of outboxEntries) {
      if (entry.kind === 'report_message' && entry.payload.messageId) byMessage.set(entry.payload.messageId, entry);
    }
    return byMessage;
  }, [outboxEntries]);
  // Queued reports whose reply is no longer on screen (cleared chat, an earlier
  // session) still need their Retry and Discard actions somewhere.
  const unassociatedReports = useMemo(
    () => outboxEntries.filter((entry) => !entry.payload.messageId || !chatHistory.some((message) => message.id === entry.payload.messageId)),
    [chatHistory, outboxEntries],
  );
  const [phraseMessage, setPhraseMessage] = useState<{ message: ChatMessage; selectedText?: string; sourceText?: string } | null>(null);
  const [phraseSheetVisible, setPhraseSheetVisible] = useState(false);
  const pendingPhraseAlertRef = useRef<{ session: number; title: string; message: string } | null>(null);
  const phraseSheetSessionRef = useRef(0);
  const closingPhraseSessionRef = useRef(0);
  const [wordDefinitionPhrase, setWordDefinitionPhrase] = useState<string | null>(null);
  const [wordSheetVisible, setWordSheetVisible] = useState(false);
  const [screenFocused, setScreenFocused] = useState(true);
  // How far a docked keyboard reaches up from the bottom of the screen; 0 when hidden or floating.
  const [keyboardOverlap, setKeyboardOverlap] = useState(0);
  const keyboardCoversTabBar = screenFocused && keyboardOverlap > 0 && keyboardOverlap >= insets.bottom;
  const ownedSnapshotIds = useRef<string[]>([]);
  const snapshotIdsRef = useRef(ownedSnapshotIds);
  const sharedSnapshotIds = floatingAsha.snapshotIds;
  const practiced = useRef(false);
  const mountedRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);
  const chatResetRef = useRef<Promise<boolean> | null>(null);
  const chatActivityRef = useRef(0);
  const realtimeStatusRef = useRef<RealtimeVoiceStatus>(resumedStatus);
  const reportControllersRef = useRef<Map<string, AbortController>>(new Map());
  const selectedChatTextRef = useRef<Map<string, { sourceText: string; text: string }>>(new Map());
  const selectionClearTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const backgroundCheckpointedRef = useRef(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const nearBottomRef = useRef(true);
  const followedMessageCountRef = useRef(0);
  const composerMicActionRef = useRef<(() => void) | null>(null);
  const [composerMicActionBound, setComposerMicActionBound] = useState(false);
  const visibleMessages = useMemo(
    () => clearingChat ? [welcome] : pendingUserMessage ? [welcome, ...chatHistory, pendingUserMessage] : [welcome, ...chatHistory],
    [chatHistory, clearingChat, pendingUserMessage],
  );
  const realtimeLocked = realtimeStatus !== 'disconnected';
  const realtimeOwnsAudio = realtimeLocked;
  const replyPlaybackLocked = busy || clearingChat || realtimeOwnsAudio;
  const hasTranscriptMessages = !clearingChat && (chatHistory.length > 0 || pendingUserMessage !== null);
  const youCaption = romanizeDevanagari(liveUserTranscript).trim();
  const ashaCaption = romanizeDevanagari(liveAshaTranscript).trim();
  const speechCaption = latestCaptionSpeaker === 'asha' && ashaCaption
    ? { speaker: 'asha' as const, text: ashaCaption }
    : latestCaptionSpeaker === 'you' && youCaption
      ? { speaker: 'you' as const, text: youCaption }
      : ashaCaption
        ? { speaker: 'asha' as const, text: ashaCaption }
        : youCaption
          ? { speaker: 'you' as const, text: youCaption }
          : null;
  const conversationStarted = aiConsent && (hasTranscriptMessages || speechCaption !== null);
  const studioPhrase = phrases[0] ?? { en: 'Less sugar, please.', hi: 'चीनी कम, कृपया।', latin: 'Cheeni kam, kripya.' };
  const studioPhraseMastery = phraseReviews[studioPhrase.hi]?.mastery ?? 0;
  const responseLanguageName = responseLanguage === 'hi' ? 'Hindi' : 'English';
  const languageControlLocked = busy || clearingChat || realtimeOwnsAudio;
  const clearChatDisabled = busy || clearingChat || realtimeLocked || chatHistory.length === 0;
  const voiceHeroTitle = {
    disconnected: 'Ready when you are',
    connecting: 'Connecting to Asha',
    ready: 'Your microphone is muted',
    recording: 'Your microphone is on',
    responding: 'Asha is speaking',
  }[realtimeStatus];
  const voiceHeroBody = {
    disconnected: 'Tap Asha to start talking with her.',
    connecting: 'Opening a private live voice session…',
    ready: 'Tap Asha to unmute and join the conversation.',
    recording: 'Speak naturally, even while Asha talks. Tap to mute.',
    responding: 'Your mic is muted. Tap Asha to speak at any time.',
  }[realtimeStatus];
  const composerMicLabel = {
    disconnected: 'Start a voice conversation',
    connecting: 'Connecting…',
    ready: 'Unmute microphone',
    recording: 'Mute microphone',
    responding: 'Unmute microphone',
  }[realtimeStatus];
  // Same gate as the portrait control, plus connecting (the button blocks that itself)
  // and a missing turn action, which happens when the floating session has no voice yet.
  const composerMicDisabled = !aiConsent || busy || clearingChat || (!floatingAsha.available && !screenFocused) || realtimeStatus === 'connecting' || !composerMicActionBound;
  const restingVoiceLayout = !compactVoiceLayout && realtimeStatus === 'disconnected';

  const messageCount = chatHistory.length + (pendingUserMessage ? 1 : 0);
  const messageCountRef = useRef(0);
  const aiConsentRef = useRef(aiConsent);
  // Sync before paint so the first native content-size event sees the new count.
  useLayoutEffect(() => {
    messageCountRef.current = messageCount;
    aiConsentRef.current = aiConsent;
  }, [aiConsent, messageCount]);
  const scrollTailIntoView = useCallback((animated: boolean) => {
    nearBottomRef.current = true;
    listRef.current?.scrollToEnd({ animated });
  }, []);
  // Resting content-size changes follow only when the reader is already near the bottom.
  // Voice status and live captions grow the header and must not pull the portrait away.
  // Refs keep a list callback from the first render aligned with the latest chat.
  const followTail = useCallback((animated: boolean) => {
    if (!aiConsentRef.current || messageCountRef.current === 0) return;
    if (realtimeStatusRef.current !== 'disconnected') return;
    if (!nearBottomRef.current) return;
    listRef.current?.scrollToEnd({ animated });
  }, []);
  const scrollToChat = useCallback(() => {
    scrollTailIntoView(!reducedMotion);
  }, [reducedMotion, scrollTailIntoView]);

  const bindComposerMicAction = useCallback((action: (() => void) | null) => {
    composerMicActionRef.current = action;
    setComposerMicActionBound((current) => (action !== null) === current ? current : action !== null);
  }, []);

  const pressComposerMic = useCallback(() => {
    if (composerMicDisabled) return;
    composerMicActionRef.current?.();
  }, [composerMicDisabled]);

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
    practiced.current = false;
    backgroundCheckpointedRef.current = false;
    resetPracticeTimer();
    return () => {
      setScreenFocused(false);
      const floating = floatingAshaRef.current;
      // Minimizing sets a ref before the next paint, so this still sees it.
      if (floating.available && floating.voice && !isFloatingAshaMinimized()) floating.voice.disconnect();
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
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    // Tabs stay mounted, so a keyboard opened on another tab must not move this thread.
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      if (!mountedRef.current) return;
      const { height, screenY } = event.endCoordinates;
      const screenHeight = Dimensions.get('window').height;
      // A floating keyboard does not reach the bottom edge, so it leaves the tab bar visible.
      setKeyboardOverlap(screenY + height >= screenHeight - 1 ? Math.max(0, screenHeight - screenY) : 0);
      if (screenFocused) scrollTailIntoView(!reducedMotion);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      if (mountedRef.current) setKeyboardOverlap(0);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [reducedMotion, screenFocused, scrollTailIntoView]);

  // A new message follows the tail when the reader is already near it. The first
  // scrollToEnd can run before layout, so retry once on the next frame.
  useEffect(() => {
    const countChanged = messageCount !== followedMessageCountRef.current;
    followedMessageCountRef.current = messageCount;
    if (!aiConsent || messageCount === 0 || !countChanged || !nearBottomRef.current) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
      secondFrame = requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: false });
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [aiConsent, messageCount]);

  // Only the outbox's explicit delivery says a queued report was received; an entry
  // that disappears through Discard, consent withdrawal, or Delete Bolo data was not.
  // The provider announces the delivery once for the whole app; this only marks the row.
  useEffect(() => syncOutbox.subscribeDelivered((entry) => {
    const messageId = entry.payload.messageId;
    if (!messageId || !mountedRef.current) return;
    setReported((existing) => (existing.has(messageId) ? existing : new Set([...existing, messageId])));
  }), []);

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
    const ids = snapshotIdsRef.current;
    replaceLiveChatSnapshot(ids.current, messages);
    ids.current = messages.map((message) => message.id);
    setLiveUserTranscript([...messages].reverse().find((row) => row.role === 'you')?.text ?? '');
    setLiveAshaTranscript([...messages].reverse().find((row) => row.role === 'asha')?.text ?? '');
    // Row order stays stable while speakers overlap, so the last snapshot row
    // is not the line that just changed. The transcript event chooses the speaker.
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
    setLatestCaptionSpeaker(null);
    setError('');
    clearAudioError();
    updateLearnerProfile({ responseLanguage: nextLanguage });
  }, [clearAudioError, languageControlLocked, responseLanguage, updateLearnerProfile]);

  const resetChat = useCallback((): Promise<boolean> => {
    if (chatResetRef.current) return chatResetRef.current;
    // Invalidate a pending typed request before clearing, even if its network
    // response arrives after abort. No old turn may repopulate the new chat.
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    setPendingUserMessage(null);
    setClearingChat(true);
    void stopSpeaking();
    snapshotIdsRef.current.current = [];
    setLiveUserTranscript('');
    setLiveAshaTranscript('');
    setLatestCaptionSpeaker(null);
    selectionClearTimersRef.current.forEach(clearTimeout);
    selectionClearTimersRef.current.clear();
    selectedChatTextRef.current.clear();
    phraseSheetSessionRef.current += 1;
    closingPhraseSessionRef.current = phraseSheetSessionRef.current;
    pendingPhraseAlertRef.current = null;
    setPhraseSheetVisible(false);
    setPhraseMessage(null);
    setWordSheetVisible(false);
    setWordDefinitionPhrase(null);
    setInterruptedReason(null);
    setError('');
    clearAudioError();
    const pending = clearChatHistory().finally(() => {
      if (chatResetRef.current !== pending) return;
      chatResetRef.current = null;
      if (mountedRef.current) setClearingChat(false);
    });
    chatResetRef.current = pending;
    return pending;
  }, [clearAudioError, clearChatHistory]);

  const clearSavedChat = useCallback(async () => {
    // The confirmation can remain open while new work starts. Read refs here,
    // not the state captured when the alert was originally displayed.
    if (!mountedRef.current || requestRef.current || chatResetRef.current || realtimeStatusRef.current !== 'disconnected') return;
    const activity = ++chatActivityRef.current;
    // Learner-initiated only: the automatic reset before a new session never touches
    // saved sessions, and this explicit delete keeps queued reports and their retries.
    const cleared = await Promise.all([resetChat(), clearAshaSessionContent().then(() => true, () => false)]).then((results) => results.every(Boolean));
    if (mountedRef.current && chatActivityRef.current === activity && !cleared) {
      setError('The chat could not be cleared. Please try again.');
    }
  }, [resetChat]);

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
    phraseSheetSessionRef.current += 1;
    pendingPhraseAlertRef.current = null;
    setPhraseMessage({ message, selectedText: selection?.text, sourceText: selection?.sourceText || message.text });
    setPhraseSheetVisible(true);
  }, []);

  const confirmClearChat = useCallback(() => {
    if (clearChatDisabled) return;
    const activity = chatActivityRef.current;
    showAppAlert(
      'Clear Asha chat?',
      CLEAR_CHAT_CONFIRMATION,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear chat', style: 'destructive', onPress: () => {
          if (chatActivityRef.current === activity) void clearSavedChat();
        } },
      ],
    );
  }, [clearChatDisabled, clearSavedChat]);

  const sendText = useCallback(async (raw: string): Promise<boolean> => {
    const text = raw.trim().slice(0, 500);
    if (!aiConsent || !text || busy || realtimeLocked || requestRef.current || chatResetRef.current || realtimeStatusRef.current !== 'disconnected') return false;
    hapticTap();
    chatActivityRef.current += 1;
    const userMessage: ChatMessage = { id: `you-${Date.now()}`, role: 'you', text };
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
      snapshotIdsRef.current.current = [];
    }
    if (previous === 'connecting' && status !== 'connecting' && status !== 'disconnected') {
      observe('voice_connection_succeeded');
    }
  }, []);
  const startNewConversation = useCallback(async (signal: AbortSignal) => {
    if (!mountedRef.current || signal.aborted) return;
    chatActivityRef.current += 1;
    // Claim the screen synchronously rather than waiting for the button's
    // status effect, so a stale text/clear action cannot race connection start.
    updateRealtimeStatus('connecting');
    // A session left active by a killed app is recovered and saved before this
    // connection may create a new record; the automatic reset keeps saved sessions.
    await ensureAshaSessionLogLoaded();
    if (!mountedRef.current || signal.aborted) return;
    const cleared = await resetChat();
    if (!mountedRef.current || signal.aborted) return;
    if (!cleared) throw new Error('The previous chat could not be cleared. Please try starting a new conversation again.');
  }, [resetChat, updateRealtimeStatus]);
  const showRealtimeError = useCallback((message: string, details?: RealtimeErrorDetails) => {
    // Turn-level errors (unreadable audio, transcription) also arrive here; only
    // count failures that happen while a connection attempt is in flight.
    const connecting = realtimeStatusRef.current === 'connecting';
    if (connecting) observe('voice_connection_failed');
    // Only a transport failure or timeout before the call started proves there is no
    // connection. Configuration, rejected payloads, microphone, and peer errors keep their copy.
    const offline = connecting && (details?.kind === 'network' || details?.kind === 'timeout');
    setError(offline ? LIVE_OFFLINE_MESSAGE : message);
  }, []);
  // Interrupted sessions keep their transcript on screen with a note that it is saved.
  const handleSessionEvent = useCallback((event: AshaSessionEvent) => {
    if (!mountedRef.current) return;
    if (event.type === 'starting') setInterruptedReason(null);
    if (event.type === 'ended' && (event.reason === 'connection_lost' || event.reason === 'backgrounded')) setInterruptedReason(event.reason);
  }, []);
  // When this screen owns the voice hook (no floating host), it is the one writer of the session log.
  const recordOwnedSnapshot = useCallback((rows: LiveTranscriptRow[]) => {
    logAshaSessionSnapshot(rows);
    recordLiveSnapshot(rows);
  }, [recordLiveSnapshot]);
  const recordOwnedSessionEvent = useCallback((event: AshaSessionEvent) => {
    logAshaSessionEvent(event, responseLanguage);
    handleSessionEvent(event);
  }, [handleSessionEvent, responseLanguage]);
  // Delete Bolo data ends the owned call as `data_deleted` before it removes the log.
  const unregisterLiveCallEnderRef = useRef<(() => void) | null>(null);
  const bindOwnedDisconnect = useCallback((disconnect: ((reason?: AshaSessionEndReason) => void) | null) => {
    unregisterLiveCallEnderRef.current?.();
    unregisterLiveCallEnderRef.current = disconnect ? registerLiveCallEnder(disconnect) : null;
  }, []);
  const updateLiveTranscript = useCallback((update: RealtimeTranscriptUpdate) => {
    if (update.speaker === 'asha') setLiveAshaTranscript(update.text);
    else setLiveUserTranscript(update.text);
    if (update.text.trim()) setLatestCaptionSpeaker(update.speaker);
  }, []);

  const floatingAvailable = floatingAsha.available;
  const setFloatingListeners = floatingAsha.setListeners;
  useEffect(() => {
    // Point at the provider's id list before listeners are registered. Assigning
    // during render trips the refs rule, and this effect runs before snapshots.
    snapshotIdsRef.current = floatingAvailable ? sharedSnapshotIds : ownedSnapshotIds;
  }, [floatingAvailable, sharedSnapshotIds]);
  useEffect(() => {
    if (!floatingAvailable) return undefined;
    setFloatingListeners({
      onError: showRealtimeError,
      onConnectionStart: startNewConversation,
      onSessionEvent: handleSessionEvent,
      onTranscriptChange: updateLiveTranscript,
      onTranscriptSnapshot: recordLiveSnapshot,
    });
    return () => setFloatingListeners(null);
  }, [floatingAvailable, handleSessionEvent, recordLiveSnapshot, setFloatingListeners, showRealtimeError, startNewConversation, updateLiveTranscript]);
  const report = useCallback((message: ChatMessage) => {
    const submit = (reason: ReportReason) => void (async () => {
      // The controller map is the in-flight record, so it also guards against a
      // duplicate submission before the pending state has committed.
      if (reportControllersRef.current.has(message.id) || reported.has(message.id)) return;
      const controller = new AbortController();
      // Captured before the first attempt: if Bolo data is deleted or consent is withdrawn
      // while this request is pending, the outbox refuses to queue the report afterwards.
      const outboxGeneration = syncOutbox.generation();
      reportControllersRef.current.set(message.id, controller);
      if (mountedRef.current) setPendingReports((current) => new Set(current).add(message.id));
      try {
        await reportGeneratedMessage({ clientId, message: message.text, reason }, controller.signal);
        if (!mountedRef.current || controller.signal.aborted) return;
        setReported((current) => new Set(current).add(message.id));
        showAppAlert('Report received', 'Thank you. This reply was sent for review.');
      } catch (cause) {
        if (!mountedRef.current || controller.signal.aborted) return;
        // No connection: keep the report on the device and let the outbox send it later.
        // The session association and row id stay local; neither is ever sent.
        if (classifyOutboxError(cause) === 'transient') {
          const sessionId = findAshaSessionIdForRow(message.id);
          // A 429 Retry-After from this attempt travels with the report so the outbox waits it out.
          const retryAfterMs = outboxRetryAfterMs(cause);
          const queued = await syncOutbox.enqueue({ kind: 'report_message', ...(sessionId ? { sessionId } : {}), payload: { message: message.text, reason, messageId: message.id } }, { generation: outboxGeneration, ...(retryAfterMs ? { retryAfterMs } : {}) }).then(() => true, () => false);
          if (!mountedRef.current) return;
          if (queued) {
            showAppAlert('Report saved', 'It will be sent when you’re back online.');
            return;
          }
        }
        showAppAlert('Could not send report', cause instanceof Error ? cause.message : 'Please try again.');
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

  const retryReport = useCallback((entryId: string) => {
    void syncOutbox.retry(entryId);
  }, []);
  const discardReport = useCallback((entryId: string) => {
    void syncOutbox.discard(entryId);
  }, []);
  const openLastSession = useCallback(() => {
    router.push('/last-session' as Href);
  }, [router]);
  // Saved transcripts stay available offline and after consent is withdrawn, so this
  // entry point renders with or without AI consent.
  const lastSessionButton = ashaSessionLogEnabled ? (
    <Pressable
      accessibilityHint="Opens the transcript of your most recent live voice session, saved on this device."
      accessibilityLabel="View last Asha session"
      accessibilityRole="button"
      onPress={openLastSession}
      style={[styles.lastSessionButton, !aiConsent && styles.lastSessionButtonConsent]}
    >
      <History color={colors.gold} size={17} />
      <Text style={styles.lastSessionText}>Last session</Text>
    </Pressable>
  ) : null;

  const saveTranscriptPhrase = useCallback((phrase: SavedPhrase) => {
    const alreadySaved = phrases.some((saved) => saved.hi.trim().toLocaleLowerCase() === phrase.hi.trim().toLocaleLowerCase());
    const session = phraseSheetSessionRef.current;
    closingPhraseSessionRef.current = session;
    pendingPhraseAlertRef.current = {
      session,
      title: alreadySaved ? 'Phrase already saved' : 'Phrase saved',
      message: `${phrase.latin} — ${phrase.en}`,
    };
    setPhraseSheetVisible(false);
    if (alreadySaved) return;
    void togglePhrase(phrase).then((result) => {
      if (result !== 'full') return;
      // Nothing was saved. Replace the queued "Phrase saved" notice while the
      // sheet is still closing, or tell the learner now if it already closed.
      const pending = pendingPhraseAlertRef.current;
      if (pending && pending.session === session) {
        pendingPhraseAlertRef.current = { session, title: SAVED_PHRASES_FULL_TITLE, message: SAVED_PHRASES_FULL_MESSAGE };
      } else if (closingPhraseSessionRef.current === session && phraseSheetSessionRef.current === session) {
        showAppAlert(SAVED_PHRASES_FULL_TITLE, SAVED_PHRASES_FULL_MESSAGE);
      }
    });
  }, [phrases, togglePhrase]);

  const closePhraseSheet = useCallback(() => {
    closingPhraseSessionRef.current = phraseSheetSessionRef.current;
    setPhraseSheetVisible(false);
  }, []);

  const finishPhraseSheet = useCallback(() => {
    if (closingPhraseSessionRef.current !== phraseSheetSessionRef.current) return;
    setPhraseSheetVisible(false);
    setPhraseMessage(null);
    const pending = pendingPhraseAlertRef.current;
    pendingPhraseAlertRef.current = null;
    if (pending && pending.session === phraseSheetSessionRef.current) showAppAlert(pending.title, pending.message);
  }, []);
  const closeWordSheet = useCallback(() => setWordSheetVisible(false), []);
  const finishWordSheet = useCallback(() => setWordDefinitionPhrase(null), []);

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
            <Text style={styles.studioMasteryText}>{studioPhraseMastery ? `Mastery ${studioPhraseMastery}/5` : 'New phrase'}</Text>
          </View>
        </View>
      </Pressable>
    </View>
  ) : null;

  const statusKicker = aiConsent
    ? { disconnected: 'READY', connecting: 'CONNECTING', ready: 'MUTED', recording: 'LISTENING', responding: 'SPEAKING' }[realtimeStatus]
    : 'LIVE VOICE';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <FlatList
        ref={listRef}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.listContent}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distanceFromEnd = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          nearBottomRef.current = distanceFromEnd <= tailFollowThreshold;
        }}
        scrollEventThrottle={16}
        data={aiConsent ? visibleMessages : []}
        keyExtractor={(message) => message.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        style={[styles.list, { marginTop: insets.top }]}
        testID="live-chat-list"
        ListHeaderComponent={(
          <View>
            <View style={[styles.voiceHero, compactVoiceLayout && styles.voiceHeroCompact, restingVoiceLayout && styles.voiceHeroResting, largeTextLayout && styles.voiceHeroLarge, !aiConsent && styles.voiceHeroConsent, { paddingTop: restingVoiceLayout ? spacing.xs : spacing.md }]} testID="voice-conversation-hero">
              {(() => {
                const topbar = (
                  <View style={[styles.topbar, reflowHeaderLayout && styles.topbarLarge, { width: heroContentWidth }]} testID="asha-header-topbar">
                    <View style={[styles.headerIdentity, reflowHeaderLayout && styles.headerIdentityLarge]}>
                      <View style={[styles.headerCopy, reflowHeaderLayout && styles.headerCopyStacked]}>
                        <JournalDisplay numberOfLines={reflowHeaderLayout ? undefined : 2} style={[styles.headerTitle, reflowHeaderLayout && styles.headerTitleStacked]}>Speak with Asha</JournalDisplay>
                        <Text numberOfLines={reflowHeaderLayout ? undefined : 1} style={[styles.headerSubtitle, reflowHeaderLayout && styles.headerSubtitleStacked]}>Private Hindi coach · {responseLanguageName} replies</Text>
                      </View>
                    </View>
                    <View style={[styles.headerActions, reflowHeaderLayout && styles.headerActionsStacked]}>
                      {floatingAsha.available && aiConsent ? (
                        <AshaMinimizeButton onPress={floatingAsha.minimize} />
                      ) : null}
                      <View accessibilityLabel="Private conversation" style={styles.privateBadge}>
                        <Lock color={colors.brandSoft} size={14} strokeWidth={2} />
                        <Text style={styles.privateText}>Private</Text>
                      </View>
                    </View>
                  </View>
                );
                return floatingAsha.available
                  ? <AshaSwipeToMinimize onMinimize={floatingAsha.minimize}>{topbar}</AshaSwipeToMinimize>
                  : topbar;
              })()}
              {!aiConsent ? (
                <View style={[styles.heroConsent, { width: heroContentWidth }]} testID="live-consent-section">
                  <AiConsentGate actionLabel="Enable live practice" title="Before your first live conversation" />
                  {lastSessionButton}
                </View>
              ) : null}
              <View style={[styles.liveControls, restingVoiceLayout && styles.liveControlsResting]} testID="live-voice-controls">
                {/* Before consent there is nothing to choose a language for; a greyed-out switch only read as broken. */}
                {aiConsent ? <SegmentedControl
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
                /> : null}
                <View style={[styles.voiceStage, compactVoiceLayout && styles.voiceStageCompact, restingVoiceLayout && styles.voiceStageResting, { width: heroContentWidth }]}>
                  {/* Asha's portrait is the tap-to-talk control: status rings and pulses wrap it. */}
                  <View style={styles.portraitControl} testID="asha-portrait-control">
                    {floatingAsha.available && !floatingAsha.voice ? (
                      <Image
                        accessible={false}
                        cachePolicy="memory-disk"
                        contentFit="cover"
                        source={ashaPortrait}
                        style={[styles.ashaPortrait, compactVoiceLayout && styles.ashaPortraitCompact]}
                        testID="asha-header-portrait"
                        transition={0}
                      />
                    ) : (
                    <RealtimeVoiceButton key={floatingAsha.available ? `shared-${clientId}` : `${screenFocused && aiConsent ? 'enabled' : 'disabled'}-${clientId}`} clientId={clientId} compact={compactVoiceLayout} disabled={!aiConsent || busy || clearingChat || (!floatingAsha.available && !screenFocused)} motionMode={motionMode} onError={showRealtimeError} liveSession={floatingAsha.available ? undefined : liveSession} onConnectionStart={floatingAsha.available ? undefined : startNewConversation} onDisconnectReady={floatingAsha.available ? undefined : bindOwnedDisconnect} onSessionEvent={floatingAsha.available ? undefined : recordOwnedSessionEvent} onTranscriptSnapshot={floatingAsha.available ? undefined : recordOwnedSnapshot} onStatusChange={updateRealtimeStatus} onTranscriptChange={floatingAsha.available ? undefined : updateLiveTranscript} onTurnActionReady={bindComposerMicAction} responseLanguage={responseLanguage} size="portrait" tone="dark" voice={floatingAsha.voice ?? undefined}>
                      <Image
                        accessible={false}
                        cachePolicy="memory-disk"
                        contentFit="cover"
                        source={ashaPortrait}
                        style={[styles.ashaPortrait, compactVoiceLayout && styles.ashaPortraitCompact]}
                        testID="asha-header-portrait"
                        transition={0}
                      />
                    </RealtimeVoiceButton>
                    )}
                    {aiConsent ? (
                      <Pressable accessibilityLabel="Open chat history" accessibilityRole="button" onPress={scrollToChat} style={styles.chatButton}>
                        <MessageCircle color={colors.white} size={20} />
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.heroCopy}>
                    <View style={styles.statusRow} testID="asha-voice-status">
                      <View style={[styles.statusDot, realtimeStatus === 'recording' && styles.statusDotLive]} />
                      <Text accessibilityLiveRegion={conversationStarted ? 'polite' : undefined} style={styles.liveVoiceText}>{statusKicker}</Text>
                    </View>
                    {conversationStarted ? (
                      <Text style={styles.heroBody}>{voiceHeroBody}</Text>
                    ) : (
                      <>
                        <Text accessibilityLiveRegion="polite" style={styles.heroTitle}>{aiConsent ? voiceHeroTitle : 'Live voice unlocks here'}</Text>
                        <Text style={styles.heroBody}>{aiConsent ? voiceHeroBody : 'Enable live practice above to use voice coaching.'}</Text>
                      </>
                    )}
                  </View>
                </View>
                {speechCaption ? (
                  <CaptionReveal key={motionMode === 'lively' ? realtimeStatus : 'caption'} mode={motionMode} style={[styles.captionBlock, { width: heroContentWidth }]}>
                    <View style={[styles.captionCard, speechCaption.speaker === 'you' ? styles.captionCardYou : styles.captionCardAsha]}>
                      <View style={styles.captionLabelBadge} testID="live-caption-label-badge">
                        <Text style={[styles.captionLabel, speechCaption.speaker === 'asha' && styles.captionLabelAsha]}>{speechCaption.speaker === 'you' ? 'You' : 'Asha'}</Text>
                      </View>
                      <Text
                        accessibilityLiveRegion="polite"
                        style={[styles.captionText, speechCaption.speaker === 'asha' && styles.captionTextAsha]}
                        testID={speechCaption.speaker === 'you' ? 'live-input-caption' : 'live-output-caption'}
                      >
                        {speechCaption.text}
                      </Text>
                    </View>
                  </CaptionReveal>
                ) : null}
              </View>
            </View>

            {aiConsent ? <View style={[styles.askSection, compactVoiceLayout && styles.askSectionCompact, restingVoiceLayout && styles.askSectionResting]} testID="ask-asha-sheet">
                <View style={[styles.askHeadingRow, largeTextLayout && styles.askHeadingRowLarge]}>
                  <View style={[styles.askHeadingCopy, compactVoiceLayout && styles.askHeadingCopyCompact]} testID="ask-asha-heading">
                    <Text style={styles.askEyebrow}>Ask Asha</Text>
                    <Text style={styles.askTitle}>How do I say…?</Text>
                  </View>
                  {lastSessionButton}
                  {chatHistory.length > 0 ? (
                    <Pressable
                      accessibilityHint="Removes typed and voice chat saved on this device, without deleting saved phrases, lesson progress, or reports waiting to be sent."
                      accessibilityLabel="Clear Asha chat history"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: clearChatDisabled }}
                      disabled={clearChatDisabled}
                      onPress={confirmClearChat}
                      style={[styles.clearChatButton, clearChatDisabled && styles.disabled]}
                    >
                      <Trash2 color={colors.dangerSoft} size={17} />
                      <Text style={styles.clearChatText}>Clear chat</Text>
                    </Pressable>
                  ) : null}
                </View>
                {unassociatedReports.length ? (
                  <View style={styles.queuedReports} testID="queued-reports">
                    <Text accessibilityRole="header" style={styles.queuedReportsTitle}>Reports waiting to send</Text>
                    {unassociatedReports.map((entry) => (
                      <QueuedReportRow entry={entry} key={entry.id} onDiscard={discardReport} onRetry={retryReport} tone="dark" />
                    ))}
                  </View>
                ) : null}
            </View> : null}
          </View>
        )}
        onContentSizeChange={() => {
          followTail(false);
        }}
        initialNumToRender={8}
        windowSize={7}
        renderItem={({ item, index }) => (
          <ChatMessageRow
            aiConsent={aiConsent}
            continuesNext={sharesSpeaker(item, visibleMessages[index + 1])}
            continuesPrevious={sharesSpeaker(visibleMessages[index - 1], item)}
            isPending={item.id === pendingUserMessage?.id}
            isWelcome={item.id === welcome.id}
            message={item}
            onOpenPhrasePicker={openPhrasePicker}
            onOpenWordDefinition={(phrase) => { setWordDefinitionPhrase(phrase); setWordSheetVisible(true); }}
            onDiscardReport={discardReport}
            onPlayReply={playReply}
            onReport={report}
            onRetryReport={retryReport}
            onSelectedText={rememberSelectedChatText}
            onSelectionCollapsed={forgetSelectedChatText}
            playbackLocked={replyPlaybackLocked}
            queuedReport={queuedReports.get(item.id)}
            reported={reported.has(item.id)}
            reporting={pendingReports.has(item.id)}
            styles={styles}
          />
        )}
        ListFooterComponent={aiConsent ? (
          <>
            {busy && pendingUserMessage ? <AshaTypingRow reducedMotion={reducedMotion} styles={styles} /> : null}
            {featuredPhrase}
          </>
        ) : null}
      />

      {/* On iOS the screen runs under the native tab bar. Native tabs wrap each tab in
          its own SafeAreaProvider, so this SafeAreaView's bottom inset includes the tab
          bar. Drop it only while a docked keyboard covers the tab bar, because
          KeyboardAvoidingView then lifts the composer; a hardware-keyboard shortcut bar
          or floating keyboard is shorter, so the inset stays. */}
      {aiConsent ? <SafeAreaView
        edges={Platform.OS === 'ios' && !keyboardCoversTabBar ? { bottom: 'additive' } : {}}
        style={[styles.composer, Platform.OS === 'ios' ? { paddingBottom: spacing.sm } : { paddingBottom: Math.max(spacing.md, insets.bottom + 52) }]}
        testID="live-composer-area"
      >
        {busy && pendingUserMessage ? (
          <View style={styles.thinkingRow}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <ActivityIndicator color={colors.gold} size="small" />
            </View>
            <Text accessibilityLiveRegion="polite" style={styles.requestStatus}>Asha is thinking…</Text>
          </View>
        ) : null}
        {interruptedReason && hasTranscriptMessages ? (
          <View accessibilityLiveRegion="polite" style={styles.noticeBanner} testID="live-interrupted-banner">
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <AlertCircle color={colors.gold} size={16} />
            </View>
            <Text style={styles.noticeText}>{interruptedCopy[interruptedReason]}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBanner}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <AlertCircle color={colors.dangerSoft} size={16} />
            </View>
            <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
            {/* The banner takes room from Asha's portrait above; let the learner clear it. */}
            <Pressable accessibilityLabel="Dismiss error" accessibilityRole="button" hitSlop={10} onPress={() => setError('')} testID="live-error-dismiss">
              <X color={colors.heroSubtle} size={16} />
            </Pressable>
          </View>
        ) : null}
        {error === LIVE_OFFLINE_MESSAGE ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Go to today’s lesson" hitSlop={8} onPress={() => router.push('/' as Href)} style={styles.settingsLink}>
            <Text style={styles.settingsLinkText}>Go to today’s lesson</Text>
          </Pressable>
        ) : null}
        {error === LIVE_MIC_PERMISSION_MESSAGE && Platform.OS !== 'web' ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Open Settings to allow microphone access" hitSlop={8} onPress={() => void Linking.openSettings()} style={styles.settingsLink}>
            <Text style={styles.settingsLinkText}>Open Settings</Text>
          </Pressable>
        ) : null}
        {audioError ? (
          <View style={styles.errorBanner}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <AlertCircle color={colors.dangerSoft} size={16} />
            </View>
            <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text>
            <Pressable accessibilityLabel="Dismiss error" accessibilityRole="button" hitSlop={10} onPress={clearAudioError}>
              <X color={colors.heroSubtle} size={16} />
            </Pressable>
          </View>
        ) : null}
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.examples}>
          {['Order tea', 'Ask the price', 'Be polite', 'Correct my Hindi'].map((example) => (
            <PressableFeedback
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || clearingChat || realtimeLocked }}
              isDisabled={busy || clearingChat || realtimeLocked}
              key={example}
              onPress={() => { void sendText(example); }}
              style={[styles.example, (busy || clearingChat || realtimeLocked) && styles.disabled]}
            >
              <Text style={styles.exampleText}>{example}</Text>
            </PressableFeedback>
          ))}
        </ScrollView>
        <View style={styles.composerEntry}>
          {conversationStarted && composerMicActionBound ? (
            <Pressable
              accessibilityHint="Mutes or unmutes your microphone."
              accessibilityLabel={composerMicLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled: composerMicDisabled }}
              disabled={composerMicDisabled}
              onPress={pressComposerMic}
              style={[styles.composerMic, composerMicDisabled && styles.disabled]}
              testID="composer-mic-toggle"
            >
              {realtimeStatus === 'recording' ? <MicOff color={colors.gold} size={20} /> : <Mic color={colors.gold} size={20} />}
            </Pressable>
          ) : null}
          <LiveComposer disabled={busy || clearingChat || realtimeLocked} onSend={sendText} styles={styles} />
        </View>
      </SafeAreaView> : null}
      {phraseMessage ? <TranscriptPhrasePicker aiConsent={aiConsent} clientId={clientId} message={phraseMessage.message} onClose={closePhraseSheet} onDismissed={finishPhraseSheet} onSave={saveTranscriptPhrase} reducedMotion={reducedMotion} selectedText={phraseMessage.selectedText} sourceText={phraseMessage.sourceText} visible={phraseSheetVisible} /> : null}
      {aiConsent ? <WordDefinitionSheet key={chatHistory[0]?.id ?? 'empty'} clientId={clientId} onClose={closeWordSheet} onDismissed={finishWordSheet} phrase={wordDefinitionPhrase ?? ''} reducedMotion={reducedMotion} scriptPreference={learnerProfile?.scriptPreference ?? 'both'} visible={wordSheetVisible && !!wordDefinitionPhrase} /> : null}
      {floatingAsha.minimized ? <AshaMinimizedCover onExpand={floatingAsha.expand} statusLabel={aiConsent ? statusKicker : 'LIVE VOICE'} /> : null}
    </KeyboardAvoidingView>
  );
}

export const createLiveStyles = (c: ReturnType<typeof useTheme>['colors']) => ({
  screen: { flex: 1, backgroundColor: c.night },
  list: { flex: 1, backgroundColor: c.night },
  listContent: { backgroundColor: c.night, paddingBottom: spacing.xxl },
  voiceHero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: c.night,
    overflow: 'hidden',
  },
  voiceHeroCompact: { gap: spacing.xs, paddingBottom: spacing.xs },
  voiceHeroResting: { gap: 0, paddingBottom: 0 },
  voiceHeroLarge: { overflow: 'visible' },
  voiceHeroConsent: { overflow: 'visible', paddingBottom: spacing.xl },
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
  chatButton: { position: 'absolute', left: 0, top: '50%', marginTop: -26, width: 52, height: 52, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.nightSurface, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  languageSelector: { alignSelf: 'center' },
  heroConsent: { alignSelf: 'center' },
  liveControls: { alignSelf: 'center', alignItems: 'center', gap: 10 },
  liveControlsResting: { gap: spacing.xs },
  voiceStage: { alignSelf: 'center', alignItems: 'center', gap: 10 },
  voiceStageResting: { gap: spacing.xs },
  voiceStageCompact: { gap: spacing.sm },
  portraitControl: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  ashaPortrait: { width: 112, height: 112, borderRadius: radius.pill, borderColor: c.gold, borderWidth: 3, backgroundColor: c.nightSurface },
  ashaPortraitCompact: { width: 96, height: 96 },
  heroCopy: { minWidth: 0, alignSelf: 'stretch', alignItems: 'center', gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: c.gold, opacity: 0.6 },
  statusDotLive: { opacity: 1 },
  liveVoiceText: { color: c.gold, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 1 },
  heroTitle: { minWidth: 0, maxWidth: 300, flexShrink: 1, color: c.white, fontFamily: displayFont, fontSize: 20, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  heroBody: { minWidth: 0, maxWidth: 310, flexShrink: 1, color: c.heroSubtle, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  captionBlock: { alignSelf: 'center', gap: 10, marginBottom: spacing.sm },
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
  studioPhraseHindi: { ...hindiType(24), color: c.white },
  studioPhraseLatin: { color: c.gold, fontSize: 14, fontWeight: '600' },
  studioPhraseFooter: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  studioPhraseCue: { minWidth: 0, flex: 1, color: c.heroSubtle, fontSize: 12, lineHeight: 17 },
  studioMastery: { minHeight: 28, borderRadius: radius.pill, backgroundColor: c.goldSoft, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm },
  studioMasteryText: { color: c.goldText, fontSize: 11, fontWeight: '700' },
  featuredPhraseSection: { alignItems: 'center', backgroundColor: c.night, paddingHorizontal: 20, paddingTop: spacing.md, paddingBottom: spacing.xl },
  askSection: { minHeight: 0, alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm, marginTop: -1, position: 'relative', zIndex: 2, borderTopLeftRadius: 32, borderTopRightRadius: 32, borderCurve: 'continuous', backgroundColor: c.night, borderTopColor: c.nightLine, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: spacing.md },
  askSectionCompact: { gap: spacing.xs, paddingTop: spacing.xs },
  askSectionResting: { gap: spacing.xs, paddingTop: spacing.xs, paddingBottom: 0 },
  askHeadingRow: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  askHeadingRowLarge: { flexDirection: 'column', alignItems: 'stretch' },
  askHeadingCopy: { minWidth: 0, flexGrow: 1, alignItems: 'center', gap: 3 },
  askHeadingCopyCompact: { gap: 0 },
  askEyebrow: { color: c.gold, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' },
  askTitle: { color: c.white, fontFamily: displayFont, fontSize: 20, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  clearChatButton: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.nightSurface, alignItems: 'center', justifyContent: 'center' },
  clearChatText: { flexShrink: 1, color: c.dangerSoft, fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  lastSessionButton: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderCurve: 'continuous', borderColor: c.nightLine, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  lastSessionButtonConsent: { alignSelf: 'center', marginTop: spacing.sm },
  lastSessionText: { flexShrink: 1, color: c.gold, fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  failedReportText: { color: c.dangerSoft },
  queuedReports: { gap: spacing.sm, marginTop: spacing.md },
  queuedReportsTitle: { color: c.heroSubtle, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  messageRow: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'flex-start', backgroundColor: c.night, paddingHorizontal: 20, marginBottom: spacing.md },
  messageRowStacked: { marginBottom: spacing.xs },
  messageRowYou: { alignItems: 'flex-end' },
  welcomeRow: { alignItems: 'center', paddingTop: spacing.xs },
  message: { maxWidth: '88%', borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: spacing.md, gap: spacing.xs },
  ashaMessage: { backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth },
  userMessage: { backgroundColor: c.nightSurface, borderColor: c.nightLine, borderWidth: 1 },
  welcomeMessage: { alignSelf: 'center', width: '100%', maxWidth: 420, borderRadius: radius.xl, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
  ashaTail: { borderBottomLeftRadius: radius.sm },
  userTail: { borderBottomRightRadius: radius.sm },
  ashaContinued: { borderTopLeftRadius: radius.sm },
  userContinued: { borderTopRightRadius: radius.sm },
  messageIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  messageLabel: { color: c.brand, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  messageText: { alignSelf: 'stretch', color: c.ink, fontSize: 16, lineHeight: 23, margin: 0, padding: 0 },
  userText: { color: c.white },
  messageStatus: { color: c.gold, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  messageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  messageActionsYou: { borderTopColor: c.nightLine },
  typingBubble: { minWidth: 84, paddingVertical: spacing.md },
  typingDots: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 10, paddingVertical: spacing.xs },
  typingDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: c.brand },
  smallAction: { minHeight: 44, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', paddingHorizontal: spacing.sm },
  smallActionText: { color: c.muted, fontSize: 12, fontWeight: '700' },
  reportedText: { color: c.success },
  composer: { width: '100%', alignSelf: 'stretch', backgroundColor: c.nightSurface, borderTopColor: c.nightLine, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: spacing.md, gap: spacing.sm },
  examples: { justifyContent: 'flex-start', gap: spacing.sm, paddingRight: spacing.xl },
  example: { minHeight: 44, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: 'transparent', borderColor: c.nightLine, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14 },
  exampleText: { color: c.white, fontSize: 14, lineHeight: 18, textAlign: 'center' },
  composerEntry: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  // LiveComposer's root: fills the row beside the mic toggle and stacks the character count above the input.
  composerField: { flex: 1, minWidth: 0, gap: spacing.xs },
  composerMic: { width: 48, height: 48, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.night, borderColor: c.gold, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  charCount: { color: c.heroSubtle, fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'right' },
  charCountLimit: { color: c.gold },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: 52, maxHeight: 120, borderRadius: 22, borderCurve: 'continuous', backgroundColor: c.night, borderColor: c.nightLine, borderWidth: 1, color: c.white, paddingHorizontal: spacing.lg, paddingTop: 14, paddingBottom: 14, fontSize: 16, lineHeight: 22 },
  inputDisabled: { opacity: 0.72 },
  sendButton: { width: 52, height: 52, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  thinkingRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  requestStatus: { color: c.gold, fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: c.danger, backgroundColor: c.night, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  noticeBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: c.nightLine, backgroundColor: c.night, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  noticeText: { flex: 1, color: c.white, fontSize: 13, lineHeight: 18 },
  error: { flex: 1, color: c.dangerSoft, fontSize: 13, lineHeight: 18 },
  settingsLink: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  settingsLinkText: { color: c.white, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
} as const);

const useStyles = makeStyles(createLiveStyles);
