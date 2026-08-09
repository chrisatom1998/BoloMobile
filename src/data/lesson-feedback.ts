import type { Choice } from './scenes';
import { trimTerminalPunctuation } from '../lib/text';

/**
 * Distinctive words that must appear in the wrong-choice English but not in the
 * intended English before we accept a distractor. A tokenizer alone is not
 * enough: two natural translations of "Please give me a window seat." can share
 * every content word ("window", "seat", "please") without meaning something
 * different, and offering the learner two answers that mean the same thing is
 * ambiguous. The guard requires at least one content word to be truly unique to
 * the distractor and at least one to be truly unique to the target.
 */

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from', 'go',
  'can', 'could', 'get', 'has', 'have', 'i', 'in', 'is', 'it', 'its', 'like',
  'may', 'me', 'my', 'not', 'of', 'on',
  'or', 'our', 'please', 'she', 'that', 'the', 'their', 'them', 'then',
  'there', 'this', 'to', 'too', 'us', 'we', 'were', 'will', 'with', 'you',
  'would', 'your', 'am', 'bring', 'give', 'here', 'need', 'say', 'take',
  'tell', 'they', 'want',
]);

function normalizeEnglish(value: string) {
  return value.toLocaleLowerCase().replace(/[’']/gu, "'").replace(/[.,!?;:—–-]/gu, ' ').trim();
}

function contentTokens(value: string) {
  return normalizeEnglish(value)
    .split(/\s+/u)
    .map((token) => token.replace(/^'+|'+$/gu, ''))
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

/**
 * Two English lines are considered semantically equivalent when neither one
 * says anything the other does not. That is a much stricter check than string
 * equality and it is what protects a beat from a distractor that reads like a
 * paraphrase of the intended answer.
 */
export function englishMeaningsOverlap(a: string, b: string): boolean {
  const first = new Set(contentTokens(a));
  const second = new Set(contentTokens(b));
  if (first.size === 0 || second.size === 0) {
    // Content-word-free sentences (e.g. plain "Yes.") are treated as equivalent
    // when the raw normalized text matches. Otherwise fall back to non-overlap.
    return normalizeEnglish(a) === normalizeEnglish(b);
  }
  const uniqueToFirst = [...first].some((token) => !second.has(token));
  const uniqueToSecond = [...second].some((token) => !first.has(token));
  return !(uniqueToFirst && uniqueToSecond);
}

/**
 * Deterministic per-beat feedback string.
 *
 * The learner needs to see three things in plain English: what they actually
 * said, what they were supposed to say, and the exact Latin-Hindi pattern to
 * reach for next time. Everything is derived from the two choices, so the same
 * beat always produces the same wording between renders, sessions, and tests.
 *
 * Alternate-mode beats (word order, recall reveal) do not have a distractor to
 * quote back, so the caller passes `null` for `selected` and the sentence tells
 * the learner what they had to reach for and how to say it.
 */
export function buildLessonFeedback(target: Pick<Choice, 'en' | 'latin'>, selected: Pick<Choice, 'en'> | null): string {
  const targetEn = trimTerminalPunctuation(target.en);
  const pattern = trimTerminalPunctuation(target.latin);
  if (selected) {
    const selectedEn = trimTerminalPunctuation(selected.en);
    return `You chose “${selectedEn},” but the natural answer here means “${targetEn}.” Reach for “${pattern}.”`;
  }
  return `The natural answer here means “${targetEn}.” Reach for “${pattern}.”`;
}

/**
 * Explains a target for alternate practice modes where no distractor exists.
 * Kept as a thin wrapper so the runtime never has to know the null contract.
 */
export function buildAlternateFeedback(target: Pick<Choice, 'en' | 'latin'>): string {
  return buildLessonFeedback(target, null);
}
