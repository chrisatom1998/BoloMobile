import { Modal, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import { makeStyles, radius, spacing } from '@/theme';

export type ChatMessageMenuItem = {
  key: string;
  label: string;
  /** Screen-reader name when the visible label is not unique across the thread. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  detail?: string;
  detailLanguage?: string;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * Small accessible action sheet for a chat bubble's secondary actions. A real
 * in-app Modal rather than `showAppAlert`, which on web chains window.confirm
 * dialogs. Every item is a 48pt button; the backdrop and Cancel both close it.
 */
export function ChatMessageMenu({
  items,
  onClose,
  reducedMotion,
  testID = 'chat-message-menu',
  title,
  visible,
}: {
  items: ChatMessageMenuItem[];
  onClose: () => void;
  reducedMotion: boolean;
  testID?: string;
  title: string;
  visible: boolean;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop} testID={testID}>
        <Pressable accessibilityLabel="Close menu" accessibilityRole="button" onPress={onClose} style={styles.scrim} />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: Math.max(spacing.md, insets.bottom + spacing.sm) }, Platform.OS === 'web' && styles.sheetWeb]}
        >
          <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{title}</Text>
          {items.map((item) => (
            <Pressable
              accessibilityHint={item.accessibilityHint}
              accessibilityLabel={item.accessibilityLabel ?? item.label}
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(item.disabled) }}
              disabled={item.disabled}
              key={item.key}
              onPress={() => {
                if (item.disabled) return;
                item.onPress();
                onClose();
              }}
              style={[styles.item, item.disabled && styles.itemDisabled]}
              testID={`${testID}-${item.key}`}
            >
              <Text style={[styles.itemLabel, item.destructive && styles.itemDestructive]}>{item.label}</Text>
              {item.detail ? (
                <Text accessibilityLanguage={item.detailLanguage} numberOfLines={2} style={styles.itemDetail}>{item.detail}</Text>
              ) : null}
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={onClose} style={[styles.item, styles.cancel]} testID={`${testID}-cancel`}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(16, 32, 30, 0.55)' },
  sheet: {
    backgroundColor: c.paperRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderCurve: 'continuous',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
  sheetWeb: { alignSelf: 'center', width: '100%', maxWidth: 480 },
  title: { color: c.muted, fontSize: 13, lineHeight: 18, fontWeight: '700', marginBottom: spacing.sm },
  item: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.background, gap: 2 },
  itemDisabled: { opacity: 0.45 },
  itemLabel: { color: c.ink, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  itemDestructive: { color: c.danger },
  itemDetail: { color: c.muted, fontSize: 13, lineHeight: 18 },
  cancel: { marginTop: spacing.sm, backgroundColor: 'transparent', alignItems: 'center' },
  cancelLabel: { color: c.brandText, fontSize: 16, lineHeight: 22, fontWeight: '700' },
}));
