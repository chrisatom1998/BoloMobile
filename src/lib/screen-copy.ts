/**
 * Short, warm lines for empty, loading, and error states.
 * Keep these in Bolo's voice: calm, specific, and free of placeholder text.
 */
export const screenCopy = {
  phrasesEmptyTitle: 'Nothing saved yet',
  phrasesEmptyBody: 'Finish a lesson, then save a line you want to keep. It will wait here.',
  phrasesNoMatchTitle: 'No phrases match',
  phrasesNoMatchBody: 'Try a different word, or clear the search and start again.',
  reviewEmptyTitle: 'Nothing to review yet',
  reviewEmptyBody: 'Save a phrase during a lesson and it becomes a short recall card here.',
  progressEmptyBody: 'Finish one short lesson. Your week, streak, and saved phrases will show up here.',
  offlineTitle: "You're offline",
  offlineBody: 'Lessons and saved phrases still work. Asha will be here when you are back online.',
  lessonPlansOfflineBody: 'Every plan is already on this phone. Asha waits until you are online.',
  micDeniedTitle: "Asha can't hear you yet",
  micDeniedBody: 'Microphone access is required before Asha can listen. Allow it in Settings, then come back.',
  voiceErrorTitle: "Asha couldn't connect",
  serverErrorTitle: "Bolo couldn't reach the server",
  serverErrorBody: 'Nothing you saved was lost. Try again when the connection is calmer.',
  loadingCaption: 'One moment.',
} as const;

export function voiceStatusTitle(message: string) {
  if (message === screenCopy.offlineBody) return screenCopy.offlineTitle;
  if (message === screenCopy.micDeniedBody) return screenCopy.micDeniedTitle;
  return screenCopy.voiceErrorTitle;
}
