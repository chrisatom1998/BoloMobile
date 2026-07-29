import {
  AI_CONSENT_VERSION,
  DEFAULT_MOTION_PREFERENCE,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_MESSAGE_CHARACTERS,
  MAX_DAILY_PRACTICE_SECONDS,
  appendChatHistory,
  calculateStreak,
  createAiConsentRecord,
  dateKey,
  emptyPractice,
  previousDate,
  sanitizeClientId,
  sanitizeGoal,
  sanitizeMotionPreference,
  sanitizeAiConsent,
  sanitizeChatHistory,
  sanitizePhraseReviews,
  sanitizePhrases,
  sanitizePractice,
  sanitizePracticeHistory,
  sanitizeReminder,
  sanitizeSceneProgress,
  sanitizeStreakDays,
  defaultReminderSettings,
} from '../src/lib/storage';

const nativeUuid = 'b7c1e2f3-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => nativeUuid) }));
const { randomUUID: expoRandomUUID } = jest.requireMock('expo-crypto') as { randomUUID: jest.Mock };

function expectDefined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected the value to be defined.');
  return value;
}

describe('local progress storage', () => {
  it('derives new client ids from a cryptographic source, not Math.random', () => {
    const globals = globalThis as { crypto?: Crypto };
    const original = globals.crypto;
    delete globals.crypto;
    try {
      // React Native has no global crypto, so expo-crypto must supply the id.
      const generated = sanitizeClientId(null);
      expect(expoRandomUUID).toHaveBeenCalled();
      expect(generated).toBe(nativeUuid);
      expect(generated).not.toContain('mobile-');
    } finally {
      if (original) globals.crypto = original;
    }
  });

  it('keeps a well-formed stored client id instead of regenerating it', () => {
    expect(sanitizeClientId('a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d')).toBe('a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d');
    expect(sanitizeClientId('short')).not.toBe('short');
  });

  it('uses local calendar dates and crosses month boundaries safely', () => {
    const value = new Date(2026, 6, 1, 23, 30);
    expect(dateKey(value)).toBe('2026-07-01');
    expect(previousDate('2026-07-01')).toBe('2026-06-30');
  });

  it('discards stale or malformed daily progress', () => {
    expect(sanitizePractice('{"date":"2026-07-12","seconds":50}', '2026-07-13')).toEqual(emptyPractice('2026-07-13'));
    expect(sanitizePractice('{bad json', '2026-07-13')).toEqual(emptyPractice('2026-07-13'));
    expect(sanitizePractice('{"date":"2026-07-13","chaiDone":true,"seconds":12.6}', '2026-07-13')).toEqual({
      date: '2026-07-13',
      chaiDone: true,
      liveDone: false,
      seconds: 13,
    });
    expect(sanitizePractice('{"date":"2026-07-13","seconds":"1e999"}', '2026-07-13').seconds).toBe(0);
    expect(sanitizePractice('{"date":"2026-07-13","seconds":999999999}', '2026-07-13').seconds)
      .toBe(MAX_DAILY_PRACTICE_SECONDS);
  });

  it('keeps the newest phrase reviews when the stored map exceeds the cap', () => {
    const review = { mastery: 1, intervalDays: 1, dueAt: dateKey(), lastReviewedAt: null, correctReviews: 1, totalReviews: 1 };
    const stored = Object.fromEntries(Array.from({ length: 250 }, (_, index) => [`phrase-${index}`, review]));
    const result = sanitizePhraseReviews(JSON.stringify(stored));
    expect(Object.keys(result)).toHaveLength(200);
    expect(result['phrase-0']).toBeUndefined();
    expect(result['phrase-249']).toEqual(review);
  });

  it('deduplicates phrases and only keeps valid records', () => {
    const value = JSON.stringify([
      { hi: 'नमस्ते', latin: 'Namaste', en: 'Hello' },
      { hi: 'नमस्ते', latin: 'Duplicate', en: 'Duplicate' },
      { hi: '', latin: 'Blank', en: 'Blank' },
      { hi: 'अधूरा', latin: '   ', en: 'Incomplete' },
      { hi: 'अर्थहीन', latin: 'Arthheen', en: '   ' },
      { hi: 'धन्यवाद', latin: 'Dhanyavaad', en: 'Thank you' },
      { hi: 'invalid' },
    ]);

    expect(sanitizePhrases(value)).toEqual([
      { hi: 'नमस्ते', latin: 'Namaste', en: 'Hello' },
      { hi: 'धन्यवाद', latin: 'Dhanyavaad', en: 'Thank you' },
    ]);
  });

  it('strictly validates chat history and discards malformed records', () => {
    const valid = { id: 'asha-1', role: 'asha', text: '  A useful reply.  ', language: 'en' };
    const value = JSON.stringify([
      valid,
      null,
      { id: '', role: 'you', text: 'Blank id' },
      { id: 'blank-text', role: 'you', text: '   ' },
      { id: 'bad-role', role: 'system', text: 'Not allowed' },
      { id: 'bad-language', role: 'asha', text: 'Not allowed', language: 'fr' },
      { id: 'oversized', role: 'asha', text: 'x'.repeat(MAX_CHAT_MESSAGE_CHARACTERS + 1) },
      { id: 'x'.repeat(129), role: 'you', text: 'Oversized id' },
    ]);

    expect(sanitizeChatHistory(value)).toEqual([
      { id: 'asha-1', role: 'asha', text: 'A useful reply.', language: 'en' },
    ]);
    expect(sanitizeChatHistory('{bad json')).toEqual([]);
    expect(sanitizeChatHistory('{}')).toEqual([]);
  });

  it('migrates prior coach identities to Asha for display', () => {
    const history = sanitizeChatHistory(JSON.stringify([
      { id: 'legacy-mira', role: 'mira', text: 'नमस्ते!' },
      { id: 'legacy-arjun', role: 'arjun', text: 'नमस्कार!' },
    ]));

    expect(history).toEqual([
      { id: 'legacy-mira', role: 'asha', text: 'नमस्ते!' },
      { id: 'legacy-arjun', role: 'asha', text: 'नमस्कार!' },
    ]);
  });

  it('keeps the newest 100 unique chat messages and lets the newest duplicate win', () => {
    const messages = Array.from({ length: MAX_CHAT_HISTORY_MESSAGES + 5 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 === 0 ? 'you' : 'asha',
      text: `Message ${index}`,
    }));
    messages.push({ id: `message-${MAX_CHAT_HISTORY_MESSAGES + 4}`, role: 'asha', text: 'Replacement' });

    const history = sanitizeChatHistory(JSON.stringify(messages));

    expect(history).toHaveLength(MAX_CHAT_HISTORY_MESSAGES);
    expect(expectDefined(history[0]).id).toBe('message-5');
    expect(history.at(-1)).toEqual({ id: 'message-104', role: 'asha', text: 'Replacement' });
  });

  it('bounds new chat text and rejects an invalid multi-message append atomically', () => {
    const current = [{ id: 'existing', role: 'asha' as const, text: 'Existing reply.' }];
    const appended = appendChatHistory(current, [
      { id: 'you-2', role: 'you', text: 'Learner turn.' },
      { id: 'asha-2', role: 'asha', text: 'x'.repeat(MAX_CHAT_MESSAGE_CHARACTERS + 50), language: 'en' },
    ]);

    expect(appended).toHaveLength(3);
    expect(expectDefined(appended[2]).text).toHaveLength(MAX_CHAT_MESSAGE_CHARACTERS);
    expect(appendChatHistory(current, [
      { id: 'you-3', role: 'you', text: 'Valid half.' },
      { id: '', role: 'asha', text: 'Invalid half.' },
    ])).toBe(current);
  });

  it('normalizes goals, streak days, and active streaks', () => {
    expect(sanitizeGoal('15')).toBe(15);
    expect(sanitizeGoal('99')).toBe(10);
    expect(sanitizeStreakDays('["2026-07-12","bad","2026-07-11","2026-07-12"]')).toEqual([
      '2026-07-11',
      '2026-07-12',
    ]);
    expect(calculateStreak(['2026-07-11', '2026-07-12'], false, '2026-07-13')).toBe(2);
    expect(calculateStreak(['2026-07-11', '2026-07-12', '2026-07-13'], true, '2026-07-13')).toBe(3);
  });

  it('requires the current versioned AI consent record', () => {
    const current = createAiConsentRecord(new Date('2026-07-13T20:00:00.000Z'));

    expect(AI_CONSENT_VERSION).toBe(8);
    expect(current).toEqual({ version: AI_CONSENT_VERSION, acceptedAt: '2026-07-13T20:00:00.000Z' });
    expect(sanitizeAiConsent(JSON.stringify(current))).toEqual(current);
    expect(sanitizeAiConsent('true')).toBeNull();
    expect(sanitizeAiConsent('{"version":0,"acceptedAt":"2026-07-13T20:00:00.000Z"}')).toBeNull();
    expect(sanitizeAiConsent('{"version":1,"acceptedAt":"not-a-date"}')).toBeNull();
  });
});

