import { Image } from 'expo-image';
import { Linking, KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { AshaMinimizedCover } from '@/components/asha-minimize-control';
import { LiveChatList } from '@/components/live/live-chat-list';
import { LiveComposerDock } from '@/components/live/live-composer-dock';
import { ashaPortrait } from '@/components/live/live-helpers';
import { LiveScreenHeader } from '@/components/live/live-screen-header';
import type { LiveScreenViewProps } from '@/components/live/live-screen-types';
import { RealtimeVoiceButton } from '@/components/realtime-voice-button';
import { SegmentedControl } from '@/components/segmented-control';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { TranscriptPhrasePicker } from '@/components/transcript-phrase-picker';
import { WordDefinitionSheet } from '@/components/word-definition-sheet';
import { LIVE_MIC_EXPLAINER } from '@/lib/live-microphone';
import { LIVE_MIC_PERMISSION_MESSAGE } from '@/lib/live-permission';
import { layout } from '@/theme';

export function LiveScreenView(props: LiveScreenViewProps) {
  const {
  accessibilityCompact,
  aiConsent,
  bindComposerMicAction,
  bindOwnedDisconnect,
  busy,
  changeResponseLanguage,
  chatHistory,
  clearingChat,
  clientId,
  closePhraseSheet,
  closeWordSheet,
  compactVoiceLayout,
  finishPhraseSheet,
  finishWordSheet,
  floatingAsha,
  headerCollapsed,
  heroContentWidth,
  languageControlLocked,
  learnerProfile,
  liveSession,
  microphonePhase,
  motionMode,
  phraseMessage,
  phraseSheetVisible,
  realtimeStatus,
  recordOwnedSessionEvent,
  recordOwnedSnapshot,
  reducedMotion,
  responseLanguage,
  saveTranscriptPhrase,
  screenFocused,
  setMicrophonePhase,
  showRealtimeError,
  startNewConversation,
  styles,
  updateLiveTranscript,
  updateRealtimeStatus,
  wordDefinitionPhrase,
  wordSheetVisible,
  } = props;

  const statusKicker = aiConsent
    ? { disconnected: 'READY', connecting: 'CONNECTING', ready: 'MUTED', recording: 'LISTENING', responding: 'SPEAKING' }[realtimeStatus]
    : 'LIVE VOICE';

  // The portrait and the rings around it shrink together. A collapsed header uses the
  // compact orb, so Asha's photo still fills the circle after a call adds chat rows.
  const compactPortrait = compactVoiceLayout || (headerCollapsed && !accessibilityCompact);
  const portraitStyle = [
    styles.ashaPortrait,
    compactPortrait && styles.ashaPortraitCompact,
  ];

  const languageControl = (
    <SegmentedControl
      accessibilityLabel="Asha voice language"
      disabled={languageControlLocked}
      disabledHint="End the current request or live voice session to change Asha voice language."
      onValueChange={changeResponseLanguage}
      options={[
        { accessibilityLabel: 'English', label: 'English', value: 'en' },
        { accessibilityLabel: 'Hindi', label: 'Hindi', value: 'hi' },
      ]}
      maxFontSizeMultiplier={accessibilityCompact ? layout.headerFontScaleCap : undefined}
      stackedAtLargeText={!accessibilityCompact}
      style={[styles.languageSelector, { width: heroContentWidth }]}
      tone="dark"
      value={responseLanguage}
    />
  );

  const talkControl = floatingAsha.available && !floatingAsha.voice ? (
    <Image
      accessibilityLabel="Talk to Asha"
      accessible
      cachePolicy="memory-disk"
      contentFit="cover"
      source={ashaPortrait}
      style={accessibilityCompact ? styles.ashaPortraitCollapsed : portraitStyle}
      testID="asha-header-portrait"
      transition={0}
    />
  ) : (
    <RealtimeVoiceButton key={floatingAsha.available ? `shared-${clientId}` : `${screenFocused && aiConsent ? 'enabled' : 'disabled'}-${clientId}`} active={screenFocused} clientId={clientId} compact={compactPortrait} disabled={!aiConsent || busy || clearingChat || (!floatingAsha.available && !screenFocused)} motionMode={motionMode} onError={showRealtimeError} onMicrophonePhase={setMicrophonePhase} liveSession={floatingAsha.available ? undefined : liveSession} onConnectionStart={floatingAsha.available ? undefined : startNewConversation} onDisconnectReady={floatingAsha.available ? undefined : bindOwnedDisconnect} onSessionEvent={floatingAsha.available ? undefined : recordOwnedSessionEvent} onTranscriptSnapshot={floatingAsha.available ? undefined : recordOwnedSnapshot} onStatusChange={updateRealtimeStatus} onTranscriptChange={floatingAsha.available ? undefined : updateLiveTranscript} onTurnActionReady={bindComposerMicAction} responseLanguage={responseLanguage} size={accessibilityCompact ? 'avatar' : 'portrait'} tone="dark" voice={floatingAsha.voice ?? undefined}>
      <Image
        accessible={false}
        cachePolicy="memory-disk"
        contentFit="cover"
        source={ashaPortrait}
        style={accessibilityCompact ? styles.ashaPortraitCollapsed : portraitStyle}
        testID="asha-header-portrait"
        transition={0}
      />
    </RealtimeVoiceButton>
  );

  const microphoneGuidance = microphonePhase === 'explaining' ? (
    <Text accessibilityLiveRegion="polite" style={styles.heroBody} testID="mic-explainer">{LIVE_MIC_EXPLAINER}</Text>
  ) : microphonePhase === 'denied' ? (
    <View style={styles.micDenied} testID="mic-denied">
      <Text accessibilityRole="alert" style={styles.heroTitle}>The microphone is off</Text>
      <Text style={styles.heroBody}>{LIVE_MIC_PERMISSION_MESSAGE}</Text>
      <Pressable accessibilityLabel="Open Settings to allow microphone access" accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.talkButton} testID="mic-open-settings">
        <Text style={styles.talkButtonText}>Open Settings</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <LiveScreenHeader {...props} languageControl={languageControl} statusKicker={statusKicker} talkControl={talkControl} />
      <LiveChatList {...props} languageControl={languageControl} microphoneGuidance={microphoneGuidance} portraitStyle={portraitStyle} statusKicker={statusKicker} talkControl={talkControl} />
      <LiveComposerDock {...props} />
      {phraseMessage ? <TranscriptPhrasePicker aiConsent={aiConsent} clientId={clientId} message={phraseMessage.message} onClose={closePhraseSheet} onDismissed={finishPhraseSheet} onSave={saveTranscriptPhrase} prefill={phraseMessage.prefill} reducedMotion={reducedMotion} selectedText={phraseMessage.selectedText} sourceText={phraseMessage.sourceText} visible={phraseSheetVisible} /> : null}
      {aiConsent ? <WordDefinitionSheet key={chatHistory[0]?.id ?? 'empty'} clientId={clientId} onClose={closeWordSheet} onDismissed={finishWordSheet} phrase={wordDefinitionPhrase ?? ''} reducedMotion={reducedMotion} scriptPreference={learnerProfile?.scriptPreference ?? 'both'} visible={wordSheetVisible && !!wordDefinitionPhrase} /> : null}
      {floatingAsha.minimized ? <AshaMinimizedCover onExpand={floatingAsha.expand} statusLabel={aiConsent ? statusKicker : 'LIVE VOICE'} /> : null}
      {props.children}
    </KeyboardAvoidingView>
  );
}
