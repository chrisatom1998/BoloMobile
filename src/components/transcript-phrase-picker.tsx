import { X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { prepareSavedPhraseFromText } from '@/services/bolo-api';
import type { ChatMessage, SavedPhrase } from '@/state/app-state-types';
import { colors, radius, spacing } from '@/theme';

type TranscriptPhrasePickerProps = {
  aiConsent: boolean;
  clientId: string;
  message: ChatMessage;
  onClose: () => void;
  onSave: (phrase: SavedPhrase) => void;
};

export function TranscriptPhrasePicker({ aiConsent, clientId, message, onClose, onSave }: TranscriptPhrasePickerProps) {
  const [selectedText, setSelectedText] = useState(message.text.trim());
  const [hindi, setHindi] = useState('');
  const [latin, setLatin] = useState('');
  const [english, setEnglish] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, []);

  async function preparePhrase() {
    const text = selectedText.trim();
    if (!aiConsent || !text || busy || requestRef.current) return;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const phrase = await prepareSavedPhraseFromText({ clientId, text }, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setLatin(phrase.latin);
      setHindi(phrase.hi);
      setEnglish(phrase.en);
      Keyboard.dismiss();
    } catch (cause) {
      if (mountedRef.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Bolo could not prepare that phrase.');
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
    if (!normalizedHindi || !normalizedLatin || !normalizedEnglish || busy) return;
    onSave({ hi: normalizedHindi, latin: normalizedLatin, en: normalizedEnglish });
  }

  const canPrepare = aiConsent && selectedText.trim().length > 0 && !busy;
  const canSave = hindi.trim().length > 0 && latin.trim().length > 0 && english.trim().length > 0 && !busy;

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <ScrollView automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Saved phrases</Text>
              <Text style={styles.title}>Choose a phrase</Text>
            </View>
            <Pressable accessibilityLabel="Close phrase picker" accessibilityRole="button" onPress={close} style={styles.closeButton}>
              <X color={colors.ink} size={21} />
            </Pressable>
          </View>

          <Text style={styles.instructions}>Trim the transcript to the exact words you want. Bolo will add a Romanized Hindi version and English meaning.</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Selected transcript text</Text>
            <TextInput
              accessibilityLabel="Selected transcript text"
              autoFocus
              maxLength={500}
              multiline
              onChangeText={(value) => {
                setSelectedText(value);
                setHindi('');
                setLatin('');
                setEnglish('');
                setError('');
              }}
              selectTextOnFocus
              style={[styles.input, styles.sourceInput]}
              value={selectedText}
            />
          </View>

          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canPrepare }} disabled={!canPrepare} onPress={() => void preparePhrase()} style={[styles.prepareButton, !canPrepare && styles.disabled]}>
            <Text style={styles.prepareButtonText}>{busy ? 'Preparing…' : 'Add Romanized + English'}</Text>
          </Pressable>
          {!aiConsent ? <Text style={styles.hint}>Connected AI consent is required to fill phrase details automatically.</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Hindi</Text>
            <TextInput accessibilityLabel="Hindi phrase" maxLength={500} onChangeText={setHindi} placeholder="उदाहरण: आप कैसे हैं?" placeholderTextColor={colors.muted} style={styles.input} value={hindi} />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Romanized Hindi</Text>
            <TextInput accessibilityLabel="Romanized Hindi phrase" maxLength={500} onChangeText={setLatin} placeholder="Example: Aap kaise hain?" placeholderTextColor={colors.muted} style={styles.input} value={latin} />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>English meaning</Text>
            <TextInput accessibilityLabel="English phrase meaning" maxLength={500} onChangeText={setEnglish} placeholder="Example: How are you?" placeholderTextColor={colors.muted} style={styles.input} value={english} />
          </View>

          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave }} disabled={!canSave} onPress={save} style={[styles.saveButton, !canSave && styles.disabled]}>
            <Text style={styles.saveButtonText}>Save phrase</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.lg, padding: spacing.xl, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { minWidth: 0, flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.brandDark, fontSize: 12, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  closeButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.paperRaised, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  instructions: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  fieldGroup: { gap: spacing.sm },
  label: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  input: { minHeight: 52, borderRadius: radius.md, borderCurve: 'continuous', borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth, backgroundColor: colors.paperRaised, color: colors.ink, fontSize: 16, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  sourceInput: { minHeight: 112, textAlignVertical: 'top' },
  prepareButton: { minHeight: 52, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  prepareButtonText: { color: colors.white, fontSize: 15, fontWeight: '900' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  saveButton: { minHeight: 54, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  saveButtonText: { color: colors.white, fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
