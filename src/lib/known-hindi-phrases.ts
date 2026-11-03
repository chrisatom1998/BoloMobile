import { scenes } from '@/data/scenes';
import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import type { SavedPhrase } from '@/state/app-state-types';

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
};

let cachedIndexes: PhraseIndexes | null = null;

function phraseIndexes() {
  if (cachedIndexes) return cachedIndexes;
  const phrases = new Map<string, SavedPhrase>();
  const hindiPhrases = new Map<string, SavedPhrase>();

  const addPhrase = (phrase: SavedPhrase) => {
    hindiPhrases.set(normalizedHindiDisplay(phrase.hi), phrase);
    hindiPhrases.set(normalizedHindiDisplay(phrase.latin), phrase);
    phrases.set(normalizedPhrase(phrase.hi), phrase);
    phrases.set(normalizedPhrase(phrase.latin), phrase);
    phrases.set(normalizedPhrase(phrase.en), phrase);
  };

  for (const scene of scenes) {
    for (const beat of scene.beats) {
      addPhrase({ hi: beat.npc, latin: romanizeDevanagari(beat.npc), en: beat.translation });
      for (const choice of beat.choices) {
        addPhrase({ hi: choice.hi, latin: choice.latin, en: choice.en });
      }
    }
  }

  cachedIndexes = { phrases, hindiPhrases };
  return cachedIndexes;
}

export function knownSavedPhrase(text: string) {
  return phraseIndexes().phrases.get(normalizedPhrase(text));
}

function normalizedHindiDisplay(text: string) {
  // These aliases are comparison keys only. Never replace words in free text.
  return normalizedPhrase(text.replace(/\bkripay(?:aa|a)\b/giu, 'kripya'));
}

/** Authoritative complete Hindi phrases only; English-meaning matches are excluded. */
export function knownHindiDisplayPhrase(text: string) {
  return phraseIndexes().hindiPhrases.get(normalizedHindiDisplay(text));
}
