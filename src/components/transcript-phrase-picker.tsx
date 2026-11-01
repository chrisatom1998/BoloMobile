import { X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSheetDismiss } from '@/components/sheet-exit';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { prepareSavedPhraseFromText } from '@/services/bolo-api';
import type { ChatMessage, SavedPhrase, StructuredPhrase } from '@/state/app-state-types';
import { legacyTranscriptDisplay } from '@/lib/learner-phrase-display';
import { makeStyles, radius, spacing, useTheme, type, buttons } from '@/theme';

type TranscriptPhrasePickerProps = {
  aiConsent: boolean;
  clientId: string;
  message: ChatMessage;
  onClose: () => void;
  /** Fires once the close animation has finished and the sheet can unmount. */
  onDismissed?: () => void;
  onSave: (phrase: SavedPhrase) => void;
  /** Canonical phrase from a structured Asha reply; fills all three fields so the learner can save at once. */
  prefill?: StructuredPhrase;
  reducedMotion?: boolean;
  selectedText?: string;
  sourceText?: string;
  visible?: boolean;
};

export function TranscriptPhrasePicker({ aiConsent, clientId, message, onClose, onDismissed, onSave, prefill, reducedMotion = false, selectedText: highlightedText, sourceText: initialSourceText, visible = true }: TranscriptPhrasePickerProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const initialText = prefill?.romanized.trim() || highlightedText?.trim() || legacyTranscriptDisplay(message.text.trim(), { normalizeKnown: message.role === 'asha' && message.language === 'hi', scriptPreference: 'latin' }).displayText;
  const initialSource = prefill?.devanagari.trim() || initialSourceText?.trim() || '';
  const [selectedText, setSelectedText] = useState(initialText);
  const [sourceText, setSourceText] = useState(initialSource);
  const [hindi, setHindi] = useState(prefill?.devanagari.trim() ?? '');
  const [latin, setLatin] = useState(prefill?.romanized.trim() ?? '');
  const [english, setEnglish] = useState(prefill?.english.trim() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);
  const savedSessionRef = useRef(-1);
  const scrollRef = useRef<ScrollView>(null);
  const [saving, setSaving] = useState(false);
  const finishDismiss = useSheetDismiss(visible, onDismissed);
  const openKey = `${message.id}\0${initialText}\0${initialSource}\0${prefill ? JSON.stringify(prefill) : ''}`;
  const [formSession, setFormSession] = useState({ key: openKey, open: visible, epoch: 0 });
  if (visible && (formSession.key !== openKey || !formSession.open)) {
    setFormSession({ key: openKey, open: true, epoch: formSession.epoch + 1 });
    setSaving(false);
    setBusy(false);
    setError('');
    setSelectedText(initialText);
    setSourceText(initialSource);
    setHindi(prefill?.devanagari.trim() ?? '');
    setLatin(prefill?.romanized.trim() ?? '');
    setEnglish(prefill?.english.trim() ?? '');
  } else if (!visible && formSession.open) {
    setFormSession({ ...formSession, open: false });
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, []);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, [formSession.epoch]);

  async function preparePhrase() {
    const text = selectedText.trim();
    if (!aiConsent || !text || busy || requestRef.current) return;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const phrase = await prepareSavedPhraseFromText({
        clientId,
        text,
        ...(sourceText ? { sourceText } : {}),
        ...(message.language === 'hi' && text === initialText && !/[\u0900-\u097f]/u.test(text) && !/[\u0900-\u097f]/u.test(sourceText) ? { preserveRomanizedText: true } : {}),
      }, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setLatin(phrase.latin);
      setHindi(phrase.hi);
      setEnglish(phrase.en);
      Keyboard.dismiss();
    } catch (cause) {
      if (mountedRef.current && !controller.signal.aborted) {
        const reason = cause instanceof Error ? cause.message : 'Bolo could not prepare that phrase.';
        setError(`${reason} You can fill the three fields below and save manually.`);
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (mountedRef.current) setBusy(false);
      }
    }
  }

  function close() {
    requestRef.current?.abort();
    requestRef.current = null;
    onClose();
  }

  function save() {
    const normalizedLatin = latin.trim();
    const normalizedEnglish = english.trim();
    const normalizedHindi = hindi.trim();
    if (savedSessionRef.current === formSession.epoch || !normalizedHindi || !normalizedLatin || !normalizedEnglish || busy) return;
    savedSessionRef.current = formSession.epoch;
    setSaving(true);
    onSave({ hi: normalizedHindi, latin: normalizedLatin, en: normalizedEnglish });
  }

  const canPrepare = aiConsent && selectedText.trim().length > 0 && !busy;
  const canSave = !saving && hindi.trim().length > 0 && latin.trim().length > 0 && english.trim().length > 0 && !busy;

  return (
    <Modal animationType={reducedMotion ? 'fade' : 'slide'} onDismiss={finishDismiss} onRequestClose={close} presentationStyle="pageSheet" visible={visible}>
      <View style={[styles.screen, Platform.OS === 'android' && { paddingTop: insets.top }]}>
        <ScrollView ref={scrollRef} automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Saved phrases</Text>
              <Text accessibilityRole="header" style={styles.title}>Choose a phrase</Text>
            </View>
            <Pressable accessibilityLabel="Close phrase picker" accessibilityRole="button" onPress={close} style={styles.closeButton}>
              <X color={colors.ink} size={21} />
            </Pressable>
          </View>

          <Text style={styles.instructions}>{prefill
            ? 'Asha’s phrase is filled in below. Check the three fields, then save.'
            : highlightedText?.trim()
              ? 'Only the words you highlighted were copied here. Adjust them if needed, then let Bolo prepare the phrase details.'
              : 'Highlight words in chat before tapping Save, or trim the transcript here. Bolo will add a Romanized Hindi version and English meaning.'}</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Selected transcript text</Text>
            <TextInput
              accessibilityLabel="Selected transcript text"
              maxLength={500}
              multiline
              onChangeText={(value) => {
                requestRef.current?.abort();
                requestRef.current = null;
                setBusy(false);
                setSelectedText(value);
                setSourceText('');
                setHindi('');
                setLatin('');
                setEnglish('');
                setError('');
              }}
              style={[styles.input, styles.sourceInput]}
              value={selectedText}
            />
          </View>

          <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: !canPrepare }} disabled={!canPrepare} onPress={() => void preparePhrase()} style={[styles.prepareButton, !canPrepare && styles.disabled]}>
            <Text style={styles.prepareButtonText}>{busy ? 'Preparing…' : 'Add Romanized + English'}</Text>
          </Pressable>
          {!aiConsent ? <Text style={styles.hint}>Connected AI consent is required to fill phrase details automatically.</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Hindi</Text>
            <TextInput accessibilityLabel="Hindi phrase" maxLength={500} onChangeText={setHindi} onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })} placeholder="उदाहरण: आप कैसे हैं?" placeholderTextColor={colors.muted} style={styles.input} value={hindi} />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Romanized Hindi</Text>
            <TextInput accessibilityLabel="Romanized Hindi phrase" maxLength={500} onChangeText={setLatin} onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })} placeholder="Example: Aap kaise hain?" placeholderTextColor={colors.muted} style={styles.input} value={latin} />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>English meaning</Text>
            <TextInput accessibilityLabel="English phrase meaning" maxLength={500} onChangeText={setEnglish} onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })} placeholder="Example: How are you?" placeholderTextColor={colors.muted} style={styles.input} value={english} />
          </View>

        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) }]}>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={save} style={[styles.saveButton, !canSave && styles.disabled]}>
            <Text style={styles.saveButtonText}>Save phrase</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { gap: spacing.lg, padding: spacing.xl, paddingBottom: spacing.xxl },
  footer: { borderTopColor: c.line, borderTopWidth: 1, backgroundColor: c.paperRaised, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  eyebrow: { ...type.eyebrow, color: c.brandDark },
  title: { ...type.display, color: c.ink },
  closeButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  instructions: { ...type.body, color: c.muted },
  fieldGroup: { gap: spacing.sm },
  label: { ...type.caption, color: c.ink, fontWeight: '700' },
  input: { ...type.body, minHeight: 52, borderRadius: radius.md, borderCurve: 'continuous', borderColor: c.inputBorder, borderWidth: 1, backgroundColor: c.paperRaised, color: c.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  sourceInput: { minHeight: 112, textAlignVertical: 'top' },
  prepareButton: buttons.primary,
  prepareButtonText: buttons.primaryText,
  hint: { ...type.caption, color: c.muted },
  error: { ...type.caption, color: c.danger },
  saveButton: { minHeight: 54, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  saveButtonText: { ...type.label, color: c.white, fontWeight: '700' },
  disabled: { opacity: 0.45 },
}));
