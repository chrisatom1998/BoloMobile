import { useRouter, type Href } from 'expo-router';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { SearchField } from 'heroui-native/search-field';
import { BookOpen, Trash2, Volume2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { SegmentedControl } from '@/components/segmented-control';
import { scenes, type SceneCategory } from '@/data/scenes';
import { showAppAlert } from '@/lib/app-alert';
import { hasOfflineSpeech, speakText, stopSpeaking } from '@/lib/speech';
import { defaultLearnerProfile } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import type { SavedPhrase } from '@/state/app-state-types';
import { makeStyles, maxContentWidth, radius, spacing, useSharedStyles, useTheme } from '@/theme';

type Filter = 'All' | SceneCategory;

const replaySpeeds = [
  { label: '0.10×', rate: 0.1 },
  { label: '0.25×', rate: 0.25 },
  { label: '0.50×', rate: 0.5 },
] as const;

const phraseCategories = new Map<string, SceneCategory>();
for (const scene of scenes) {
  for (const beat of scene.beats) {
    for (const choice of beat.choices) phraseCategories.set(choice.hi, scene.category);
  }
}

function MasteryMeter({ mastery }: { mastery: number }) {
  const styles = useStyles();
  const filledDots = Math.min(3, Math.ceil(mastery / 2));
  return (
    <View accessibilityLabel={`Mastery ${mastery} of 5`} style={styles.masteryMeter}>
      {Array.from({ length: 3 }, (_, index) => <View key={index} style={[styles.masteryDot, index < filledDots && styles.masteryDotFilled]} />)}
    </View>
  );
}

export default function PhrasesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
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
      if (filter !== 'All' && phraseCategories.get(phrase.hi) !== filter) return false;
      return !normalized || `${phrase.hi} ${phrase.latin} ${phrase.en}`.toLocaleLowerCase().includes(normalized);
    });
  }, [filter, phrases, query]);

  useEffect(() => () => { void stopSpeaking(); }, []);

  async function playPhrase(text: string, playbackRate = 1) {
    if (!aiConsent && !(hasOfflineSpeech?.(text) ?? false)) return;
    setAudioError('');
    try {
      await speakText(text, undefined, playbackRate);
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

  const Header = (
    <View style={styles.header}>
      <View style={styles.headerHero}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Your phrase book</Text>
          <Text style={styles.headerTitle}>Phrases</Text>
        </View>
      </View>
      <PressableFeedback accessibilityLabel={`Review ${due.length} phrases due today`} accessibilityRole="button" onPress={() => router.push('/review' as Href)} style={styles.dueCard}>
        <View style={styles.dueIcon}><Text style={styles.dueIconText}>{due.length}</Text></View>
        <View style={styles.dueCopy}>
          <Text style={styles.dueTitle}>Ready for review</Text>
          <Text style={styles.dueBody}>{due.length ? `A quick practice keeps ${due.length} phrase${due.length === 1 ? '' : 's'} fresh.` : 'Everything is reviewed for today.'}</Text>
        </View>
      </PressableFeedback>
      <SearchField onChange={setQuery} style={styles.searchField} value={query}>
        <SearchField.Group style={styles.searchRow}>
          <SearchField.SearchIcon iconProps={{ color: colors.muted, size: 18 }} />
          <SearchField.Input accessibilityLabel="Search saved phrases" placeholder="Search phrases" placeholderTextColor={colors.muted} style={styles.search} />
          <SearchField.ClearButton iconProps={{ color: colors.muted }} />
        </SearchField.Group>
      </SearchField>
      <SegmentedControl
        accessibilityLabel="Phrase category"
        compact
        onValueChange={setFilter}
        options={[
          { label: 'All', value: 'All' },
          { label: 'Café', value: 'Food' },
          { label: 'Social', value: 'Social' },
          { label: 'Travel', value: 'Travel' },
        ]}
        style={styles.segmentedControl}
        value={filter}
      />
      <View style={styles.savedHeading}>
        <Text style={styles.savedTitle}>Saved for practice</Text>
        <Text style={styles.savedCount}>{visible.length} total</Text>
      </View>
      {audioError ? <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text> : null}
    </View>
  );

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      data={visible}
      keyExtractor={(phrase) => phrase.hi}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={Header}
      ListEmptyComponent={phrases.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><BookOpen color={colors.white} size={28} /></View>
          <Text style={styles.emptyTitle}>Your phrase book is ready</Text>
          <Text style={styles.emptyBody}>Save useful answers from any scene and they will appear here for quick practice.</Text>
        </View>
      ) : <Text style={styles.noResults}>No phrases match this search and filter.</Text>}
      renderItem={({ item }) => {
        const offline = hasOfflineSpeech?.(item.hi) ?? false;
        const canListen = aiConsent || offline;
        const review = reviews[item.hi];
        const mastery = review?.mastery ?? 0;
        const category = phraseCategories.get(item.hi) ?? 'Asha';
        const isDue = dueSet.has(item.hi);
        return (
          <View style={[styles.card, isDue && styles.cardDue]}>
            <View style={styles.cardHeader}>
              <View style={[styles.categoryPill, category === 'Food' ? styles.categoryPillBrand : styles.categoryPillForest]}>
                <Text style={[styles.categoryText, category === 'Food' ? styles.categoryTextBrand : styles.categoryTextForest]}>{category === 'Food' ? 'Café' : category}</Text>
              </View>
              <View style={styles.cardHeaderActions}>
                <PressableFeedback accessibilityHint={canListen ? 'Bundled lesson audio works offline.' : 'Agree to connected AI processing to enable Listen.'} accessibilityLabel={`Hear ${item.hi}`} accessibilityRole="button" accessibilityState={{ disabled: !canListen }} isDisabled={!canListen} onPress={() => void playPhrase(item.hi)} style={[styles.listenButton, category === 'Food' ? styles.listenButtonBrand : styles.listenButtonForest, !canListen && styles.disabled]}>
                  <Volume2 color={category === 'Food' ? colors.brand : colors.forest} size={14} />
                  <Text style={[styles.listenText, category === 'Food' ? styles.categoryTextBrand : styles.categoryTextForest]}>Listen</Text>
                </PressableFeedback>
                <PressableFeedback accessibilityLabel={`Remove ${item.hi}`} accessibilityRole="button" onPress={() => confirmRemove(item)} style={styles.removeButton}><Trash2 color={colors.danger} size={17} /></PressableFeedback>
              </View>
            </View>
            <View style={styles.copy}>
              {profile.scriptPreference !== 'latin' && item.hi.trim().toLocaleLowerCase() !== item.latin.trim().toLocaleLowerCase() ? <Text style={styles.hindi}>{item.hi}</Text> : null}
              <Text style={[styles.latin, category === 'Food' ? styles.latinBrand : styles.latinForest]}>{item.latin}</Text>
              <Text style={styles.english}>{item.en}</Text>
              <View style={styles.masteryRow}>
                <MasteryMeter mastery={mastery} />
                <Text style={[styles.mastery, isDue && styles.masteryDue]}>{isDue ? 'Due now' : `${mastery}/5`}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              {replaySpeeds.map(({ label, rate }) => (
                <PressableFeedback key={rate} accessibilityLabel={`Replay ${item.latin} at ${label} speed`} accessibilityRole="button" accessibilityState={{ disabled: !canListen }} isDisabled={!canListen} onPress={() => void playPhrase(item.hi, rate)} style={[styles.speedButton, !canListen && styles.disabled]}><Text style={styles.speedText}>{label}</Text></PressableFeedback>
              ))}
            </View>
          </View>
        );
      }}
      style={sharedStyles.screen}
      testID="saved-phrase-list"
    />
  );
}

