import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { SearchField } from 'heroui-native/search-field';
import { BookOpen, Leaf, Trash2, Volume2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/segmented-control';
import { JournalDisplay, JournalKicker } from '@/components/journal-chrome';
import { lessonPlans } from '@/data/lesson-plans';
import { scenes, type SceneCategory } from '@/data/scenes';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { useSpeakText } from '@/hooks/use-speak-text';
import { showAppAlert } from '@/lib/app-alert';
import { learnerPhraseLatin } from '@/lib/learner-phrase-display';
import { dueSavedPhrases } from '@/lib/learning';
import { hasOfflineSpeech, stopSpeaking } from '@/lib/speech';
import { defaultLearnerProfile } from '@/lib/storage';
import { useAppState } from '@/state/app-state';
import type { SavedPhrase } from '@/state/app-state-types';
import { makeStyles, maxContentWidth, radius, spacing, useSharedStyles, useTheme } from '@/theme';

type Filter = 'All' | SceneCategory;

const replaySpeeds = [
  { label: '0.10×', rate: 0.1 },
  { label: '0.25×', rate: 0.25 },
  { label: '0.50×', rate: 0.5 },
  { label: '0.75×', rate: 0.75 },
  { label: 'Normal', rate: 1 },
] as const;

const phraseCategories = new Map<string, SceneCategory>();
for (const scene of scenes) {
  for (const beat of scene.beats) {
    for (const choice of beat.choices) phraseCategories.set(choice.hi, scene.category);
  }
}

function MasteryMeter({ mastery }: { mastery: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View accessibilityLabel={`Mastery ${mastery} of 5`} style={styles.masteryMeter}>
      {Array.from({ length: 5 }, (_, index) => <Leaf color={index < mastery ? colors.forest : colors.lineStrong} fill={index < mastery ? colors.forestSoft : 'transparent'} key={index} size={14} strokeWidth={1.8} />)}
    </View>
  );
}

export default function PhrasesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles();
  const sharedStyles = useSharedStyles();
  const largeTextLayout = useLargeTextLayout();
  const insets = useSafeAreaInsets();
  const { aiConsent, learnerProfile, phraseReviews, phrases, removePhrase, updateLearnerProfile, sceneProgress: savedSceneProgress } = useAppState();
  const { audioError, clearAudioError, speak } = useSpeakText();
  const [audioPhrase, setAudioPhrase] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  // List all due phrases here, not the 5-phrase review-session cap from duePhrases.
  const due = useMemo(() => dueSavedPhrases(phrases, phraseReviews ?? {}, Infinity), [phraseReviews, phrases]);
  const reviews = phraseReviews ?? {};
  const profile = learnerProfile ?? { ...defaultLearnerProfile(), completed: true };
  const sceneProgress = useMemo(() => savedSceneProgress ?? {}, [savedSceneProgress]);
  const nextLesson = useMemo(() => {
    const catalog = lessonPlans.flatMap((plan) => plan.lessonIds.map((lessonId) => ({ lessonId, plan })));
    const resumed = catalog
      .filter(({ lessonId }) => {
        const progress = sceneProgress[lessonId];
        return (progress?.completions ?? 0) === 0 && (progress?.lastBeatIndex ?? 0) > 0;
      })
      .reduce<(typeof catalog)[number] | undefined>((selected, candidate) => {
        if (!selected) return candidate;
        const candidateTime = Date.parse(sceneProgress[candidate.lessonId]?.lastPracticedAt ?? '');
        const selectedTime = Date.parse(sceneProgress[selected.lessonId]?.lastPracticedAt ?? '');
        const normalizedCandidateTime = Number.isNaN(candidateTime) ? 0 : candidateTime;
        const normalizedSelectedTime = Number.isNaN(selectedTime) ? 0 : selectedTime;
        return normalizedCandidateTime > normalizedSelectedTime ? candidate : selected;
      }, undefined);
    const incompletePlan = lessonPlans.find((plan) => plan.lessonIds.some((lessonId) => (sceneProgress[lessonId]?.completions ?? 0) === 0));
    const plan = resumed?.plan ?? incompletePlan ?? lessonPlans[lessonPlans.length - 1]!;
    const lessonId = resumed?.lessonId
      ?? plan.lessonIds.find((id) => (sceneProgress[id]?.completions ?? 0) === 0)
      ?? plan.lessonIds[0]!;

    return {
      action: resumed ? 'Continue lesson' : incompletePlan ? 'Start next lesson' : 'Review a lesson',
      lessonId,
    };
  }, [sceneProgress]);
  const dueSet = useMemo(() => new Set(due.map((phrase) => phrase.hi)), [due]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return phrases.filter((phrase) => {
      if (filter !== 'All' && phraseCategories.get(phrase.hi) !== filter) return false;
      return !normalized || `${phrase.hi} ${phrase.latin} ${phrase.en}`.toLocaleLowerCase().includes(normalized);
    });
  }, [filter, phrases, query]);

  useFocusEffect(useCallback(() => () => { void stopSpeaking(); }, []));

  function playPhrase(text: string, playbackRate = profile.phrasePlaybackRate ?? 1) {
    if (!aiConsent && !hasOfflineSpeech(text)) return;
    if (playbackRate !== (profile.phrasePlaybackRate ?? 1)) updateLearnerProfile({ phrasePlaybackRate: playbackRate });
    clearAudioError();
    setAudioPhrase(text);
    void speak(text, undefined, playbackRate);
  }

  function confirmRemove(phrase: SavedPhrase) {
    showAppAlert('Remove saved phrase?', phrase.hi, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePhrase(phrase.hi) },
    ]);
  }

  const Header = (
    <View style={styles.header}>
      <View style={[styles.headerHero, largeTextLayout && styles.headerHeroLarge]} testID="phrases-header-hero">
        <View style={[styles.headerCopy, largeTextLayout && styles.headerCopyLarge]}>
          <JournalKicker>Your language garden</JournalKicker>
          <JournalDisplay style={[styles.headerTitle, largeTextLayout && styles.headerTitleLarge]}>Words you want to keep.</JournalDisplay>
        </View>
      </View>
      {phrases.length > 0 ? (
        <>
          <PressableFeedback accessibilityLabel={`Review ${due.length} phrases due today`} accessibilityRole="button" onPress={() => router.push('/review' as Href)} style={[styles.dueCard, largeTextLayout && styles.dueCardLarge]}>
            <View style={styles.dueCopy}>
              <Text style={styles.dueTitle}>Ready for review</Text>
              <Text style={styles.dueBody}>{due.length ? `A quick practice keeps ${due.length} phrase${due.length === 1 ? '' : 's'} fresh.` : 'Everything is reviewed for today.'}</Text>
            </View>
            <View style={styles.dueTrail}>
              <Text style={styles.dueCount}>{due.length}</Text>
              <Text accessible={false} style={styles.dueArrow}>→</Text>
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
            stackedAtLargeText
            style={styles.segmentedControl}
            value={filter}
          />
          <View style={styles.savedHeading}>
            <Text style={styles.savedTitle}>Saved for practice</Text>
            <Text style={styles.savedCount}>{visible.length === phrases.length ? `${phrases.length} total` : `${visible.length} of ${phrases.length}`}</Text>
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.content,
        Platform.OS === 'android' && { paddingTop: insets.top + 18, paddingBottom: insets.bottom + spacing.xxl },
      ]}
      data={visible}
      keyExtractor={(phrase) => phrase.hi}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={Header}
      ListEmptyComponent={phrases.length === 0 ? (
        <View style={styles.empty}>
          <BookOpen color={colors.brand} size={32} strokeWidth={1.6} />
          <Text style={styles.emptyBody}>Practice a lesson, then save any useful phrase you want to keep.</Text>
          <PressableFeedback
            accessibilityLabel={nextLesson.action}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/scene/[id]', params: { id: nextLesson.lessonId } })}
            style={styles.emptyAction}
            testID="phrases-empty-lesson-action"
          >
            <Text style={styles.emptyActionText}>{nextLesson.action}</Text>
          </PressableFeedback>
        </View>
      ) : <Text style={styles.noResults}>No phrases match this search and filter.</Text>}
      renderItem={({ item }) => {
        const offline = hasOfflineSpeech(item.hi);
        const canListen = aiConsent || offline;
        const review = reviews[item.hi];
        const mastery = review?.mastery ?? 0;
        const category = phraseCategories.get(item.hi) ?? 'Asha';
        const isDue = dueSet.has(item.hi);
        return (
          <View style={[styles.card, largeTextLayout && styles.cardLarge, isDue && styles.cardDue]}>
            <View style={[styles.cardHeader, largeTextLayout && styles.cardHeaderLarge]}>
              <View style={[styles.categoryPill, category === 'Food' ? styles.categoryPillBrand : styles.categoryPillForest]}>
                <Text style={[styles.categoryText, category === 'Food' ? styles.categoryTextBrand : styles.categoryTextForest]}>{category === 'Food' ? 'Café' : category}</Text>
              </View>
              <View style={styles.cardHeaderActions}>
                <PressableFeedback accessibilityHint={canListen ? 'Bundled lesson audio works offline.' : 'Agree to connected AI processing to enable Listen.'} accessibilityLabel={`Hear ${item.hi}`} accessibilityRole="button" accessibilityState={{ disabled: !canListen }} isDisabled={!canListen} onPress={() => playPhrase(item.hi)} style={[styles.listenButton, category === 'Food' ? styles.listenButtonBrand : styles.listenButtonForest, !canListen && styles.disabled]} testID="saved-phrase-listen">
                  <Volume2 color={category === 'Food' ? colors.brand : colors.forest} size={14} />
                  <Text style={[styles.listenText, category === 'Food' ? styles.categoryTextBrand : styles.categoryTextForest]}>Listen</Text>
                </PressableFeedback>
                <PressableFeedback accessibilityLabel={`Remove ${item.hi}`} accessibilityRole="button" onPress={() => confirmRemove(item)} style={styles.removeButton}><Trash2 color={colors.danger} size={17} /></PressableFeedback>
              </View>
            </View>
            <View style={styles.copy}>
              {profile.scriptPreference !== 'latin' && item.hi.trim().toLocaleLowerCase() !== item.latin.trim().toLocaleLowerCase() ? <Text style={styles.hindi}>{item.hi}</Text> : null}
              <Text style={[styles.latin, category === 'Food' ? styles.latinBrand : styles.latinForest]}>{learnerPhraseLatin(item.hi, item.latin)}</Text>
              <Text style={styles.english}>{item.en}</Text>
              <View style={styles.masteryRow}>
                <MasteryMeter mastery={mastery} />
                <Text style={[styles.mastery, isDue && styles.masteryDue]}>{isDue ? 'Due now' : `${mastery}/5`}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              {replaySpeeds.map(({ label, rate }) => (
                <PressableFeedback key={rate} accessibilityLabel={`Replay ${learnerPhraseLatin(item.hi, item.latin)} at ${label} speed`} accessibilityRole="button" accessibilityState={{ disabled: !canListen, selected: rate === (profile.phrasePlaybackRate ?? 1) }} isDisabled={!canListen} onPress={() => playPhrase(item.hi, rate)} style={[styles.speedButton, rate === (profile.phrasePlaybackRate ?? 1) && styles.speedButtonSelected, largeTextLayout && styles.speedButtonLarge, !canListen && styles.disabled]}><Text style={styles.speedText}>{label}</Text></PressableFeedback>
              ))}
            </View>
            {audioError && audioPhrase === item.hi ? <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text> : null}
          </View>
        );
      }}
      style={sharedStyles.screen}
      testID="saved-phrase-list"
    />
  );
}

