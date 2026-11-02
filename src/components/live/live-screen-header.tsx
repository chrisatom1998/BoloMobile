import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { ChevronDown, Lock, MessageCircle, Settings } from 'lucide-react-native';

import { AshaMinimizeButton, AshaSwipeToMinimize } from '@/components/asha-minimize-control';
import { JournalDisplay } from '@/components/journal-chrome';
import type { LiveScreenViewProps } from '@/components/live/live-screen-types';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { layout } from '@/theme';

export function LiveScreenHeader({
  accessibilityCompact,
  aiConsent,
  colors,
  composingAtLargeText,
  conversationStarted,
  floatingAsha,
  headerCollapsed,
  heroContentWidth,
  insets,
  languageMenuOpen,
  realtimeStatus,
  reflowHeaderLayout,
  router,
  scrollToChat,
  setLanguageMenuOpen,
  styles,
  languageControl,
  statusKicker,
  talkControl,
}: LiveScreenViewProps & {
  languageControl: ReactNode;
  statusKicker: string;
  talkControl: ReactNode;
}) {
  const headerTopbar = (
    <View style={[styles.topbar, reflowHeaderLayout && !accessibilityCompact && styles.topbarLarge, accessibilityCompact && styles.topbarCompact, { width: heroContentWidth }]} testID="asha-header-topbar">
      {accessibilityCompact ? (
        <View style={styles.headerAvatarCluster}>
          {talkControl}
          <View style={styles.headerStatus} testID="asha-voice-status">
            <View style={[styles.statusDot, realtimeStatus === 'recording' && styles.statusDotLive]} />
            <Text accessibilityLiveRegion={conversationStarted ? 'polite' : undefined} maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.liveVoiceText}>{statusKicker}</Text>
          </View>
        </View>
      ) : null}
      {accessibilityCompact ? null : (
        <View style={[styles.headerIdentity, reflowHeaderLayout && styles.headerIdentityLarge]}>
          <View style={[styles.headerCopy, reflowHeaderLayout && styles.headerCopyStacked]}>
            <JournalDisplay maxFontSizeMultiplier={layout.headerFontScaleCap} style={[styles.headerTitle, reflowHeaderLayout && styles.headerTitleStacked, headerCollapsed && styles.headerTitleCollapsed]}>Speak with Asha</JournalDisplay>
          </View>
        </View>
      )}
      {composingAtLargeText ? null : (
        <View style={[styles.headerActions, reflowHeaderLayout && !accessibilityCompact && styles.headerActionsStacked]}>
          {floatingAsha.available && aiConsent && !accessibilityCompact ? (
            <AshaMinimizeButton onPress={floatingAsha.minimize} />
          ) : null}
          <View accessibilityLabel="Private conversation" style={styles.privateBadge}>
            <Lock color={colors.heroSubtle} size={14} strokeWidth={2} />
            <Text maxFontSizeMultiplier={layout.headerFontScaleCap} style={styles.privateText}>Private</Text>
          </View>
          <Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={() => router.push('/settings')} style={styles.headerSettings} testID="asha-settings">
            <Settings accessibilityLabel="Settings" accessible={false} color={colors.white} size={20} strokeWidth={2} />
          </Pressable>
          {accessibilityCompact && aiConsent ? (
            <Pressable accessibilityLabel="Open transcript" accessibilityRole="button" onPress={scrollToChat} style={styles.headerSettings}>
              <MessageCircle accessibilityLabel="Open transcript" accessible={false} color={colors.white} size={20} />
            </Pressable>
          ) : null}
          {accessibilityCompact && aiConsent ? (
            <Pressable
              accessibilityLabel="Asha voice language"
              accessibilityRole="button"
              accessibilityState={{ expanded: languageMenuOpen }}
              onPress={() => setLanguageMenuOpen((open) => !open)}
              style={styles.headerSettings}
              testID="asha-language-menu"
            >
              <ChevronDown accessibilityLabel="Asha voice language" accessible={false} color={colors.white} size={20} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );

  return (
      <View style={[styles.screenHeader, { paddingTop: insets.top }]}>
        {floatingAsha.available
          ? <AshaSwipeToMinimize onMinimize={floatingAsha.minimize}>{headerTopbar}</AshaSwipeToMinimize>
          : headerTopbar}
        {accessibilityCompact ? (
          <JournalDisplay maxFontSizeMultiplier={layout.headerFontScaleCap} numberOfLines={1} style={[styles.headerTitle, styles.headerTitleCollapsed, styles.headerTitleBar, styles.headerSubtitleInset]}>Speak with Asha</JournalDisplay>
        ) : null}
        {accessibilityCompact ? (
          <Text maxFontSizeMultiplier={layout.headerFontScaleCap} style={[styles.headerSubtitle, styles.headerSubtitleInset]}>Your Hindi coach</Text>
        ) : null}
        {headerCollapsed && aiConsent && !accessibilityCompact && !composingAtLargeText ? languageControl : null}
        {accessibilityCompact && languageMenuOpen && aiConsent && !composingAtLargeText ? languageControl : null}
      </View>
  );
}
