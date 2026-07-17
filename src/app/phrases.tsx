import { BookOpen, Trash2, Volume2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AiConsentGate } from '@/components/ai-consent-gate';
import { showAppAlert } from '@/lib/app-alert';
import { speakText, stopSpeaking } from '@/lib/speech';
import { useAppState } from '@/state/app-state';
import type { SavedPhrase } from '@/state/app-state-types';
import { colors, radius, sharedStyles, spacing } from '@/theme';

export default function PhrasesScreen() {
  const { aiConsent, phrases, removePhrase } = useAppState();
  const [audioError, setAudioError] = useState('');

  useEffect(() => () => {
    void stopSpeaking();
  }, []);

  async function playPhrase(text: string) {
    if (!aiConsent) return;
    setAudioError('');
    try {
      await speakText(text);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'Bolo could not play the AI voice.');
    }
  }

  function confirmRemove(phrase: SavedPhrase) {
    showAppAlert('Remove saved phrase?', phrase.hi, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePhrase(phrase.hi) },
    ]);
  }

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, phrases.length === 0 && styles.emptyContent]}
      data={phrases}
      keyExtractor={(phrase) => phrase.hi}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={phrases.length ? (
        <View style={styles.header}>
          <View style={styles.headerHero}>
            <View style={styles.headerIcon}><BookOpen color={colors.white} size={22} /></View>
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>Saved phrases</Text>
              <Text style={styles.headerBody}>{phrases.length} phrase{phrases.length === 1 ? '' : 's'} ready for quick review.</Text>
            </View>
          </View>
          {!aiConsent ? <AiConsentGate><View /></AiConsentGate> : null}
          {audioError ? <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text> : null}
        </View>
      ) : null}
      ListEmptyComponent={(
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><BookOpen color={colors.white} size={28} /></View>
          <Text style={styles.emptyTitle}>Your phrase book is ready</Text>
          <Text style={styles.emptyBody}>Save useful answers from any scene and they will appear here for quick practice.</Text>
        </View>
      )}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.copy}>
            <Text style={styles.hindi}>{item.hi}</Text>
            <Text style={styles.latin}>{item.latin}</Text>
            <Text style={styles.english}>{item.en}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityHint={!aiConsent ? 'Agree to connected AI processing to enable Listen.' : undefined} accessibilityLabel={`Hear ${item.hi}`} accessibilityRole="button" accessibilityState={{ disabled: !aiConsent }} disabled={!aiConsent} onPress={() => void playPhrase(item.hi)} style={[styles.iconButton, !aiConsent && styles.disabled]}><Volume2 color={colors.forest} size={20} /></Pressable>
            <Pressable accessibilityLabel={`Remove ${item.hi}`} accessibilityRole="button" onPress={() => confirmRemove(item)} style={styles.iconButton}><Trash2 color={colors.danger} size={19} /></Pressable>
          </View>
        </View>
      )}
      style={sharedStyles.screen}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  separator: { height: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.md },
  headerHero: { ...sharedStyles.elevatedCard, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  headerIcon: { width: 48, height: 48, borderRadius: 17, borderCurve: 'continuous', backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: 3 },
  headerTitle: { color: colors.ink, fontSize: 21, fontWeight: '900' },
  headerBody: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  card: { ...sharedStyles.card, flexDirection: 'row', alignItems: 'center' },
  copy: { flex: 1, gap: spacing.xs },
  hindi: { color: colors.ink, fontSize: 22, lineHeight: 30, fontWeight: '900' },
  latin: { color: colors.forest, fontSize: 14, fontWeight: '700' },
  english: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  actions: { gap: spacing.sm },
  iconButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, borderCurve: 'continuous', backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.ink, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
