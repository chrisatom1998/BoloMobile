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

export type SpeechResult = {
  status: 'played' | 'cancelled' | 'failed';
  started: boolean;
};

function optionsWithPlaybackObserver(options: SpeakOptions, onPlaybackStarted: () => void) {
  const [signal, playbackRate, language, audioMode, normalizeGeneratedChatReply] = options;
  return [signal, playbackRate, language, audioMode, normalizeGeneratedChatReply, onPlaybackStarted] as const;
}

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

  // Keep the boolean API for callers that only need completion. Review hints
  // also need to know whether an interrupted clip could already have been heard.
  const runSpeech = useCallback(async (
    text: string, options: SpeakOptions, trackPlayback: boolean,
  ): Promise<SpeechResult> => {
    setAudioError('');
    let started = false;
    try {
      const played = trackPlayback
        ? await speakText(text, ...optionsWithPlaybackObserver(options, () => { started = true; }))
        : await speakText(text, ...options);
      return { status: played ? 'played' : 'cancelled', started: started || played };
    } catch (error) {
      if (mountedRef.current && !options[0]?.aborted) {
        setAudioError(error instanceof Error ? error.message : playbackFallbackMessage);
      }
      return { status: 'failed', started };
    }
  }, []);

  const speak = useCallback(async (text: string, ...options: SpeakOptions): Promise<boolean> => {
    return (await runSpeech(text, options, false)).status === 'played';
  }, [runSpeech]);

  const speakWithResult = useCallback((text: string, ...options: SpeakOptions) => {
    return runSpeech(text, options, true);
  }, [runSpeech]);

  return { audioError, clearAudioError, speak, speakWithResult };
}
