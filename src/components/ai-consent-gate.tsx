import { ShieldCheck } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { showAppAlert } from '@/lib/app-alert';
import { openPublicPage } from '@/lib/public-pages';
import { observe, observeOncePerSession } from '@/lib/observability';
import { useAppState } from '@/state/app-state';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

type AiConsentGateProps = {
  actionLabel?: string;
  children?: ReactNode;
  title?: string;
};

export function AiConsentGate({
  actionLabel = 'I agree and want to continue',
  children,
  title = 'Before using Asha',
}: AiConsentGateProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { aiConsent, setAiConsent } = useAppState();
  const [saving, setSaving] = useState(false);
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
      <View style={styles.icon}><ShieldCheck color={colors.white} size={22} /></View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>
        Core lesson and saved-phrase audio is bundled with Bolo and works offline without sending text anywhere. After you agree, Bolo uses its service and OpenAI for generated Asha speech, submitted text, live voice turns, and pronunciation recordings. Typed coaching includes a short recent conversation history. Starting live voice requests microphone permission and opens a WebRTC media stream with its audio track disabled. Tap the glowing orb to begin each turn, then tap the orb again to send the turn. Microphone transmission is enabled only during an active turn, remains disabled between turns, and the stream is released when you tap End (the close control), leave the screen, or the app leaves the foreground. Live voice does not create a recording file or capture microphone audio in the background. Asha&apos;s spoken reply travels directly from OpenAI to the app. A random app identifier is used for safety and deletion requests. Do not include sensitive personal information.
      </Text>
      <Text style={styles.detail}>
        Saved phrases, learning progress, preferences, reminder settings, content-free reliability counters, and up to 100 recent Asha chat messages stay in unencrypted storage on this device. Reliability counters contain no messages, transcripts, audio, phrases, identifiers, or error text and are never uploaded. Bolo stores generated content off device only when you choose Report, keeps those reports for up to 90 days, and lets you delete local data and reports from Settings. OpenAI does not use API data to train models unless the developer opts in and may retain abuse-monitoring logs for up to 30 days unless different data controls apply. You can withdraw consent at any time.
      </Text>
      <Pressable accessibilityRole="link" onPress={openPrivacyPolicy} style={styles.link}>
        <Text style={styles.linkText}>Read the public Privacy Policy</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void accept()} style={[styles.button, saving && styles.disabled]}>
        <Text style={styles.buttonText}>{saving ? 'Saving privacy choice…' : actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.paper, borderColor: c.forest, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.xl, gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 15, borderCurve: 'continuous', backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center' },
  title: { color: c.ink, fontSize: 22, fontWeight: '900' },
  body: { color: c.ink, fontSize: 15, lineHeight: 22 },
  detail: { color: c.muted, fontSize: 13, lineHeight: 19 },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { color: c.forestText, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  button: { minHeight: 50, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { color: c.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.5 },
}));