describe('scene progress storage', () => {
  it.each([
    ['nothing stored', null],
    ['malformed JSON', '{bad json'],
    ['an array where a map is expected', '[]'],
    ['a primitive', '"progress"'],
  ])('falls back to an empty map for %s', (_label, value) => {
    expect(sanitizeSceneProgress(value)).toEqual({});
  });

  it.each([
    ['uppercase letters', 'Chai-Stall'],
    ['more than 64 characters', 'a'.repeat(65)],
    ['underscores', 'chai_stall'],
    ['spaces', 'chai stall'],
    ['an empty name', ''],
  ])('drops scene ids with %s', (_label, sceneId) => {
    expect(sanitizeSceneProgress(JSON.stringify({ [sceneId]: { completions: 1 } }))).toEqual({});
  });

  it('zeroes non-integer counters and clamps oversized ones', () => {
    const progress = expectDefined(sanitizeSceneProgress(JSON.stringify({
      'chai-stall': {
        completions: 99_999,
        bestScore: '400',
        bestAccuracy: 250,
        totalCorrect: 3.5,
        totalAnswers: -4,
        lastBeatIndex: 900,
        lastPracticedAt: 'whenever',
        weakPhrases: [],
      },
    }))['chai-stall']);

    expect(progress).toEqual({
      completions: 10_000,
      bestScore: 0,
      bestAccuracy: 100,
      totalCorrect: 0,
      totalAnswers: 0,
      lastPracticedAt: null,
      lastBeatIndex: 100,
      weakPhrases: [],
    });
  });

  it('deduplicates weak phrases, drops non-strings, and keeps at most fifty', () => {
    const many = Array.from({ length: 60 }, (_, index) => `phrase-${index}`);
    const progress = expectDefined(sanitizeSceneProgress(JSON.stringify({
      'chai-stall': { weakPhrases: ['एक', 'एक', '   ', 7, null, 'दो'] },
      'auto-ride': { weakPhrases: many },
    }))['chai-stall']);

    expect(progress.weakPhrases).toEqual(['एक', 'दो']);
    expect(expectDefined(sanitizeSceneProgress(JSON.stringify({ 'auto-ride': { weakPhrases: many } }))['auto-ride'])
      .weakPhrases).toHaveLength(50);
  });

  it('keeps a valid practice timestamp and truncates beyond two hundred scenes', () => {
    const stored = Object.fromEntries(Array.from({ length: 210 }, (_, index) => [
      `scene-${index}`,
      { lastPracticedAt: '2026-07-13T20:00:00.000Z' },
    ]));
    const sanitized = sanitizeSceneProgress(JSON.stringify(stored));

    expect(Object.keys(sanitized)).toHaveLength(200);
    expect(expectDefined(sanitized['scene-0']).lastPracticedAt).toBe('2026-07-13T20:00:00.000Z');
    expect(sanitized['scene-205']).toBeUndefined();
  });
});

