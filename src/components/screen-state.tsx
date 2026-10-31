import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { TapPressable } from '@/components/tap-pressable';
import { getNetworkStatus, subscribeNetworkStatus, type NetworkStatus } from '@/lib/network-signal';
import { screenCopy } from '@/lib/screen-copy';
import { displayFont, makeStyles, radius, spacing } from '@/theme';

type Tone = 'empty' | 'error' | 'loading';

export function ScreenState({
  actionLabel,
  body,
  onAction,
  testID,
  title,
  tone = 'empty',
}: {
  actionLabel?: string;
  body: string;
  onAction?: () => void;
  testID?: string;
  title: string;
  tone?: Tone;
}) {
  const styles = useStyles();
  const alert = tone === 'error';
  return (
    <View
      accessibilityLiveRegion={tone === 'loading' ? 'polite' : undefined}
      accessibilityRole={alert ? 'alert' : undefined}
      style={styles.wrap}
      testID={testID}
    >
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <TapPressable accessibilityLabel={actionLabel} accessibilityRole="button" onPress={onAction} style={styles.action}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TapPressable>
      ) : null}
    </View>
  );
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState(getNetworkStatus);
  useEffect(() => subscribeNetworkStatus(() => setStatus(getNetworkStatus())), []);
  return status;
}

/** A quiet line once Bolo has seen a failed request. Hidden until then. */
export function OfflineNote({ body = screenCopy.offlineBody }: { body?: string }) {
  const styles = useStyles();
  const status = useNetworkStatus();
  if (status !== 'offline') return null;
  return (
    <View accessibilityRole="alert" style={styles.note} testID="offline-note">
      <Text style={styles.noteTitle}>{screenCopy.offlineTitle}</Text>
      <Text style={styles.noteBody}>{body}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
  },
  title: {
    color: c.ink,
    fontFamily: displayFont,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    textAlign: 'center',
  },
  body: {
    color: c.muted,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  action: {
    alignItems: 'center',
    backgroundColor: c.ink,
    borderCurve: 'continuous',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 180,
    paddingHorizontal: spacing.lg,
  },
  actionText: {
    color: c.white,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  note: {
    alignSelf: 'stretch',
    backgroundColor: c.paper,
    borderColor: c.line,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  noteTitle: {
    color: c.ink,
    fontFamily: displayFont,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  noteBody: {
    color: c.muted,
    fontSize: 15,
    lineHeight: 21,
  },
}));
