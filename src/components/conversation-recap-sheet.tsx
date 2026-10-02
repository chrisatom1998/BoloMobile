import { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLargeTextLayout } from '@/hooks/use-large-text-layout';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import { makeStyles, maxContentWidth, radius, spacing, useTheme } from '@/theme';
import type { RecapCorrection } from '../../shared/conversation-recap';

export type RecapSheetState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; corrections: RecapCorrection[] };

type Props = {
  state: RecapSheetState;
  onClose: () => void;
  onRetry: () => void;
  onDismiss: (sourceId: string) => void;
  onSave: (correction: RecapCorrection) => void;
  savedPhraseKeys: string[];
  reducedMotion?: boolean;
};

/** Presentation only: fetching, saving, and any learning history belong to the parent. */
export function ConversationRecapSheet({ state, onClose, onRetry, onDismiss, onSave, savedPhraseKeys, reducedMotion = false }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const largeText = useLargeTextLayout();
  const [focusedSourceId, setFocusedSourceId] = useState<string | null>(null);
  const corrections = state.status === 'ready' ? state.corrections.slice(0, 3) : [];
  const focusedIndex = corrections.findIndex((correction) => correction.sourceId === focusedSourceId);
  const focusedCorrection = corrections[focusedIndex];

  // Clear a removed selection during this render, so re-added sources do not reopen practice.
  if (focusedSourceId !== null && !focusedCorrection) setFocusedSourceId(null);

  return (
    <Modal
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      testID="conversation-recap-modal"
      visible
    >
      <View accessibilityViewIsModal onAccessibilityEscape={onClose} style={[styles.screen, Platform.OS === 'android' && { paddingTop: insets.top }]}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(spacing.xxl, insets.bottom + spacing.lg) }]}
          key={focusedCorrection ? focusedCorrection.sourceId : 'recap'}
          testID="conversation-recap-scroll"
        >
          <View style={[styles.header, largeText && styles.headerLarge]}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>A little more natural</Text>
              <Text accessibilityRole="header" style={styles.title}>{focusedCorrection ? 'Practise from memory' : 'Conversation recap'}</Text>
            </View>
            <Pressable accessibilityLabel="Close conversation recap" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {focusedCorrection ? (
            <RecapPractice correction={focusedCorrection} index={focusedIndex + 1} key={focusedCorrection.sourceId} onBack={() => setFocusedSourceId(null)} />
          ) : (
            <>
              <Text style={styles.instructions}>These suggestions come from the transcript. Transcription can be wrong or miss your last words; dismiss anything that does not match what you said.</Text>
              <Text style={styles.hint}>Only phrases you save will be kept for review. This recap is temporary.</Text>

              {state.status === 'loading' ? (
                <View accessibilityLiveRegion="polite" style={styles.statusCard}>
                  <ActivityIndicator accessibilityLabel="Preparing conversation recap" color={colors.forest} />
                  <Text style={styles.body}>Preparing your recap…</Text>
                  <Text style={styles.hint}>You can close this whenever you like.</Text>
                </View>
              ) : null}

              {state.status === 'error' ? (
                <View style={styles.statusCard}>
                  <Text accessibilityRole="header" style={styles.cardTitle}>Could not prepare your recap</Text>
                  <Text accessibilityRole="alert" style={styles.body}>{state.message}</Text>
                  <Pressable accessibilityLabel="Retry conversation recap" accessibilityRole="button" onPress={onRetry} style={styles.primaryButton}>
                    <Text style={styles.primaryText}>Try again</Text>
                  </Pressable>
                </View>
              ) : null}

              {state.status === 'ready' && corrections.length === 0 ? (
                <View accessibilityLiveRegion="polite" style={styles.statusCard}>
                  <Text accessibilityRole="header" style={styles.cardTitle}>No suggestions this time</Text>
                  <Text style={styles.body}>There are no suggestions to review in this recap.</Text>
                </View>
              ) : null}

              {corrections.map((correction, index) => {
                const number = index + 1;
                const saved = savedPhraseKeys.includes(correction.hi.trim().toLowerCase());
                return (
                  <View key={correction.sourceId} style={styles.card}>
                    <Text style={styles.eyebrow}>Suggestion {number} of {corrections.length}</Text>
                    <View style={styles.copyGroup}>
                      <Text style={styles.label}>From the transcript</Text>
                      <Text selectable style={styles.original}>{romanizeDevanagari(correction.original)}</Text>
                    </View>
                    <View style={styles.suggestion}>
                      <Text accessibilityRole="header" style={styles.cardTitle}>Suggested wording</Text>
                      <Text selectable style={styles.latin}>{correction.latin}</Text>
                      <Text selectable style={styles.hindi}>{correction.hi}</Text>
                      <Text selectable style={styles.body}>{correction.en}</Text>
                    </View>
                    <Text style={styles.body}>{correction.explanation}</Text>
                    <View style={styles.actions}>
                      <Pressable accessibilityLabel={`Practise suggestion ${number}: ${correction.latin}`} accessibilityRole="button" onPress={() => setFocusedSourceId(correction.sourceId)} style={styles.primaryButton}>
                        <Text style={styles.primaryText}>Practise now</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={saved ? `Suggestion ${number} saved for review: ${correction.latin}` : `Save suggestion ${number} for review: ${correction.latin}`}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: saved }}
                        disabled={saved}
                        onPress={() => onSave(correction)}
                        style={[styles.secondaryButton, saved && styles.savedButton]}
                      >
                        <Text style={styles.secondaryText}>{saved ? 'Saved' : 'Save for review'}</Text>
                      </Pressable>
                      <Pressable accessibilityLabel={`Dismiss suggestion ${number}`} accessibilityRole="button" onPress={() => onDismiss(correction.sourceId)} style={styles.quietButton}>
                        <Text style={styles.quietText}>Dismiss</Text>
                      </Pressable>
                      <Pressable accessibilityLabel={`Transcription was wrong for suggestion ${number}`} accessibilityRole="button" onPress={() => onDismiss(correction.sourceId)} style={styles.quietButton}>
                        <Text style={styles.quietText}>Transcription was wrong</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** A local self-check with no grading, implicit saving, recording, or network work. */
function RecapPractice({ correction, index, onBack }: { correction: RecapCorrection; index: number; onBack: () => void }) {
  const styles = useStyles();
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.practice}>
      <Text style={styles.instructions}>Read the English cue and try recalling the Hindi in your head. Reveal it when you are ready to check.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>English cue</Text>
        <Text selectable style={styles.cue}>{correction.en}</Text>
      </View>
      {revealed ? (
        <View accessibilityLiveRegion="polite" style={styles.suggestion}>
          <Text accessibilityRole="header" style={styles.cardTitle}>Suggested wording</Text>
          <Text selectable style={styles.latin}>{correction.latin}</Text>
          <Text selectable style={styles.hindi}>{correction.hi}</Text>
          <Text style={styles.body}>Compare this wording with what you recalled.</Text>
        </View>
      ) : <Text style={styles.hint}>The wording is hidden while you recall it.</Text>}
      {revealed ? (
        <Pressable accessibilityLabel={`Try suggestion ${index} again`} accessibilityRole="button" onPress={() => setRevealed(false)} style={styles.primaryButton}>
          <Text style={styles.primaryText}>Try again</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityLabel={`Reveal Hindi for suggestion ${index}`} accessibilityRole="button" onPress={() => setRevealed(true)} style={styles.primaryButton}>
          <Text style={styles.primaryText}>Reveal wording</Text>
        </Pressable>
      )}
      <Pressable accessibilityLabel="Back to recap" accessibilityRole="button" onPress={onBack} style={styles.secondaryButton}>
        <Text style={styles.secondaryText}>Back to recap</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', gap: spacing.lg, padding: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerLarge: { flexDirection: 'column', alignItems: 'stretch' },
  headerCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  eyebrow: { color: c.forestText, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: c.ink, fontFamily: 'Georgia', fontSize: 28, lineHeight: 35, fontWeight: '700' },
  closeButton: { minWidth: 44, minHeight: 44, borderRadius: radius.pill, backgroundColor: c.night, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexShrink: 1 },
  closeText: { color: c.white, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  instructions: { color: c.muted, fontSize: 15, lineHeight: 23 },
  hint: { color: c.muted, fontSize: 13, lineHeight: 20 },
  statusCard: { gap: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1 },
  card: { gap: spacing.lg, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1 },
  copyGroup: { gap: spacing.xs },
  label: { color: c.muted, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  original: { color: c.ink, fontSize: 17, lineHeight: 26 },
  suggestion: { gap: spacing.sm, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.lg, backgroundColor: c.forestSoft },
  cardTitle: { color: c.forestText, fontSize: 15, lineHeight: 22, fontWeight: '900' },
  latin: { color: c.ink, fontSize: 22, lineHeight: 31, fontWeight: '800' },
  hindi: { color: c.ink, fontSize: 20, lineHeight: 31 },
  body: { color: c.ink, fontSize: 15, lineHeight: 23 },
  actions: { gap: spacing.sm },
  primaryButton: { minHeight: 48, minWidth: 44, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  primaryText: { color: c.white, fontSize: 16, lineHeight: 23, fontWeight: '900', textAlign: 'center' },
  secondaryButton: { minHeight: 48, minWidth: 44, borderRadius: radius.md, borderCurve: 'continuous', borderColor: c.forest, borderWidth: 1, backgroundColor: c.paperRaised, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  secondaryText: { color: c.forestText, fontSize: 16, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
  savedButton: { backgroundColor: c.forestSoft, borderColor: c.line },
  quietButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  quietText: { color: c.muted, fontSize: 14, lineHeight: 21, fontWeight: '700', textAlign: 'center' },
  practice: { gap: spacing.lg },
  cue: { color: c.ink, fontSize: 24, lineHeight: 33, fontWeight: '800' },
}));
