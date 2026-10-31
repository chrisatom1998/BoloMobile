import { BookmarkPlus, Flag, Volume2 } from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TextInput, View, type NativeSyntheticEvent, type StyleProp, type TextInputSelectionChangeEventData, type TextStyle, type ViewStyle } from 'react-native';

import type { createLiveStyles } from '@/app/(tabs)/live';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { hindiSourcePhrase } from '@/lib/contextual-word-definition';
import { canonicalTranscriptSource, displayHindiTranscript } from '@/lib/learner-phrase-display';
import { sourceTextForDisplayedSelection } from '@/lib/transcript-selection';
import type { ChatMessage } from '@/state/app-state-types';
import { spacing, useTheme } from '@/theme';

const MAX_ACCESSIBLE_REPLY_CHARACTERS = 56;
// Half the action-row gap, so neighboring targets do not overlap. The row is 44pt tall, so no vertical slop.
const actionHitSlop = { bottom: 0, left: spacing.xs / 2, right: spacing.xs / 2, top: 0 };

// Web textareas draw a resize grip, which makes a chat line look editable.
const webChatText = { resize: 'none' } as TextStyle;
const selectableTextFrame: ViewStyle = { alignSelf: 'stretch', minHeight: 23 };
const hiddenSizer: TextStyle = { opacity: 0 };

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
  selectionColor,
  sourceText,
  style,
  text,
}: {
  accessibilityHint: string;
  accessibilityLabel: string;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  onSelectedText: (selection: { sourceText: string; text: string }) => void;
  onSelectionCollapsed: () => void;
  selectionColor: string;
  sourceText: string;
  style: StyleProp<TextStyle>;
  text: string;
}) {
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

  // A hidden Text sizes the bubble; the selectable TextInput sits on top. Pinning
  // the input to its own contentSize kept stale tall heights from narrow layouts.
  return (
    <View style={selectableTextFrame}>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[style, hiddenSizer]}>{text}</Text>
      <TextInput
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        accessibilityLiveRegion={accessibilityLiveRegion}
        accessibilityRole="text"
        contextMenuHidden={false}
        multiline
        onSelectionChange={selectionChanged}
        readOnly
        scrollEnabled={false}
        selectionColor={selectionColor}
        style={[style, Platform.OS === 'web' ? webChatText : null, StyleSheet.absoluteFill]}
        value={text}
      />
    </View>
  );
}