const useStyles = makeStyles((c) => ({
  // Let saved-phrase cards use a little more of the screen without changing
  // the visual margins of the header controls above them.
  content: { width: '100%', alignItems: 'stretch', paddingHorizontal: spacing.md, paddingTop: 18, paddingBottom: spacing.xxl },
  separator: { height: spacing.md },
  header: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md, paddingHorizontal: spacing.sm },
  headerHero: { width: '100%', alignItems: 'stretch', justifyContent: 'center', gap: spacing.md, paddingTop: spacing.sm },
  headerHeroLarge: { alignItems: 'stretch' },
  headerCopy: { alignItems: 'flex-start', gap: spacing.xs },
  headerCopyLarge: { width: '100%' },
  headerTitle: { maxWidth: 310, fontSize: 30, lineHeight: 36, textAlign: 'left' },
  headerTitleLarge: { maxWidth: '100%' },
  dueCard: { width: '100%', minHeight: 88, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  dueCardLarge: { alignItems: 'flex-start', flexDirection: 'column' },
  dueCopy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 3 },
  dueTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 21, lineHeight: 26, fontWeight: '700', textAlign: 'left' },
  dueBody: { color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'left' },
  dueTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dueArrow: { color: c.forestText, fontSize: 20, fontWeight: '900' },
  dueCount: { color: c.forestText, fontFamily: 'Georgia', fontSize: 26, lineHeight: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  searchField: { width: '100%', alignSelf: 'stretch' },
  searchRow: { width: '100%', minHeight: 50 },
  search: { minWidth: 0, flex: 1, minHeight: 50, borderRadius: radius.pill, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, backgroundColor: c.paperRaised, color: c.ink, fontSize: 15, paddingVertical: spacing.sm },
  segmentedControl: { width: '100%', alignSelf: 'stretch' },
  savedHeading: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  savedTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 21, fontWeight: '700', textAlign: 'left' },
  savedCount: { color: c.muted, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'], textAlign: 'right' },
  error: { color: c.danger, fontSize: 13, lineHeight: 18 },
  card: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'center', overflow: 'hidden', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, borderRadius: radius.lg, borderCurve: 'continuous', gap: 5, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  cardLarge: { alignItems: 'stretch', gap: spacing.md, overflow: 'visible' },
  cardDue: { borderColor: c.gold },
  cardHeader: { width: '100%', minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  cardHeaderLarge: { alignItems: 'flex-start', flexDirection: 'column' },
  cardHeaderActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  categoryPill: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  categoryPillForest: { backgroundColor: c.forestSoft },
  categoryPillBrand: { backgroundColor: c.brandSoft },
  categoryText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  categoryTextForest: { color: c.forest },
  categoryTextBrand: { color: c.brand },
  listenButton: { minWidth: 44, minHeight: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, paddingVertical: 5 },
  listenButtonForest: {},
  listenButtonBrand: {},
  listenText: { fontSize: 12, fontWeight: '800' },
  removeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  copy: { minWidth: 0, alignSelf: 'stretch', alignItems: 'flex-start', gap: spacing.xs },
  hindi: { color: c.ink, fontFamily: 'Georgia', fontSize: 27, lineHeight: 34, fontWeight: '700', textAlign: 'left' },
  latin: { fontSize: 14, fontWeight: '800', textAlign: 'left' },
  latinForest: { color: c.forest },
  latinBrand: { color: c.brand },
  english: { color: c.muted, fontSize: 14, lineHeight: 20, textAlign: 'left' },
  masteryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start', gap: spacing.sm, paddingTop: 2 },
  masteryMeter: { flexDirection: 'row', gap: 4 },
  mastery: { color: c.mutedSoft, fontSize: 11, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase' },
  masteryDue: { color: c.brandText },
  actions: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.xs, paddingTop: spacing.xs },
  speedButton: { flexGrow: 1, minWidth: 56, minHeight: 44, borderRadius: radius.pill, backgroundColor: c.backgroundWarm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  speedButtonSelected: { borderColor: c.forest, borderWidth: 1, backgroundColor: c.forestSoft },
  speedButtonLarge: { minHeight: 44, paddingVertical: spacing.sm },
  speedText: { color: c.forestText, flexShrink: 1, fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.4 },
  empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, paddingTop: spacing.xxl },
  emptyBody: { color: c.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  emptyAction: { minWidth: 180, minHeight: 48, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.night, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  emptyActionText: { color: c.white, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  noResults: { color: c.muted, fontSize: 15, textAlign: 'center', padding: spacing.xl },
}));