describe('phrase review storage', () => {
  it.each([
    ['nothing stored', null],
    ['malformed JSON', '{bad json'],
    ['an array where a map is expected', '[]'],
    ['a primitive', '12'],
  ])('falls back to an empty map for %s', (_label, value) => {
    expect(sanitizePhraseReviews(value)).toEqual({});
  });

  it.each([
    ['an empty key', ''],
    ['a whitespace key', '   '],
    ['a key longer than 300 characters', 'x'.repeat(301)],
  ])('drops reviews stored under %s', (_label, phrase) => {
    expect(sanitizePhraseReviews(JSON.stringify({ [phrase]: { mastery: 2 } }))).toEqual({});
  });

  it('clamps mastery, intervals, and review counts into their supported ranges', () => {
    const reviews = sanitizePhraseReviews(JSON.stringify({
      'नमस्ते': { mastery: 9, intervalDays: 900, correctReviews: 6, totalReviews: 2, dueAt: '2026-07-20' },
      'धन्यवाद': { mastery: -3, intervalDays: 2.5, correctReviews: 1, totalReviews: 4, dueAt: 'someday' },
    }));

    expect(expectDefined(reviews['नमस्ते'])).toEqual({
      mastery: 5,
      intervalDays: 365,
      dueAt: '2026-07-20',
      lastReviewedAt: null,
      correctReviews: 6,
      totalReviews: 6,
    });
    expect(expectDefined(reviews['धन्यवाद'])).toEqual({
      mastery: 0,
      intervalDays: 0,
      dueAt: dateKey(),
      lastReviewedAt: null,
      correctReviews: 1,
      totalReviews: 4,
    });
  });

  it('keeps at most two hundred reviews', () => {
    const stored = Object.fromEntries(Array.from({ length: 210 }, (_, index) => [`phrase-${index}`, { mastery: 1 }]));

    expect(Object.keys(sanitizePhraseReviews(JSON.stringify(stored)))).toHaveLength(200);
  });
});

