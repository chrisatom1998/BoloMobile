import {
  AI_CONSENT_VERSION,
  dateKey,
  storageKeys,
  type AiConsentRecord,
  type PracticeState,
} from '@/lib/storage';
import type { LearnerProfile } from '@/state/app-state-types';

const clientId = 'screenshot-client-0001';

/** Local chat used by the iOS simulator screenshot flow. It never calls the network. */
export function screenshotChatFixtureEntries(now = new Date()): [string, string][] {
  const today = dateKey(now);
  const profile: LearnerProfile = {
    completed: true,
    displayName: 'Chris',
    level: 'new',
    microphoneTested: false,
    primaryGoal: 'conversation',
    responseLanguage: 'en',
    scriptPreference: 'both',
  };
  const practice: PracticeState = {
    chaiDone: false,
    date: today,
    liveDone: false,
    seconds: 0,
  };
  const consent: AiConsentRecord = { acceptedAt: '2026-10-31T15:00:00.000Z', version: AI_CONSENT_VERSION };
  const chat = [
    { id: 'shot-you', role: 'you', text: 'How do I greet a neighbor?' },
    { id: 'shot-asha', language: 'en', role: 'asha', text: 'Say namaste.' },
  ];
  return [
    [storageKeys.clientId, clientId],
    [storageKeys.learnerProfile, JSON.stringify(profile)],
    [storageKeys.goal, '10'],
    [storageKeys.phrases, '[]'],
    [storageKeys.phraseReviews, '{}'],
    [storageKeys.practice, JSON.stringify(practice)],
    [storageKeys.streakDays, '[]'],
    [storageKeys.practiceHistory, '[]'],
    [storageKeys.sceneProgress, '{}'],
    [storageKeys.reviewStreakDays, '[]'],
    [storageKeys.reminder, JSON.stringify({ enabled: false, hour: 19, minute: 0, notificationId: null })],
    [storageKeys.motionPreference, 'gentle'],
    [storageKeys.chatHistory, JSON.stringify(chat)],
    [storageKeys.aiConsent, JSON.stringify(consent)],
  ];
}
