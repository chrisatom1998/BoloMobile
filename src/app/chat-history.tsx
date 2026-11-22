import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ChevronRight, MessageCircle, Mic, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { SavedTranscriptRows, savedTranscriptText, useSavedTranscriptScript } from '@/components/saved-transcript-rows';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { showAppAlert } from '@/lib/app-alert';
import { MAX_ASHA_CHATS, ashaChatHasVoice, ashaChatPreview, ashaChatTitle, type AshaChatRecord } from '@/lib/asha-chat-archive';
import { announceAshaChatSwitch, archiveAshaChat, removeAshaChat, useAshaChats } from '@/lib/asha-chat-archive-store';
import { ashaSessionLogEnabled } from '@/lib/asha-session-log';
import { clearAshaSessionContentForRows } from '@/lib/asha-session-log-store';
import { useAshaVoiceSession } from '@/state/asha-voice-session';
import { useAppState } from '@/state/app-state';
import { buttons, layout, makeStyles, radius, spacing, useSharedStyles, useTheme, type } from '@/theme';

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function describeChatDate(chat: AshaChatRecord) {
  return new Date(chat.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function chatKind(chat: AshaChatRecord) {
  return ashaChatHasVoice(chat) ? 'Voice call' : 'Typed chat';
}

export default function ChatHistoryScreen() {
  const { chatId } = useLocalSearchParams<{ chatId?: string }>();
  const selectedId = Array.isArray(chatId) ? chatId[0] : chatId;
  return selectedId ? <PastChat chatId={selectedId} /> : <ChatList />;
}

function ChatList() {
  const script = useSavedTranscriptScript();
  const router = useRouter();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const { colors } = useTheme();
  const { chatHistory } = useAppState();
  const chats = useAshaChats();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <Stack.Screen options={{ title: 'Chat history' }} />
      <Text style={sharedStyles.body}>Your past chats and voice calls with Asha. Open one to read it again or pick up where you left off.</Text>

      {chatHistory.length > 0 ? (
        <Pressable
          accessibilityHint="Goes back to the chat that is open with Asha now."
          accessibilityLabel={`Current chat, ${plural(chatHistory.length, 'message')}`}
          accessibilityRole="button"
          onPress={() => router.back()}
          style={[styles.row, styles.rowCurrent]}
          testID="chat-history-current"
        >
          <View style={styles.rowCopy}>
            <Text style={sharedStyles.eyebrow}>Current chat</Text>
            <Text numberOfLines={2} style={styles.rowTitle}>{savedTranscriptText(chatHistory.find((message) => message.role === 'you')?.text ?? chatHistory[0]?.text ?? '', script)}</Text>
            <Text style={styles.rowMeta}>{plural(chatHistory.length, 'message')}</Text>
          </View>
          <ChevronRight color={colors.muted} size={20} />
        </Pressable>
      ) : null}

      {chats.length === 0 ? (
        <View style={[sharedStyles.card, styles.empty]} testID="chat-history-empty">
          <MessageCircle color={colors.brand} size={28} />
          <Text accessibilityRole="header" style={styles.emptyTitle}>No past chats yet</Text>
          <Text style={sharedStyles.body}>When you start a new chat or a new voice call, the one before it is saved here.</Text>
        </View>
      ) : (
        <View accessibilityLabel={plural(chats.length, 'past chat')} style={styles.list} testID="chat-history-list">
          <Text accessibilityRole="header" style={styles.sectionTitle}>Past chats</Text>
          {chats.map((chat) => {
            const title = savedTranscriptText(ashaChatTitle(chat), script);
            const preview = ashaChatPreview(chat);
            const voice = ashaChatHasVoice(chat);
            const meta = `${describeChatDate(chat)} · ${plural(chat.messages.length, 'message')}`;
            const Icon = voice ? Mic : MessageCircle;
            return (
              <Pressable
                accessibilityHint="Opens this chat."
                accessibilityLabel={`${chatKind(chat)}: ${title}. ${meta}`}
                accessibilityRole="button"
                key={chat.id}
                onPress={() => router.push({ pathname: '/chat-history', params: { chatId: chat.id } } as Href)}
                style={styles.row}
                testID="chat-history-row"
              >
                <View style={styles.rowIcon}>
                  <Icon color={colors.brandText} size={18} />
                </View>
                <View style={styles.rowCopy}>
                  <Text numberOfLines={2} style={styles.rowTitle}>{title}</Text>
                  {preview ? <Text numberOfLines={1} style={styles.rowPreview}>{savedTranscriptText(preview, script)}</Text> : null}
                  <Text style={styles.rowMeta}>{meta}</Text>
                </View>
                <ChevronRight color={colors.muted} size={20} />
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={styles.footnote}>{`Saved on this device only. Nothing is uploaded. Bolo keeps your ${MAX_ASHA_CHATS} most recent chats.`}</Text>
      {ashaSessionLogEnabled ? (
        <Pressable
          accessibilityHint="Shows how long your most recent voice call lasted and how it ended."
          accessibilityRole="button"
          onPress={() => router.push('/last-session' as Href)}
          style={[buttons.quiet, styles.quietLink]}
        >
          <Text style={buttons.quietText}>Last voice call details</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function PastChat({ chatId }: { chatId: string }) {
  const router = useRouter();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const { colors } = useTheme();
  const { aiConsent, appendChatMessages, chatHistory, clearChatHistory } = useAppState();
  const floatingAsha = useAshaVoiceSession();
  const chats = useAshaChats();
  const chat = chats.find((candidate) => candidate.id === chatId);
  const [working, setWorking] = useState(false);
  // Set just before this chat leaves history, so its removal does not flash the "no longer saved" card.
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  const callActive = floatingAsha.available && floatingAsha.status !== 'disconnected';

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  /** Makes this the chat on the Asha screen. The chat that was open there is saved first. */
  const continueChat = useCallback(async () => {
    if (!chat || working || callActive || !aiConsent) return;
    setWorking(true);
    setError('');
    // A copy of the open chat already in history (an interrupted reopen) is the same
    // conversation: keep what is on screen and drop the older copy.
    const alreadyOpen = chatHistory[0]?.id === chat.id;
    let reopened = alreadyOpen;
    if (!alreadyOpen) {
      // A typed reply still on its way belongs to the chat being put away, not this one.
      announceAshaChatSwitch();
      if (chatHistory.length > 0) void archiveAshaChat(chatHistory);
      // The copy in history is removed only once the reopened chat is stored as the
      // current chat. If that write fails, the chat is still in history to try again.
      reopened = await clearChatHistory() && await appendChatMessages(chat.messages);
    }
    if (!reopened) {
      if (!mountedRef.current) return;
      setWorking(false);
      setError('This chat could not be opened. Please try again.');
      return;
    }
    setLeaving(true);
    // The chat is on the Asha screen now. If this removal fails, the copy left in
    // history is dropped the next time it is opened (see `alreadyOpen`).
    await removeAshaChat(chat.id).catch(() => undefined);
    if (mountedRef.current) router.dismissTo('/live' as Href);
  }, [aiConsent, appendChatMessages, callActive, chat, chatHistory, clearChatHistory, router, working]);

  const deleteChat = useCallback(async () => {
    if (!chat) return;
    setWorking(true);
    setError('');
    setLeaving(true);
    // A voice call's lines are also kept for Last session; "removed from this device" covers that copy.
    const removed = await Promise.all([
      removeAshaChat(chat.id),
      clearAshaSessionContentForRows(chat.messages.map((message) => message.id)),
    ]).then(() => true, () => false);
    if (!mountedRef.current) return;
    if (removed) {
      router.back();
      return;
    }
    setLeaving(false);
    setWorking(false);
    setError('This chat could not be fully deleted. Please try again.');
  }, [chat, router]);

  const confirmDelete = useCallback(() => {
    if (working) return;
    showAppAlert('Delete this chat?', 'It will be removed from this device. Saved phrases and progress will remain.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete chat', style: 'destructive', onPress: () => void deleteChat() },
    ]);
  }, [deleteChat, working]);

  if (!chat && leaving) return <View style={sharedStyles.screen} />;
  if (!chat) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
        <Stack.Screen options={{ title: 'Past chat' }} />
        <View style={[sharedStyles.card, styles.empty]} testID="chat-history-missing">
          <Text accessibilityRole="header" style={styles.emptyTitle}>This chat is no longer saved</Text>
          <Text style={sharedStyles.body}>It was deleted, or it is the chat open with Asha now.</Text>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={sharedStyles.primaryButton}>
            <Text style={sharedStyles.primaryButtonText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const continueDisabled = working || callActive || !aiConsent;
  const continueNote = !aiConsent
    ? 'Turn on Asha in the Asha tab to continue this chat. You can still read it here.'
    : callActive
      ? 'End your voice call to continue this chat.'
      : 'Your current chat is saved to Chat history first.';

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <Stack.Screen options={{ title: 'Past chat' }} />
      <View accessible accessibilityLabel={`${chatKind(chat)}, ${describeChatDate(chat)}, ${plural(chat.messages.length, 'message')}`} style={[sharedStyles.card, styles.summary]} testID="chat-history-summary">
        <Text style={sharedStyles.eyebrow}>{describeChatDate(chat)}</Text>
        <Text style={styles.rowMeta}>{`${chatKind(chat)} · ${plural(chat.messages.length, 'message')}`}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityHint="Opens this chat with Asha so you can keep going. Your current chat is saved to Chat history."
          accessibilityRole="button"
          accessibilityState={{ disabled: continueDisabled }}
          disabled={continueDisabled}
          onPress={() => void continueChat()}
          style={[sharedStyles.primaryButton, continueDisabled && styles.disabled]}
          testID="chat-history-continue"
        >
          <Text style={sharedStyles.primaryButtonText}>{working ? 'Opening…' : 'Continue this chat'}</Text>
        </Pressable>
        <Text style={styles.footnote}>{continueNote}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>

      <View accessibilityLabel={`Transcript, ${plural(chat.messages.length, 'line')}, read only`} style={styles.transcript} testID="chat-history-transcript">
        <SavedTranscriptRows rows={chat.messages.map((message) => ({ id: message.id, speaker: message.role, text: message.text }))} />
      </View>

      <Pressable
        accessibilityHint="Removes this chat from this device."
        accessibilityLabel="Delete this chat"
        accessibilityRole="button"
        accessibilityState={{ disabled: working }}
        disabled={working}
        onPress={confirmDelete}
        style={[styles.deleteButton, working && styles.disabled]}
      >
        <Trash2 color={colors.danger} size={18} />
        <Text style={styles.deleteText}>Delete chat</Text>
      </Pressable>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  list: { gap: spacing.sm },
  sectionTitle: { ...type.headline, color: c.ink },
  row: { minHeight: layout.touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, backgroundColor: c.paper, padding: spacing.lg },
  // The current item in a list: brandSoft fill with a rust left bar (docs/design-system.md).
  rowCurrent: { backgroundColor: c.brandSoft, borderColor: c.brandSoft, borderLeftColor: c.brand, borderLeftWidth: spacing.xs },
  rowIcon: { width: spacing.xxl, height: spacing.xxl, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.brandSoft },
  rowCopy: { flex: 1, gap: spacing.xs },
  rowTitle: { ...type.label, color: c.ink },
  rowPreview: { ...type.caption, color: c.muted },
  rowMeta: { ...type.caption, color: c.muted },
  empty: { alignItems: 'flex-start' },
  emptyTitle: { ...type.headline, color: c.ink },
  summary: { gap: spacing.xs },
  actions: { gap: spacing.sm },
  transcript: { gap: spacing.sm },
  footnote: { ...type.caption, color: c.muted },
  quietLink: { alignSelf: 'flex-start' },
  error: { ...type.caption, color: c.danger },
  deleteButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.pill, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, paddingHorizontal: spacing.lg },
  deleteText: { ...type.label, color: c.danger, fontWeight: '700' },
  disabled: { opacity: 0.5 },
}));
