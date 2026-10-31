import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { SearchField } from 'heroui-native/search-field';
import { BookOpen, Trash2, Volume2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/segmented-control';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { JournalDisplay } from '@/components/journal-chrome';
import { selectNextLesson } from '@/lib/lesson-path';
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
import { displayFont, hindiType, makeStyles, maxContentWidth, radius, spacing, useSharedStyles, useTheme, type, buttons } from '@/theme';
import { StatusBarScrim } from '@/components/status-bar-scrim';

type Filter = 'All' | SceneCategory;

// Below half speed Hindi stops sounding like speech, so the slowest choice is 0.5×.
const replaySpeeds = [
  { label: 'Slower', rate: 0.5 },
  { label: 'Slow', rate: 0.75 },
  { label: 'Normal', rate: 1 },
] as const;
const speedOptions = replaySpeeds.map(({ label, rate }) => ({ accessibilityLabel: label, label, value: String(rate) }));
const categoryLabels: Record<SceneCategory, string> = { Everyday: 'Everyday', Food: 'Food', Health: 'Health', Social: 'Social', Travel: 'Travel', Work: 'Work' };

const phraseCategories = new Map<string, SceneCategory>();
for (const scene of scenes) {
  for (const beat of scene.beats) {
    for (const choice of beat.choices) phraseCategories.set(choice.hi, scene.category);
  }
}

function MasteryMeter({ mastery }: { mastery: number }) {
  const styles = useStyles();
  return (
    <View accessible accessibilityLabel={`Mastery ${mastery} of 5`} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 5, now: mastery }} style={styles.masteryMeter}>
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
    const { lessonId, mode } = selectNextLesson(sceneProgress, learnerProfile);

    return {
      action: mode === 'continue' ? 'Continue lesson' : mode === 'next' ? 'Start next lesson' : 'Review a lesson',
      lessonId,
    };
  }, [learnerProfile, sceneProgress]);
  const dueSet = useMemo(() => new Set(due.map((phrase) => phrase.hi)), [due]);
  // Filters list only the categories the learner has actually saved phrases from.
  const filterOptions = useMemo(() => {
    const present = new Set(phrases.map((phrase) => phraseCategories.get(phrase.hi)).filter((category): category is SceneCategory => Boolean(category)));
    return (Object.keys(categoryLabels) as SceneCategory[]).filter((category) => present.has(category)).map((category) => ({ label: categoryLabels[category], value: category as Filter }));
  }, [phrases]);
  // A filter whose last phrase was removed falls back to All instead of showing an empty list.
  const activeFilter: Filter = filter !== 'All' && filterOptions.some((option) => option.value === filter) ? filter : 'All';
  // Forget the stale choice too, so saving into that category later doesn't silently re-filter the list.
  if (activeFilter !== filter) setFilter('All');
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return phrases.filter((phrase) => {
      if (activeFilter !== 'All' && phraseCategories.get(phrase.hi) !== activeFilter) return false;
      return !normalized || `${phrase.hi} ${phrase.latin} ${phrase.en}`.toLocaleLowerCase().includes(normalized);
    });
  }, [activeFilter, phrases, query]);

  useFocusEffect(useCallback(() => () => { void stopSpeaking(); }, []));

  // Older builds offered 0.1× and 0.25×; those settings play at the new slowest speed.
  const playbackRate = Math.max(0.5, profile.phrasePlaybackRate ?? 1);

  function playPhrase(text: string) {
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

  const savedCount = visible.length === phrases.length
    ? `${phrases.length} saved`
    : `${visible.length} of ${phrases.length}`;

  const Header = (
    <View style={styles.header}>
      <View style={[styles.headerHero, largeTextLayout && styles.headerHeroLarge]} testID="phrases-header-hero">
        <View style={[styles.headerRow, largeTextLayout && styles.headerRowLarge]}>
          <JournalDisplay style={styles.headerTitle}>Phrases</JournalDisplay>
          {phrases.length > 0 ? <Text style={styles.savedCount}>{savedCount}</Text> : null}
        </View>
        <Text style={[styles.headerSubtitle, largeTextLayout && styles.headerSubtitleLarge]}>Words you want to keep.</Text>
      </View>
      {phrases.length > 0 ? (
        <>
          <PressableFeedback accessibilityLabel={due.length ? `Review ${due.length} phrase${due.length === 1 ? '' : 's'} due today` : 'All phrases reviewed for today. Practice them again'} accessibilityRole="button" onPress={() => router.push('/review' as Href)} style={[styles.dueCard, largeTextLayout && styles.dueCardLarge]}>
            <Text style={styles.dueCount}>{due.length}</Text>
            <View style={styles.dueCopy}>
              <Text style={styles.dueTitle}>{due.length ? 'Ready for review' : 'All caught up'}</Text>
              <Text style={styles.dueBody}>{due.length ? `A quick practice keeps ${due.length} phrase${due.length === 1 ? '' : 's'} fresh.` : 'New phrases come back for review tomorrow.'}</Text>
            </View>
            <View style={styles.dueAction}><Text style={styles.dueActionText}>{due.length ? 'Review' : 'Practice'}</Text></View>
          </PressableFeedback>
          <SearchField onChange={setQuery} style={styles.searchField} value={query}>
            <SearchField.Group style={styles.searchRow}>
              <SearchField.SearchIcon iconProps={{ color: colors.muted, size: 18 }} />
              <SearchField.Input accessibilityLabel="Search saved phrases" placeholder="Search in Hindi or English" placeholderTextColor={colors.muted} style={styles.search} />
              <SearchField.ClearButton iconProps={{ color: colors.muted }} />
            </SearchField.Group>
          </SearchField>
          {filterOptions.length >= 2 ? (
            <SegmentedControl
              accessibilityLabel="Phrase category"
              compact
              onValueChange={setFilter}
              options={[{ label: 'All', value: 'All' as Filter }, ...filterOptions]}
              stackedAtLargeText
              style={styles.segmentedControl}
              value={activeFilter}
            />
          ) : null}
          {!aiConsent && phrases.some((phrase) => !hasOfflineSpeech(phrase.hi)) ? (
            <Pressable accessibilityHint="Opens Settings" accessibilityRole="link" onPress={() => router.push('/settings')} style={styles.consentNote} testID="phrases-consent-note">
              <Text style={styles.consentNoteText}>Some phrases need Asha&apos;s voice to play. <Text style={styles.consentNoteLink}>Turn on AI coaching in Settings</Text></Text>
            </Pressable>
          ) : null}
          <View style={styles.speedSetting}>
            <Text style={styles.speedLabel}>Listen speed</Text>
            {/* One shared speed, like a podcast player, instead of a row of speed chips on every card. */}
            <SegmentedControl
              accessibilityLabel="Playback speed"
              compact
              onValueChange={(value) => updateLearnerProfile({ phrasePlaybackRate: Number(value) })}
              options={speedOptions}
              stackedAtLargeText
              style={styles.segmentedControl}
              testID="phrases-playback-speed"
              value={String(playbackRate)}
            />
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          Platform.OS === 'android' && { paddingTop: insets.top + 18, paddingBottom: insets.bottom + spacing.xxl },
        ]}
        data={visible}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
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
        ) : (
          <View style={styles.noResultsBlock}>
            <Text style={styles.noResults}>No phrases match this search and filter.</Text>
            <PressableFeedback
              accessibilityRole="button"
              onPress={() => { setQuery(''); setFilter('All'); }}
              style={styles.clearFilters}
              testID="phrases-clear-filters"
            >
              <Text style={styles.clearFiltersText}>Show all phrases</Text>
            </PressableFeedback>
          </View>
        )}
        renderItem={({ item }) => {
          const offline = hasOfflineSpeech(item.hi);
          const canListen = aiConsent || offline;
          const review = reviews[item.hi];
          const mastery = review?.mastery ?? 0;
          const isDue = dueSet.has(item.hi);
          return (
            <View style={[styles.card, largeTextLayout && styles.cardLarge]}>
              <View style={[styles.cardMain, largeTextLayout && styles.cardMainLarge]}>
                <View style={styles.copy}>
                  {profile.scriptPreference !== 'latin' && item.hi.trim().toLocaleLowerCase() !== item.latin.trim().toLocaleLowerCase() ? <Text accessibilityLanguage="hi-IN" style={styles.hindi}>{item.hi}</Text> : null}
                  <Text style={styles.latin}>{learnerPhraseLatin(item.hi, item.latin)}</Text>
                  <Text style={styles.english}>{item.en}</Text>
                  <View style={styles.masteryRow}>
                    <MasteryMeter mastery={mastery} />
                    <Text style={[styles.mastery, isDue && styles.masteryDue]}>{isDue ? 'Due now' : `${mastery}/5`}</Text>
                  </View>
                </View>
                <View style={[styles.cardActions, largeTextLayout && styles.cardActionsLarge]}>
                  <PressableFeedback accessibilityHint={canListen ? 'Bundled lesson audio works offline.' : 'Agree to connected AI processing to enable Listen.'} accessibilityLabel={`Hear ${item.hi}`} accessibilityValue={{ text: `${replaySpeeds.find((speed) => speed.rate === playbackRate)?.label ?? 'Normal'} speed` }} accessibilityRole="button" accessibilityState={{ disabled: !canListen }} isDisabled={!canListen} onPress={() => playPhrase(item.hi)} style={[styles.listenButton, !canListen && styles.disabled]} testID="saved-phrase-listen">
                    <Volume2 color={colors.brandText} size={18} />
                  </PressableFeedback>
                  <PressableFeedback accessibilityLabel={`Remove ${item.hi}`} accessibilityRole="button" onPress={() => confirmRemove(item)} style={styles.removeButton}><Trash2 color={colors.muted} size={17} /></PressableFeedback>
                </View>
              </View>
              {audioError && audioPhrase === item.hi ? <Text accessibilityRole="alert" style={styles.error}>{audioError}</Text> : null}
            </View>
          );
        }}
        style={sharedStyles.screen}
        testID="saved-phrase-list"
      />
      <StatusBarScrim />
    </>
  );
}

