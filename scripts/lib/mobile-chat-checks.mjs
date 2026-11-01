/**
 * Pure checks for `/api/mobile-chat` acceptance. No network access, so these
 * can be unit-tested; `validate-live-services.mjs` imports them.
 */

export const STRUCTURED_REPLY_FORMAT = 'structured-v1';

const DEVANAGARI = /[ऀ-ॿ]/u;
const LATIN = /[A-Za-z]/u;

export function containsDevanagari(value) {
  return DEVANAGARI.test(value);
}

export function containsLatin(value) {
  return LATIN.test(value);
}

/** 'Devanagari', 'Romanized', 'mixed' or 'none' for a reply string. */
export function describeReplyScript(reply) {
  const devanagari = containsDevanagari(reply);
  const latin = containsLatin(reply);
  if (devanagari && latin) return 'mixed';
  if (devanagari) return 'Devanagari';
  if (latin) return 'Romanized';
  return 'none';
}

function check(condition, label, message) {
  if (!condition) throw new Error(`${label}: ${message}`);
}

/** A Hindi-mode reply may be Devanagari (the client asks for it) or Romanized (older deployment). */
export function assertHindiReplyScript(reply, label) {
  check(containsDevanagari(reply) || containsLatin(reply), label, 'Hindi reply contained neither Devanagari nor Romanized Hindi');
  return describeReplyScript(reply);
}

/** An English-mode reply must be mostly English; a Devanagari phrase inside it is fine. */
export function assertEnglishReplyScript(reply, label) {
  check(containsLatin(reply), label, 'English reply contained no Latin text');
  const latinLetters = (reply.match(/[A-Za-z]/gu) ?? []).length;
  const devanagariLetters = (reply.match(/[ऄ-हक़-ॡॲ-ॿ]/gu) ?? []).length;
  check(latinLetters > devanagariLetters, label, 'English reply was mostly Devanagari');
  return describeReplyScript(reply);
}

function checkPhraseLike(value, label, { englishRequired }) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), label, 'expected a phrase object');
  check(typeof value.devanagari === 'string' && containsDevanagari(value.devanagari) && !containsLatin(value.devanagari), label, 'phrase.devanagari must be Devanagari script without Latin letters');
  check(typeof value.romanized === 'string' && containsLatin(value.romanized) && !containsDevanagari(value.romanized), label, 'phrase.romanized must be Latin letters without Devanagari');
  if (englishRequired || (value.english !== undefined && value.english !== null)) {
    check(typeof value.english === 'string' && value.english.trim().length > 0 && !containsDevanagari(value.english), label, 'phrase.english must be non-empty English without Devanagari');
  }
}

/** Validates the shape of a `structured` block when the server returns one. */
export function assertStructuredReplyShape(structured, label) {
  check(structured !== null && typeof structured === 'object' && !Array.isArray(structured), label, 'structured must be an object');
  check(structured.version === 1, label, 'structured.version must be 1');
  for (const field of ['intro', 'outro']) {
    if (structured[field] === undefined || structured[field] === null) continue;
    check(typeof structured[field] === 'string' && structured[field].trim().length > 0, label, `structured.${field} must be non-empty text`);
    check(!containsDevanagari(structured[field]), label, `structured.${field} must be English prose without Devanagari`);
  }
  const phrases = structured.phrases ?? [];
  const corrections = structured.corrections ?? [];
  check(Array.isArray(phrases) && phrases.length <= 8, label, 'structured.phrases must be an array of at most 8 items');
  check(Array.isArray(corrections) && corrections.length <= 6, label, 'structured.corrections must be an array of at most 6 items');
  phrases.forEach((phrase, index) => checkPhraseLike(phrase, `${label} phrases[${index}]`, { englishRequired: true }));
  corrections.forEach((correction, index) => {
    const itemLabel = `${label} corrections[${index}]`;
    check(correction !== null && typeof correction === 'object' && correction.youSaid && typeof correction.youSaid === 'object' && correction.say && typeof correction.say === 'object', itemLabel, 'expected youSaid and say objects');
    const { devanagari, romanized } = correction.youSaid;
    check((typeof devanagari === 'string' && containsDevanagari(devanagari)) || (typeof romanized === 'string' && containsLatin(romanized)), itemLabel, 'youSaid needs Devanagari or a romanization');
    if (typeof romanized === 'string') check(!containsDevanagari(romanized), itemLabel, 'youSaid.romanized must not contain Devanagari');
    checkPhraseLike(correction.say, `${itemLabel} say`, { englishRequired: false });
    if (correction.note !== undefined && correction.note !== null) {
      check(typeof correction.note === 'string' && !containsDevanagari(correction.note), itemLabel, 'note must be English without Devanagari');
    }
  });
  check(phrases.length > 0 || corrections.length > 0 || structured.intro || structured.outro, label, 'structured block was empty');
  return { corrections: corrections.length, phrases: phrases.length };
}
