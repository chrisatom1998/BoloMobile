import { BookmarkPlus, Ellipsis, Flag } from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Platform, Text, TextInput, View, type NativeSyntheticEvent, type StyleProp, type TextInputSelectionChangeEventData, type TextStyle, type ViewStyle } from 'react-native';

import type { createLiveStyles } from '@/app/(tabs)/live';
import { ChatMessageMenu, type ChatMessageMenuItem } from '@/components/chat-message-menu';
import { PhraseCard } from '@/components/phrase-card';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { hindiSourcePhrase } from '@/lib/contextual-word-definition';
import { legacyTranscriptDisplay, type LegacyTranscriptDisplay } from '@/lib/learner-phrase-display';
import { phraseCardLines } from '@/lib/phrase-card-lines';
import { structuredHindiSource, structuredSaveCandidates } from '@/lib/structured-reply';
import { sourceTextForLegacySelection } from '@/lib/transcript-selection';
import type { ChatMessage, ScriptPreference, StructuredCorrection, StructuredPhrase } from '@/state/app-state-types';
import { spacing, useTheme } from '@/theme';

const MAX_ACCESSIBLE_REPLY_CHARACTERS = 56;
// Half the action-row gap, so neighboring targets do not overlap. The row is 44pt tall, so no vertical slop.
const actionHitSlop = { bottom: 0, left: spacing.xs / 2, right: spacing.xs / 2, top: 0 };

// Web textareas draw a resize grip, which makes a chat line look editable.
const webChatText = { resize: 'none' } as TextStyle;

export function phrasePlaybackKey(messageId: string, phrase: Pick<StructuredPhrase, 'devanagari'>) {
  return `${messageId}\u0000${phrase.devanagari}`;
}

function messageActionExcerpt(text: string) {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= MAX_ACCESSIBLE_REPLY_CHARACTERS) return normalized;
  return `${normalized.slice(0, MAX_ACCESSIBLE_REPLY_CHARACTERS).trimEnd()}…`;
}

/**
 * Read-only, selectable chat text. Hindi runs render in the Tiro face (tagged
 * hi-IN) as nested spans inside the TextInput on native, so the learner can
 * still highlight words and Save maps the highlight back to the Devanagari
 * source. Web textareas cannot hold spans, so the flat string is used there.
 */
function SelectableChatText({
  accessibilityHint,
  accessibilityLabel,
  accessibilityLiveRegion,
  display,
  hindiStyle,
  onSelectedText,
  onSelectionCollapsed,
  selectionColor,
  style,
  testID,
}: {
  accessibilityHint: string;
  accessibilityLabel: string;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  display: LegacyTranscriptDisplay;
  hindiStyle: StyleProp<TextStyle>;
  onSelectedText: (selection: { sourceText: string; text: string }) => void;
  onSelectionCollapsed: () => void;
  selectionColor: string;
  style: StyleProp<TextStyle>;
  testID?: string;
}) {
  const text = display.displayText;
  const [measurement, setMeasurement] = useState<{ height?: number; text: string }>({ text });
  // A new or recycled message must measure at its natural height before the
  // measured value is pinned; a one-line initial height clips long turns.
  const height = measurement.text === text ? measurement.height : undefined;
  const useSpans = Platform.OS !== 'web' && display.hasDevanagari;

  const selectionChanged = useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { end, start } = event.nativeEvent.selection;
    if (end <= start) {
      onSelectionCollapsed();
      return;
    }
    const excerpt = text.slice(start, end).trim();
    if (!excerpt) return;
    onSelectedText({
      sourceText: sourceTextForLegacySelection(display, { end, start }),
      text: excerpt,
    });
  }, [display, onSelectedText, onSelectionCollapsed, text]);

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
      selectionColor={selectionColor}
      style={[style, Platform.OS === 'web' ? webChatText : null, { minHeight: 23 }, height === undefined ? undefined : { height }]}
      testID={testID}
      {...(useSpans ? {} : { value: text })}
    >
      {useSpans ? display.spans.map((span, index) => (
        span.script === 'devanagari'
          ? <Text accessibilityLanguage="hi-IN" key={index} style={hindiStyle} testID={testID ? `${testID}-devanagari` : undefined}>{span.text}</Text>
          : <Text key={index}>{span.text}</Text>
      )) : null}
    </TextInput>
  );
}

