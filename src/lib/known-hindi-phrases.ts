import { scenes } from '@/data/scenes';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import type { SavedPhrase } from '@/state/app-state-types';

const DEVANAGARI_WORD = /[\u0900-\u0963\u0971-\u097f]+/gu;
const LATIN_WORD = /[A-Za-z]+(?:['’-][A-Za-z]+)*/gu;
const TEXT_SEGMENT = /[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+/gu;

function normalizedLatin(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/aa/gu, 'a')
    .replace(/ee/gu, 'i')
    .replace(/oo/gu, 'u')
    .replace(/ei/gu, 'e')
    .replace(/w/gu, 'v')
    .replace(/[^a-z0-9]/gu, '');
}

function normalizedPhrase(text: string) {
  return normalizedLatin(romanizeDevanagari(text));
}

type PhraseIndexes = {
  phrases: Map<string, SavedPhrase>;
  hindiPhrases: Map<string, SavedPhrase>;
  words: Map<string, string>;
};

let cachedIndexes: PhraseIndexes | null = null;

function phraseIndexes() {
  if (cachedIndexes) return cachedIndexes;
  const phrases = new Map<string, SavedPhrase>();
  const hindiPhrases = new Map<string, SavedPhrase>();
  const wordCounts = new Map<string, Map<string, number>>();

  const addWord = (latin: string, hindi: string) => {
    const key = normalizedLatin(latin);
    if (!key || !DEVANAGARI_WORD.test(hindi)) return;
    DEVANAGARI_WORD.lastIndex = 0;
    const candidates = wordCounts.get(key) ?? new Map<string, number>();
    candidates.set(hindi, (candidates.get(hindi) ?? 0) + 1);
    wordCounts.set(key, candidates);
  };

  const addPhrase = (phrase: SavedPhrase) => {
    hindiPhrases.set(normalizedHindiDisplay(phrase.hi), phrase);
    hindiPhrases.set(normalizedHindiDisplay(phrase.latin), phrase);
    phrases.set(normalizedPhrase(phrase.hi), phrase);
    phrases.set(normalizedPhrase(phrase.latin), phrase);
    phrases.set(normalizedPhrase(phrase.en), phrase);
    const hindiWords = phrase.hi.match(DEVANAGARI_WORD) ?? [];
    const latinWords = phrase.latin.match(LATIN_WORD) ?? [];
    for (const hindi of hindiWords) addWord(romanizeDevanagari(hindi), hindi);
    if (hindiWords.length === latinWords.length) {
      hindiWords.forEach((hindi, index) => addWord(latinWords[index] ?? '', hindi));
    }
  };

  for (const scene of scenes) {
    scene.words.forEach((word) => addWord(romanizeDevanagari(word), word));
    for (const beat of scene.beats) {
      addPhrase({ hi: beat.npc, latin: romanizeDevanagari(beat.npc), en: beat.translation });
      for (const choice of beat.choices) {
        addPhrase({ hi: choice.hi, latin: choice.latin, en: choice.en });
        for (const word of choice.reply.match(DEVANAGARI_WORD) ?? []) {
          addWord(romanizeDevanagari(word), word);
        }
      }
    }
  }

  const words = new Map<string, string>();
  for (const [key, candidates] of wordCounts) {
    const winner = [...candidates].sort((a, b) => b[1] - a[1])[0];
    if (winner) words.set(key, winner[0]);
  }
  cachedIndexes = { phrases, hindiPhrases, words };
  return cachedIndexes;
}

export function knownSavedPhrase(text: string) {
  return phraseIndexes().phrases.get(normalizedPhrase(text));
}

export function knownDevanagariForRomanizedText(text: string) {
  const segments = text.match(TEXT_SEGMENT) ?? [];
  let latinWords = 0;
  let convertedWords = 0;
  const converted = segments.map((segment) => {
    if (!/[A-Za-z]/u.test(segment)) return segment;
    latinWords += 1;
    const hindi = phraseIndexes().words.get(normalizedLatin(segment));
    if (!hindi) return segment;
    convertedWords += 1;
    return hindi;
  }).join('').trim();
  // Partial Romanized Hindi plus English must not become mixed-script Hindi.
  // Any unrecognized Latin word means the full AI JSON fallback should run.
  if (latinWords === 0 || convertedWords !== latinWords) return null;
  return converted;
}


function normalizedHindiDisplay(text: string) {
  // These aliases are comparison keys only. Never replace words in free text.
  return normalizedPhrase(text.replace(/\bkripay(?:aa|a)\b/giu, 'kripya'));
}

/** Authoritative complete Hindi phrases only; English-meaning matches are excluded. */
export function knownHindiDisplayPhrase(text: string) {
  return phraseIndexes().hindiPhrases.get(normalizedHindiDisplay(text));
}
