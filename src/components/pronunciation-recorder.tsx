import { Flag, Sparkles } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { VoiceTurnButton } from '@/components/voice-turn-button';
import { AiConsentGate } from '@/components/ai-consent-gate';
import { showAppAlert } from '@/lib/app-alert';
import { hapticSuccess } from '@/lib/haptics';
import { speakText } from '@/lib/speech';
import { checkPronunciation, reportGeneratedMessage, type ReportReason } from '@/services/bolo-api';
import { useAppState } from '@/state/app-state';
import type { SavedPhrase } from '@/state/app-state-types';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

type Props = {
  lessonTitle: string;
  onActivityChange?: (active: boolean) => void;
  target: SavedPhrase;
};

export function PronunciationRecorder({ lessonTitle, onActivityChange, target }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [feedback, setFeedback] = useState('');
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);
  const { clientId } = useAppState();
  const mountedRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);
  const reportRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      reportRef.current?.abort();
      reportRef.current = null;
    };
  }, []);

  async function submitReport(reason: ReportReason) {
    if (!feedback || reported || reporting || reportRef.current) return;
    setReporting(true);
    const controller = new AbortController();
    reportRef.current = controller;
    try {
      await reportGeneratedMessage({ clientId, message: `Pronunciation feedback: ${feedback}`, reason }, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      setReported(true);
      showAppAlert('Report received', 'Thank you. This pronunciation feedback was sent for review.');
    } catch (error) {
      if (mountedRef.current && !controller.signal.aborted) {
        showAppAlert('Could not send report', error instanceof Error ? error.message : 'Please try again.');
      }
    } finally {
      if (reportRef.current === controller) reportRef.current = null;
      if (mountedRef.current && !controller.signal.aborted) setReporting(false);
    }
  }

  function reportFeedback() {
    showAppAlert('Report Asha’s feedback', 'Choose the main problem.', [
      { text: 'Unsafe or inappropriate', onPress: () => void submitReport('unsafe_or_inappropriate') },
      { text: 'Incorrect or misleading', onPress: () => void submitReport('incorrect_or_misleading') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.copy}>
        <Sparkles color={colors.brandText} size={18} />
        <View style={styles.text}>
          <Text style={styles.title}>Practice this answer</Text>
          <Text style={styles.body}>Record up to 15 seconds. Asha will check one useful sound or rhythm detail.</Text>
        </View>
      </View>
      <AiConsentGate>
        <VoiceTurnButton
          idleLabel="Record pronunciation"
          onActivityChange={onActivityChange}
          onRecordingReady={async ({ audioBase64, mimeType }) => {
            const controller = new AbortController();
            requestRef.current = controller;
            try {
              const result = await checkPronunciation({ audioBase64, clientId, mimeType, target, lessonTitle }, controller.signal);
              if (!mountedRef.current || controller.signal.aborted) return;
              const pendingReport = reportRef.current;
              pendingReport?.abort();
              if (reportRef.current === pendingReport) reportRef.current = null;
              setReporting(false);
              hapticSuccess();
              setFeedback(result.feedback);
              setReported(false);
              // Feedback is ready as soon as the card appears. Playback should
              // not keep the recorder labelled "Asha is thinking…".
              void speakText(result.feedback, controller.signal).catch(() => undefined);
            } finally {
              if (requestRef.current === controller) requestRef.current = null;
            }
          }}
        />
      </AiConsentGate>
      {feedback ? (
        <View style={styles.feedbackCard}>
          <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: reported || reporting }} disabled={reported || reporting} onPress={reportFeedback} style={styles.reportButton}>
            <Flag color={reported ? colors.success : colors.muted} size={15} />
            <Text style={styles.reportText}>{reported ? 'Reported' : reporting ? 'Reporting…' : 'Report feedback'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: {
    backgroundColor: c.forestSoft,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing.lg,
    gap: spacing.md,
  },
  copy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  text: { flex: 1, gap: spacing.xs },
  title: { color: c.ink, fontSize: 15, fontWeight: '800' },
  body: { color: c.muted, fontSize: 14, lineHeight: 20 },
  feedbackCard: { gap: spacing.sm },
  feedback: { color: c.ink, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  reportButton: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  reportText: { color: c.muted, fontSize: 12, fontWeight: '700' },
}));
