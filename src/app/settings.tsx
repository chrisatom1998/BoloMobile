import { useRouter } from 'expo-router';
import { ChevronRight, DatabaseBackup, ExternalLink, FileText, LifeBuoy, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { showAppAlert } from '@/lib/app-alert';
import { openPublicPage, type PublicPage } from '@/lib/public-pages';
import { deleteMobileData } from '@/services/bolo-api';
import { useAppState } from '@/state/app-state';
import { colors, radius, sharedStyles, spacing } from '@/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { aiConsent, clearAllData, clientId, setAiConsent } = useAppState();
  const [deleting, setDeleting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const mountedRef = useRef(true);
  const deletionRef = useRef<AbortController | null>(null);
  const deletionInFlightRef = useRef(false);
  const withdrawalInFlightRef = useRef(false);

  useEffect(() => () => {
    mountedRef.current = false;
    deletionRef.current?.abort();
  }, []);

  function withdraw() {
    if (withdrawing) return;
    showAppAlert(
      'Withdraw AI processing consent?',
      'AI Listen, typed coaching, live voice, Live Translate, and pronunciation feedback will stop working until you consent again. Written scenes and saved phrases still work offline.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Withdraw', style: 'destructive', onPress: () => void performWithdrawal() },
      ],
    );
  }

  async function performWithdrawal() {
    if (withdrawalInFlightRef.current) return;
    withdrawalInFlightRef.current = true;
    setWithdrawing(true);
    try {
      const saved = await setAiConsent(false);
      if (saved && mountedRef.current) showAppAlert('AI consent withdrawn', 'Connected AI features are now disabled.');
    } finally {
      withdrawalInFlightRef.current = false;
      if (mountedRef.current) setWithdrawing(false);
    }
  }

  function openPage(page: PublicPage, title: string) {
    void openPublicPage(page).catch((error: unknown) => {
      showAppAlert(`Could not open ${title}`, error instanceof Error ? error.message : 'Check your connection and try again.');
    });
  }

  async function performDeletion() {
    if (deletionInFlightRef.current) return;
    deletionInFlightRef.current = true;
    setDeleting(true);
    const controller = new AbortController();
    deletionRef.current = controller;
    try {
      await deleteMobileData(clientId, controller.signal);
      await clearAllData();
      if (mountedRef.current) {
        showAppAlert('Bolo data deleted', 'Stored reports and data on this device were deleted. Bolo created a new random app identifier.');
      }
    } catch (error) {
      if (mountedRef.current && !controller.signal.aborted) {
        showAppAlert(
          'Could not delete data',
          error instanceof Error ? error.message : 'Your data and current identifier were kept so you can try again.',
        );
      }
    } finally {
      if (deletionRef.current === controller) {
        deletionRef.current = null;
        deletionInFlightRef.current = false;
      }
      if (mountedRef.current) setDeleting(false);
    }
  }

  function confirmDeletion() {
    showAppAlert(
      'Delete your Bolo data?',
      'This permanently deletes reports tied to this installation, recent Mira chat history, saved phrases, practice progress, your consent choice, and the current random app identifier.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete data', style: 'destructive', onPress: () => void performDeletion() },
      ],
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} style={sharedStyles.screen}>
      {aiConsent ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.forest }]}><ShieldCheck color={colors.white} size={21} /></View>
            <View style={styles.copy}><Text style={styles.title}>AI coaching consent</Text><Text style={styles.body}>Enabled for the current privacy notice</Text></View>
          </View>
          <Text style={styles.detail}>After consent, Listen text, typed messages, active live voice turns, live-translation segments, and pronunciation recordings are processed by Bolo&apos;s backend and OpenAI for AI speech, transcription, translation, or coaching.</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: withdrawing }} disabled={withdrawing} onPress={withdraw} style={[styles.destructiveButton, withdrawing && styles.disabled]}><Trash2 color={colors.danger} size={18} /><Text style={styles.destructiveText}>{withdrawing ? 'Saving…' : 'Withdraw consent'}</Text></Pressable>
        </View>
      ) : (
        <AiConsentGate><View /></AiConsentGate>
      )}

      <Pressable accessibilityRole="button" onPress={() => router.push('/privacy')} style={styles.linkCard}>
        <View style={styles.icon}><LockKeyhole color={colors.white} size={20} /></View>
        <View style={styles.copy}><Text style={styles.title}>Privacy & data use</Text><Text style={styles.body}>Read the in-app data summary</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => openPage('privacy', 'Privacy Policy')} style={styles.linkCard}>
        <View style={styles.icon}><ExternalLink color={colors.white} size={20} /></View>
        <View style={styles.copy}><Text style={styles.title}>Public Privacy Policy</Text><Text style={styles.body}>Open the current policy on the web</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => openPage('support', 'Support')} style={styles.linkCard}>
        <View style={styles.icon}><LifeBuoy color={colors.white} size={20} /></View>
        <View style={styles.copy}><Text style={styles.title}>Support</Text><Text style={styles.body}>Get help or make a privacy request</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <Pressable accessibilityRole="link" onPress={() => openPage('terms', 'Terms of Use')} style={styles.linkCard}>
        <View style={styles.icon}><FileText color={colors.white} size={20} /></View>
        <View style={styles.copy}><Text style={styles.title}>Terms of Use</Text><Text style={styles.body}>Read Bolo&apos;s public terms</Text></View>
        <ChevronRight color={colors.muted} size={20} />
      </Pressable>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: colors.danger }]}><DatabaseBackup color={colors.white} size={20} /></View>
          <View style={styles.copy}><Text style={styles.title}>Delete Bolo data</Text><Text style={styles.body}>Reports and this device&apos;s local data</Text></View>
        </View>
        <Text style={styles.detail}>Bolo first deletes reports associated with your random app identifier. It then clears local data and rotates that identifier. If the request fails, the identifier is kept so you can retry.</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: deleting }} disabled={deleting} onPress={confirmDeletion} style={[styles.destructiveButton, deleting && styles.disabled]}>
          <Trash2 color={colors.danger} size={18} /><Text style={styles.destructiveText}>{deleting ? 'Deleting…' : 'Delete my Bolo data'}</Text>
        </Pressable>
      </View>

      <View style={styles.about}>
        <Text style={sharedStyles.eyebrow}>Bolo 1.0.0</Text>
        <Text style={styles.aboutText}>A practical Hindi learning app with offline scenarios and optional AI coaching.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  card: { ...sharedStyles.card, gap: spacing.lg },
  linkCard: { ...sharedStyles.card, flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 15, borderCurve: 'continuous', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 3 },
  title: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 13 },
  detail: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  destructiveButton: { minHeight: 48, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: '#E4B5AE', backgroundColor: '#FBEDEA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  destructiveText: { color: colors.danger, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  about: { padding: spacing.lg, gap: spacing.sm },
  aboutText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
