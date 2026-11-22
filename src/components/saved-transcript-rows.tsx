import { Fragment } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { legacyTranscriptDisplay, type LegacyTranscriptDisplay } from '@/lib/learner-phrase-display';
import { useAppState } from '@/state/app-state';
import type { ScriptPreference } from '@/state/app-state-types';
import { hindiFont, hindiLineHeightRatio, makeStyles, radius, spacing, type } from '@/theme';

export type SavedTranscriptRow = { id: string; speaker: 'you' | 'asha'; text: string };

/** The learner's script setting, so saved chats match the live chat. */
export function useSavedTranscriptScript(): ScriptPreference {
  return useAppState().learnerProfile?.scriptPreference ?? 'both';
}

const savedDisplay = (text: string, scriptPreference: ScriptPreference) => (
  legacyTranscriptDisplay(text, { normalizeKnown: false, scriptPreference })
);

/** Screen-reader text: one pronounceable romanization per Hindi run, as in the live chat. */
export const savedAccessibleText = (text: string) => savedDisplay(text, 'latin').accessibleText;

const shows = (display: LegacyTranscriptDisplay, script: 'devanagari' | 'latin') => display.spans.some((span) => (
  span.script === script && display.segments[span.segment]?.kind === 'hindi'
));

/**
 * One rule everywhere saved chats appear: Hindi script takes the Hindi face at the
 * line's own size, and Hindi in English letters is italic so it stands apart.
 */
function HindiSpans({ display, fontSize }: { display: LegacyTranscriptDisplay; fontSize: number }) {
  return display.spans.map((span, index) => {
    if (display.segments[span.segment]?.kind !== 'hindi') return <Fragment key={index}>{span.text}</Fragment>;
    const devanagari = span.script === 'devanagari';
    return (
      <Text
        accessibilityLanguage={devanagari ? 'hi-IN' : undefined}
        key={index}
        style={devanagari ? { fontFamily: hindiFont, fontSize, fontWeight: '400' } : italic}
        testID={devanagari ? 'saved-transcript-devanagari' : 'saved-transcript-romanized'}
      >
        {span.text}
      </Text>
    );
  });
}

const italic: TextStyle = { fontStyle: 'italic' };

/**
 * Hindi script has tall marks above and below (the matra on ि, the dot of ं). Set
 * inside a Latin line, the Latin line height crops them, so a line that shows
 * Devanagari gets more room than Hindi alone needs (`hindiLineHeightRatio`).
 */
const MIXED_HINDI_LINE_RATIO = hindiLineHeightRatio + 0.15;

function lineRoom(display: LegacyTranscriptDisplay, style: TextStyle): TextStyle | null {
  const fontSize = style.fontSize ?? 16;
  const room = Math.ceil(fontSize * MIXED_HINDI_LINE_RATIO);
  return shows(display, 'devanagari') && (style.lineHeight ?? 0) < room ? { lineHeight: room } : null;
}

/** A single saved line (title, preview, label) in the learner's script. */
export function SavedHindiText({ text, script, style, numberOfLines, prefix, testID }: {
  text: string | readonly string[];
  script: ScriptPreference;
  style: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Plain lead-in in the regular font, such as "Saved phrases: ". */
  prefix?: string;
  testID?: string;
}) {
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = flat.fontSize ?? 16;
  const parts = (typeof text === 'string' ? [text] : text).map((part) => savedDisplay(part, script));
  const room = parts.map((part) => lineRoom(part, flat)).find(Boolean) ?? null;
  return (
    <Text numberOfLines={numberOfLines} style={[style, room]} testID={testID}>
      {prefix}
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index ? ', ' : null}
          <HindiSpans display={part} fontSize={fontSize} />
        </Fragment>
      ))}
    </Text>
  );
}

/**
 * Read-only chat bubbles for a saved conversation: Last session and Chat history.
 * Hindi follows the learner's script setting, like the live chat. Rows with Hindi
 * keep the hi-IN tag so VoiceOver reads the romanized words in a Hindi voice.
 */
export function SavedTranscriptRows({ rows }: { rows: readonly SavedTranscriptRow[] }) {
  const styles = useStyles();
  const scriptPreference = useSavedTranscriptScript();
  return rows.map((row) => {
    const isYou = row.speaker === 'you';
    const display = savedDisplay(row.text, scriptPreference);
    return (
      <View
        accessibilityLabel={`${isYou ? 'You' : 'Asha'}: ${display.accessibleText}`}
        accessibilityLanguage={display.hasDevanagari ? 'hi-IN' : undefined}
        accessible
        key={row.id}
        style={[styles.row, isYou ? styles.rowYou : styles.rowAsha]}
      >
        <Text style={[styles.speaker, isYou && styles.speakerYou]}>{isYou ? 'You' : 'Asha'}</Text>
        <SavedHindiText script={scriptPreference} style={[styles.rowText, isYou && styles.rowTextYou]} testID="saved-transcript-line" text={row.text} />
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
