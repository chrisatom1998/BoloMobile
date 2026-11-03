import type { StructuredCorrection, StructuredPhrase, StructuredReply } from '@/state/app-state-types';

/** The request field that asks `/api/mobile-chat` for a structured block. Older servers ignore it. */
export const STRUCTURED_REPLY_FORMAT = 'structured-v1' as const;
export const STRUCTURED_REPLY_VERSION = 1 as const;

export const MAX_STRUCTURED_PROSE_CHARACTERS = 600;
export const MAX_STRUCTURED_LINE_CHARACTERS = 300;
export const MAX_STRUCTURED_PHRASES = 8;
export const MAX_STRUCTURED_CORRECTIONS = 6;
/** Serialized size cap, so one reply cannot bloat the persisted chat history. */
export const MAX_STRUCTURED_REPLY_BYTES = 6_000;

const DEVANAGARI = /[ऀ-ॿ]/u;
const LATIN_LETTER = /[A-Za-z]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > maximum) return undefined;
  return text;
}

/** Devanagari script, optionally with digits and punctuation; never Latin letters. */
function devanagariLine(value: unknown): string | undefined {
  const text = boundedText(value, MAX_STRUCTURED_LINE_CHARACTERS);
  if (!text || !DEVANAGARI.test(text) || LATIN_LETTER.test(text)) return undefined;
  return text;
}

/** Latin letters, never Devanagari. */
function latinLine(value: unknown): string | undefined {
  const text = boundedText(value, MAX_STRUCTURED_LINE_CHARACTERS);
  if (!text || !LATIN_LETTER.test(text) || DEVANAGARI.test(text)) return undefined;
  return text;
}

/** Null and "" mean "absent". A present value that fails the reader rejects the block. */
function optionalField(value: unknown, read: (value: unknown) => string | undefined): { ok: boolean; text?: string } {
  if (value === undefined || value === null || value === '') return { ok: true };
  const text = read(value);
  return text ? { ok: true, text } : { ok: false };
}

function optionalLatinLine(value: unknown): { ok: boolean; text?: string } {
  return optionalField(value, latinLine);
}

/** English coaching prose: no Devanagari, so a Latin-mode learner never sees Hindi script here. */
function englishProse(value: unknown): string | undefined {
  const text = boundedText(value, MAX_STRUCTURED_PROSE_CHARACTERS);
  if (!text || DEVANAGARI.test(text)) return undefined;
  return text;
}

function optionalProse(value: unknown): { ok: boolean; text?: string } {
  return optionalField(value, englishProse);
}

function sanitizePhrase(value: unknown): StructuredPhrase | null {
  if (!isRecord(value)) return null;
  const devanagari = devanagariLine(value.devanagari);
  const romanized = latinLine(value.romanized);
  const english = latinLine(value.english);
  if (!devanagari || !romanized || !english) return null;
  return { devanagari, romanized, english };
}

function sanitizeCorrection(value: unknown): StructuredCorrection | null {
  if (!isRecord(value) || !isRecord(value.youSaid) || !isRecord(value.say)) return null;
  const youSaidDevanagari = optionalField(value.youSaid.devanagari, devanagariLine);
  const youSaidRomanized = optionalField(value.youSaid.romanized, latinLine);
  if (!youSaidDevanagari.ok || !youSaidRomanized.ok || (!youSaidDevanagari.text && !youSaidRomanized.text)) return null;
  const sayDevanagari = devanagariLine(value.say.devanagari);
  const sayRomanized = latinLine(value.say.romanized);
  const sayEnglish = optionalLatinLine(value.say.english);
  const note = optionalProse(value.note);
  if (!sayDevanagari || !sayRomanized || !sayEnglish.ok || !note.ok) return null;
  return {
    youSaid: {
      ...(youSaidDevanagari.text ? { devanagari: youSaidDevanagari.text } : {}),
      ...(youSaidRomanized.text ? { romanized: youSaidRomanized.text } : {}),
    },
    say: { devanagari: sayDevanagari, romanized: sayRomanized, ...(sayEnglish.text ? { english: sayEnglish.text } : {}) },
    ...(note.text ? { note: note.text } : {}),
  };
}

/**
 * Strict but tolerant validation of a `structured` reply block. Unknown fields
 * are ignored; any malformed, oversized, or empty block returns `undefined` so
 * the caller falls back to the plain `reply` string instead of failing.
 */
export function sanitizeStructuredReply(value: unknown): StructuredReply | undefined {
  if (!isRecord(value) || value.version !== STRUCTURED_REPLY_VERSION) return undefined;
  const intro = optionalProse(value.intro);
  const outro = optionalProse(value.outro);
  if (!intro.ok || !outro.ok) return undefined;

  let phrases: StructuredPhrase[] | undefined;
  if (value.phrases !== undefined && value.phrases !== null) {
    if (!Array.isArray(value.phrases) || value.phrases.length > MAX_STRUCTURED_PHRASES) return undefined;
    const sanitized = value.phrases.map(sanitizePhrase);
    if (sanitized.some((phrase) => phrase === null)) return undefined;
    phrases = sanitized as StructuredPhrase[];
  }

  let corrections: StructuredCorrection[] | undefined;
  if (value.corrections !== undefined && value.corrections !== null) {
    if (!Array.isArray(value.corrections) || value.corrections.length > MAX_STRUCTURED_CORRECTIONS) return undefined;
    const sanitized = value.corrections.map(sanitizeCorrection);
    if (sanitized.some((correction) => correction === null)) return undefined;
    corrections = sanitized as StructuredCorrection[];
  }

  if (!intro.text && !outro.text && !phrases?.length && !corrections?.length) return undefined;

  const structured: StructuredReply = {
    version: STRUCTURED_REPLY_VERSION,
    ...(intro.text ? { intro: intro.text } : {}),
    ...(phrases?.length ? { phrases } : {}),
    ...(corrections?.length ? { corrections } : {}),
    ...(outro.text ? { outro: outro.text } : {}),
  };
  if (new TextEncoder().encode(JSON.stringify(structured)).byteLength > MAX_STRUCTURED_REPLY_BYTES) return undefined;
  return structured;
}

/** Every Hindi phrase a learner could save from a structured reply: taught phrases, then corrected forms. */
export function structuredSaveCandidates(structured: StructuredReply): StructuredPhrase[] {
  const seen = new Set<string>();
  const candidates: StructuredPhrase[] = [];
  const add = (phrase: StructuredPhrase) => {
    const key = phrase.devanagari.trim();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(phrase);
  };
  for (const phrase of structured.phrases ?? []) add(phrase);
  for (const correction of structured.corrections ?? []) {
    add({ devanagari: correction.say.devanagari, romanized: correction.say.romanized, english: correction.say.english ?? '' });
  }
  return candidates;
}

/** Canonical Devanagari source for the Words tray: every taught or corrected Hindi line. */
export function structuredHindiSource(structured: StructuredReply) {
  return structuredSaveCandidates(structured).map((phrase) => phrase.devanagari).join(' · ');
}