export const ChatMessageRow = memo(function ChatMessageRow({
  aiConsent,
  continuesNext,
  continuesPrevious,
  isPending,
  isWelcome,
  message,
  onOpenPhrasePicker,
  onOpenWordDefinition,
  onPlayReply,
  onReport,
  onSelectionCollapsed,
  onSelectedText,
  playbackLocked,
  reported,
  reporting,
  styles,
}: {
  aiConsent: boolean;
  continuesNext: boolean;
  continuesPrevious: boolean;
  isPending: boolean;
  isWelcome: boolean;
  message: ChatMessage;
  onOpenPhrasePicker: (message: ChatMessage) => void;
  onOpenWordDefinition: (sourcePhrase: string) => void;
  onPlayReply: (message: ChatMessage) => void;
  onReport: (message: ChatMessage) => void;
  onSelectedText: (messageId: string, selection: { sourceText: string; text: string }) => void;
  onSelectionCollapsed: (messageId: string) => void;
  playbackLocked: boolean;
  reported: boolean;
  reporting: boolean;
  styles: ReturnType<typeof createLiveStyles>;
}) {
  const { colors } = useTheme();
  const normalizeKnown = message.role === 'asha' && message.language === 'hi';
  const displayText = useMemo(() => displayHindiTranscript(message.text, normalizeKnown), [message.text, normalizeKnown]);
  const selectionSource = useMemo(() => canonicalTranscriptSource(message.text, normalizeKnown), [message.text, normalizeKnown]);
  const sourcePhrase = useMemo(() => hindiSourcePhrase(selectionSource) || (message.language === 'hi' ? message.text : ''), [message.language, message.text, selectionSource]);
  const excerpt = useMemo(() => messageActionExcerpt(displayText), [displayText]);
  const isYou = message.role === 'you';
  const messageHint = isWelcome
    ? 'Read-only message.'
    : 'Read-only message. Highlight words, then use Save selection below.';

  const selectedText = useCallback((selection: { sourceText: string; text: string }) => {
    onSelectedText(message.id, selection);
  }, [message.id, onSelectedText]);
  const selectionCollapsed = useCallback(() => onSelectionCollapsed(message.id), [message.id, onSelectionCollapsed]);
  const openPhrasePicker = useCallback(() => onOpenPhrasePicker(message), [message, onOpenPhrasePicker]);
  const openWordDefinition = useCallback(() => { if (sourcePhrase) onOpenWordDefinition(sourcePhrase); }, [onOpenWordDefinition, sourcePhrase]);
  const playReply = useCallback(() => onPlayReply(message), [message, onPlayReply]);
  const report = useCallback(() => onReport(message), [message, onReport]);
  const showActions = !isPending && !isWelcome;

  return (
    <View style={[styles.messageRow, isYou && styles.messageRowYou, isWelcome && styles.welcomeRow, continuesNext && styles.messageRowStacked]} testID={!isWelcome && !isPending ? (isYou ? 'live-transcript-user' : 'live-transcript-assistant') : undefined}>
      <View style={[styles.message, isYou ? styles.userMessage : styles.ashaMessage, isWelcome && styles.welcomeMessage, !isWelcome && continuesPrevious && (isYou ? styles.userContinued : styles.ashaContinued), !isWelcome && !continuesNext && (isYou ? styles.userTail : styles.ashaTail)]}>
        {continuesPrevious ? null : (
          <View style={styles.messageIdentity}>
            <Text style={[styles.messageLabel, isYou && styles.userText]}>{isYou ? 'You' : 'Asha'}</Text>
          </View>
        )}
        <SelectableChatText
          accessibilityHint={messageHint}
          accessibilityLabel={`${isYou ? 'You' : 'Asha'}: ${displayText}`}
          accessibilityLiveRegion={message.role === 'asha' && !isWelcome ? 'polite' : 'none'}
          onSelectionCollapsed={selectionCollapsed}
          onSelectedText={selectedText}
          selectionColor={isYou ? colors.gold : colors.brand}
          sourceText={selectionSource}
          style={[styles.messageText, isYou && styles.userText]}
          text={displayText}
        />
        {isPending ? <Text style={styles.messageStatus}>Sending…</Text> : null}
        {showActions ? (
          <View style={[styles.messageActions, isYou && styles.messageActionsYou]}>
            {!isWelcome ? <Pressable accessibilityHint="Saves the words you highlighted. If nothing is highlighted, opens the full message for trimming." accessibilityLabel={`Save transcript phrase: ${excerpt}`} accessibilityRole="button" hitSlop={actionHitSlop} onPress={openPhrasePicker} style={styles.smallAction}><BookmarkPlus color={isYou ? colors.white : colors.forest} size={16} /><Text style={[styles.smallActionText, isYou && styles.userText]}>Save selection</Text></Pressable> : null}
            {!isWelcome && !isPending && sourcePhrase ? <Pressable accessibilityHint={aiConsent ? 'Opens the Hindi-only word tray with contextual English explanations.' : 'Agree to connected AI processing to unpack this message.'} accessibilityLabel={`Explore Hindi words: ${excerpt}`} accessibilityRole="button" accessibilityState={{ disabled: !aiConsent }} disabled={!aiConsent} hitSlop={actionHitSlop} onPress={openWordDefinition} style={[styles.smallAction, !aiConsent && styles.disabled]}><Text style={[styles.smallActionText, isYou && styles.userText]}>Words</Text></Pressable> : null}
            {message.role === 'asha' ? (
              <>
                <Pressable accessibilityHint={!aiConsent ? 'Agree to connected AI processing to enable Listen.' : playbackLocked ? 'Wait until Asha finishes speaking before playing another reply.' : undefined} accessibilityLabel={`Read reply aloud: ${excerpt}`} accessibilityRole="button" accessibilityState={{ disabled: !aiConsent || playbackLocked }} disabled={!aiConsent || playbackLocked} hitSlop={actionHitSlop} onPress={playReply} style={[styles.smallAction, (!aiConsent || playbackLocked) && styles.disabled]}><Volume2 color={colors.forest} size={16} /><Text style={styles.smallActionText}>Listen</Text></Pressable>
                {!isWelcome ? <Pressable accessibilityLabel={`Report reply: ${excerpt}`} accessibilityRole="button" accessibilityState={{ disabled: reported || reporting }} disabled={reported || reporting} hitSlop={actionHitSlop} onPress={report} style={[styles.smallAction, reporting && styles.disabled]}><Flag color={reported ? colors.success : colors.muted} size={15} /><Text style={[styles.smallActionText, reported && styles.reportedText]}>{reported ? 'Reported' : reporting ? 'Reporting…' : 'Report'}</Text></Pressable> : null}
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});

/** Quiet in-thread marker while a typed reply is in flight. The composer owns the live announcement. */
export function AshaTypingRow({ reducedMotion, styles }: { reducedMotion: boolean; styles: ReturnType<typeof createLiveStyles> }) {
  return (
    <View accessibilityLabel="Asha is writing a reply" style={styles.messageRow} testID="asha-typing-indicator">
      <View style={[styles.message, styles.ashaMessage, styles.ashaTail, styles.typingBubble]}>
        <Text style={styles.messageLabel}>Asha</Text>
        <View style={styles.typingDots}>
          <TypingDot delay={0} reducedMotion={reducedMotion} style={styles.typingDot} />
          <TypingDot delay={140} reducedMotion={reducedMotion} style={styles.typingDot} />
          <TypingDot delay={280} reducedMotion={reducedMotion} style={styles.typingDot} />
        </View>
      </View>
    </View>
  );
}

function TypingDot({ delay, reducedMotion, style }: { delay: number; reducedMotion: boolean; style: StyleProp<ViewStyle> }) {
  const [opacity] = useState(() => new Animated.Value(reducedMotion ? 0.85 : 0.35));

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.85);
      return;
    }
    const animation = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { duration: 280, toValue: 1, useNativeDriver: true }),
          Animated.timing(opacity, { duration: 280, toValue: 0.28, useNativeDriver: true }),
        ]),
      ),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delay, opacity, reducedMotion]);

  return <Animated.View style={[style, { opacity }]} />;
}
