const INDEPENDENT_VOWELS: Record<string, string> = {
  अ: 'a',
  आ: 'aa',
  इ: 'i',
  ई: 'ee',
  उ: 'u',
  ऊ: 'oo',
  ऋ: 'ri',
  ए: 'e',
  ऐ: 'ai',
  ओ: 'o',
  औ: 'au',
};

const VOWEL_SIGNS: Record<string, string> = {
  'ा': 'aa',
  'ि': 'i',
  'ी': 'ee',
  'ु': 'u',
  'ू': 'oo',
  'ृ': 'ri',
  'े': 'e',
  'ै': 'ai',
  'ो': 'o',
  'ौ': 'au',
};

const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'ng',
  च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'ny',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n',
  त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm',
  य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh', ष: 'sh', स: 's', ह: 'h', ळ: 'l',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'd', 'ढ़': 'dh', 'फ़': 'f', 'य़': 'y',
};

const MARKS: Record<string, string> = {
  'ं': 'n',
  'ँ': 'n',
  'ः': 'h',
  'ऽ': "'",
};

const DIGITS: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

const VIRAMA = '्';
const NUKTA = '़';
const DEVANAGARI_LETTER_OR_MARK = /[\u0900-\u0963\u0971-\u097F]/u;
const BOLO_WORD_SPELLINGS: Record<string, string> = {
  आशा: 'Asha',
};

function isWordBoundary(character: string | undefined) {
  return !character || !DEVANAGARI_LETTER_OR_MARK.test(character);
}

function capitalizeSentences(text: string) {
  return text.replace(/(^|[.!?।]\s+)([a-z])/gu, (_match, prefix: string, letter: string) => (
    `${prefix}${letter.toUpperCase()}`
  ));
}

/**
 * Converts Devanagari portions of a mixed-language transcript to the same
 * learner-friendly Latin alphabet used throughout Bolo. English and
 * punctuation pass through unchanged.
 */
export function romanizeDevanagari(text: string) {
  const normalized = text.normalize('NFC').replace(/[\u0900-\u0963\u0970-\u097F]+/gu, (word) => (
    BOLO_WORD_SPELLINGS[word] ?? word
  ));
  const characters = Array.from(normalized);
  let result = '';

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (character === undefined) continue;

    const independentVowel = INDEPENDENT_VOWELS[character];
    if (independentVowel !== undefined) {
      result += independentVowel;
      continue;
    }

    let consonantKey = character;
    let nextIndex = index + 1;
    if (characters[nextIndex] === NUKTA && CONSONANTS[`${character}${NUKTA}`]) {
      consonantKey = `${character}${NUKTA}`;
      nextIndex += 1;
    }

    const consonant = CONSONANTS[consonantKey];
    if (consonant) {
      const nextCharacter = characters[nextIndex];
      const vowel = nextCharacter ? VOWEL_SIGNS[nextCharacter] : undefined;
      result += consonant;
      if (vowel !== undefined) {
        result += vowel;
        index = nextIndex;
      } else if (nextCharacter === VIRAMA) {
        index = nextIndex;
      } else if (!isWordBoundary(nextCharacter)) {
        result += 'a';
      }
      continue;
    }

    const vowelSign = VOWEL_SIGNS[character];
    if (vowelSign !== undefined) {
      result += vowelSign;
      continue;
    }
    const mark = MARKS[character];
    if (mark !== undefined) {
      result += mark;
      continue;
    }
    const digit = DIGITS[character];
    if (digit !== undefined) {
      result += digit;
      continue;
    }
    if (character === '।' || character === '॥') {
      result += '.';
      continue;
    }
    if (character !== VIRAMA && character !== NUKTA) result += character;
  }

  return capitalizeSentences(result);
}
