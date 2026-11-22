import { Text, View } from 'react-native';

import { legacyTranscriptDisplay } from '@/lib/learner-phrase-display';
import { useAppState } from '@/state/app-state';
import type { ScriptPreference } from '@/state/app-state-types';
import { hindiType, makeStyles, radius, spacing, type } from '@/theme';

export type SavedTranscriptRow = { id: string; speaker: 'you' | 'asha'; text: string };

/** The learner's script setting, so saved chats match the live chat. */
export function useSavedTranscriptScript(): ScriptPreference {
  return useAppState().learnerProfile?.scriptPreference ?? 'both';
}

/** Plain-text line for titles and previews, in the learner's chosen script. */
export const savedTranscriptText = (text: string, scriptPreference: ScriptPreference) => (
  legacyTranscriptDisplay(text, { normalizeKnown: false, scriptPreference }).displayText
);

/**
 * Read-only chat bubbles for a saved conversation: Last session and Chat history.
 * Hindi follows the learner's script setting, like the live chat. Romanized Hindi
 * is set in italics so it stands apart from English, and rows with Hindi keep the
 * hi-IN tag so VoiceOver reads the romanized words in a Hindi voice.
 */
export function SavedTranscriptRows({ rows }: { rows: readonly SavedTranscriptRow[] }) {
  const styles = useStyles();
  const scriptPreference = useSavedTranscriptScript();
  return rows.map((row) => {
    const isYou = row.speaker === 'you';
    const display = legacyTranscriptDisplay(row.text, { normalizeKnown: false, scriptPreference });
    return (
      <View
        accessibilityLabel={`${isYou ? 'You' : 'Asha'}: ${display.accessibleText}`}
        accessibilityLanguage={display.hasDevanagari ? 'hi-IN' : undefined}
        accessible
        key={row.id}
        style={[styles.row, isYou ? styles.rowYou : styles.rowAsha]}
      >
        <Text style={[styles.speaker, isYou && styles.speakerYou]}>{isYou ? 'You' : 'Asha'}</Text>
        <Text style={[styles.rowText, isYou && styles.rowTextYou]}>
          {display.spans.map((span, index) => {
            const hindi = display.segments[span.segment]?.kind === 'hindi';
            if (!hindi) return <Text key={index}>{span.text}</Text>;
            return (
              <Text
                key={index}
                style={span.script === 'devanagari' ? styles.hindiScript : styles.hindiLatin}
                testID={span.script === 'devanagari' ? 'saved-transcript-devanagari' : 'saved-transcript-romanized'}
              >
                {span.text}
              </Text>
            );
          })}
        </Text>
      </View>
    );
  });
}

const useStyles = makeStyles((c) => ({
  row: { maxWidth: '92%', borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  rowAsha: { alignSelf: 'flex-start', backgroundColor: c.paperRaised, borderColor: c.line, borderWidth: 1 },
  rowYou: { alignSelf: 'flex-end', backgroundColor: c.night },
  speaker: { ...type.caption, color: c.brandText, fontWeight: '700' },
  speakerYou: { color: c.gold },
  rowText: { ...type.body, color: c.ink },
  rowTextYou: { color: c.white },
  hindiScript: { ...hindiType(17) },
  hindiLatin: { fontStyle: 'italic' },
}));
