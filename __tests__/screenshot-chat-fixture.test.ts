import { screenshotChatFixtureEntries } from '../src/lib/screenshot-chat-fixture';
import { AI_CONSENT_VERSION, sanitizeAiConsent, sanitizeChatHistory, sanitizeLearnerProfile, storageKeys } from '../src/lib/storage';

describe('screenshot chat fixture', () => {
  it('seeds a finished learner, consent, and the two-message chat', () => {
    const entries = Object.fromEntries(screenshotChatFixtureEntries(new Date('2026-11-01T12:00:00.000Z')));
    expect(sanitizeLearnerProfile(entries[storageKeys.learnerProfile] ?? null).completed).toBe(true);
    expect(sanitizeAiConsent(entries[storageKeys.aiConsent] ?? null)?.version).toBe(AI_CONSENT_VERSION);
    expect(sanitizeChatHistory(entries[storageKeys.chatHistory] ?? null).map((message) => message.text)).toEqual([
      'How do I greet a neighbor?',
      'Say namaste.',
    ]);
  });
});
