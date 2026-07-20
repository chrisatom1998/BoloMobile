import {
  AI_CONSENT_VERSION,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_MESSAGE_CHARACTERS,
  MAX_DAILY_PRACTICE_SECONDS,
  appendChatHistory,
  calculateStreak,
  createAiConsentRecord,
  dateKey,
  emptyPractice,
  previousDate,
  sanitizeGoal,
  sanitizeAiConsent,
  sanitizeChatHistory,
  sanitizePhrases,
  sanitizePractice,
  sanitizeStreakDays,
} from '../src/lib/storage';

describe('local progress storage', () => {
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

  it('deduplicates phrases and only keeps valid records', () => {
    const value = JSON.stringify([
      { hi: 'नमस्ते', latin: 'Namaste', en: 'Hello' },
      { hi: 'नमस्ते', latin: 'Duplicate', en: 'Duplicate' },
      { hi: '', latin: 'Blank', en: 'Blank' },
      { hi: 'धन्यवाद', latin: 'Dhanyavaad', en: 'Thank you' },
      { hi: 'invalid' },
    ]);

    expect(sanitizePhrases(value)).toEqual([
      { hi: 'नमस्ते', latin: 'Namaste', en: 'Hello' },
      { hi: 'धन्यवाद', latin: 'Dhanyavaad', en: 'Thank you' },
    ]);
  });

  it('strictly validates chat history and discards malformed records', () => {
    const valid = { id: 'mira-1', role: 'mira', text: '  A useful reply.  ', language: 'en' };
    const value = JSON.stringify([
      valid,
      null,
      { id: '', role: 'you', text: 'Blank id' },
      { id: 'blank-text', role: 'you', text: '   ' },
      { id: 'bad-role', role: 'system', text: 'Not allowed' },
      { id: 'bad-language', role: 'mira', text: 'Not allowed', language: 'fr' },
      { id: 'oversized', role: 'mira', text: 'x'.repeat(MAX_CHAT_MESSAGE_CHARACTERS + 1) },
      { id: 'x'.repeat(129), role: 'you', text: 'Oversized id' },
    ]);

    expect(sanitizeChatHistory(value)).toEqual([
      { id: 'mira-1', role: 'mira', text: 'A useful reply.', language: 'en' },
    ]);
    expect(sanitizeChatHistory('{bad json')).toEqual([]);
    expect(sanitizeChatHistory('{}')).toEqual([]);
  });

  it('keeps the newest 100 unique chat messages and lets the newest duplicate win', () => {
    const messages = Array.from({ length: MAX_CHAT_HISTORY_MESSAGES + 5 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 === 0 ? 'you' : 'mira',
      text: `Message ${index}`,
    }));
    messages.push({ id: `message-${MAX_CHAT_HISTORY_MESSAGES + 4}`, role: 'mira', text: 'Replacement' });

    const history = sanitizeChatHistory(JSON.stringify(messages));

    expect(history).toHaveLength(MAX_CHAT_HISTORY_MESSAGES);
    expect(history[0].id).toBe('message-5');
    expect(history.at(-1)).toEqual({ id: 'message-104', role: 'mira', text: 'Replacement' });
  });

  it('bounds new chat text and rejects an invalid multi-message append atomically', () => {
    const current = [{ id: 'existing', role: 'mira' as const, text: 'Existing reply.' }];
    const appended = appendChatHistory(current, [
      { id: 'you-2', role: 'you', text: 'Learner turn.' },
      { id: 'mira-2', role: 'mira', text: 'x'.repeat(MAX_CHAT_MESSAGE_CHARACTERS + 50), language: 'en' },
    ]);

    expect(appended).toHaveLength(3);
    expect(appended[2].text).toHaveLength(MAX_CHAT_MESSAGE_CHARACTERS);
    expect(appendChatHistory(current, [
      { id: 'you-3', role: 'you', text: 'Valid half.' },
      { id: '', role: 'mira', text: 'Invalid half.' },
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

    expect(AI_CONSENT_VERSION).toBe(6);
    expect(current).toEqual({ version: AI_CONSENT_VERSION, acceptedAt: '2026-07-13T20:00:00.000Z' });
    expect(sanitizeAiConsent(JSON.stringify(current))).toEqual(current);
    expect(sanitizeAiConsent('true')).toBeNull();
    expect(sanitizeAiConsent('{"version":0,"acceptedAt":"2026-07-13T20:00:00.000Z"}')).toBeNull();
    expect(sanitizeAiConsent('{"version":1,"acceptedAt":"not-a-date"}')).toBeNull();
  });
});
