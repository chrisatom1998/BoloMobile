import { useCallback, useEffect, useRef, useState } from 'react';

import { speakText } from '@/lib/speech';
import type { VoiceAudioMode } from '@/lib/voice';
import type { AshaResponseLanguage } from '@/state/app-state-types';

// One canonical message for every screen that surfaces a failed voice playback.
const playbackFallbackMessage = 'Bolo could not play the voice.';

type SpeakOptions = [
  signal?: AbortSignal,
  playbackRate?: number,
  language?: AshaResponseLanguage,
  audioMode?: VoiceAudioMode,
  normalizeGeneratedChatReply?: boolean,
];

export function useSpeakText() {
  const [audioError, setAudioError] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const clearAudioError = useCallback(() => {
    setAudioError('');
  }, []);

  // Options are forwarded as a rest tuple so callers keep the exact `speakText`
  // argument shape they need instead of always pinning a language or rate.
  // Resolves true only when playback ran, so callers can tell a heard hint from a failed one.
  const speak = useCallback(async (text: string, ...options: SpeakOptions): Promise<boolean> => {
    setAudioError('');
    try {
      await speakText(text, ...options);
      return true;
    } catch (error) {
      if (mountedRef.current && !options[0]?.aborted) {
        setAudioError(error instanceof Error ? error.message : playbackFallbackMessage);
      }
      return false;
    }
  }, []);

  return { audioError, clearAudioError, speak };
}
