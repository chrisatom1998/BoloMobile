import { ShieldCheck } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

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
      <Text style={styles.version}>AI data-use consent notice version {AI_CONSENT_VERSION}</Text>
      <Text style={styles.body}>
        Core lesson and saved-phrase audio is bundled with Bolo and works offline without sending text anywhere. After you agree, Bolo uses its service and OpenAI for generated Asha speech, submitted text, live conversation audio, and pronunciation recordings. Typed coaching includes a short recent conversation history. Before an iOS live conversation starts, Bolo sends the selected mode, current lesson ID, title and objective, selected learner level, active-lesson vocabulary, and up to eight recent Asha chat messages. It does not send your saved-phrase list or counts, review schedule, daily practice totals, or full scene history. During the live chat, OpenAI processes microphone audio, transcripts, requested words or phrases and context, teaching feedback, a session recap, and minimal tool results such as whether a confirmed phrase save or completed progress update succeeded. Start Conversation requests microphone permission and opens a full-duplex WebRTC media stream. Its microphone track stays enabled during the active chat so you can interrupt naturally; Mute disables it until you unmute. Other supported platforms retain Bolo&apos;s turn-based voice controls. Every stream and its tracks are released when you tap End Chat, leave the screen, or the app leaves the foreground. Live voice does not create a recording file or capture microphone audio in the background. Asha&apos;s spoken reply travels directly from OpenAI to the app. A random app identifier is used for safety and deletion requests. Do not include sensitive personal information.
      </Text>
      <Text style={styles.detail}>
        Saved-phrase records, learning-progress records, preferences, reminder settings, content-free reliability counters, and up to 100 recent Asha chat messages stay in unencrypted storage on this device. Live tools can read only the bounded fields described above and return the minimum result needed for the current conversation; saves and progress changes are written only to Bolo&apos;s local stores. Reliability counters contain no messages, transcripts, audio, phrases, identifiers, or error text and are never uploaded. Bolo stores generated content off device only when you choose Report, keeps those reports for up to 90 days, and lets you delete local data and reports from Settings. OpenAI does not use API data to train models unless the developer opts in and may retain abuse-monitoring logs for up to 30 days unless different data controls apply. You can withdraw consent at any time.
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
  version: { color: c.muted, fontSize: 12, fontWeight: '800' },
  body: { color: c.ink, fontSize: 15, lineHeight: 22 },
  detail: { color: c.muted, fontSize: 13, lineHeight: 19 },
  link: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  linkText: { color: c.forestText, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  button: { minHeight: 50, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { color: c.white, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.5 },
}));
