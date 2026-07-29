import { Send } from 'lucide-react-native';
import { memo, useCallback, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import type { createLiveStyles } from '@/app/(tabs)/live';
import { useTheme } from '@/theme';

type Props = {
  disabled: boolean;
  onSend: (text: string) => void;
  styles: ReturnType<typeof createLiveStyles>;
};

/**
 * Owns the typed message draft so a keystroke re-renders only the composer,
 * leaving the animated hero and the chat list untouched.
 */
export const LiveComposer = memo(function LiveComposer({ disabled, onSend, styles }: Props) {
  const { colors } = useTheme();
  const [input, setInput] = useState('');
  const sendDisabled = disabled || !input.trim();

  const send = useCallback(() => {
    const text = input.trim();
    if (disabled || !text) return;
    setInput('');
    onSend(text);
  }, [disabled, input, onSend]);

  return (
    <View style={styles.inputRow}>
      <TextInput
        accessibilityLabel="Message Asha"
        testID="message-asha-input"
        editable={!disabled}
        maxLength={500}
        multiline
        onChangeText={setInput}
        onSubmitEditing={send}
        placeholder="Ask in English or Hindi…"
        placeholderTextColor={colors.muted}
        style={[styles.input, disabled && styles.inputDisabled]}
        value={input}
      />
      <Pressable accessibilityLabel="Send message" accessibilityRole="button" testID="send-asha-message" accessibilityState={{ disabled: sendDisabled }} disabled={sendDisabled} onPress={send} style={[styles.sendButton, sendDisabled && styles.disabled]}><Send color={colors.white} size={20} /></Pressable>
    </View>
  );
});
