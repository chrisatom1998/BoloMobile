/** A small, shared contract for an optional recap of provisional conversation captions. */
export type RecapMessage = { id: string; role: 'you' | 'asha'; text: string };
export type RecapCorrection = {
  sourceId: string;
  original: string;
  hi: string;
  latin: string;
  en: string;
  explanation: string;
};
export type RecapResponse = { corrections: RecapCorrection[] };

export const MAX_RECAP_MESSAGES = 12;
export const MAX_RECAP_TEXT_CHARACTERS = 600;
export const MAX_RECAP_TEXT_BYTES = 6_000;
export const MAX_RECAP_CORRECTIONS = 3;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function recapTextBytes(value: string): number {
  // Does not depend on TextEncoder being present in the mobile runtime.
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function isRecapMessage(value: unknown): value is RecapMessage {
  return record(value)
    && typeof value.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.id)
    && (value.role === 'you' || value.role === 'asha')
    && typeof value.text === 'string' && value.text.length <= MAX_RECAP_TEXT_CHARACTERS;
}

export function hasUncertainRecapText(text: string): boolean {
  return /\[(?:inaudible|unintelligible|unclear|unknown|noise|silence|music|\?+)[^\]]*\]|<(?:inaudible|unintelligible|unclear)>/iu.test(text);
}

/** Keep whole recent caption rows without adding truncation. Rows are provisional, not completed-turn evidence. */
export function selectRecapMessages(messages: readonly RecapMessage[]): RecapMessage[] {
  if (!Array.isArray(messages)) return [];
  const recent: unknown[] = messages.slice(-128);
  const idCounts = new Map<string, number>();
  for (const row of recent) {
    if (record(row) && typeof row.id === 'string') idCounts.set(row.id, (idCounts.get(row.id) ?? 0) + 1);
  }
  const selected: RecapMessage[] = [];
  let bytes = 0;
  for (const row of recent.reverse()) {
    if (!isRecapMessage(row) || !row.text.trim() || idCounts.get(row.id) !== 1 || hasUncertainRecapText(row.text)) continue;
    const size = recapTextBytes(row.text);
    if (bytes + size > MAX_RECAP_TEXT_BYTES) continue;
    selected.unshift({ id: row.id, role: row.role, text: row.text });
    bytes += size;
    if (selected.length === MAX_RECAP_MESSAGES) break;
  }
  return selected;
}

function bounded(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function comparisonText(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
}

function latinText(value: string): boolean {
  return /\p{Script=Latin}/u.test(value) && /^[\p{Script=Latin}\p{M}\p{N}\p{P}\p{Sc}\p{Z}\s]+$/u.test(value)
    && !/[\u0900-\u097f]/u.test(value);
}

/** Reject the entire client payload if any item is ungrounded or malformed. */
export function parseRecapResponse(value: unknown, messages: readonly RecapMessage[]): RecapResponse | null {
  if (!record(value) || Object.keys(value).length !== 1 || !Array.isArray(value.corrections)
    || value.corrections.length > MAX_RECAP_CORRECTIONS) return null;
  const sources = selectRecapMessages(messages).filter(row => row.role === 'you');
  const sourceIds = new Set<string>();
  const correctedTexts = new Set<string>();
  const corrections: RecapCorrection[] = [];
  for (const item of value.corrections) {
    if (!record(item) || Object.keys(item).length !== 6
      || typeof item.sourceId !== 'string' || typeof item.original !== 'string'
      || !bounded(item.hi, 600) || !bounded(item.latin, 600)
      || !bounded(item.en, 400) || !bounded(item.explanation, 400)
      || !/\p{L}/u.test(item.hi)
      || !/^[\u0900-\u097f\p{N}\p{P}\p{Sc}\p{Z}\s]+$/u.test(item.hi)
      || !latinText(item.latin) || !latinText(item.en) || !latinText(item.explanation)) return null;
    const source = sources.find(row => row.id === item.sourceId);
    const correctedText = comparisonText(item.hi);
    if (!source || item.original !== source.text || sourceIds.has(item.sourceId)
      || correctedTexts.has(correctedText)
      || comparisonText(item.original) === correctedText
      || comparisonText(item.original) === comparisonText(item.latin)) return null;
    sourceIds.add(item.sourceId);
    correctedTexts.add(correctedText);
    corrections.push({ sourceId: item.sourceId, original: item.original, hi: item.hi, latin: item.latin, en: item.en, explanation: item.explanation });
  }
  return { corrections };
}