const useStyles = makeStyles((c) => ({
  content: { width: '100%', alignItems: 'stretch', paddingHorizontal: spacing.gutter, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  separator: { height: spacing.md },
  header: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg },
  headerHero: { width: '100%', alignItems: 'stretch', justifyContent: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  headerHeroLarge: { alignItems: 'stretch' },
  headerRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  headerRowLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  headerTitle: { ...type.display },
  headerSubtitle: { ...type.body, maxWidth: 310, color: c.muted, fontFamily: displayFont, textAlign: 'left' },
  headerSubtitleLarge: { maxWidth: '100%' },
  savedCount: { ...type.caption, color: c.muted, fontVariant: ['lining-nums', 'tabular-nums'], paddingBottom: spacing.xs },
  dueCard: { width: '100%', minHeight: 76, borderRadius: radius.xl, borderCurve: 'continuous', backgroundColor: c.brandSoft, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.lg, paddingLeft: spacing.lg, paddingRight: spacing.lg },
  dueCardLarge: { alignItems: 'flex-start', flexDirection: 'column' },
  dueCount: { color: c.ink, fontFamily: displayFont, fontSize: 44, lineHeight: 48, fontWeight: '700', fontVariant: ['lining-nums', 'tabular-nums'] },  // Exception to the type scale: hero numeral.
  dueCopy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: spacing.xs },
  dueTitle: { ...type.label, color: c.ink, textAlign: 'left' },
  dueBody: { ...type.caption, color: c.muted, textAlign: 'left' },
  dueAction: { ...buttons.primary, minHeight: 44 },
  dueActionText: buttons.primaryText,
  searchField: { width: '100%', alignSelf: 'stretch' },
  searchRow: { width: '100%', minHeight: 48 },
  search: { ...type.body, minWidth: 0, flex: 1, minHeight: 48, borderRadius: radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: c.inputBorder, backgroundColor: c.paperRaised, color: c.ink, paddingVertical: spacing.sm },
  segmentedControl: { width: '100%', alignSelf: 'stretch' },
  error: { ...type.caption, color: c.danger },
  card: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'stretch', backgroundColor: c.paperRaised, borderRadius: radius.lg, borderCurve: 'continuous', gap: spacing.md, paddingVertical: spacing.lg, paddingLeft: spacing.lg, paddingRight: spacing.lg },
  cardLarge: { gap: spacing.md },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardMainLarge: { flexDirection: 'column', alignItems: 'stretch' },
  cardActions: { alignItems: 'center', gap: spacing.xs },
  cardActionsLarge: { flexDirection: 'row', justifyContent: 'flex-end' },
  listenButton: { width: 44, height: 44, minHeight: 44, borderRadius: radius.pill, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  removeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  copy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: spacing.xs },
  hindi: { ...hindiType(20), color: c.ink, textAlign: 'left' },
  latin: { ...type.label, color: c.brand, textAlign: 'left' },
  english: { ...type.caption, color: c.muted, textAlign: 'left' },
  masteryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start', gap: spacing.sm, paddingTop: spacing.sm },
  masteryMeter: { flexDirection: 'row', gap: spacing.xs },
  masterySegment: { width: 18, height: 4, borderRadius: radius.pill, backgroundColor: c.track },
  masterySegmentFilled: { backgroundColor: c.forest },
  mastery: { ...type.caption, color: c.muted, fontVariant: ['lining-nums', 'tabular-nums'], fontWeight: '600' },
  masteryDue: { color: c.brandText },
  speedSetting: { width: '100%', gap: spacing.sm },
  speedLabel: { ...type.caption, color: c.muted, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, paddingTop: spacing.xxl },
  emptyBody: { ...type.body, color: c.muted, textAlign: 'center' },
  emptyAction: { ...buttons.primary, minWidth: 180 },
  emptyActionText: buttons.primaryText,
  consentNote: { minHeight: 44, justifyContent: 'center' },
  consentNoteText: { ...type.caption, color: c.muted },
  consentNoteLink: { color: c.brandText, fontWeight: '700', textDecorationLine: 'underline' },
  noResultsBlock: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  noResults: { ...type.body, color: c.muted, textAlign: 'center' },
  clearFilters: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg },
  clearFiltersText: { ...type.label, color: c.brandText, fontWeight: '700' },
}));
