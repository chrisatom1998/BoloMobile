import { BookmarkPlus, Flag, Volume2 } from 'lucide-react-native';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View, type NativeSyntheticEvent, type StyleProp, type TextInputSelectionChangeEventData, type TextStyle } from 'react-native';

import type { createLiveStyles } from '@/app/(tabs)/live';
import { hindiSourcePhrase } from '@/lib/contextual-word-definition';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { sourceTextForDisplayedSelection } from '@/lib/transcript-selection';
import type { ChatMessage } from '@/state/app-state-types';
import { useTheme } from '@/theme';

const MAX_ACCESSIBLE_REPLY_CHARACTERS = 56;

function messageActionExcerpt(text: string) {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= MAX_ACCESSIBLE_REPLY_CHARACTERS) return normalized;
  return `${normalized.slice(0, MAX_ACCESSIBLE_REPLY_CHARACTERS).trimEnd()}…`;
}

function SelectableChatText({
  accessibilityHint,
  accessibilityLabel,
  accessibilityLiveRegion,
  onSelectedText,
  onSelectionCollapsed,
  sourceText,
  style,
  text,
}: {
  accessibilityHint: string;
  accessibilityLabel: string;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  onSelectedText: (selection: { sourceText: string; text: string }) => void;
  onSelectionCollapsed: () => void;
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
    if (end <= start) {
      onSelectionCollapsed();
      return;
    }
    const excerpt = text.slice(start, end).trim();
    if (!excerpt) return;
    onSelectedText({
      sourceText: sourceTextForDisplayedSelection({ displayText: text, end, sourceText, start }),
      text: excerpt,
    });
  }, [onSelectedText, onSelectionCollapsed, sourceText, text]);

  return (
    <TextInput
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion={accessibilityLiveRegion}
      accessibilityRole="text"
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

export const ChatMessageRow = memo(function ChatMessageRow({
  aiConsent,
  isPending,
  isWelcome,
  message,
  onOpenPhrasePicker,
  onOpenWordDefinition,
  onPlayReply,
  onReport,
  onSelectionCollapsed,
  onSelectedText,
  realtimeOwnsAudio,
  reported,
  reporting,
  styles,
}: {
  aiConsent: boolean;
  isPending: boolean;
  isWelcome: boolean;
  message: ChatMessage;
  onOpenPhrasePicker: (message: ChatMessage) => void;
  onOpenWordDefinition: (sourcePhrase: string) => void;
  onPlayReply: (message: ChatMessage) => void;
  onReport: (message: ChatMessage) => void;
  onSelectedText: (messageId: string, selection: { sourceText: string; text: string }) => void;
  onSelectionCollapsed: (messageId: string) => void;
  realtimeOwnsAudio: boolean;
  reported: boolean;
  reporting: boolean;
  styles: ReturnType<typeof createLiveStyles>;
}) {
  const { colors } = useTheme();
  const displayText = useMemo(() => romanizeDevanagari(message.text), [message.text]);
  const sourcePhrase = useMemo(() => hindiSourcePhrase(message.text), [message.text]);
  const excerpt = useMemo(() => messageActionExcerpt(displayText), [displayText]);
  const isYou = message.role === 'you';

  const selectedText = useCallback((selection: { sourceText: string; text: string }) => {
    onSelectedText(message.id, selection);
  }, [message.id, onSelectedText]);
  const selectionCollapsed = useCallback(() => onSelectionCollapsed(message.id), [message.id, onSelectionCollapsed]);
  const openPhrasePicker = useCallback(() => onOpenPhrasePicker(message), [message, onOpenPhrasePicker]);
  const openWordDefinition = useCallback(() => { if (sourcePhrase) onOpenWordDefinition(sourcePhrase); }, [onOpenWordDefinition, sourcePhrase]);
  const playReply = useCallback(() => onPlayReply(message), [message, onPlayReply]);
  const report = useCallback(() => onReport(message), [message, onReport]);

  return (
    <View style={[styles.messageRow, isYou && styles.messageRowYou]}>
      <View style={[styles.message, isYou ? styles.userMessage : styles.ashaMessage]}>
        <View style={styles.messageIdentity}>
          <View style={[styles.messageAvatar, isYou && styles.messageAvatarYou]}>
            <Text style={[styles.messageAvatarText, isYou && styles.messageAvatarTextYou]}>{isYou ? 'Y' : 'आ'}</Text>
          </View>
          <Text style={[styles.messageLabel, isYou && styles.userText]}>{isYou ? 'You' : 'Asha'}</Text>
        </View>
        <SelectableChatText
          accessibilityHint={isWelcome ? 'Read-only message.' : 'Read-only message. Highlight words, then use Save selection below.'}
          accessibilityLabel={`Selectable chat text: ${displayText}`}
          accessibilityLiveRegion={message.role === 'asha' && !isWelcome ? 'polite' : 'none'}
          onSelectionCollapsed={selectionCollapsed}
          onSelectedText={selectedText}
          sourceText={message.text}
          style={[styles.messageText, isYou && styles.userText]}
          text={displayText}
        />
        {message.role === 'asha' || !isWelcome ? (
          <View style={styles.messageActions}>
            {!isWelcome ? <Pressable accessibilityHint="Saves the words you highlighted. If nothing is highlighted, opens the full message for trimming." accessibilityLabel={`Save transcript phrase: ${excerpt}`} accessibilityRole="button" onPress={openPhrasePicker} style={styles.smallAction}><BookmarkPlus color={isYou ? colors.white : colors.forest} size={16} /><Text style={[styles.smallActionText, isYou && styles.userText]}>Save selection</Text></Pressable> : null}
            {!isWelcome && !isPending && sourcePhrase ? <Pressable accessibilityHint={aiConsent ? 'Opens the Hindi-only word tray with contextual English explanations.' : 'Agree to connected AI processing to unpack this message.'} accessibilityLabel={`Explore Hindi words: ${excerpt}`} accessibilityRole="button" accessibilityState={{ disabled: !aiConsent }} disabled={!aiConsent} onPress={openWordDefinition} style={[styles.smallAction, !aiConsent && styles.disabled]}><Text style={[styles.smallActionText, isYou && styles.userText]}>Words</Text></Pressable> : null}
            {message.role === 'asha' ? (
              <>
                <Pressable accessibilityHint={!aiConsent ? 'Agree to connected AI processing to enable Listen.' : realtimeOwnsAudio ? 'End realtime voice before playing another voice.' : undefined} accessibilityLabel={`Read reply aloud: ${excerpt}`} accessibilityRole="button" accessibilityState={{ disabled: !aiConsent || realtimeOwnsAudio }} disabled={!aiConsent || realtimeOwnsAudio} onPress={playReply} style={[styles.smallAction, (!aiConsent || realtimeOwnsAudio) && styles.disabled]}><Volume2 color={colors.forest} size={16} /><Text style={styles.smallActionText}>Listen</Text></Pressable>
                {!isWelcome ? <Pressable accessibilityLabel={`Report reply: ${excerpt}`} accessibilityRole="button" accessibilityState={{ disabled: reported || reporting }} disabled={reported || reporting} onPress={report} style={[styles.smallAction, (reported || reporting) && styles.disabled]}><Flag color={reported ? colors.success : colors.muted} size={15} /><Text style={styles.smallActionText}>{reported ? 'Reported' : reporting ? 'Reporting…' : 'Report'}</Text></Pressable> : null}
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});
