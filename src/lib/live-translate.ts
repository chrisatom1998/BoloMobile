import type { LiveTranscriptRow } from '@/lib/live-transcripts';

/** One thing somebody said: the Hindi that was heard and its English translation. */
export type TranslationLine = {
  id: string;
  /** What the microphone heard. Empty when only the translation arrived. */
  hindi: string;
  /** The English translation. Empty while it is still on its way. */
  english: string;
  /** A short gloss for a family or cultural word, for example "Mausi: your mother's sister". */
  note: string;
  /** True until a translation has arrived for this line. */
  pending: boolean;
};

/** A translation only attaches to one of the newest few unanswered lines; older ones were skipped. */
const PAIRING_WINDOW = 3;
const NOTE_LIMIT = 160;

/** Splits a trailing "[word: meaning]" note off a translation. "[unclear]" stays in the sentence. */
export function splitTranslationNote(text: string): { english: string; note: string } {
  const trimmed = text.trim();
  const match = /^(.*\S)\s*\[([^[\]]{1,160})\]$/su.exec(trimmed);
  const [, sentence = '', note = ''] = match ?? [];
  if (sentence && note.includes(':')) return { english: sentence.trim(), note: note.trim().slice(0, NOTE_LIMIT) };
  // While a note is still streaming in, hide its unfinished half.
  const open = trimmed.lastIndexOf('[');
  if (open > 0 && !trimmed.includes(']', open)) return { english: trimmed.slice(0, open).trim(), note: '' };
  return { english: trimmed, note: '' };
}

/**
 * Pairs what was heard with its translation. The live session reports heard speech
 * and the interpreter's reply as two separate streams, in the order they arrive.
 * Each reply belongs to the oldest recent line that has no translation yet.
 */
export function pairTranslationLines(rows: readonly LiveTranscriptRow[]): TranslationLine[] {
  const lines: { id: string; hindi: string; raw: string }[] = [];
  for (const row of rows) {
    const text = row.text.trim();
    if (!text) continue;
    if (row.speaker === 'you') {
      lines.push({ id: row.id, hindi: text, raw: '' });
      continue;
    }
    const recent = lines.slice(-PAIRING_WINDOW);
    const waiting = recent.find((line) => !line.raw);
    const target = waiting ?? lines[lines.length - 1];
    if (target) target.raw = target.raw ? `${target.raw} ${text}` : text;
    else lines.push({ id: row.id, hindi: '', raw: text });
  }
  return lines.map((line) => {
    const { english, note } = splitTranslationNote(line.raw);
    return { id: line.id, hindi: line.hindi, english, note, pending: !line.raw };
  });
}

/** "4:12" style elapsed time for the Listening pill. */
export function formatListeningTime(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * The question Asha gets when the learner taps "Ask Asha how to reply" on a line.
 * The chat server rejects a message over 500 characters, and the app adds Asha's own
 * instructions to it, so the ask stays short and the heard line travels as chat context.
 */
export const REPLY_HELP_QUESTION = 'What could I say back? Give 1 or 2 short, polite Hindi replies a beginner can say, each with romanization and English.';

export function buildReplyContext(line: Pick<TranslationLine, 'hindi' | 'english'>): string {
  const heard = line.hindi.trim().slice(0, 240);
  const meaning = line.english.trim().slice(0, 240);
  return [
    'A family member just said this to me in Hindi.',
    heard ? `They said: "${heard}"` : '',
    meaning ? `It means: "${meaning}"` : '',
  ].filter(Boolean).join(' ');
}
