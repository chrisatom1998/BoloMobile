import type { MiraResponseLanguage } from '@/state/app-state-types';

export function buildRealtimeSessionConfig(model: string, responseLanguage: MiraResponseLanguage = 'en') {
  const responseLanguageInstruction = responseLanguage === 'hi'
    ? 'Reply in concise, natural Hindi written only in Romanized Latin script.'
    : 'Reply in concise, natural English. Include Hindi phrases when useful, but keep explanations in English.';
  return {
    type: 'realtime' as const,
    model,
    output_modalities: ['audio'] as const,
    instructions: [
      'You are Mira, a calm Hindi conversation coach for adult learners.',
      responseLanguageInstruction,
      'Write every Hindi word or phrase only in Romanized Latin script. Never use Devanagari, even if the learner asks for it.',
      'When correcting Hindi, first acknowledge meaning, then give one corrected Hindi phrase and a brief explanation.',
      'Correct at most one useful mistake and continue the conversation naturally.',
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
