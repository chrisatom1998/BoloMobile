import { Trash2 } from 'lucide-react-native';
import { Text, View } from 'react-native';

import type { LiveScreenViewProps } from '@/components/live/live-screen-types';
import { QueuedReportRow } from '@/components/queued-report-row';
import { TapPressable as Pressable } from '@/components/tap-pressable';

export function AskAshaSection({
  accessibilityCompact,
  aiConsent,
  chatHistory,
  clearChatDisabled,
  colors,
  compactVoiceLayout,
  confirmClearChat,
  discardReport,
  headerCollapsed,
  lastSessionButton,
  restingVoiceLayout,
  retryReport,
  styles,
  unassociatedReports,
}: LiveScreenViewProps) {
  return aiConsent ? <View style={[styles.askSection, compactVoiceLayout && styles.askSectionCompact, (restingVoiceLayout || accessibilityCompact) && styles.askSectionResting]} testID="ask-asha-sheet">
                {/* Title on its own row, then the controls. A shared row let the title paint over Last session. */}
                <View style={styles.askHeading} testID="ask-asha-heading-block">
                  {headerCollapsed ? null : (
                    <View style={[styles.askHeadingCopy, compactVoiceLayout && styles.askHeadingCopyCompact]} testID="ask-asha-heading">
                      <Text style={styles.askEyebrow}>Ask Asha</Text>
                      <Text style={styles.askTitle}>How do I say…?</Text>
                    </View>
                  )}
                  <View style={styles.askHeadingActions} testID="ask-asha-actions">
                    {chatHistory.length > 0 ? (
                      <Pressable
                        accessibilityHint="Removes typed and voice chat saved on this device, without deleting saved phrases, lesson progress, or reports waiting to be sent."
                        accessibilityLabel="Clear Asha chat history"
                        accessibilityRole="button"
                        accessibilityState={{ disabled: clearChatDisabled }}
                        disabled={clearChatDisabled}
                        onPress={confirmClearChat}
                        style={[styles.clearChatButton, clearChatDisabled && styles.disabled]}
                      >
                        <Trash2 color={colors.gold} size={17} />
                        <Text style={styles.secondaryActionText}>Clear chat</Text>
                      </Pressable>
                    ) : null}
                    <View style={styles.lastSessionSlot}>{lastSessionButton}</View>
                  </View>
                </View>
                {unassociatedReports.length ? (
                  <View style={styles.queuedReports} testID="queued-reports">
                    <Text accessibilityRole="header" style={styles.queuedReportsTitle}>Reports waiting to send</Text>
                    {unassociatedReports.map((entry) => (
                      <QueuedReportRow entry={entry} key={entry.id} onDiscard={discardReport} onRetry={retryReport} tone="dark" />
                    ))}
                  </View>
                ) : null}
            </View> : null;
}
