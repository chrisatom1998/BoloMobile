/**
 * Portable, undeployed reference for the `/api/mobile-chat` structured reply
 * contract (`replyFormat: 'structured-v1'`). The deployed mobile-chat server
 * lives outside this repository; integrate this module there. It has no
 * imports and no credentials. See backend/README.md for the contract.
 *
 * The client-side twin of `sanitizeStructuredReply` lives in
 * `src/lib/structured-reply.ts`; keep the limits below identical.
 */
export const STRUCTURED_REPLY_FORMAT = 'structured-v1';
export const STRUCTURED_REPLY_VERSION = 1;
export const MAX_STRUCTURED_PROSE_CHARACTERS = 600;
export const MAX_STRUCTURED_LINE_CHARACTERS = 300;
export const MAX_STRUCTURED_PHRASES = 8;
export const MAX_STRUCTURED_CORRECTIONS = 6;
export const MAX_STRUCTURED_REPLY_BYTES = 6_000;
/** The plain `reply` the server already returns is capped by the existing client validator. */
export const MAX_REPLY_CHARACTERS = 2_400;

const DEVANAGARI = /[ऀ-ॿ]/u;
const LATIN_LETTER = /[A-Za-z]/u;

export type StructuredPhrase = { devanagari: string; romanized: string; english: string };
export type StructuredCorrection = {
  youSaid: { devanagari?: string; romanized?: string };
  say: { devanagari: string; romanized: string; english?: string };
  note?: string;
};
export type StructuredReply = {
  version: 1;
  intro?: string;
  phrases?: StructuredPhrase[];
  corrections?: StructuredCorrection[];
  outro?: string;
};
export type MobileChatReply = {
  transcript: string;
  reply: string;
  language: 'en' | 'hi';
  structured?: StructuredReply;
};

/**
 * JSON schema for OpenAI structured outputs (strict mode: every property is
 * listed in `required`; optional fields are nullable).
 */
export const STRUCTURED_REPLY_JSON_SCHEMA = {
  name: 'bolo_structured_reply_v1',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'intro', 'phrases', 'corrections', 'outro'],
    properties: {
      version: { type: 'integer', enum: [1] },
      intro: { type: ['string', 'null'], description: 'One or two English sentences that lead into the phrase or correction. No Devanagari.' },
      phrases: {
        type: 'array',
        maxItems: MAX_STRUCTURED_PHRASES,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['devanagari', 'romanized', 'english'],
          properties: {
            devanagari: { type: 'string', description: 'The Hindi phrase in Devanagari script only.' },
            romanized: { type: 'string', description: 'One Latin-letter romanization of the same phrase. No Devanagari.' },
            english: { type: 'string', description: 'The English meaning. No Devanagari.' },
          },
        },
      },
      corrections: {
        type: 'array',
        maxItems: MAX_STRUCTURED_CORRECTIONS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['youSaid', 'say', 'note'],
          properties: {
            youSaid: {
              type: 'object',
              additionalProperties: false,
              required: ['devanagari', 'romanized'],
              properties: {
                devanagari: { type: ['string', 'null'] },
                romanized: { type: ['string', 'null'] },
              },
            },
            say: {
              type: 'object',
              additionalProperties: false,
              required: ['devanagari', 'romanized', 'english'],
              properties: {
                devanagari: { type: 'string' },
                romanized: { type: 'string' },
                english: { type: ['string', 'null'] },
              },
            },
            note: { type: ['string', 'null'], description: 'A short English explanation of the correction.' },
          },
        },
      },
      outro: { type: ['string', 'null'], description: 'Optional closing English sentence or follow-up question.' },
    },
  },
} as const;

/** Whether this request body asks for the structured block. Unknown formats are ignored. */
export function wantsStructuredReply(body: unknown) {
  if (body === null || typeof body !== 'object') return false;
  const { replyFormat, responseLanguage } = body as { replyFormat?: unknown; responseLanguage?: unknown };
  // Hindi-mode replies are Hindi prose; the structured contract's intro/outro are English.
  return replyFormat === STRUCTURED_REPLY_FORMAT && responseLanguage !== 'hi';
}

