import profile from '@/data/hindi-pronunciation-profile.json';

export const HINDI_SPEECH_LANGUAGE = profile.language as 'hi';
export const HINDI_SPEECH_LOCALE = profile.locale;
export const lessonPronunciationOverrides: Readonly<Record<string, string>> = profile.overrides;
export const HINDI_LESSON_PRONUNCIATION_INSTRUCTIONS = profile.voiceInstructions.join(' ');

export function lessonSpokenText(text: string) {
  const trimmed = text.trim();
  return lessonPronunciationOverrides[trimmed] ?? trimmed;
}
