/**
 * iOS keyboard substitutions must never rewrite learner-authored Hindi,
 * Romanized Hindi, names, punctuation, or phrase text.
 */
export const EXACT_LEARNER_TEXT_INPUT_PROPS = {
  autoCapitalize: 'none' as const,
  autoComplete: 'off' as const,
  autoCorrect: false,
  spellCheck: false,
  smartDashesType: 'no' as const,
  smartInsertDelete: false,
  smartQuotesType: 'no' as const,
};
