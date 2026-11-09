import {
  sanitizeAiConsent,
  sanitizeChatHistory,
  sanitizeLearnerProfile,
  sanitizePhraseReviews,
  sanitizePhrases,
  sanitizePractice,
  sanitizePracticeHistory,
  sanitizeReminder,
  sanitizeSceneProgress,
  storageKeys,
} from '../src/lib/storage';
import { screenshotFixtureEntries } from '../src/lib/screenshot-fixtures';

const now = new Date(2026, 9, 31, 12, 0, 0);

function entries(name: string) {
  return Object.fromEntries(screenshotFixtureEntries(name, now));
}

describe('screenshot fixtures', () => {
  it('rejects an unknown fixture', () => {
    expect(() => screenshotFixtureEntries('store', now)).toThrow('Unknown screenshot fixture "store".');
  });

  it('seeds Today with due phrases and no finished lesson', () => {
    const stored = entries('today');
    const profile = sanitizeLearnerProfile(stored[storageKeys.learnerProfile] ?? null);
    const phrases = sanitizePhrases(stored[storageKeys.phrases] ?? null);
    const reviews = sanitizePhraseReviews(stored[storageKeys.phraseReviews] ?? null);
    const progress = sanitizeSceneProgress(stored[storageKeys.sceneProgress] ?? null);

    expect(profile.completed).toBe(true);
    expect(profile.displayName).toBe('Chris');
    expect(phrases.map((phrase) => phrase.en)).toEqual(['One tea, please.', 'Less sugar, please.']);
    expect(phrases.every((phrase) => reviews[phrase.hi]?.dueAt === '2026-10-31')).toBe(true);
    expect(progress).toEqual({});
    expect(sanitizeAiConsent(stored[storageKeys.aiConsent] ?? null)).toBeNull();
  });

  it('seeds one speak-first review card', () => {
    const stored = entries('review');
    const phrases = sanitizePhrases(stored[storageKeys.phrases] ?? null);
    const reviews = sanitizePhraseReviews(stored[storageKeys.phraseReviews] ?? null);

    expect(phrases).toHaveLength(1);
    expect(reviews[phrases[0]?.hi ?? '']?.mastery).toBe(0);
  });

  it('seeds progress with practice days and a finished lesson', () => {
    const stored = entries('progress');
    const history = sanitizePracticeHistory(stored[storageKeys.practiceHistory] ?? null);
    const progress = sanitizeSceneProgress(stored[storageKeys.sceneProgress] ?? null);
    const practice = sanitizePractice(stored[storageKeys.practice] ?? null, '2026-10-31');

    expect(history.map((day) => day.date)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31']);
    expect(progress.chai?.completions).toBe(1);
    expect(practice.seconds).toBe(600);
  });

  it('leaves the first lesson unfinished so the reminder offer can appear', () => {
    const stored = entries('reminder');
    const reminder = sanitizeReminder(stored[storageKeys.reminder] ?? null);
    const progress = sanitizeSceneProgress(stored[storageKeys.sceneProgress] ?? null);

    expect(reminder.enabled).toBe(false);
    expect(progress).toEqual({});
  });

  it('stores a structured chat reply without dropping the plain text', () => {
    const stored = entries('chat');
    const raw = stored[storageKeys.chatHistory] ?? '';
    const history = sanitizeChatHistory(raw);

    expect(raw).toContain('"intro":"Greet them like this."');
    expect(raw).toContain('"devanagari":"नमस्ते"');
    expect(history.map((message) => message.text)).toEqual(['How do I greet a neighbor?', 'Say namaste.']);
    expect(sanitizeAiConsent(stored[storageKeys.aiConsent] ?? null)?.version).toBe(10);
  });
});