const useStyles = makeStyles((c) => ({
  content: { width: '100%', alignItems: 'stretch', paddingHorizontal: spacing.lg, paddingTop: 18, paddingBottom: spacing.xxl },
  separator: { height: spacing.md },
  header: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  headerHero: { minHeight: 72, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { alignItems: 'center', gap: 3 },
  headerEyebrow: { color: c.brandText, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  headerTitle: { color: c.ink, fontSize: 31, lineHeight: 37, fontWeight: '900', textAlign: 'center' },
  dueCard: { width: '100%', minHeight: 106, overflow: 'hidden', borderRadius: 22, borderCurve: 'continuous', backgroundColor: c.goldSoft, borderColor: '#F2DB99', borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 14, padding: spacing.lg, boxShadow: '0 5px 16px rgba(84, 58, 11, 0.08)' },
  dueIcon: { width: 68, height: 68, borderRadius: 21, borderCurve: 'continuous', backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  dueIconText: { color: '#38290D', fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  dueCopy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 4 },
  dueTitle: { color: c.ink, fontSize: 17, fontWeight: '900', textAlign: 'left' },
  dueBody: { color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'left' },
  searchField: { width: '100%', alignSelf: 'stretch' },
  searchRow: { width: '100%', minHeight: 52, borderRadius: radius.pill, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, backgroundColor: c.paperRaised, paddingHorizontal: spacing.md },
  search: { minWidth: 0, flex: 1, color: c.ink, fontSize: 15, paddingVertical: spacing.sm },
  segmentedControl: { width: '100%', alignSelf: 'stretch' },
  savedHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  savedTitle: { color: c.ink, fontSize: 17, fontWeight: '900', textAlign: 'left' },
  savedCount: { color: c.muted, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'right' },
  error: { color: c.danger, fontSize: 13, lineHeight: 18 },
  card: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, borderRadius: 22, borderCurve: 'continuous', gap: 5, paddingHorizontal: spacing.lg, paddingVertical: 14, boxShadow: '0 4px 14px rgba(0, 0, 0, 0.035)' },
  cardDue: { borderColor: c.gold, borderWidth: 1.5 },
  cardHeader: { width: '100%', minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  cardHeaderActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  categoryPill: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  categoryPillForest: { backgroundColor: c.forestSoft },
  categoryPillBrand: { backgroundColor: c.brandSoft },
  categoryText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  categoryTextForest: { color: c.forest },
  categoryTextBrand: { color: c.brand },
  listenButton: { minWidth: 44, minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  listenButtonForest: { backgroundColor: c.forestSoft },
  listenButtonBrand: { backgroundColor: c.brandSoft },
  listenText: { fontSize: 11, fontWeight: '800' },
  removeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  copy: { minWidth: 0, alignSelf: 'stretch', alignItems: 'flex-start', gap: spacing.xs },
  hindi: { color: c.ink, fontSize: 23, lineHeight: 31, fontWeight: '900', textAlign: 'left' },
  latin: { fontSize: 14, fontWeight: '800', textAlign: 'left' },
  latinForest: { color: c.forest },
  latinBrand: { color: c.brand },
  english: { color: c.muted, fontSize: 14, lineHeight: 20, textAlign: 'left' },
  masteryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start', gap: spacing.sm, paddingTop: 2 },
  masteryMeter: { flexDirection: 'row', gap: 4 },
  masteryDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: c.lineStrong },
  masteryDotFilled: { backgroundColor: c.forest },
  mastery: { color: c.mutedSoft, fontSize: 11, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase' },
  masteryDue: { color: c.brandText },
  actions: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: spacing.xs, paddingTop: spacing.xs },
  speedButton: { minWidth: 54, height: 34, borderRadius: radius.pill, backgroundColor: c.backgroundWarm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  speedText: { color: c.forestText, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, paddingTop: spacing.xxl },
  emptyIcon: { width: 64, height: 64, borderRadius: 22, borderCurve: 'continuous', backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: c.ink, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: c.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  noResults: { color: c.muted, fontSize: 15, textAlign: 'center', padding: spacing.xl },
}));