/** Model instructions appended to Asha's English-mode system prompt when the client asked for structured-v1. */
export function structuredReplyInstructions() {
  return [
    'Return your reply as JSON matching the provided schema.',
    'Put English explanation in "intro" and, if needed, "outro". Never put Devanagari in intro, outro, romanized, english or note.',
    'Put every Hindi phrase you teach in "phrases": "devanagari" holds the phrase in Devanagari script only (no Latin letters); "romanized" holds exactly one Latin-letter romanization using long vowels as aa, ee, oo and "ai", "au" for ऐ, औ (for example "chaay mein cheeni kam daaliye"); "english" holds the meaning.',
    'When the learner made a mistake, add a "corrections" item: "youSaid" repeats their form (Devanagari and/or romanized, whichever they used), "say" gives the correct or polite form with its English meaning, and "note" explains briefly in English.',
    `Keep at most ${MAX_STRUCTURED_PHRASES} phrases and ${MAX_STRUCTURED_CORRECTIONS} corrections. Use null for fields you do not need.`,
    'Keep the learner-facing tone calm and brief.',
  ].join(' ');
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text && text.length <= maximum ? text : undefined;
}

function devanagariLine(value: unknown) {
  const text = boundedText(value, MAX_STRUCTURED_LINE_CHARACTERS);
  return text && DEVANAGARI.test(text) && !LATIN_LETTER.test(text) ? text : undefined;
}

function latinLine(value: unknown) {
  const text = boundedText(value, MAX_STRUCTURED_LINE_CHARACTERS);
  return text && LATIN_LETTER.test(text) && !DEVANAGARI.test(text) ? text : undefined;
}

function optional(value: unknown, read: (value: unknown) => string | undefined) {
  if (value === undefined || value === null || value === '') return { ok: true as const, text: undefined };
  const text = read(value);
  return text ? { ok: true as const, text } : { ok: false as const, text: undefined };
}

function sanitizePhrase(value: unknown): StructuredPhrase | null {
  if (!record(value)) return null;
  const devanagari = devanagariLine(value.devanagari);
  const romanized = latinLine(value.romanized);
  const english = latinLine(value.english);
  return devanagari && romanized && english ? { devanagari, romanized, english } : null;
}

function sanitizeCorrection(value: unknown): StructuredCorrection | null {
  if (!record(value) || !record(value.youSaid) || !record(value.say)) return null;
  const saidDevanagari = optional(value.youSaid.devanagari, devanagariLine);
  const saidRomanized = optional(value.youSaid.romanized, latinLine);
  if (!saidDevanagari.ok || !saidRomanized.ok || (!saidDevanagari.text && !saidRomanized.text)) return null;
  const sayDevanagari = devanagariLine(value.say.devanagari);
  const sayRomanized = latinLine(value.say.romanized);
  const sayEnglish = optional(value.say.english, latinLine);
  const note = optional(value.note, (note) => boundedText(note, MAX_STRUCTURED_PROSE_CHARACTERS));
  if (!sayDevanagari || !sayRomanized || !sayEnglish.ok || !note.ok) return null;
  return {
    youSaid: {
      ...(saidDevanagari.text ? { devanagari: saidDevanagari.text } : {}),
      ...(saidRomanized.text ? { romanized: saidRomanized.text } : {}),
    },
    say: { devanagari: sayDevanagari, romanized: sayRomanized, ...(sayEnglish.text ? { english: sayEnglish.text } : {}) },
    ...(note.text ? { note: note.text } : {}),
  };
}

/**
 * Strict validation of a model-produced structured block. Returns `undefined`
 * for anything malformed, oversized, or empty so the caller falls back to a
 * plain reply. Unknown fields are ignored. Mirrors the client sanitizer.
 */
