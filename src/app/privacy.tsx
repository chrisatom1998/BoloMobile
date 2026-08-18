import { ExternalLink } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { showAppAlert } from '@/lib/app-alert';
import { openPublicPage, type PublicPage } from '@/lib/public-pages';
import { AI_CONSENT_VERSION } from '@/lib/storage';
import { makeStyles, radius, spacing, useSharedStyles, useTheme } from '@/theme';

export default function PrivacyScreen() {
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  function openPage(page: PublicPage, title: string) {
    void openPublicPage(page).catch((error: unknown) => {
      showAppAlert(`Could not open ${title}`, error instanceof Error ? error.message : 'Check your connection and try again.');
    });
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      <Text style={sharedStyles.eyebrow}>Effective July 16, 2026</Text>
      <Text style={sharedStyles.heading}>Privacy & data use</Text>
      <Text style={sharedStyles.body}>AI data-use consent notice version {AI_CONSENT_VERSION}</Text>
      <Text style={sharedStyles.body}>Bolo&apos;s core scenarios work without an account. Connected AI coaching is optional and requires consent to the current notice.</Text>

      <Section title="Data stored on your device">
        Saved phrases, daily goal, practice time, challenge status, up to 100 recent typed and transcribed Asha chat messages, consent record, and a random app identifier are stored locally. They are not encrypted, so do not use Bolo to store sensitive information.
      </Section>
      <Section title="Data processed for AI coaching">
        Fixed lesson and saved-phrase audio is bundled in the app and plays offline without sending text anywhere. After consent, generated Asha speech sends only the selected generated reply text through Bolo&apos;s backend to OpenAI; these voice requests do not include the random app identifier. Typed coaching sends your message, a short recent conversation history, and the random app identifier to Bolo&apos;s backend. Live voice asks the backend for a short-lived OpenAI Realtime credential tied to the random identifier, then exchanges microphone audio and Asha&apos;s spoken response directly with OpenAI over WebRTC. Pronunciation checks also send a temporary recording through Bolo&apos;s backend. OpenAI transcribes audio and generates speech or coaching. Normal connected content is not intentionally added to Bolo&apos;s report database. Bolo does not send contacts, location, photos, advertising identifiers, or background microphone audio.
      </Section>
      <Section title="Reports and retention">
        If you tap Report on a generated reply or pronunciation response, Bolo stores that response, your selected reason, the random app identifier, and the report time so the developer can investigate safety or quality problems. Reports are retained for up to 90 days. OpenAI does not use API data to train models unless the developer opts in and may keep abuse-monitoring logs for up to 30 days unless different data controls apply; the hosting provider may process limited operational logs.
      </Section>
      <Section title="Microphone behavior">
        Starting live voice requests microphone permission and opens a peer media stream with its audio track disabled. Tap the glowing orb to begin each turn, then tap the orb again to send the turn. Microphone transmission is enabled only during that active turn and remains disabled between turns. The stream and its tracks are released when you tap End (the close control), leave the screen, or the app leaves the foreground. Live voice does not create a recording file or capture microphone audio in the background. Pronunciation recording begins only after its record control and stops when you tap Stop, leave the screen, or after 15 seconds; its temporary file is deleted after each request or cleanup. Bolo does not record in the background.
      </Section>
      <Section title="Delete data or withdraw consent">
        Bolo keeps learning preferences, scene mastery, review schedules, reminder settings, saved phrases, and up to 30 days of content-free reliability counts on this device. Those counters never include content or identifiers and are never uploaded. You can withdraw AI consent in Settings. This disables generated AI voice playback and connected coaching; written scenes, bundled lesson audio, saved phrases, review, and recent local chat history remain available offline. Clear chat in Practice with Asha removes only the saved typed and voice chat from this device; it does not delete reports already submitted. You can also use Delete Bolo data to delete reports associated with this installation, clear all local data including diagnostics and chat history, and replace its random identifier. Bolo keeps the current identifier if deletion fails so you can retry. Uninstalling clears local data but does not itself send a report-deletion request, so use Settings before uninstalling if you have submitted reports.
      </Section>
      <Section title="Children">
        Bolo is a general-audience language-learning app and is not directed to children under 13. A parent or guardian who believes a child submitted personal information can use the Support page to request help or deletion.
      </Section>
      <Section title="Service providers and international processing">
        Connected coaching uses Bolo&apos;s hosted backend and OpenAI. These providers may process content in the United States and other countries, where data-protection rules may differ from those where you live. Their infrastructure handles content under their applicable service terms and safeguards.
      </Section>

      <View style={styles.links}>
        <PolicyLink label="Public Privacy Policy" onPress={() => openPage('privacy', 'Privacy Policy')} />
        <PolicyLink label="Support and privacy requests" onPress={() => openPage('support', 'Support')} />
        <PolicyLink label="Terms of Use" onPress={() => openPage('terms', 'Terms of Use')} />
      </View>
    </ScrollView>
  );
}

function Section({ children, title }: { children: string; title: string }) {
  const styles = useStyles();
  return <View style={styles.section}><Text style={styles.title}>{title}</Text><Text style={styles.body}>{children}</Text></View>;
}

function PolicyLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text><ExternalLink color={colors.forest} size={17} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  section: { gap: spacing.sm },
  title: { color: c.ink, fontSize: 17, fontWeight: '900' },
  body: { color: c.muted, fontSize: 15, lineHeight: 23 },
  links: { gap: spacing.sm, paddingTop: spacing.sm },
  link: { minHeight: 48, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, backgroundColor: c.paper, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  linkText: { flex: 1, color: c.forestText, fontSize: 14, fontWeight: '800' },
}));
