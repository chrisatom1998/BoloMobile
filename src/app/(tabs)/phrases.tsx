import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { SearchField } from 'heroui-native/search-field';
import { BookOpen, Trash2, Volume2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lessonPlans } from '@/data/lesson-plans';
import { scenes, type SceneCategory } from '@/data/scenes';
import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { useSpeakText } from '@/hooks/use-speak-text';
import { showAppAlert } from '@/lib/app-alert';
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
] as const;

const phraseCategories = new Map<string, SceneCategory>();
for (const scene of scenes) {
  for (const beat of scene.beats) {
    for (const choice of beat.choices) phraseCategories.set(choice.hi, scene.category);
  }
}

const filterOptions: readonly { label: string; value: Filter }[] = [
  { label: 'All', value: 'All' },
  { label: 'Café', value: 'Food' },
  { label: 'Social', value: 'Social' },
  { label: 'Travel', value: 'Travel' },
];

function MasteryMeter({ mastery }: { mastery: number }) {
  const styles = useStyles();
  return (
    <View accessibilityLabel={`Mastery ${mastery} of 5`} style={styles.masteryMeter}>
      {Array.from({ length: 5 }, (_, index) => <View key={index} style={[styles.masterySegment, index < mastery && styles.masterySegmentFilled]} />)}
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
  const { aiConsent, learnerProfile, phraseReviews, phrases, removePhrase, sceneProgress: savedSceneProgress } = useAppState();
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

  function playPhrase(text: string, playbackRate = 1) {
    if (!aiConsent && !hasOfflineSpeech(text)) return;
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

  const savedCountLabel = visible.length === phrases.length ? `${phrases.length} saved` : `${visible.length} of ${phrases.length} saved`;

  const Header = (
    <View style={styles.header}>
      <View style={[styles.headerHero, largeTextLayout && styles.headerHeroLarge]} testID="phrases-header-hero">
        <View style={[styles.headerTitleRow, largeTextLayout && styles.headerTitleRowLarge]}>
          <Text accessibilityRole="header" style={styles.headerTitle}>Phrases</Text>
          {phrases.length > 0 ? <Text style={styles.savedCount}>{savedCountLabel}</Text> : null}
        </View>
        <Text style={[styles.headerSubtitle, largeTextLayout && styles.headerSubtitleLarge]}>Words you want to keep.</Text>
      </View>
      {phrases.length > 0 ? (
        <>
          <View style={[styles.dueCard, largeTextLayout && styles.dueCardLarge]} testID="phrases-review-banner">
            <Text style={styles.dueCount}>{due.length}</Text>
            <View style={[styles.dueCopy, largeTextLayout && styles.dueCopyLarge]}>
              <Text style={styles.dueTitle}>Ready for review</Text>
              <Text style={styles.dueBody}>{due.length ? `A quick practice keeps ${due.length} phrase${due.length === 1 ? '' : 's'} fresh.` : 'Everything is reviewed for today.'}</Text>
            </View>
            <PressableFeedback accessibilityLabel={`Review ${due.length} phrases due today`} accessibilityRole="button" onPress={() => router.push('/review' as Href)} style={[styles.dueButton, largeTextLayout && styles.dueButtonLarge]}>
              <Text style={styles.dueButtonText}>Review</Text>
            </PressableFeedback>
          </View>
          <SearchField onChange={setQuery} style={styles.searchField} value={query}>
            <SearchField.Group style={styles.searchRow}>
              <SearchField.SearchIcon iconProps={{ color: colors.muted, size: 18 }} />
              <SearchField.Input accessibilityLabel="Search saved phrases" placeholder="Search in Hindi or English" placeholderTextColor={colors.muted} style={styles.search} />
              <SearchField.ClearButton iconProps={{ color: colors.muted }} />
            </SearchField.Group>
          </SearchField>
          <View accessibilityLabel="Phrase category" accessibilityRole="tablist" style={styles.filters}>
            {filterOptions.map((option) => {
              const selected = filter === option.value;
              return (
                <Pressable
                  accessibilityLabel={`Phrase category: ${option.label}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={option.value}
                  onPress={() => setFilter(option.value)}
                  style={({ pressed }) => [styles.filterPill, selected && styles.filterPillSelected, largeTextLayout && styles.filterPillLarge, pressed && styles.pressed]}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
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
          <View style={styles.emptyIcon}><BookOpen color={colors.brandText} size={28} /></View>
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
        const isDue = dueSet.has(item.hi);
        const showHindi = profile.scriptPreference !== 'latin' && item.hi.trim().toLocaleLowerCase() !== item.latin.trim().toLocaleLowerCase();
        return (
          <View style={[styles.card, largeTextLayout && styles.cardLarge]}>
            <View style={[styles.cardMain, largeTextLayout && styles.cardMainLarge]}>
              <View style={styles.copy}>
                {showHindi ? <Text style={styles.hindi}>{item.hi}</Text> : null}
                <Text style={styles.latin}>{item.latin}</Text>
                <Text style={styles.english}>{item.en}</Text>
                <View style={styles.masteryRow}>
                  <MasteryMeter mastery={mastery} />
                  <Text style={[styles.mastery, isDue && styles.masteryDue]}>{isDue ? 'Due now' : `${mastery}/5`}</Text>
                </View>
              </View>
              <View style={[styles.cardActions, largeTextLayout && styles.cardActionsLarge]}>
                <PressableFeedback accessibilityHint={canListen ? 'Bundled lesson audio works offline.' : 'Agree to connected AI processing to enable Listen.'} accessibilityLabel={`Hear ${item.hi}`} accessibilityRole="button" accessibilityState={{ disabled: !canListen }} isDisabled={!canListen} onPress={() => playPhrase(item.hi)} style={[styles.listenButton, !canListen && styles.disabled]} testID="saved-phrase-listen">
                  <Volume2 color={colors.brandText} size={18} />
                </PressableFeedback>
                <PressableFeedback accessibilityLabel={`Remove ${item.hi}`} accessibilityRole="button" onPress={() => confirmRemove(item)} style={styles.removeButton}><Trash2 color={colors.danger} size={17} /></PressableFeedback>
              </View>
            </View>
            <View style={styles.speeds}>
              {replaySpeeds.map(({ label, rate }) => (
                <PressableFeedback key={rate} accessibilityLabel={`Replay ${item.latin} at ${label} speed`} accessibilityRole="button" accessibilityState={{ disabled: !canListen }} isDisabled={!canListen} onPress={() => playPhrase(item.hi, rate)} style={[styles.speedButton, largeTextLayout && styles.speedButtonLarge, !canListen && styles.disabled]}><Text style={styles.speedText}>{label}</Text></PressableFeedback>
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
  content: { width: '100%', alignItems: 'stretch', paddingHorizontal: spacing.lg, paddingTop: 18, paddingBottom: spacing.xxl },
  separator: { height: spacing.md },
  header: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'stretch', gap: spacing.lg, marginBottom: spacing.lg },
  headerHero: { width: '100%', alignItems: 'flex-start', gap: 2, paddingTop: spacing.sm },
  headerHeroLarge: { alignItems: 'stretch' },
  headerTitleRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
  headerTitleRowLarge: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.xs },
  headerTitle: { color: c.ink, fontFamily: 'Georgia', fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.3, textAlign: 'left' },
  headerSubtitle: { maxWidth: 310, color: c.muted, fontSize: 14, lineHeight: 20, textAlign: 'left' },
  headerSubtitleLarge: { maxWidth: '100%' },
  savedCount: { color: c.muted, fontSize: 13, lineHeight: 18, paddingBottom: spacing.xs, fontVariant: ['tabular-nums'], textAlign: 'right' },
  dueCard: { width: '100%', borderRadius: 24, borderCurve: 'continuous', backgroundColor: c.gold, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: spacing.lg, paddingLeft: 18, paddingRight: spacing.lg },
  dueCardLarge: { alignItems: 'flex-start', flexDirection: 'column', gap: spacing.sm },
  dueCount: { color: c.ink, fontFamily: 'Georgia', fontSize: 44, lineHeight: 50, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dueCopy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 2 },
  dueCopyLarge: { flex: 0, alignSelf: 'stretch' },
  dueTitle: { color: c.ink, fontSize: 16, lineHeight: 21, fontWeight: '600', textAlign: 'left' },
  // Ink rather than muted copy keeps the body above 4.5:1 on the gold banner.
  dueBody: { color: c.ink, fontSize: 13, lineHeight: 18, textAlign: 'left' },
  dueButton: { minHeight: 44, minWidth: 44, borderRadius: radius.pill, backgroundColor: c.neutralSurface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  dueButtonLarge: { alignSelf: 'stretch', paddingVertical: spacing.sm },
  dueButtonText: { color: c.neutralSurfaceText, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  searchField: { width: '100%', alignSelf: 'stretch' },
  searchRow: { width: '100%', minHeight: 48, borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, backgroundColor: c.paperRaised, paddingHorizontal: 14, gap: 10 },
  search: { minWidth: 0, flex: 1, color: c.ink, fontSize: 15, paddingVertical: spacing.sm },
  filters: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  filterPill: { minHeight: 44, minWidth: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  filterPillLarge: { paddingVertical: spacing.xs },
  filterPillSelected: { borderColor: c.ink, backgroundColor: c.ink },
  filterText: { color: c.ink, fontSize: 13, fontWeight: '500', textAlign: 'center' },
  filterTextSelected: { color: c.white, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  error: { alignSelf: 'stretch', color: c.danger, fontSize: 13, lineHeight: 18 },
  card: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', backgroundColor: c.paperRaised, borderRadius: radius.lg, borderCurve: 'continuous', gap: spacing.md, paddingVertical: 14, paddingLeft: spacing.lg, paddingRight: 14 },
  cardLarge: { gap: spacing.md },
  cardMain: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardMainLarge: { alignItems: 'stretch', flexDirection: 'column' },
  cardActions: { alignItems: 'center', gap: spacing.xs },
  cardActionsLarge: { flexDirection: 'row', justifyContent: 'flex-start' },
  listenButton: { width: 44, height: 44, minWidth: 44, minHeight: 44, borderRadius: radius.pill, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  removeButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  copy: { minWidth: 0, flex: 1, alignSelf: 'stretch', alignItems: 'flex-start', gap: 2 },
  hindi: { color: c.ink, fontFamily: 'Georgia', fontSize: 19, lineHeight: 26, fontWeight: '700', textAlign: 'left' },
  latin: { color: c.brand, fontSize: 14, lineHeight: 19, fontWeight: '500', textAlign: 'left' },
  english: { color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'left' },
  masteryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start', gap: spacing.xs, paddingTop: 6 },
  masteryMeter: { flexDirection: 'row', gap: spacing.xs },
  masterySegment: { width: 18, height: 6, borderRadius: radius.pill, backgroundColor: c.line },
  masterySegmentFilled: { backgroundColor: c.brand },
  mastery: { marginLeft: 6, color: c.muted, fontSize: 12, lineHeight: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  masteryDue: { color: c.danger },
  speeds: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'space-between', gap: spacing.xs },
  speedButton: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: radius.pill, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  speedButtonLarge: { minHeight: 44, paddingVertical: spacing.sm },
  speedText: { color: c.ink, flexShrink: 1, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  disabled: { opacity: 0.4 },
  empty: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'center', gap: spacing.md, backgroundColor: c.paperRaised, borderRadius: 22, borderCurve: 'continuous', padding: spacing.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  emptyBody: { color: c.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  emptyAction: { minWidth: 180, minHeight: 48, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.neutralSurface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  emptyActionText: { color: c.neutralSurfaceText, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  noResults: { color: c.muted, fontSize: 15, textAlign: 'center', padding: spacing.xl },
}));