describe('practice history storage', () => {
  it.each([
    ['nothing stored', null],
    ['malformed JSON', '{bad json'],
    ['an object where a list is expected', '{}'],
    ['a primitive', '"history"'],
  ])('falls back to an empty history for %s', (_label, value) => {
    expect(sanitizePracticeHistory(value)).toEqual([]);
  });

  it('drops undated entries, collapses duplicate days, and sorts the result', () => {
    expect(sanitizePracticeHistory(JSON.stringify([
      { date: '2026-07-13', seconds: 60, correct: 1, answers: 2, reviews: 3 },
      { date: 'yesterday', seconds: 60 },
      null,
      { date: '2026-07-11', seconds: 30, correct: 0, answers: 0, reviews: 0 },
      { date: '2026-07-13', seconds: 90, correct: 4, answers: 5, reviews: 6 },
    ]))).toEqual([
      { date: '2026-07-11', seconds: 30, correct: 0, answers: 0, reviews: 0 },
      { date: '2026-07-13', seconds: 90, correct: 4, answers: 5, reviews: 6 },
    ]);
  });

  it('rounds numeric strings and clamps each counter to its daily maximum', () => {
    expect(sanitizePracticeHistory(JSON.stringify([
      { date: '2026-07-13', seconds: '120.6', correct: 99_999, answers: -5, reviews: 'not a number' },
    ]))).toEqual([
      { date: '2026-07-13', seconds: 121, correct: 10_000, answers: 0, reviews: 0 },
    ]);
    expect(expectDefined(sanitizePracticeHistory(JSON.stringify([{ date: '2026-07-13', seconds: 999_999 }]))[0]).seconds)
      .toBe(MAX_DAILY_PRACTICE_SECONDS);
  });

  it('keeps only the most recent ninety days', () => {
    const stored = Array.from({ length: 120 }, (_, index) => ({
      date: dateKey(new Date(2026, 0, index + 1)),
      seconds: 60,
    }));
    const history = sanitizePracticeHistory(JSON.stringify(stored));

    expect(history).toHaveLength(90);
    expect(expectDefined(history[0]).date).toBe(dateKey(new Date(2026, 0, 31)));
    expect(expectDefined(history.at(-1)).date).toBe(dateKey(new Date(2026, 0, 120)));
  });
});

describe('practice reminder storage', () => {
  it.each([
    ['nothing stored', null],
    ['malformed JSON', '{bad json'],
    ['an array where an object is expected', '[]'],
    ['a primitive', 'true'],
  ])('falls back to the default reminder for %s', (_label, value) => {
    expect(sanitizeReminder(value)).toEqual(defaultReminderSettings());
  });

  it.each([
    ['a fractional hour', 18.5, 19],
    ['an hour past midnight', 99, 23],
    ['a negative hour', -4, 0],
    ['a string hour', '20', 19],
  ])('normalizes %s', (_label, hour, expected) => {
    expect(sanitizeReminder(JSON.stringify({ hour })).hour).toBe(expected);
  });

  it.each([
    ['a fractional minute', 30.5, 0],
    ['a minute past the hour', 90, 59],
    ['a negative minute', -1, 0],
    ['a string minute', '45', 0],
  ])('normalizes %s', (_label, minute, expected) => {
    expect(sanitizeReminder(JSON.stringify({ minute })).minute).toBe(expected);
  });

  it('only enables reminders for a literal true and keeps bounded notification ids', () => {
    expect(sanitizeReminder('{"enabled":"true"}').enabled).toBe(false);
    expect(sanitizeReminder('{"enabled":1}').enabled).toBe(false);
    expect(sanitizeReminder('{"enabled":true}').enabled).toBe(true);
    expect(sanitizeReminder('{"notificationId":"reminder-1"}').notificationId).toBe('reminder-1');
    expect(sanitizeReminder('{"notificationId":42}').notificationId).toBeNull();
    expect(sanitizeReminder(JSON.stringify({ notificationId: 'x'.repeat(201) })).notificationId).toBeNull();
  });
});

describe('movement preference storage', () => {
  it.each(['system', 'gentle', 'lively', 'reduced'] as const)('keeps the %s option', (preference) => {
    expect(sanitizeMotionPreference(preference)).toBe(preference);
  });

  it.each([null, '', 'fast', '{"value":"lively"}'])('falls back to gentle for %p', (value) => {
    expect(sanitizeMotionPreference(value)).toBe(DEFAULT_MOTION_PREFERENCE);
  });
});
