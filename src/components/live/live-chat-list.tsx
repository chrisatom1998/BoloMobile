import type { ReactNode } from 'react';
import { FlatList, Text, View, type ImageStyle, type StyleProp } from 'react-native';

import { AshaTypingRow, ChatMessageRow } from '@/components/chat-message-row';
import { AskAshaSection } from '@/components/live/ask-asha-section';
import { FeaturedPhrase } from '@/components/live/featured-phrase';
import { sharesSpeaker, tailFollowThreshold, welcome } from '@/components/live/live-helpers';
import type { LiveScreenViewProps } from '@/components/live/live-screen-types';
import { VoiceHero } from '@/components/live/voice-hero';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { layout, spacing } from '@/theme';

export function LiveChatList(props: LiveScreenViewProps & {
  languageControl: ReactNode;
  microphoneGuidance: ReactNode;
  portraitStyle: StyleProp<ImageStyle>;
  statusKicker: string;
  talkControl: ReactNode;
}) {
  const {
  aiConsent,
  animatedFollowRef,
  busy,
  callFocus,
  realtimeLocked,
  discardReport,
  focusAshaComposer,
  followTail,
  forgetSelectedChatText,
  hasSelectedChatText,
  heroContentWidth,
  learnerProfile,
  listRef,
  liveConfigError,
  nearBottomRef,
  openPhrasePicker,
  pendingReports,
  pendingUserMessage,
  playPhrase,
  playReply,
  playingPhrase,
  queuedReports,
  reducedMotion,
  releaseAnimatedFollow,
  rememberSelectedChatText,
  replyPlaybackLocked,
  report,
  reported,
  retryReport,
  setScrolledCompact,
  setWordDefinitionPhrase,
  setWordSheetVisible,
  styles,
  visibleMessages,
  } = props;
  return (
      <FlatList
        ref={listRef}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={styles.listContent}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distanceFromEnd = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          const canScroll = contentSize.height > layoutMeasurement.height + layout.headerCollapseOffset;
          const nextCompact = canScroll && contentOffset.y > layout.headerCollapseOffset;
          setScrolledCompact((current) => {
            if (!canScroll || contentOffset.y < spacing.sm) return false;
            if (nextCompact) return true;
            return current;
          });
          const nearBottom = distanceFromEnd <= tailFollowThreshold;
          if (animatedFollowRef.current && !nearBottom) return;
          releaseAnimatedFollow();
          nearBottomRef.current = nearBottom;
        }}
        onMomentumScrollEnd={releaseAnimatedFollow}
        onScrollBeginDrag={releaseAnimatedFollow}
        onScrollEndDrag={releaseAnimatedFollow}
        scrollEventThrottle={16}
        data={aiConsent && !callFocus ? visibleMessages : []}
        keyExtractor={(message) => message.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        testID="live-chat-list"
        ListHeaderComponent={(
          <View>
            <VoiceHero {...props} />

            {liveConfigError ? (
              <View accessibilityRole="alert" style={[styles.liveConfigCard, { width: heroContentWidth }]} testID="live-voice-config-error">
                <Text maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.liveConfigTitle}>Voice isn’t set up</Text>
                <Text accessibilityLanguage="hi-IN" maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.liveConfigHindi}>आवाज़ तैयार नहीं</Text>
                <Text maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.liveConfigBody}>{liveConfigError}</Text>
                <Pressable accessibilityRole="button" onPress={focusAshaComposer} style={styles.talkButton} testID="type-to-asha">
                  <Text maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.talkButtonText}>Type to Asha</Text>
                </Pressable>
              </View>
            ) : null}

            {realtimeLocked ? null : <AskAshaSection {...props} />}
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
            hasSelectedText={hasSelectedChatText}
            isWelcome={item.id === welcome.id}
            message={item}
            onOpenPhrasePicker={openPhrasePicker}
            onOpenWordDefinition={(phrase) => { setWordDefinitionPhrase(phrase); setWordSheetVisible(true); }}
            onPlayPhrase={playPhrase}
            onDiscardReport={discardReport}
            onPlayReply={playReply}
            onReport={report}
            onRetryReport={retryReport}
            onSelectedText={rememberSelectedChatText}
            onSelectionCollapsed={forgetSelectedChatText}
            playbackLocked={replyPlaybackLocked}
            playingPhrase={playingPhrase}
            reducedMotion={reducedMotion}
            queuedReport={queuedReports.get(item.id)}
            reported={reported.has(item.id)}
            reporting={pendingReports.has(item.id)}
            scriptPreference={learnerProfile.scriptPreference}
            styles={styles}
          />
        )}
        ListFooterComponent={aiConsent && !realtimeLocked ? (
          <>
            {busy && pendingUserMessage ? <AshaTypingRow reducedMotion={reducedMotion} styles={styles} /> : null}
            <FeaturedPhrase {...props} />
          </>
        ) : null}
      />  );
}
