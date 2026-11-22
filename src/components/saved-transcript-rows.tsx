import { Text, View } from 'react-native';

import { displayHindiTranscript } from '@/lib/learner-phrase-display';
import { makeStyles, radius, spacing, type } from '@/theme';

export type SavedTranscriptRow = { id: string; speaker: 'you' | 'asha'; text: string };

/** Romanized Hindi for saved chats; English and Latin spellings pass through unchanged. */
export const savedTranscriptText = (text: string) => displayHindiTranscript(text, false);

/** Read-only chat bubbles for a saved conversation: Last session and Chat history. Hindi is always romanized. */
export function SavedTranscriptRows({ rows }: { rows: readonly SavedTranscriptRow[] }) {
  const styles = useStyles();
  return rows.map((row) => {
    const isYou = row.speaker === 'you';
    const text = savedTranscriptText(row.text);
    return (
      <View
        accessibilityLabel={`${isYou ? 'You' : 'Asha'}: ${text}`}
        accessible
        key={row.id}
        style={[styles.row, isYou ? styles.rowYou : styles.rowAsha]}
      >
        <Text style={[styles.speaker, isYou && styles.speakerYou]}>{isYou ? 'You' : 'Asha'}</Text>
        <Text style={[styles.rowText, isYou && styles.rowTextYou]}>{text}</Text>
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
}));