function CorrectionTable({
  correction,
  index,
  messageId,
  scriptPreference,
  stacked,
  styles,
}: {
  correction: StructuredCorrection;
  index: number;
  messageId: string;
  scriptPreference: ScriptPreference;
  stacked: boolean;
  styles: ReturnType<typeof createLiveStyles>;
}) {
  const said = phraseCardLines({ devanagari: correction.youSaid.devanagari, romanized: correction.youSaid.romanized, scriptPreference });
  const say = phraseCardLines({ devanagari: correction.say.devanagari, romanized: correction.say.romanized, english: correction.say.english, scriptPreference });
  const testID = `chat-correction-${messageId}-${index}`;
  return (
    <View style={styles.correction} testID={testID}>
      <View style={[styles.correctionRow, stacked && styles.correctionRowStacked]} testID={`${testID}-you-said`}>
        <Text style={styles.correctionLabel}>You said</Text>
        <View style={styles.correctionWords}>
          {said.devanagari ? <Text accessibilityLanguage="hi-IN" style={[styles.correctionHindi, styles.correctionStruck]}>{said.devanagari}</Text> : null}
          {said.romanized ? <Text style={[styles.correctionRoman, styles.correctionStruck]}>{said.romanized}</Text> : null}
        </View>
      </View>
      <View style={[styles.correctionRow, styles.correctionSay, stacked && styles.correctionRowStacked]} testID={`${testID}-say`}>
        <Text style={[styles.correctionLabel, styles.correctionSayLabel]}>Say</Text>
        <View style={styles.correctionWords}>
          {say.devanagari ? <Text accessibilityLanguage="hi-IN" style={styles.correctionHindi}>{say.devanagari}</Text> : null}
          {say.romanized ? <Text style={[styles.correctionRoman, styles.correctionSayRoman]}>{say.romanized}</Text> : null}
          {say.english ? <Text style={styles.correctionEnglish}>{say.english}</Text> : null}
        </View>
      </View>
      {correction.note ? (
        <Text style={styles.correctionNote}>
          {legacyTranscriptDisplay(correction.note, { normalizeKnown: false, scriptPreference }).displayText}
        </Text>
      ) : null}
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
  onPlayPhrase,
  onPlayReply,
  onReport,
  onSelectionCollapsed,
  onSelectedText,
  playbackLocked,
  playingPhrase = null,
  reducedMotion = false,
  reported,
  reporting,
  scriptPreference,
  styles,
}: {
  aiConsent: boolean;
  continuesNext: boolean;
  continuesPrevious: boolean;
  isPending: boolean;
  isWelcome: boolean;
  message: ChatMessage;
  /** `prefill` is the canonical phrase from a structured reply; omitted for the selection-based legacy path. */
  onOpenPhrasePicker: (message: ChatMessage, prefill?: StructuredPhrase) => void;
  onOpenWordDefinition: (sourcePhrase: string) => void;
  /** Speaks one phrase's Devanagari (not the whole reply). */
  onPlayPhrase?: (message: ChatMessage, phrase: StructuredPhrase) => void;
  onPlayReply: (message: ChatMessage) => void;
  onReport: (message: ChatMessage) => void;
  onSelectedText: (messageId: string, selection: { sourceText: string; text: string }) => void;
  onSelectionCollapsed: (messageId: string) => void;
  playbackLocked: boolean;
  /** `phrasePlaybackKey` of the phrase whose audio is loading or playing. */
  playingPhrase?: string | null;
  reducedMotion?: boolean;
  reported: boolean;
  reporting: boolean;
  scriptPreference: ScriptPreference;
  styles: ReturnType<typeof createLiveStyles>;
}) {
  const { colors } = useTheme();
  const largeTextLayout = useLargeTextLayout();
  const isYou = message.role === 'you';
  const structured = !isYou ? message.structured : undefined;
  const normalizeKnown = message.role === 'asha' && message.language === 'hi';
  const legacy = useMemo(() => legacyTranscriptDisplay(message.text, { normalizeKnown, scriptPreference }), [message.text, normalizeKnown, scriptPreference]);
  const introText = structured?.intro;
  const outroText = structured?.outro;
  const intro = useMemo(() => introText ? legacyTranscriptDisplay(introText, { normalizeKnown: false, scriptPreference }) : null, [introText, scriptPreference]);
  const outro = useMemo(() => outroText ? legacyTranscriptDisplay(outroText, { normalizeKnown: false, scriptPreference }) : null, [outroText, scriptPreference]);
  const saveCandidates = useMemo(() => structured ? structuredSaveCandidates(structured) : [], [structured]);
  const sourcePhrase = useMemo(() => {
    if (structured) return hindiSourcePhrase(structuredHindiSource(structured));
    return hindiSourcePhrase(legacy.selectionSource) || (message.language === 'hi' ? message.text : '');
  }, [legacy.selectionSource, message.language, message.text, structured]);
  const excerpt = useMemo(() => messageActionExcerpt(legacy.accessibleText), [legacy.accessibleText]);
  const [menu, setMenu] = useState<'actions' | 'save' | null>(null);
  const messageHint = isWelcome
    ? 'Read-only message.'
    : 'Read-only message. Highlight words, then use Save phrase below.';

  const selectedText = useCallback((selection: { sourceText: string; text: string }) => {
    onSelectedText(message.id, selection);
  }, [message.id, onSelectedText]);
  const selectionCollapsed = useCallback(() => onSelectionCollapsed(message.id), [message.id, onSelectionCollapsed]);
  const closeMenu = useCallback(() => setMenu(null), []);
  const savePhrase = useCallback(() => {
    if (saveCandidates.length === 1) onOpenPhrasePicker(message, saveCandidates[0]);
    else if (saveCandidates.length > 1) setMenu('save');
    else onOpenPhrasePicker(message);
  }, [message, onOpenPhrasePicker, saveCandidates]);
  const openWordDefinition = useCallback(() => { if (sourcePhrase) onOpenWordDefinition(sourcePhrase); }, [onOpenWordDefinition, sourcePhrase]);
  const playReply = useCallback(() => onPlayReply(message), [message, onPlayReply]);
  const report = useCallback(() => onReport(message), [message, onReport]);
  const showActions = !isPending && !isWelcome;
  const hindiStyle = useMemo(() => [styles.messageHindi, isYou && styles.userText], [isYou, styles.messageHindi, styles.userText]);

  const actionItems = useMemo<ChatMessageMenuItem[]>(() => {
    const items: ChatMessageMenuItem[] = [];
    if (sourcePhrase) {
      items.push({
        key: 'words',
        label: 'Words',
        accessibilityLabel: `Explore Hindi words: ${excerpt}`,
        accessibilityHint: aiConsent ? 'Opens the Hindi-only word tray with contextual English explanations.' : 'Agree to connected AI processing to unpack this message.',
        disabled: !aiConsent,
        onPress: openWordDefinition,
      });
    }
    if (!isYou) {
      items.push({
        key: 'listen',
        label: 'Listen',
        accessibilityLabel: `Read reply aloud: ${excerpt}`,
        accessibilityHint: !aiConsent ? 'Agree to connected AI processing to enable Listen.' : playbackLocked ? 'Wait until Asha finishes speaking before playing another reply.' : 'Reads the whole reply aloud.',
        disabled: !aiConsent || playbackLocked,
        onPress: playReply,
      });
      items.push({
        key: 'report',
        label: reported ? 'Reported' : reporting ? 'Reporting…' : 'Report',
        accessibilityLabel: `Report reply: ${excerpt}`,
        destructive: !reported,
        disabled: reported || reporting,
        onPress: report,
      });
    }
    return items;
  }, [aiConsent, excerpt, isYou, openWordDefinition, playReply, playbackLocked, report, reported, reporting, sourcePhrase]);

  const saveItems = useMemo<ChatMessageMenuItem[]>(() => saveCandidates.map((phrase, index) => ({
    key: `save-${index}`,
    label: phrase.romanized,
    accessibilityLabel: `Save phrase: ${phrase.romanized}`,
    detail: phrase.english || undefined,
    onPress: () => onOpenPhrasePicker(message, phrase),
  })), [message, onOpenPhrasePicker, saveCandidates]);

  const body = structured ? (
    <View style={styles.structuredBody} testID={`chat-structured-${message.id}`}>
      {intro ? (
        <SelectableChatText
          accessibilityHint={messageHint}
          accessibilityLabel={`Asha: ${intro.accessibleText}`}
          accessibilityLiveRegion="polite"
          display={intro}
          hindiStyle={hindiStyle}
          onSelectedText={selectedText}
          onSelectionCollapsed={selectionCollapsed}
          selectionColor={colors.brand}
          style={styles.messageText}
        />
      ) : null}
      {structured.phrases?.map((phrase, index) => {
        const key = phrasePlaybackKey(message.id, phrase);
        return (
          <PhraseCard
            devanagari={phrase.devanagari}
            english={phrase.english}
            key={`${phrase.devanagari}-${index}`}
            listenDisabled={!aiConsent || playbackLocked}
            listenHint={!aiConsent ? 'Agree to connected AI processing to enable Listen.' : playbackLocked ? 'Wait until Asha finishes speaking.' : 'Plays only this Hindi phrase.'}
            onListen={onPlayPhrase ? () => onPlayPhrase(message, phrase) : undefined}
            playing={playingPhrase === key}
            romanized={phrase.romanized}
            scriptPreference={scriptPreference}
            style={styles.phraseCard}
            testID={`chat-phrase-${message.id}-${index}`}
          />
        );
      })}
      {structured.corrections?.map((correction, index) => (
        <CorrectionTable correction={correction} index={index} key={`${correction.say.devanagari}-${index}`} messageId={message.id} scriptPreference={scriptPreference} stacked={largeTextLayout} styles={styles} />
      ))}
      {outro ? (
        <SelectableChatText
          accessibilityHint={messageHint}
          accessibilityLabel={`Asha: ${outro.accessibleText}`}
          display={outro}
          hindiStyle={hindiStyle}
          onSelectedText={selectedText}
          onSelectionCollapsed={selectionCollapsed}
          selectionColor={colors.brand}
          style={styles.messageText}
        />
      ) : null}
    </View>
  ) : (
    <SelectableChatText
      accessibilityHint={messageHint}
      accessibilityLabel={`${isYou ? 'You' : 'Asha'}: ${legacy.accessibleText}`}
      accessibilityLiveRegion={message.role === 'asha' && !isWelcome ? 'polite' : 'none'}
      display={legacy}
      hindiStyle={hindiStyle}
      onSelectedText={selectedText}
      onSelectionCollapsed={selectionCollapsed}
      selectionColor={isYou ? colors.gold : colors.brand}
      style={[styles.messageText, isYou && styles.userText]}
    />
  );

  return (
    <View style={[styles.messageRow, isYou && styles.messageRowYou, isWelcome && styles.welcomeRow, continuesNext && styles.messageRowStacked]} testID={!isWelcome && !isPending ? (isYou ? 'live-transcript-user' : 'live-transcript-assistant') : undefined}>
      <View style={[styles.message, isYou ? styles.userMessage : styles.ashaMessage, isWelcome && styles.welcomeMessage, !isWelcome && continuesPrevious && (isYou ? styles.userContinued : styles.ashaContinued), !isWelcome && !continuesNext && (isYou ? styles.userTail : styles.ashaTail)]}>
        {continuesPrevious ? null : (
          <View style={styles.messageIdentity}>
            <Text style={[styles.messageLabel, isYou && styles.userText]}>{isYou ? 'You' : 'Asha'}</Text>
          </View>
        )}
        {body}
        {isPending ? <Text style={styles.messageStatus}>Sending…</Text> : null}
        {showActions ? (
          <View style={[styles.messageActions, isYou && styles.messageActionsYou]}>
            <Pressable
              accessibilityHint={saveCandidates.length ? 'Opens the phrase picker with Asha’s Hindi, romanization and meaning filled in.' : 'Saves the words you highlighted. If nothing is highlighted, opens the full message for trimming.'}
              accessibilityLabel={`Save phrase: ${excerpt}`}
              accessibilityRole="button"
              hitSlop={actionHitSlop}
              onPress={savePhrase}
              style={styles.smallAction}
              testID={`chat-save-${message.id}`}
            >
              <BookmarkPlus color={isYou ? colors.white : colors.forest} size={16} />
              <Text style={[styles.smallActionText, isYou && styles.userText]}>Save phrase</Text>
            </Pressable>
            {actionItems.length ? (
              <Pressable
                accessibilityHint={isYou ? 'Opens Words.' : 'Opens Words, Listen and Report.'}
                accessibilityLabel={`More actions: ${excerpt}`}
                accessibilityRole="button"
                onPress={() => setMenu('actions')}
                style={styles.moreAction}
                testID={`chat-more-${message.id}`}
              >
                <Ellipsis color={isYou ? colors.white : colors.muted} size={20} />
              </Pressable>
            ) : null}
            {reported || reporting ? (
              <View style={styles.reportStatus}>
                <Flag color={reported ? colors.success : colors.muted} size={14} />
                <Text style={[styles.smallActionText, reported && styles.reportedText]}>{reported ? 'Reported' : 'Reporting…'}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {menu ? (
        <ChatMessageMenu
          items={menu === 'save' ? saveItems : actionItems}
          onClose={closeMenu}
          reducedMotion={reducedMotion}
          testID={`chat-menu-${message.id}`}
          title={menu === 'save' ? 'Which phrase do you want to save?' : `${isYou ? 'Your message' : 'Asha’s reply'}: ${excerpt}`}
          visible
        />
      ) : null}
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
