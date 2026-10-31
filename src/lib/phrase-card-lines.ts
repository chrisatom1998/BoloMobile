import { displayHindiTranscript, learnerPhraseLatin } from '@/lib/learner-phrase-display';
import type { ScriptPreference } from '@/state/app-state-types';

const DEVANAGARI = /[ऀ-ॿ]/u;

export type PhraseCardInput = {
  devanagari?: string | null;
  romanized?: string | null;
  english?: string | null;
  scriptPreference: ScriptPreference;
};

export type PhraseCardLines = {
  /** Present only when the learner's script preference allows Devanagari and the phrase has it. */
  devanagari?: string;
  /** At most one romanization: the learner's own spelling for unknown phrases, Bolo's for lesson phrases. */
  romanized?: string;
  english?: string;
  /** Which Hindi line reads as the headline; `null` when the phrase has no Hindi at all. */
  primary: 'devanagari' | 'romanized' | null;
};

function cleaned(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Script-visibility rules shared by every phrase card. 'both' shows Devanagari,
 * one romanization and English; 'devanagari' drops the romanization; 'latin'
 * never shows Devanagari. Pure Latin stays as typed. A romanized field that is
 * entirely Devanagari is the Hindi source. Mixed script is romanized in place
 * and never promoted into a Devanagari line.
 */
export function phraseCardLines({ devanagari, romanized, english, scriptPreference }: PhraseCardInput): PhraseCardLines {
  let hindi = cleaned(devanagari);
  let latin = cleaned(romanized);
  const meaning = cleaned(english);

  // A "Devanagari" field that holds Latin text is really a romanization; never
  // present it as Hindi script or show it twice.
  if (hindi && !DEVANAGARI.test(hindi)) {
    latin ??= hindi;
    hindi = undefined;
  }

  // Devanagari in the romanized field must not reach the learner as mixed
  // script. A value with no Latin letters is mislabeled Hindi, so it stays the
  // Hindi source. A mixed value such as "chai कम" is romanized in place and is
  // not promoted: promoting it would invent a Devanagari line.
  if (latin && DEVANAGARI.test(latin)) {
    if (!/[A-Za-z]/u.test(latin)) hindi ??= latin;
    latin = displayHindiTranscript(latin);
  }

  if (hindi && !latin) latin = displayHindiTranscript(hindi);
  else if (hindi && latin) latin = learnerPhraseLatin(hindi, latin);

  if (!hindi) {
    return { romanized: latin, english: meaning, primary: latin ? 'romanized' : null };
  }
  if (scriptPreference === 'latin') {
    return { romanized: latin, english: meaning, primary: 'romanized' };
  }
  if (scriptPreference === 'devanagari') {
    return { devanagari: hindi, english: meaning, primary: 'devanagari' };
  }
  return { devanagari: hindi, romanized: latin, english: meaning, primary: 'devanagari' };
}

/** Screen-reader name for the card's Listen button; never leaks hidden Hindi in concealed mode. */
export function phraseCardListenLabel(lines: Pick<PhraseCardLines, 'english' | 'romanized'>, concealed = false) {
  if (lines.english) return `Listen to ${lines.english}`;
  if (lines.romanized && !concealed) return `Listen to ${lines.romanized}`;
  return 'Listen to this phrase';
}
