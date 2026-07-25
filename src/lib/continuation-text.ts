type TokenSpan = {
  end: number;
  normalized: string;
};

const WORD = /[\p{L}\p{M}\p{N}]+/gu;
const MAX_OVERLAP_WORDS = 32;

function tokenSpans(text: string): TokenSpan[] {
  return [...text.matchAll(WORD)].map((match) => ({
    end: (match.index ?? 0) + match[0].length,
    normalized: match[0].normalize('NFC').toLocaleLowerCase(),
  }));
}

/** Joins a streamed continuation while removing words repeated at its boundary. */
export function appendContinuationText(existing: string, continuation: string) {
  const base = existing.trim();
  const next = continuation.trim();
  if (!base) return next;
  if (!next) return base;

  const baseTokens = tokenSpans(base);
  const nextTokens = tokenSpans(next);
  const maximum = Math.min(MAX_OVERLAP_WORDS, baseTokens.length, nextTokens.length);
  let overlap = 0;

  for (let length = maximum; length >= 1; length -= 1) {
    const baseStart = baseTokens.length - length;
    const matches = Array.from({ length }, (_, index) => {
      const baseToken = baseTokens[baseStart + index];
      const nextToken = nextTokens[index];
      return baseToken !== undefined && nextToken !== undefined && baseToken.normalized === nextToken.normalized;
    }).every(Boolean);
    if (matches) {
      overlap = length;
      break;
    }
  }

  const overlapEnd = overlap > 0 ? nextTokens[overlap - 1]?.end : undefined;
  const remainder = overlapEnd === undefined ? next : next.slice(overlapEnd).trimStart();
  if (!remainder) return base;
  return /^[,.;:!?।]/u.test(remainder) ? `${base}${remainder}` : `${base} ${remainder}`;
}

export function continuationTail(text: string, maximumWords = 12) {
  const words = text.trim().match(WORD) ?? [];
  return words.slice(-maximumWords).join(' ');
}