export function sanitizeStructuredReply(value: unknown): StructuredReply | undefined {
  if (!record(value) || value.version !== STRUCTURED_REPLY_VERSION) return undefined;
  const intro = optional(value.intro, (text) => boundedText(text, MAX_STRUCTURED_PROSE_CHARACTERS));
  const outro = optional(value.outro, (text) => boundedText(text, MAX_STRUCTURED_PROSE_CHARACTERS));
  if (!intro.ok || !outro.ok) return undefined;
  if (intro.text && DEVANAGARI.test(intro.text)) return undefined;
  if (outro.text && DEVANAGARI.test(outro.text)) return undefined;

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
    version: 1,
    ...(intro.text ? { intro: intro.text } : {}),
    ...(phrases?.length ? { phrases } : {}),
    ...(corrections?.length ? { corrections } : {}),
    ...(outro.text ? { outro: outro.text } : {}),
  };
  if (Buffer.byteLength(JSON.stringify(structured), 'utf8') > MAX_STRUCTURED_REPLY_BYTES) return undefined;
  return structured;
}

/**
 * The readable `reply` string for old app builds and speech. Devanagari is
 * followed by its single romanization in parentheses, which the legacy client
 * path recognises as the model's transliteration and never duplicates.
 */
export function readableReply(structured: StructuredReply) {
  const lines: string[] = [];
  if (structured.intro) lines.push(structured.intro);
  for (const phrase of structured.phrases ?? []) lines.push(`${phrase.devanagari} (${phrase.romanized}) — ${phrase.english}`);
  for (const correction of structured.corrections ?? []) {
    const said = correction.youSaid.devanagari
      ? `${correction.youSaid.devanagari}${correction.youSaid.romanized ? ` (${correction.youSaid.romanized})` : ''}`
      : correction.youSaid.romanized ?? '';
    const english = correction.say.english ? ` — ${correction.say.english}` : '';
    lines.push(`You said ${said}. Say ${correction.say.devanagari} (${correction.say.romanized})${english}.${correction.note ? ` ${correction.note}` : ''}`);
  }
  if (structured.outro) lines.push(structured.outro);
  return lines.join('\n');
}

type ParsedModelOutput = { kind: 'json'; value: unknown } | { kind: 'text'; text: string } | { kind: 'invalid' };

/** JSON (optionally fenced) is parsed; anything else that starts like JSON is invalid; other text is plain prose. */
function parseModelOutput(output: unknown): ParsedModelOutput {
  if (typeof output !== 'string') return output === null || output === undefined ? { kind: 'invalid' } : { kind: 'json', value: output };
  const trimmed = output.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  if (!trimmed) return { kind: 'invalid' };
  if (!trimmed.startsWith('{')) return { kind: 'text', text: trimmed };
  try {
    return { kind: 'json', value: JSON.parse(trimmed) };
  } catch {
    return { kind: 'invalid' };
  }
}

/**
 * Turns the model output of a structured-v1 request into the wire response.
 * `reply` is always a readable string; `structured` is present only when the
 * block validated. Plain text output (the model ignored the schema) becomes
 * the reply as-is. Returns `null` when nothing readable is available so the
 * server can retry or answer with its usual error.
 */
export function normalizeStructuredMobileChatReply(input: {
  transcript: string;
  language: 'en' | 'hi';
  modelOutput: unknown;
}): MobileChatReply | null {
  const parsed = parseModelOutput(input.modelOutput);
  const structured = parsed.kind === 'json' ? sanitizeStructuredReply(parsed.value) : undefined;
  const reply = structured ? readableReply(structured) : parsed.kind === 'text' ? parsed.text : '';
  if (!reply || reply.length > MAX_REPLY_CHARACTERS) return null;
  return {
    transcript: input.transcript,
    reply,
    language: input.language,
    ...(structured ? { structured } : {}),
  };
}
