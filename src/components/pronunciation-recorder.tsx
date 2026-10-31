import { Flag, Sparkles } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';

import { TapPressable as Pressable } from '@/components/tap-pressable';
import { VoiceTurnButton, VoiceTurnPlaceholder } from '@/components/voice-turn-button';
import { AiConsentGate } from '@/components/ai-consent-gate';
import { showAppAlert } from '@/lib/app-alert';
import { hapticSuccess } from '@/lib/haptics';
import { speakText } from '@/lib/speech';
import { checkPronunciation, reportGeneratedMessage, type ReportReason } from '@/services/bolo-api';
import { useAppState } from '@/state/app-state';
import type { SavedPhrase } from '@/state/app-state-types';
import { makeStyles, radius, spacing, useTheme } from '@/theme';

export type PronunciationRecorderVariant = 'card' | 'hero';

type Props = {
  /** Screen-reader and visible name of the idle record button. */
  idleLabel?: string;
  lessonTitle: string;
  onActivityChange?: (active: boolean) => void;
  target: SavedPhrase;
  /**
   * 'card' is the lesson block with its own surface and copy, gated by the
   * consent notice. 'hero' is the bare review mic: it stays visible without
   * consent as a disabled control plus an explicit way to open the notice, so
   * the primary action never looks live when it cannot record.
   */
  variant?: PronunciationRecorderVariant;
};

const CONSENT_HINT = 'Pronunciation checks need your consent to connected AI processing.';

export function PronunciationRecorder({ idleLabel, lessonTitle, onActivityChange, target, variant = 'card' }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [feedback, setFeedback] = useState('');
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const { aiConsent, clientId } = useAppState();
  const hero = variant === 'hero';
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

  const recordButton = (
    <VoiceTurnButton
      appearance={hero ? 'hero' : 'pill'}
      idleLabel={idleLabel ?? 'Record pronunciation'}
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
          if (result.outcome !== 'no-speech' && result.understood !== false) hapticSuccess();
          setFeedback(result.feedback);
          setReported(false);
          // Android reads the feedback via its live region; iOS needs an explicit announcement.
          if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(result.feedback);
          // Feedback is ready as soon as the card appears. Playback should
          // not keep the recorder labelled "Asha is thinking…".
          void speakText(result.feedback, controller.signal).catch(() => undefined);
        } finally {
          if (requestRef.current === controller) requestRef.current = null;
        }
      }}
      testID={hero ? 'review-say-it' : undefined}
    />
  );

  const feedbackCard = feedback ? (
    <View style={[styles.feedbackCard, hero && styles.feedbackCardHero]} testID="pronunciation-feedback">
      <Text accessibilityLiveRegion="polite" style={[styles.feedback, hero && styles.feedbackHero]}>{feedback}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: reported || reporting }} disabled={reported || reporting} onPress={reportFeedback} style={[styles.reportButton, hero && styles.reportButtonHero]}>
        <Flag color={reported ? colors.success : colors.muted} size={15} />
        <Text style={styles.reportText}>{reported ? 'Reported' : reporting ? 'Reporting…' : 'Report feedback'}</Text>
      </Pressable>
    </View>
  ) : null;

  if (hero) {
    return (
      <View style={styles.hero} testID="pronunciation-recorder-hero">
        {aiConsent ? recordButton : (
          // No recorder is mounted before consent: the mic is a static, disabled face.
          <VoiceTurnPlaceholder accessibilityHint={CONSENT_HINT} appearance="hero" idleLabel={idleLabel ?? 'Record pronunciation'} testID="review-say-it" />
        )}
        {aiConsent ? (
          <Text style={styles.heroCaption}>Asha checks one sound or rhythm detail in up to 15 seconds.</Text>
        ) : (
          <>
            <Text style={styles.heroCaption}>{CONSENT_HINT}</Text>
            {consentOpen ? null : (
              <Pressable accessibilityRole="button" onPress={() => setConsentOpen(true)} style={styles.consentLink} testID="review-allow-pronunciation">
                <Text style={styles.consentLinkText}>Allow pronunciation checks</Text>
              </Pressable>
            )}
          </>
        )}
        {consentOpen && !aiConsent ? <AiConsentGate title="Before checking pronunciation" /> : null}
        {feedbackCard}
      </View>
    );
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
      <AiConsentGate compact={{ body: 'Recording uses Asha coaching, which sends your clip to Bolo and OpenAI.' }}>
        {recordButton}
      </AiConsentGate>
      {feedbackCard}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  container: {
    backgroundColor: c.brandSoft,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing.lg,
    gap: spacing.md,
  },
  copy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  text: { flex: 1, gap: spacing.xs },
  title: { color: c.brandText, fontSize: 15, fontWeight: '800' },
  body: { color: c.muted, fontSize: 14, lineHeight: 20 },
  feedbackCard: { gap: spacing.sm },
  feedback: { color: c.ink, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  reportButton: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  reportText: { color: c.muted, fontSize: 12, fontWeight: '700' },
  hero: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
  heroCaption: { color: c.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  consentLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  consentLinkText: { color: c.forestText, fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  feedbackCardHero: { alignSelf: 'stretch', alignItems: 'center', marginTop: spacing.xs, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: c.brandSoft, padding: spacing.md },
  feedbackHero: { textAlign: 'center' },
  reportButtonHero: { alignSelf: 'center' },
}));
