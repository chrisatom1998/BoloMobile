import { AlertCircle, Mic, MicOff, X } from 'lucide-react-native';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import type { Href } from 'expo-router';
import { ActivityIndicator, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { LiveScreenViewProps } from '@/components/live/live-screen-types';
import { interruptedCopy, LIVE_OFFLINE_MESSAGE } from '@/components/live/live-helpers';
import { LiveComposer } from '@/components/live-composer';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { LIVE_MIC_PERMISSION_MESSAGE } from '@/lib/live-permission';
import { layout, spacing } from '@/theme';

export function LiveComposerDock({
  accessibilityCompact,
  aiConsent,
  audioError,
  busy,
  chipClipWidth,
  chipViewportWidth,
  clearAudioError,
  clearingChat,
  colors,
  composerMicActionBound,
  composerMicDisabled,
  composerMicLabel,
  composerRef,
  dismissInterruption,
  error,
  errorAction,
  resumeConversation,
  toggleTranscript,
  transcriptOpen,
  hasTranscriptMessages,
  insets,
  interruptedReason,
  keyboardCoversTabBar,
  liveConfigError,
  micOn,
  pendingUserMessage,
  pressComposerMic,
  realtimeLocked,
  realtimeStatus,
  router,
  sendText,
  setChipClipWidth,
  setChipWidths,
  setError,
  setSuggestionsOpen,
  styles,
  suggestionsOpen,
}: LiveScreenViewProps) {
  // On iOS the screen runs under the native tab bar. Native tabs wrap each tab in
  // its own SafeAreaProvider, so this SafeAreaView's bottom inset includes the tab
  // bar. Drop it only while a docked keyboard covers the tab bar, because
  // KeyboardAvoidingView then lifts the composer; a hardware-keyboard shortcut bar
  // or floating keyboard is shorter, so the inset stays.
  return aiConsent ? <SafeAreaView
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
        {interruptedReason && hasTranscriptMessages && !realtimeLocked ? (
          <View accessibilityLiveRegion="polite" style={styles.noticeBanner} testID="live-interrupted-banner">
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <AlertCircle color={colors.gold} size={16} />
            </View>
            <View style={styles.noticeBody}>
              <Text style={styles.noticeText}>{interruptedCopy[interruptedReason]}</Text>
              <View style={styles.noticeActions}>
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: composerMicDisabled }} disabled={composerMicDisabled} onPress={resumeConversation} style={[styles.noticeButton, composerMicDisabled && styles.disabled]} testID="live-resume">
                  <Text style={styles.noticeButtonText}>Pick up where we left off</Text>
                </Pressable>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={dismissInterruption} style={styles.settingsLink} testID="live-start-fresh">
                  <Text style={styles.settingsLinkText}>Start fresh</Text>
                </Pressable>
              </View>
            </View>
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
        {error && errorAction === 'resume' && hasTranscriptMessages && !realtimeLocked ? (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: composerMicDisabled }} disabled={composerMicDisabled} hitSlop={8} onPress={resumeConversation} style={styles.settingsLink} testID="live-error-resume">
            <Text style={styles.settingsLinkText}>Pick up where we left off</Text>
          </Pressable>
        ) : null}
        {error && (errorAction === 'retry' || (errorAction === 'resume' && !hasTranscriptMessages)) && !realtimeLocked ? (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: composerMicDisabled }} disabled={composerMicDisabled} hitSlop={8} onPress={pressComposerMic} style={styles.settingsLink} testID="live-error-retry">
            <Text style={styles.settingsLinkText}>Try again</Text>
          </Pressable>
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
        {realtimeLocked ? (
          // During a call, typing and suggestions wait; the transcript is one tap away.
          <View style={styles.callDock} testID="live-call-dock">
            <Pressable accessibilityRole="button" hitSlop={8} onPress={toggleTranscript} style={styles.settingsLink} testID="live-call-transcript-toggle">
              <Text style={styles.settingsLinkText}>{transcriptOpen ? 'Hide transcript' : 'Show transcript'}</Text>
            </Pressable>
            {composerMicActionBound ? (
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
                {micOn ? <MicOff color={colors.gold} size={20} /> : <Mic color={colors.gold} size={20} />}
              </Pressable>
            ) : null}
          </View>
        ) : accessibilityCompact && !suggestionsOpen ? (
          <Pressable accessibilityLabel="Suggestions" accessibilityRole="button" onPress={() => setSuggestionsOpen(true)} style={styles.example} testID="asha-suggestions">
            <Text maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.exampleText}>Suggestions</Text>
          </Pressable>
        ) : (
        <View
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            setChipClipWidth((current) => (current === width ? current : width));
          }}
          style={styles.exampleClip}
        >
          <View style={[styles.exampleViewport, chipViewportWidth > 0 && { width: chipViewportWidth }]}>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            style={styles.exampleScroller}
            contentContainerStyle={styles.examples}
            testID="live-example-chips"
          >
            {['Order tea', 'Ask the price', 'Be polite', 'Correct my Hindi'].map((example, index, examples) => (
              <View
                key={example}
                onLayout={(event) => {
                  const width = event.nativeEvent.layout.width;
                  setChipWidths((current) => {
                    if (current[index] === width) return current;
                    const next = current.slice();
                    next[index] = width;
                    return next;
                  });
                }}
                style={index < examples.length - 1 ? styles.exampleSpacer : undefined}
              >
                <PressableFeedback
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || clearingChat || realtimeLocked }}
                  isDisabled={busy || clearingChat || realtimeLocked}
                  onPress={() => { void sendText(example); }}
                  style={[styles.example, (busy || clearingChat || realtimeLocked) && styles.disabled]}
                >
                  <Text style={styles.exampleText}>{example}</Text>
                </PressableFeedback>
              </View>
            ))}
          </ScrollView>
          {chipClipWidth > 0 && chipViewportWidth < chipClipWidth - 1 ? (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.chipFade}>
              {Array.from({ length: 6 }, (_, index) => (
                <View key={index} style={[styles.chipFadeStrip, { opacity: (index + 1) / 6 }]} />
              ))}
            </View>
          ) : null}
          </View>
        </View>
        )}
        {realtimeLocked ? null : <View style={styles.composerEntry}>
          {composerMicActionBound ? (
            <Pressable
              accessibilityHint="Mutes or unmutes your microphone."
              accessibilityLabel={composerMicLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled: composerMicDisabled }}
              disabled={composerMicDisabled}
              onPress={pressComposerMic}
              style={[styles.composerMic, composerMicDisabled && (liveConfigError ? styles.voiceUnavailable : styles.disabled)]}
              testID="composer-mic-toggle"
            >
              {micOn ? <MicOff color={colors.gold} size={20} /> : <Mic color={colors.gold} size={20} />}
            </Pressable>
          ) : null}
          <LiveComposer ref={composerRef} disabled={busy || clearingChat || realtimeLocked} onSend={sendText} styles={styles} />
        </View>}
      </SafeAreaView> : null;
}
