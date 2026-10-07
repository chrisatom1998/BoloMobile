import { Send } from 'lucide-react-native';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';

import type { createLiveStyles } from '@/app/(tabs)/live';
import { TapPressable as Pressable } from '@/components/tap-pressable';
import { useTheme } from '@/theme';

type Props = {
  disabled: boolean;
  /** True only after the learner message and Asha reply have been accepted. */
  onSend: (text: string) => Promise<boolean>;
  styles: ReturnType<typeof createLiveStyles>;
};

/**
 * Owns the typed message draft so a keystroke re-renders only the composer,
 * leaving the animated hero and the chat list untouched.
 */
export const LiveComposer = memo(function LiveComposer({ disabled, onSend, styles }: Props) {
  const { colors } = useTheme();
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const draftRevisionRef = useRef(0);
  const mountedRef = useRef(true);
  const locked = disabled || sending;
  const sendDisabled = locked || !input.trim();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const changeInput = useCallback((text: string) => {
    draftRevisionRef.current += 1;
    setInput(text);
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (disabled || sendingRef.current || !text) return;
    sendingRef.current = true;
    setSending(true);
    const revision = draftRevisionRef.current;
    try {
      const accepted = await onSend(text);
      // Keep the draft through failures, and never clear a newer native edit.
      if (accepted && mountedRef.current && draftRevisionRef.current === revision) setInput('');
    } catch {
      // The screen reports the request error; the original draft stays available.
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setSending(false);
    }
  }, [disabled, input, onSend]);

  const submit = useCallback(() => { void send(); }, [send]);

  return (
    <View style={styles.inputRow}>
      <TextInput
        accessibilityLabel="Message Asha"
        testID="message-asha-input"
        editable={!locked}
        maxLength={500}
        multiline
        onChangeText={changeInput}
        onSubmitEditing={submit}
        placeholder="Ask in English or Hindi…"
        placeholderTextColor={colors.heroSubtle}
        style={[styles.input, locked && styles.inputDisabled]}
        value={input}
      />
      <Pressable accessibilityLabel="Send message" accessibilityRole="button" testID="send-asha-message" accessibilityState={{ disabled: sendDisabled }} disabled={sendDisabled} onPress={submit} style={[styles.sendButton, sendDisabled && styles.disabled]}><Send color={colors.ink} size={20} /></Pressable>
    </View>
  );
});
