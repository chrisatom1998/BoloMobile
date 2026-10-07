import { ShieldCheck } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import { showAppAlert } from '@/lib/app-alert';
import { openPublicPage } from '@/lib/public-pages';
import { observe, observeOncePerSession } from '@/lib/observability';
import { AI_CONSENT_VERSION } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

type AiConsentGateProps = {
  actionLabel?: string;
  children?: ReactNode;
  title?: string;
};

/** Plain-language summary of the full notice below. The complete text stays reachable under "Read full notice". */
const consentSummary = [
  'Lesson and saved-phrase audio is bundled and works offline.',
  'After you agree, Asha speech, typed text, live voice, and pronunciation clips are processed by Bolo and OpenAI.',
  'Once live voice starts, your microphone stays on until you mute it, end the session, or leave the screen. Nothing is recorded in the background.',
  'Progress stays on this device. You can withdraw consent or delete your data in Settings.',
] as const;

export function AiConsentGate({
  actionLabel = 'I agree and want to continue',
  children,
  title = 'Before using Asha',
}: AiConsentGateProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { aiConsent, setAiConsent } = useAppState();
  const [saving, setSaving] = useState(false);
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => {
    if (!aiConsent) observeOncePerSession('consent_viewed');
  }, [aiConsent]);
  if (aiConsent) return children;

  function openPrivacyPolicy() {
    void openPublicPage('privacy').catch((error: unknown) => {
      showAppAlert('Could not open Privacy Policy', error instanceof Error ? error.message : 'Check your connection and try again.');
    });
  }

  async function accept() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await setAiConsent(true);
      if (saved) observe('consent_accepted');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <ShieldCheck color={colors.forest} size={20} strokeWidth={2} />
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      </View>
      <View style={styles.summary}>
        {consentSummary.map((line) => (
          <View key={line} style={styles.summaryItem}>
            <Text accessible={false} style={styles.bullet}>•</Text>
            <Text style={styles.summaryText}>{line}</Text>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: noticeExpanded }}
        onPress={() => setNoticeExpanded((current) => !current)}
        style={styles.disclosure}
        testID="consent-notice-toggle"
      >
        <Text style={styles.disclosureText}>{noticeExpanded ? 'Hide full notice' : 'Read full notice'}</Text>
        <Text accessible={false} style={styles.disclosureChevron}>{noticeExpanded ? '▴' : '▾'}</Text>
      </Pressable>
      {noticeExpanded ? (
        <View style={styles.notice} testID="consent-notice-full">
          <Text style={styles.body}>
            Core lesson and saved-phrase audio is bundled with Bolo and works offline without sending text anywhere. After you agree, Bolo uses its service and OpenAI for generated Asha speech, submitted text, live voice turns, and pronunciation recordings. Typed coaching and live voice startup include a short recent conversation history. Starting live voice requests microphone permission and opens a WebRTC media stream. Your microphone stays on continuously until you mute it by tapping the orb. Tap again to unmute; you can speak while Asha is speaking. The stream is released when you tap End (the close control), leave the screen, or the app leaves the foreground. Live voice does not create a recording file or capture microphone audio in the background. Asha&apos;s spoken reply travels directly from OpenAI to the app. A random app identifier is used for safety and deletion requests. Do not include sensitive personal information.
          </Text>
          <Text style={styles.detail}>
            Saved phrases, learning progress, preferences, reminder settings, content-free reliability counters, and up to 100 recent Asha chat messages stay in unencrypted storage on this device. Reliability counters contain no messages, transcripts, audio, phrases, identifiers, or error text and are never uploaded. Bolo stores generated content off device only when you choose Report, keeps those reports for up to 90 days, and lets you delete local data and reports from Settings. OpenAI does not use API data to train models unless the developer opts in and may retain abuse-monitoring logs for up to 30 days unless different data controls apply. You can withdraw consent at any time.
          </Text>
        </View>
      ) : null}
      <Pressable accessibilityRole="link" onPress={openPrivacyPolicy} style={styles.link}>
        <Text style={styles.linkText}>Read the public Privacy Policy</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void accept()} style={[styles.button, saving && styles.disabled]}>
        <Text style={styles.buttonText}>{saving ? 'Saving privacy choice…' : actionLabel}</Text>
      </Pressable>
      <Text style={styles.version}>AI data-use consent notice version {AI_CONSENT_VERSION}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.paper, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.xl, gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { minWidth: 0, flex: 1, color: c.ink, fontFamily: 'Georgia', fontSize: 22, lineHeight: 28, fontWeight: '700' },
  summary: { gap: spacing.sm },
  summaryItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bullet: { color: c.forest, fontSize: 15, lineHeight: 22, fontWeight: '900' },
  summaryText: { minWidth: 0, flex: 1, color: c.ink, fontSize: 15, lineHeight: 22 },
  disclosure: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  disclosureText: { color: c.forestText, fontSize: 14, fontWeight: '800' },
  disclosureChevron: { color: c.forestText, fontSize: 14, fontWeight: '800' },
  notice: { gap: spacing.md, borderTopColor: c.line, borderTopWidth: 1, paddingTop: spacing.md },
  body: { color: c.ink, fontSize: 15, lineHeight: 22 },
  detail: { color: c.muted, fontSize: 13, lineHeight: 19 },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { color: c.forestText, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  button: { minHeight: 50, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { color: c.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  version: { color: c.mutedSoft, fontSize: 11, lineHeight: 15 },
  disabled: { opacity: 0.5 },
}));
