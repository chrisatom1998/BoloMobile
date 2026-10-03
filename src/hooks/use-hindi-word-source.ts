import { useEffect, useRef, useState } from 'react';

import { hindiSourcePhrase, MAX_WORD_DEFINITION_SOURCE_CHARACTERS } from '@/lib/contextual-word-definition';
import { prepareSavedPhraseFromText } from '@/services/bolo-api';

/** Resolve only a message already identified as Hindi by its caller. */
export function useHindiWordSource(clientId: string, phrase: string, visible: boolean) {
  const retainedSource = hindiSourcePhrase(phrase);
  const excerptLimit = retainedSource ? MAX_WORD_DEFINITION_SOURCE_CHARACTERS : 500;
  const needsExcerpt = (retainedSource || phrase.trim()).length > excerptLimit;
  const cacheRef = useRef(new Map<string, string>());
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; source?: string; error?: string }>({ key: '' });
  const key = `${clientId}:${phrase}`;
  const source = needsExcerpt ? '' : retainedSource || (result.key === key ? result.source : '') || '';
  const error = needsExcerpt ? `This reply is too long to prepare at once. Keep a Hindi excerpt of ${excerptLimit} characters or fewer below, then tap Prepare words.` : result.key === key ? result.error : undefined;

  useEffect(() => {
    if (!visible || !phrase.trim() || retainedSource || needsExcerpt) return;
    const cached = cacheRef.current.get(key);
    if (cached) {
      setResult({ key, source: cached });
      return;
    }
    const controller = new AbortController();
    setResult({ key });
    void prepareSavedPhraseFromText({ clientId, text: phrase }, controller.signal)
      .then((prepared) => {
        if (controller.signal.aborted) return;
        const resolved = hindiSourcePhrase(prepared.hi);
        if (!resolved) throw new Error('No Hindi words were found. Try a shorter Hindi excerpt.');
        // Cache only successful resolutions, scoped to this mounted tray.
        if (cacheRef.current.size >= 40) cacheRef.current.clear();
        cacheRef.current.set(key, resolved);
        setResult({ key, source: resolved });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, error: cause instanceof Error ? cause.message : 'Bolo could not prepare these Hindi words. Please try again.' });
      });
    return () => controller.abort();
  }, [attempt, clientId, key, needsExcerpt, phrase, retainedSource, visible]);

  return { source, error, needsExcerpt, loading: visible && !!phrase.trim() && !source && !error, retry: () => setAttempt((value) => value + 1) };
}
