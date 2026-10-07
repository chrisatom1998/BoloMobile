import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import { useHindiWordSource } from '@/hooks/use-hindi-word-source';
import { hindiSourcePhrase, hindiWordTokens, MAX_WORD_DEFINITION_SOURCE_CHARACTERS } from '@/lib/contextual-word-definition';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { alignedHindiWordLabels, displayHindiTranscript } from '@/lib/learner-phrase-display';
import { getContextualWordDefinition } from '@/services/bolo-api';
import type { ScriptPreference } from '@/state/app-state-types';
import { hindiType, makeStyles, radius, spacing } from '@/theme';

type DefinitionState = {
  explanation?: string;
  error?: string;
  loading?: boolean;
};

export function WordDefinitionSheet({
  clientId,
  initialWord,
  onClose,
  phrase,
  reducedMotion = false,
  scriptPreference = 'both',
  visible,
}: {
  clientId: string;
  initialWord?: string | null;
  onClose: () => void;
  phrase: string;
  reducedMotion?: boolean;
  scriptPreference?: ScriptPreference;
  visible: boolean;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [excerpt, setExcerpt] = useState({ original: '', draft: '', submitted: '' });
  const currentExcerpt = excerpt.original === phrase ? excerpt : { original: phrase, draft: phrase, submitted: '' };
  const resolutionPhrase = currentExcerpt.submitted || phrase;
  const { source: sourcePhrase, error: sourceError, needsExcerpt, loading: sourceLoading, retry: retrySource } = useHindiWordSource(clientId, resolutionPhrase, visible);
  const originalSource = hindiSourcePhrase(phrase);
  const originalLimit = originalSource ? MAX_WORD_DEFINITION_SOURCE_CHARACTERS : 500;
  const excerptLimit = hindiSourcePhrase(currentExcerpt.draft) ? MAX_WORD_DEFINITION_SOURCE_CHARACTERS : 500;
  const showExcerptEditor = !sourcePhrase && (originalSource || phrase.trim()).length > originalLimit;
  const words = useMemo(() => hindiWordTokens(sourcePhrase), [sourcePhrase]);
  const requestRef = useRef<AbortController | null>(null);
  const requestWordRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const autoExplainedRef = useRef<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, DefinitionState>>({});
  const definitionsRef = useRef(definitions);
  definitionsRef.current = definitions;

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    requestWordRef.current = null;
    requestIdRef.current += 1;
    autoExplainedRef.current = null;
    setSelectedWord(null);
    setDefinitions({});
  }, [sourcePhrase, visible]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const explain = useCallback(async (word: string) => {
    setSelectedWord(word);
    const cached = definitionsRef.current[word];
    if (cached?.explanation || (cached?.loading && requestWordRef.current === word)) return;

    const abortedWord = requestWordRef.current;
    requestRef.current?.abort();
    requestRef.current = null;
    requestWordRef.current = null;
    if (abortedWord) {
      setDefinitions((current) => {
        if (!current[abortedWord]?.loading) return current;
        const next = { ...current };
        delete next[abortedWord];
        return next;
      });
    }
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    requestRef.current = controller;
    requestWordRef.current = word;
    setDefinitions((current) => ({ ...current, [word]: { loading: true } }));
    try {
      const explanation = await getContextualWordDefinition({ clientId, phrase: sourcePhrase, word }, controller.signal);
      if (controller.signal.aborted || requestIdRef.current !== requestId) return;
      setDefinitions((current) => ({ ...current, [word]: { explanation } }));
    } catch (cause) {
      if (controller.signal.aborted || requestIdRef.current !== requestId) return;
      setDefinitions((current) => ({
        ...current,
        [word]: { error: cause instanceof Error ? cause.message : 'Bolo could not explain that word. Please try again.' },
      }));
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        requestWordRef.current = null;
      }
    }
  }, [clientId, sourcePhrase]);

  const selectedDefinition = selectedWord ? definitions[selectedWord] : undefined;
  const romanization = sourcePhrase ? (hindiSourcePhrase(resolutionPhrase) ? displayHindiTranscript(sourcePhrase) : displayHindiTranscript(resolutionPhrase)) : '';
  const wordLabels = useMemo(() => alignedHindiWordLabels(sourcePhrase, romanization), [romanization, sourcePhrase]);
  const displaySource = scriptPreference === 'latin' ? romanization : sourcePhrase;
  const showRomanization = scriptPreference === 'both' && romanization;
  const displayWord = useCallback((word: string) => scriptPreference === 'latin' ? wordLabels.get(word) || romanizeDevanagari(word) : word, [scriptPreference, wordLabels]);

  useEffect(() => {
    if (!visible || !initialWord || !words.includes(initialWord)) return;
    if (autoExplainedRef.current === initialWord) return;
    autoExplainedRef.current = initialWord;
    void explain(initialWord);
  }, [explain, initialWord, visible, words]);

  return (
    <Modal animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <View style={styles.screen}>
        <View style={[styles.header, Platform.OS === 'android' && { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Word by word</Text>
            <Text style={styles.title}>Unpack the Hindi.</Text>
          </View>
          <Pressable accessibilityLabel="Close word meanings" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, Platform.OS === 'android' && { paddingBottom: insets.bottom + spacing.xxl }]}>
          <View style={styles.sourceCard}>
            <Text style={styles.sourceLabel}>Source phrase</Text>
            <Text selectable style={[styles.sourcePhrase, scriptPreference !== 'latin' && sourcePhrase ? styles.sourcePhraseHindi : null]}>{displaySource || (sourceLoading ? 'Preparing the Hindi words…' : sourceError ? 'Hindi words are not ready yet.' : 'No Hindi words were found in this message.')}</Text>
            {sourceError ? <>
              <Text accessibilityRole="alert" style={styles.error}>{sourceError}</Text>
              {!needsExcerpt ? <Pressable accessibilityLabel="Retry preparing Hindi words" accessibilityRole="button" onPress={retrySource} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable> : null}
            </> : null}
            {showExcerptEditor ? <View style={styles.excerptEditor}>
              <Text style={styles.sourceLabel}>Keep the words you want to explore</Text>
              <TextInput accessibilityLabel="Hindi excerpt for word meanings" multiline onChangeText={(draft) => setExcerpt({ ...currentExcerpt, draft })} style={styles.excerptInput} value={currentExcerpt.draft} />
              <Text style={styles.guidance}>{currentExcerpt.draft.trim().length}/{excerptLimit} characters</Text>
              <Pressable accessibilityLabel="Prepare words from excerpt" accessibilityRole="button" accessibilityState={{ disabled: sourceLoading || !currentExcerpt.draft.trim() || currentExcerpt.draft.trim().length > excerptLimit }} disabled={sourceLoading || !currentExcerpt.draft.trim() || currentExcerpt.draft.trim().length > excerptLimit} onPress={() => setExcerpt({ ...currentExcerpt, submitted: currentExcerpt.draft.trim() })} style={styles.retryButton}><Text style={styles.retryText}>Prepare words</Text></Pressable>
            </View> : null}
            {showRomanization ? <Text selectable style={styles.romanization}>{romanization}</Text> : null}
          </View>

          {words.length ? (
            <View style={styles.tray}>
              <Text style={styles.trayLabel}>Tap a Hindi word</Text>
              <View style={styles.tokenWrap}>
                {words.map((word) => {
                  const selected = word === selectedWord;
                  return (
                    <Pressable
                      accessibilityLabel={`Explain ${displayWord(word)}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      key={word}
                      onPress={() => void explain(word)}
                      style={[styles.token, selected && styles.tokenSelected]}
                    >
                      <Text style={[styles.tokenText, scriptPreference !== 'latin' && styles.tokenHindi, selected && styles.tokenTextSelected]}>{displayWord(word)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {selectedWord ? (
            <View accessibilityLiveRegion="polite" style={styles.definitionCard}>
              <Text style={styles.definitionLabel}>In this phrase, {displayWord(selectedWord)}</Text>
              {selectedDefinition?.loading ? <Text style={styles.definitionBody}>Finding the useful meaning…</Text> : null}
              {selectedDefinition?.explanation ? <Text selectable style={styles.definitionBody}>{selectedDefinition.explanation}</Text> : null}
              {selectedDefinition?.error ? (
                <>
                  <Text accessibilityRole="alert" style={styles.error}>{selectedDefinition.error}</Text>
                  <Pressable accessibilityLabel={`Retry explanation for ${displayWord(selectedWord)}`} accessibilityRole="button" onPress={() => void explain(selectedWord)} style={styles.retryButton}>
                    <Text style={styles.retryText}>Try again</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : <Text style={styles.guidance}>Choose a Hindi word above. English stays here in the explanation, not in the word tray.</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderBottomColor: c.line, borderBottomWidth: 1, backgroundColor: c.paperRaised, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerCopy: { minWidth: 0, flex: 1, gap: 2 },
  eyebrow: { color: c.brandText, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: c.ink, fontFamily: 'Georgia', fontSize: 25, lineHeight: 31, fontWeight: '700' },
  closeButton: { minWidth: 52, minHeight: 44, borderRadius: radius.pill, backgroundColor: c.night, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  closeText: { color: c.white, fontSize: 14, fontWeight: '900' },
  content: { gap: spacing.lg, padding: spacing.lg, paddingBottom: spacing.xxl },
  sourceCard: { gap: spacing.xs, borderRadius: radius.lg, borderCurve: 'continuous', borderColor: c.line, borderWidth: 1, backgroundColor: c.paperRaised, padding: spacing.lg },
  excerptEditor: { gap: spacing.sm },
  excerptInput: { minHeight: 120, maxHeight: 240, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, color: c.ink, padding: spacing.sm, fontSize: 16 },
  sourceLabel: { color: c.forestText, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  sourcePhrase: { color: c.ink, fontSize: 24, lineHeight: 34, fontWeight: '800' },
  sourcePhraseHindi: hindiType(26),
  romanization: { color: c.muted, fontSize: 16, lineHeight: 23, fontWeight: '700' },
  tray: { gap: spacing.sm },
  trayLabel: { color: c.ink, fontSize: 17, lineHeight: 24, fontWeight: '900' },
  tokenWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  token: { minHeight: 48, borderRadius: radius.pill, borderCurve: 'continuous', borderColor: c.brand, borderWidth: 1, backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tokenSelected: { backgroundColor: c.brand },
  tokenText: { color: c.brandText, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  tokenHindi: hindiType(19),
  tokenTextSelected: { color: c.white },
  definitionCard: { gap: spacing.sm, borderRadius: radius.lg, borderCurve: 'continuous', backgroundColor: c.forestSoft, borderColor: c.forest, borderWidth: 1, padding: spacing.lg },
  definitionLabel: { color: c.forestText, fontSize: 15, lineHeight: 21, fontWeight: '900' },
  definitionBody: { color: c.ink, fontSize: 18, lineHeight: 27 },
  guidance: { color: c.muted, fontSize: 15, lineHeight: 22 },
  error: { color: c.danger, fontSize: 15, lineHeight: 21 },
  retryButton: { alignSelf: 'flex-start', minHeight: 44, borderRadius: radius.pill, backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  retryText: { color: c.forestText, fontSize: 14, fontWeight: '900' },
}));
