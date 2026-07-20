import { useRouter, type Href } from 'expo-router';
import { BookOpen, Search, Trash2, Volume2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { sceneCategories, scenes, type SceneCategory } from '@/data/scenes';
import { showAppAlert } from '@/lib/app-alert';
import { hasOfflineSpeech, speakText, stopSpeaking } from '@/lib/speech';
import { defaultLearnerProfile } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import type { SavedPhrase } from '@/state/app-state-types';
import { colors, radius, sharedStyles, spacing } from '@/theme';

type Filter = 'All' | 'Due' | SceneCategory;

const phraseCategories = new Map<string, SceneCategory>();
for (const scene of scenes) {
  for (const beat of scene.beats) {
    for (const choice of beat.choices) if (choice.correct) phraseCategories.set(choice.hi, scene.category);
  }
}

export default function PhrasesScreen() {
  const router = useRouter();
  const { aiConsent, duePhrases, learnerProfile, phraseReviews, phrases, removePhrase } = useAppState();
  const [audioError, setAudioError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const due = useMemo(() => duePhrases ?? [], [duePhrases]);
  const reviews = phraseReviews ?? {};
  const profile = learnerProfile ?? { ...defaultLearnerProfile(), completed: true };
  const dueSet = useMemo(() => new Set(due.map((phrase) => phrase.hi)), [due]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return phrases.filter((phrase) => {
      if (filter === 'Due' && !dueSet.has(phrase.hi)) return false;
      if (filter !== 'All' && filter !== 'Due' && phraseCategories.get(phrase.hi) !== filter) return false;
      return !normalized || `${phrase.hi} ${phrase.latin} ${phrase.en}`.toLocaleLowerCase().includes(normalized);
    });
  }, [dueSet, filter, phrases, query]);

  useEffect(() => () => { void stopSpeaking(); }, []);

  async function playPhrase(text: string, slow = false) {
    if (!aiConsent && !(hasOfflineSpeech?.(text) ?? false)) return;
    setAudioError('');
    try {
      if (slow) await speakText(text, undefined, 0.72);
      else await speakText(text);
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'Bolo could not play the voice.');
    }
  }

  function confirmRemove(phrase: SavedPhrase) {
    showAppAlert('Remove saved phrase?', phrase.hi, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePhrase(phrase.hi) },
    ]);
  }

  const Header = phrases.length ? (
    <View style={styles.header}>
      <View style={styles.headerHero}>
        <View style={styles.headerIcon}><BookOpen color={colors.white} size={22} /></View>
        <View style={styles.headerCopy}><Text style={styles.headerTitle}>Saved phrases</Text><Text style={styles.headerBody}>{due.length ? `${due.length} ready to review today.` : 'Everything is reviewed for today.'}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/review' as Href)} style={styles.reviewButton}><Text style={styles.reviewText}>Review</Text></Pressable>
      </View>
      <View style={styles.searchRow}><Search color={colors.muted} size={18} /><TextInput accessibilityLabel="Search saved phrases" clearButtonMode="while-editing" onChangeText={setQuery} placeholder="Search Hindi or English" placeholderTextColor={colors.muted} style={styles.search} value={query} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {(['All', 'Due', ...sceneCategories.filter((item): item is SceneCategory => item !== 'All')] as Filter[]).map((item) => (
          <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: filter === item }} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>
        ))}
      </ScrollView>
      {audioError ? <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text> : null}
    </View>
  ) : null;

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.content, phrases.length === 0 && styles.emptyContent]}
      data={visible}
      keyExtractor={(phrase) => phrase.hi}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={Header}
      ListEmptyComponent={phrases.length === 0 ? (
        <View style={styles.empty}><View style={styles.emptyIcon}><BookOpen color={colors.white} size={28} /></View><Text style={styles.emptyTitle}>Your phrase book is ready</Text><Text style={styles.emptyBody}>Save useful answers from any scene and they will appear here for quick practice.</Text></View>
      ) : <Text style={styles.noResults}>No phrases match this search and filter.</Text>}
      renderItem={({ item }) => {
        const offline = hasOfflineSpeech?.(item.hi) ?? false;
        const canListen = aiConsent || offline;
        const review = reviews[item.hi];
        return (
          <View style={styles.card}>
            <View style={styles.copy}>
              {profile.scriptPreference !== 'latin' ? <Text style={styles.hindi}>{item.hi}</Text> : null}
              {profile.scriptPreference !== 'devanagari' ? <Text style={styles.latin}>{item.latin}</Text> : null}
              <Text style={styles.english}>{item.en}</Text>
              <Text style={styles.mastery}>{dueSet.has(item.hi) ? 'Due now' : `Mastery ${review?.mastery ?? 0}/5`}{phraseCategories.get(item.hi) ? ` · ${phraseCategories.get(item.hi)}` : ''}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable accessibilityHint={canListen ? 'Bundled lesson audio works offline.' : 'Agree to connected AI processing to enable Listen.'} accessibilityLabel={`Hear ${item.hi}`} accessibilityRole="button" accessibilityState={{ disabled: !canListen }} disabled={!canListen} onPress={() => void playPhrase(item.hi)} style={[styles.iconButton, !canListen && styles.disabled]}><Volume2 color={colors.forest} size={20} /></Pressable>
              <Pressable accessibilityLabel={`Hear ${item.hi} slowly`} accessibilityRole="button" accessibilityState={{ disabled: !canListen }} disabled={!canListen} onPress={() => void playPhrase(item.hi, true)} style={[styles.slowButton, !canListen && styles.disabled]}><Text style={styles.slowText}>0.7×</Text></Pressable>
              <Pressable accessibilityLabel={`Remove ${item.hi}`} accessibilityRole="button" onPress={() => confirmRemove(item)} style={styles.iconButton}><Trash2 color={colors.danger} size={19} /></Pressable>
            </View>
          </View>
        );
      }}
      style={sharedStyles.screen}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  separator: { height: spacing.md },
  header: { gap: spacing.md, marginBottom: spacing.md },
  headerHero: { ...sharedStyles.elevatedCard, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  headerIcon: { width: 48, height: 48, borderRadius: 17, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { minWidth: 150, flex: 1, gap: 3 },
  headerTitle: { color: colors.ink, fontSize: 21, fontWeight: '900' },
  headerBody: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  reviewButton: { minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.brand, justifyContent: 'center', paddingHorizontal: spacing.md },
  reviewText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  searchRow: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paperRaised, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  search: { minWidth: 0, flex: 1, color: colors.ink, fontSize: 15, paddingVertical: spacing.sm },
  filters: { gap: spacing.sm },
  filter: { minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.paperRaised, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  filterActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  filterTextActive: { color: colors.white },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  card: { ...sharedStyles.card, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  copy: { minWidth: 180, flex: 1, gap: spacing.xs },
  hindi: { color: colors.ink, fontSize: 22, lineHeight: 30, fontWeight: '900' },
  latin: { color: colors.forest, fontSize: 14, fontWeight: '700' },
  english: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  mastery: { color: colors.brandDark, fontSize: 11, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  iconButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  slowButton: { minWidth: 48, height: 44, borderRadius: radius.pill, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  slowText: { color: colors.forest, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.ink, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  noResults: { color: colors.muted, fontSize: 15, textAlign: 'center', padding: spacing.xl },
});
