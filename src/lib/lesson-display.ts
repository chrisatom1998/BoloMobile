import { romanizeDevanagari } from '@/lib/devanagari-romanization';
import type { ScriptPreference } from '@/state/app-state-types';

/** Display only: callers retain the original Hindi for speech and answer checks. */
export function lessonHindiLabel(hi: string, preference: ScriptPreference, latin = romanizeDevanagari(hi)) {
  if (preference === 'latin') return latin;
  if (preference === 'devanagari') return hi;
  return `${hi}\n${latin}`;
}
