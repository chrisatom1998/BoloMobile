import {
  AI_CONSENT_VERSION,
  dateKey,
  previousDate,
  storageKeys,
  type AiConsentRecord,
  type PracticeState,
} from '@/lib/storage';
import type { LearnerProfile, PhraseReview, PracticeDay, SavedPhrase, SceneProgress } from '@/state/app-state-types';

/**
 * Local AsyncStorage snapshots for the iOS simulator screenshot workflow.
 * They never call the network. The screenshot route writes one snapshot only
 * when this install has not already finished onboarding.
 */
export const screenshotFixtureNames = ['today', 'phrases', 'review', 'progress', 'asha', 'chat', 'reminder'] as const;

export type ScreenshotFixtureName = (typeof screenshotFixtureNames)[number];

const savedPhrases: SavedPhrase[] = [
  { hi: 'एक चाय दीजिए।', latin: 'Ek chai dijiye.', en: 'One tea, please.' },
  { hi: 'चीनी कम, कृपया।', latin: 'Cheeni kam, kripya.', en: 'Less sugar, please.' },
];

const clientId = 'screenshot-client-0001';

function reviewPhrase(): SavedPhrase {
  const phrase = savedPhrases[0];
  if (!phrase) throw new Error('Missing review phrase.');
  return phrase;
}

export function isScreenshotFixtureName(name: string): name is ScreenshotFixtureName {
  return (screenshotFixtureNames as readonly string[]).includes(name);
}

export function screenshotFixtureEntries(name: string, now = new Date()): [string, string][] {
  const fixture = parseFixtureName(name);
  const today = dateKey(now);
  switch (fixture) {
    case 'today':
      return onboarded(today, { phrases: savedPhrases, practiceSeconds: 240 });
    case 'phrases':
      return onboarded(today, { phrases: savedPhrases, practiceSeconds: 240 });
    case 'review':
      return onboarded(today, { phrases: [reviewPhrase()], practiceSeconds: 0 });
    case 'progress':
      return onboarded(today, {
        phrases: savedPhrases,
        practiceSeconds: 600,
        history: practiceHistory(today),
        sceneProgress: { chai: completedScene(now) },
      });
    case 'asha':
      return onboarded(today, { phrases: [], practiceSeconds: 0 });
    case 'chat':
      return onboarded(today, { phrases: [], practiceSeconds: 0, chat: true });
    case 'reminder':
      return onboarded(today, { phrases: [], practiceSeconds: 0, sceneProgress: {} });
    default: {
      const unreachable: never = fixture;
      return unreachable;
    }
  }
}

function parseFixtureName(name: string): ScreenshotFixtureName {
  switch (name) {
    case 'today':
    case 'phrases':
    case 'review':
    case 'progress':
    case 'asha':
    case 'chat':
    case 'reminder':
      return name;
    default:
      throw new Error(`Unknown screenshot fixture "${name}".`);
  }
}

function onboarded(today: string, options: {
  phrases: SavedPhrase[];
  practiceSeconds: number;
  history?: PracticeDay[];
  sceneProgress?: Record<string, SceneProgress>;
  chat?: boolean;
}): [string, string][] {
  const profile: LearnerProfile = {
    completed: true,
    displayName: 'Chris',
    level: 'new',
    scriptPreference: 'both',
    primaryGoal: 'conversation',
    responseLanguage: 'en',
    microphoneTested: false,
  };
  const practice: PracticeState = {
    date: today,
    chaiDone: false,
    liveDone: false,
    seconds: options.practiceSeconds,
  };
  const reviews = Object.fromEntries(options.phrases.map((phrase) => [phrase.hi, dueReview(today)]));
  const entries: [string, string][] = [
    [storageKeys.clientId, clientId],
    [storageKeys.learnerProfile, JSON.stringify(profile)],
    [storageKeys.goal, '10'],
    [storageKeys.phrases, JSON.stringify(options.phrases)],
    [storageKeys.phraseReviews, JSON.stringify(reviews)],
    [storageKeys.practice, JSON.stringify(practice)],
    [storageKeys.streakDays, JSON.stringify(options.practiceSeconds > 0 ? [today] : [])],
    [storageKeys.practiceHistory, JSON.stringify(options.history ?? [])],
    [storageKeys.sceneProgress, JSON.stringify(options.sceneProgress ?? {})],
    [storageKeys.reviewStreakDays, JSON.stringify([])],
    [storageKeys.reminder, JSON.stringify({ enabled: false, hour: 19, minute: 0, notificationId: null })],
    [storageKeys.motionPreference, 'gentle'],
    [storageKeys.chatHistory, JSON.stringify(options.chat ? chatHistory() : [])],
  ];
  if (options.chat) {
    const consent: AiConsentRecord = { version: AI_CONSENT_VERSION, acceptedAt: '2026-10-31T15:00:00.000Z' };
    entries.push([storageKeys.aiConsent, JSON.stringify(consent)]);
  }
  return entries;
}

function dueReview(today: string): PhraseReview {
  return {
    mastery: 0,
    intervalDays: 0,
    dueAt: today,
    lastReviewedAt: null,
    correctReviews: 0,
    totalReviews: 0,
  };
}

function practiceHistory(today: string): PracticeDay[] {
  const yesterday = previousDate(today);
  const dayBefore = previousDate(yesterday);
  return [
    { date: dayBefore, seconds: 300, correct: 2, answers: 2, reviews: 0 },
    { date: yesterday, seconds: 480, correct: 3, answers: 4, reviews: 1 },
    { date: today, seconds: 600, correct: 2, answers: 2, reviews: 0 },
  ];
}

function completedScene(now: Date): SceneProgress {
  return {
    completions: 1,
    bestScore: 2,
    bestAccuracy: 100,
    totalCorrect: 2,
    totalAnswers: 2,
    lastPracticedAt: now.toISOString(),
    lastBeatIndex: 1,
    weakPhrases: [],
  };
}

function chatHistory() {
  return [
    { id: 'shot-you', role: 'you', text: 'How do I greet a neighbor?' },
    {
      id: 'shot-asha',
      role: 'asha',
      text: 'Say namaste.',
      language: 'en',
      structured: {
        version: 1,
        intro: 'Greet them like this.',
        phrases: [{ devanagari: 'नमस्ते', romanized: 'Namaste', english: 'Hello' }],
      },
    },
  ];
}
