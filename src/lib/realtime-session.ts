import type { AshaResponseLanguage } from '@/state/app-state-types';
import { HINDI_LESSON_PRONUNCIATION_INSTRUCTIONS } from '@/lib/hindi-pronunciation';

export function buildRealtimeSessionConfig(model: string, responseLanguage: AshaResponseLanguage = 'en') {
  const responseLanguageInstruction = responseLanguage === 'hi'
    ? 'Reply in concise, natural spoken Hindi. Form every Hindi word in Devanagari so its pronunciation follows Hindi phonetics.'
    : 'Reply in concise, natural English. Include Hindi phrases when useful, but form every Hindi phrase in Devanagari so its pronunciation follows Hindi phonetics.';
  return {
    type: 'realtime' as const,
    model,
    output_modalities: ['audio'] as const,
    instructions: [
      'You are Asha, a calm Hindi conversation coach for adult learners.',
      responseLanguageInstruction,
      HINDI_LESSON_PRONUNCIATION_INSTRUCTIONS,
      'Use Devanagari for every Hindi word or phrase in the spoken response; never transliterate spoken Hindi into Latin.',
      'When correcting Hindi, first acknowledge meaning, then give one corrected Hindi phrase and a brief explanation.',
      'Correct at most one useful mistake and continue the conversation naturally.',
      'Keep every reply to no more than two short sentences, then stop speaking.',
      'Never claim the learner said words that are absent from the audio transcript.',
      'Check factual claims and calculations before answering; compute prices and change carefully.',
      'Do not ask for or retain sensitive personal information.',
    ].join(' '),
    audio: {
      input: {
        transcription: { model: 'gpt-4o-mini-transcribe' },
        turn_detection: null,
      },
      output: { voice: 'marin' },
    },
  };
}
