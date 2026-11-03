import { Image } from 'expo-image';
import { MessageCircle } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View, type ImageStyle, type StyleProp } from 'react-native';

import { CaptionReveal } from '@/components/live/caption-reveal';
import { ashaPortrait } from '@/components/live/live-helpers';
import type { LiveScreenViewProps } from '@/components/live/live-screen-types';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { ashaInviteAction, ashaInviteLine, ashaInviteSharing } from '@/lib/asha-invite';
import { layout, spacing } from '@/theme';

export function VoiceHero({
  accessibilityCompact,
  aiConsent,
  callFocus,
  cancelConnecting,
  colors,
  compactVoiceLayout,
  conversationStarted,
  headerCollapsed,
  heroContentWidth,
  largeTextLayout,
  liveConfigError,
  lastSessionButton,
  microphonePhase,
  motionMode,
  realtimeStatus,
  reflowHeaderLayout,
  restingVoiceLayout,
  scrollToChat,
  setConsentSheetOpen,
  slowConnecting,
  speechCaption,
  styles,
  toggleTranscript,
  transcriptOpen,
  realtimeLocked,
  voiceHeroBody,
  voiceHeroTitle,
  languageControl,
  microphoneGuidance,
  portraitStyle,
  statusKicker,
  talkControl,
}: LiveScreenViewProps & {
  languageControl: ReactNode;
  microphoneGuidance: ReactNode;
  portraitStyle: StyleProp<ImageStyle>;
  statusKicker: string;
  talkControl: ReactNode;
}) {
  return (
            <View style={[styles.voiceHero, compactVoiceLayout && styles.voiceHeroCompact, restingVoiceLayout && styles.voiceHeroResting, largeTextLayout && styles.voiceHeroLarge, headerCollapsed && styles.voiceHeroCollapsed, { paddingTop: accessibilityCompact || restingVoiceLayout ? spacing.xs : spacing.md }, accessibilityCompact && aiConsent && !speechCaption && microphonePhase === 'idle' && styles.voiceHeroHidden]} testID="voice-conversation-hero">
              {headerCollapsed ? null : <Text maxFontSizeMultiplier={layout.headerFontScaleCap} style={[styles.headerSubtitle, reflowHeaderLayout && styles.headerSubtitleStacked]}>Your Hindi coach</Text>}
              {!aiConsent ? (
                <View style={[styles.liveControls, { width: heroContentWidth }]} testID="live-voice-controls">
                  <View style={[styles.inviteRing, compactVoiceLayout && styles.inviteRingCompact]}>
                    <View
                      accessibilityLabel={liveConfigError ? 'Asha voice, unavailable' : undefined}
                      accessibilityState={liveConfigError ? { disabled: true } : undefined}
                      accessible={Boolean(liveConfigError)}
                      style={liveConfigError ? styles.voiceUnavailable : undefined}
                    >
                    <Image
                      accessible={false}
                      cachePolicy="memory-disk"
                      contentFit="cover"
                      source={ashaPortrait}
                      style={portraitStyle}
                      testID="asha-header-portrait"
                      transition={0}
                    />
                    </View>
                  </View>
                  <View style={styles.heroCopy}>
                    <Text accessibilityLabel={`Asha says: ${ashaInviteLine}`} style={styles.heroTitle}>{ashaInviteLine}</Text>
                    <Text style={styles.heroBody}>{ashaInviteSharing}</Text>
                    {liveConfigError ? <Text maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.voiceOffCaption}>Voice off</Text> : null}
                  </View>
                  {liveConfigError ? null : (
                  <Pressable accessibilityRole="button" onPress={() => setConsentSheetOpen(true)} style={styles.talkButton} testID="talk-with-asha">
                    <Text style={styles.talkButtonText}>{ashaInviteAction}</Text>
                  </Pressable>
                  )}
                  {lastSessionButton}
                </View>
              ) : null}
              {aiConsent ? <View style={[styles.liveControls, restingVoiceLayout && styles.liveControlsResting]} testID="live-voice-controls">
                {/* The language is fixed for the call, so the switch leaves the screen until it ends. */}
                {headerCollapsed || accessibilityCompact || realtimeLocked ? null : languageControl}
                {accessibilityCompact ? null : (
                <View style={[styles.voiceStage, compactVoiceLayout && styles.voiceStageCompact, restingVoiceLayout && styles.voiceStageResting, { width: heroContentWidth }]}>
                  {/* Asha's portrait is the tap-to-talk control: status rings and pulses wrap it. */}
                  <View style={styles.portraitControl} testID="asha-portrait-control">
                    {talkControl}
                    <Pressable accessibilityLabel={realtimeLocked ? (transcriptOpen ? 'Hide transcript' : 'Show transcript') : 'Open transcript'} accessibilityRole="button" onPress={realtimeLocked ? toggleTranscript : scrollToChat} style={styles.chatButton} testID="live-transcript-toggle">
                      <MessageCircle accessible={false} color={colors.white} size={20} />
                    </Pressable>
                  </View>
                  <View style={styles.heroCopy}>
                    <View style={styles.statusRow} testID="asha-voice-status">
                      <View style={[styles.statusDot, realtimeStatus === 'recording' && styles.statusDotLive, realtimeStatus === 'thinking' && styles.statusDotThinking]} />
                      <Text accessibilityLiveRegion={conversationStarted ? 'polite' : undefined} maxFontSizeMultiplier={layout.headerFontScaleCap} style={liveConfigError ? styles.voiceOffCaption : styles.liveVoiceText}>{liveConfigError ? 'Voice off' : statusKicker}</Text>
                    </View>
                    {liveConfigError ? null : microphoneGuidance ?? (conversationStarted && !callFocus ? (
                      <Text style={styles.heroBody}>{voiceHeroBody}</Text>
                    ) : (
                      <>
                        <Text accessibilityLiveRegion="polite" style={styles.heroTitle}>{voiceHeroTitle}</Text>
                        <Text style={styles.heroBody}>{voiceHeroBody}</Text>
                      </>
                    ))}
                    {slowConnecting && realtimeStatus === 'connecting' ? (
                      <Pressable accessibilityRole="button" onPress={cancelConnecting} style={styles.secondaryActionButton} testID="live-cancel-connecting">
                        <Text style={styles.secondaryActionText}>Cancel</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                )}
                {/* The compact layout drops the stage, so permission guidance renders on its own. */}
                {accessibilityCompact && microphoneGuidance ? <View style={[styles.heroCopy, { width: heroContentWidth }]}>{microphoneGuidance}</View> : null}
                {/* Live captions are for the call in progress. Once it ends, each line lives in the chat below. */}
                {speechCaption && realtimeStatus !== 'disconnected' ? (
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
              </View> : null}
            </View>
  );
}
