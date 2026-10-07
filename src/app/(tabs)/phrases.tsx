import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { PressableFeedback } from 'heroui-native/pressable-feedback';
import { SearchField } from 'heroui-native/search-field';
import { BookOpen, Trash2, Volume2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/segmented-control';
import { JournalDisplay } from '@/components/journal-chrome';
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
import { displayFont, hindiType, makeStyles, maxContentWidth, radius, spacing, useSharedStyles, useTheme } from '@/theme';
import { StatusBarScrim } from '@/components/status-bar-scrim';

type Filter = 'All' | SceneCategory;

const replaySpeeds = [
  { label: '0.1×', rate: 0.1 },
  { label: '0.25×', rate: 0.25 },
  { label: '0.5×', rate: 0.5 },
  { label: '0.75×', rate: 0.75 },
  { label: '1×', rate: 1 },
] as const;
const speedOptions = replaySpeeds.map(({ label, rate }) => ({ accessibilityLabel: rate === 1 ? 'Normal' : label, label, value: String(rate) }));

const phraseCategories = new Map<string, SceneCategory>();
for (const scene of scenes) {
  for (const beat of scene.beats) {
    for (const choice of beat.choices) phraseCategories.set(choice.hi, scene.category);
  }
}

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

  const playbackRate = profile.phrasePlaybackRate ?? 1;

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
          <PressableFeedback accessibilityLabel={`Review ${due.length} phrases due today`} accessibilityRole="button" onPress={() => router.push('/review' as Href)} style={[styles.dueCard, largeTextLayout && styles.dueCardLarge]}>
            <Text style={styles.dueCount}>{due.length}</Text>
            <View style={styles.dueCopy}>
              <Text style={styles.dueTitle}>Ready for review</Text>
              <Text style={styles.dueBody}>{due.length ? `A quick practice keeps ${due.length} phrase${due.length === 1 ? '' : 's'} fresh.` : 'Everything is reviewed for today.'}</Text>
            </View>
            <View style={styles.dueAction}><Text style={styles.dueActionText}>Review</Text></View>
          </PressableFeedback>
          <SearchField onChange={setQuery} style={styles.searchField} value={query}>
            <SearchField.Group style={styles.searchRow}>
              <SearchField.SearchIcon iconProps={{ color: colors.muted, size: 18 }} />
              <SearchField.Input accessibilityLabel="Search saved phrases" placeholder="Search in Hindi or English" placeholderTextColor={colors.muted} style={styles.search} />
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
        ) : <Text style={styles.noResults}>No phrases match this search and filter.</Text>}
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
                  <PressableFeedback accessibilityHint={canListen ? 'Bundled lesson audio works offline.' : 'Agree to connected AI processing to enable Listen.'} accessibilityLabel={`Hear ${item.hi}`} accessibilityValue={{ text: playbackRate === 1 ? 'Normal speed' : `${playbackRate}× speed` }} accessibilityRole="button" accessibilityState={{ disabled: !canListen }} isDisabled={!canListen} onPress={() => playPhrase(item.hi)} style={[styles.listenButton, !canListen && styles.disabled]} testID="saved-phrase-listen">
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
  content: { width: '100%', alignItems: 'stretch', paddingHorizontal: 20, paddingTop: 18, paddingBottom: spacing.xxl },
  separator: { height: spacing.md },
  header: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg },
  headerHero: { width: '100%', alignItems: 'stretch', justifyContent: 'center', gap: 2, paddingTop: spacing.sm },
  headerHeroLarge: { alignItems: 'stretch' },
  headerRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  headerRowLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  headerTitle: { fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  headerSubtitle: { maxWidth: 310, color: c.muted, fontFamily: displayFont, fontSize: 16, lineHeight: 22, textAlign: 'left' },
  headerSubtitleLarge: { maxWidth: '100%' },
  savedCount: { color: c.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'], paddingBottom: 4 },
  dueCard: { width: '100%', minHeight: 76, borderRadius: radius.xl, borderCurve: 'continuous', backgroundColor: c.gold, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: spacing.lg, paddingLeft: 18, paddingRight: spacing.lg },
  dueCardLarge: { alignItems: 'flex-start', flexDirection: 'column' },
  dueCount: { color: c.ink, fontFamily: displayFont, fontSize: 44, lineHeight: 48, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dueCopy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 2 },
  dueTitle: { color: c.ink, fontSize: 16, lineHeight: 21, fontWeight: '600', textAlign: 'left' },
  dueBody: { color: c.goldDeepText, fontSize: 13, lineHeight: 18, textAlign: 'left' },
  dueAction: { minHeight: 44, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: c.ink, paddingHorizontal: spacing.lg },
  dueActionText: { color: c.white, fontSize: 14, fontWeight: '600' },
  searchField: { width: '100%', alignSelf: 'stretch' },
  searchRow: { width: '100%', minHeight: 48 },
  search: { minWidth: 0, flex: 1, minHeight: 48, borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: c.line, backgroundColor: c.paperRaised, color: c.ink, fontSize: 15, paddingVertical: spacing.sm },
  segmentedControl: { width: '100%', alignSelf: 'stretch' },
  error: { color: c.danger, fontSize: 13, lineHeight: 18 },
  card: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', alignItems: 'stretch', backgroundColor: c.paperRaised, borderRadius: radius.lg, borderCurve: 'continuous', gap: spacing.md, paddingVertical: 14, paddingLeft: spacing.lg, paddingRight: 14 },
  cardLarge: { gap: spacing.md },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardMainLarge: { flexDirection: 'column', alignItems: 'stretch' },
  cardActions: { alignItems: 'center', gap: spacing.xs },
  cardActionsLarge: { flexDirection: 'row', justifyContent: 'flex-end' },
  listenButton: { width: 44, height: 44, minHeight: 44, borderRadius: radius.pill, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  removeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  copy: { minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 2 },
  hindi: { ...hindiType(21), color: c.ink, textAlign: 'left' },
  latin: { color: c.brand, fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'left' },
  english: { color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'left' },
  masteryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-start', gap: spacing.sm, paddingTop: 6 },
  masteryMeter: { flexDirection: 'row', gap: 4 },
  masterySegment: { width: 18, height: 4, borderRadius: radius.pill, backgroundColor: c.track },
  masterySegmentFilled: { backgroundColor: c.forest },
  mastery: { color: c.muted, fontSize: 12, lineHeight: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  masteryDue: { color: c.brandText },
  speedSetting: { width: '100%', gap: spacing.sm },
  speedLabel: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xl, paddingTop: spacing.xxl },
  emptyBody: { color: c.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  emptyAction: { minWidth: 180, minHeight: 48, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  emptyActionText: { color: c.white, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  noResults: { color: c.muted, fontSize: 15, textAlign: 'center', padding: spacing.xl },
}));
