import { Mic, MicOff, X } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import type { RealtimeVoiceStatus } from '@/hooks/use-realtime-conversation';
import { borderWidth, iconSize, makeStyles, opacity, radius, size, spacing, typeScale, useTheme } from '@/theme';

type Props = {
  endDisabled: boolean;
  micDisabled: boolean;
  micLabel: string;
  onEnd: () => void;
  onToggleMic: () => void;
  status: RealtimeVoiceStatus;
};

/**
 * The only controls shown in the composer row while a live voice session is
 * connecting or connected: the mute toggle and a labelled End chat pill. End
 * tears the session down exactly like the portrait's X did, so the transcript
 * stays on screen and the session log records `user_ended`.
 */
export function LiveCallBar({ endDisabled, micDisabled, micLabel, onEnd, onToggleMic, status }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.bar} testID="live-call-bar">
      <Pressable
        accessibilityHint="Mutes or unmutes your microphone."
        accessibilityLabel={micLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: micDisabled }}
        disabled={micDisabled}
        onPress={onToggleMic}
        style={[styles.mic, micDisabled && styles.disabled]}
        testID="composer-mic-toggle"
      >
        {status === 'recording' ? <MicOff color={colors.gold} size={iconSize.lg} /> : <Mic color={colors.gold} size={iconSize.lg} />}
      </Pressable>
      <Pressable
        accessibilityHint="Ends the live voice session. Your conversation stays on this screen."
        accessibilityLabel="End chat"
        accessibilityRole="button"
        accessibilityState={{ disabled: endDisabled }}
        disabled={endDisabled}
        onPress={onEnd}
        style={[styles.end, endDisabled && styles.disabled]}
        testID="live-end-chat"
      >
        <X color={colors.white} size={iconSize.md} />
        <Text style={styles.endText}>End chat</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  bar: { minHeight: size.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  // Same treatment as the resting composer's mic toggle.
  mic: { width: size.control, height: size.control, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.night, borderColor: c.gold, borderWidth: borderWidth.thin, alignItems: 'center', justifyContent: 'center' },
  end: { minHeight: size.control, minWidth: size.touchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.pill, borderCurve: 'continuous', backgroundColor: c.night, borderColor: c.nightLine, borderWidth: borderWidth.thin, paddingHorizontal: spacing.lg },
  endText: { color: c.white, ...typeScale.label, fontWeight: '700' },
  disabled: { opacity: opacity.disabled },
}));
