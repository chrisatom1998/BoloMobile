import { AI_VOICE_TEXT_LIMIT } from '@/services/bolo-api';

function preferredSplit(text: string): number {
  const minimum = Math.floor(AI_VOICE_TEXT_LIMIT * 0.55);
  for (let index = AI_VOICE_TEXT_LIMIT; index >= minimum; index -= 1) {
    if (/\s/u.test(text[index] ?? '')) return index;
    if (/[.!?।,;:]/u.test(text[index - 1] ?? '')) return index;
  }
  return AI_VOICE_TEXT_LIMIT;
}

export function splitAiVoiceText(text: string): string[] {
  let remaining = text.trim().replace(/\s+/gu, ' ');
  const chunks: string[] = [];

  while (remaining.length > AI_VOICE_TEXT_LIMIT) {
    const splitAt = preferredSplit(remaining);
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
