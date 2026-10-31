import { displayHindiTranscript } from '@/lib/learner-phrase-display';
import type { ScriptPreference } from '@/state/app-state-types';

const DEVANAGARI = /[ऀ-ॿ]/u;

export type LiveCaptionLines = {
  /** The raw line in Devanagari; present only when it has the script and the learner's setting allows it. */
  devanagari?: string;
  /** One romanization of the line; absent for a Devanagari-only learner when the Devanagari line is shown. */
  romanized?: string;
};

/**
 * The same script-visibility rule as phrase cards, applied to a live caption:
 * 'both' shows the Devanagari line with one romanization beneath it,
 * 'devanagari' shows the script alone, and 'latin' never shows a Devanagari
 * character. A line without Devanagari (English, or Live's own romanization)
 * stays as spoken. Nothing is translated.
 */
export function liveCaptionLines(raw: string, scriptPreference: ScriptPreference): LiveCaptionLines {
  const line = raw.trim();
  if (!line) return {};
  const romanized = displayHindiTranscript(line).trim();
  if (!DEVANAGARI.test(line) || scriptPreference === 'latin') return romanized ? { romanized } : {};
  if (scriptPreference === 'devanagari') return { devanagari: line };
  return romanized ? { devanagari: line, romanized } : { devanagari: line };
}
