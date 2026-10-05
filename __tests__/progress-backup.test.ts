import {
  createProgressBackup,
  exceedsBackupSize,
  MAX_PROGRESS_BACKUP_BYTES,
  parseProgressBackup,
  progressBackupFileName,
  PROGRESS_BACKUP_FORMAT,
  PROGRESS_BACKUP_VERSION,
  serializeProgressBackup,
} from '../src/lib/progress-backup';
import { createAiConsentRecord, dateKey, defaultLearnerProfile, type PersistedState } from '../src/lib/storage';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000000' }));

function fullState(): PersistedState {
  const today = dateKey();
  return {
    phrases: [
      { hi: 'नमस्ते', latin: 'namaste', en: 'Hello' },
      { hi: 'धन्यवाद', latin: 'dhanyavaad', en: 'Thank you' },
    ],
    goal: 15,
    practice: { date: today, chaiDone: true, liveDone: false, seconds: 300 },
    streakDays: ['2026-10-01', '2026-10-02', today],
    clientId: 'client-secret-12345',
    aiConsent: createAiConsentRecord(new Date('2026-09-01T10:00:00.000Z')),
    chatHistory: [{ id: 'asha-1', role: 'asha', text: 'Private chat reply', language: 'en' }],
    learnerProfile: { ...defaultLearnerProfile(), completed: true, displayName: 'Priya', level: 'beginner', phrasePlaybackRate: 0.75 },
    sceneProgress: {
      chai: {
        completions: 3,
        bestScore: 90,
        bestAccuracy: 95,
        totalCorrect: 30,
        totalAnswers: 33,
        lastPracticedAt: '2026-10-02T09:00:00.000Z',
        lastBeatIndex: 0,
        weakPhrases: ['चाय'],
      },
    },
    phraseReviews: {
      'नमस्ते': { mastery: 2, intervalDays: 3, dueAt: '2026-10-08', lastReviewedAt: '2026-10-05T08:00:00.000Z', correctReviews: 4, totalReviews: 5 },
    },
    practiceHistory: [{ date: '2026-10-02', seconds: 600, correct: 10, answers: 12, reviews: 3 }],
    reviewStreakDays: ['2026-10-02'],
    reminder: { enabled: true, hour: 20, minute: 15, notificationId: 'device-notification-id' },
    motionPreference: 'lively',
  };
}

function backupJson(mutate: (backup: Record<string, any>) => void = () => undefined) {
  const backup = JSON.parse(serializeProgressBackup(fullState(), new Date('2026-10-05T12:00:00.000Z'))) as Record<string, any>;
  mutate(backup);
  return JSON.stringify(backup);
}

describe('progress backup', () => {
  it('round-trips learning progress through a versioned backup', () => {
    const state = fullState();
    const parsed = parseProgressBackup(serializeProgressBackup(state, new Date('2026-10-05T12:00:00.000Z')));

    expect(parsed).toEqual({
      ok: true,
      backup: {
        format: PROGRESS_BACKUP_FORMAT,
        version: PROGRESS_BACKUP_VERSION,
        exportedAt: '2026-10-05T12:00:00.000Z',
        data: {
          phrases: state.phrases,
          goal: 15,
          practice: state.practice,
          streakDays: state.streakDays,
          learnerProfile: state.learnerProfile,
          sceneProgress: state.sceneProgress,
          phraseReviews: state.phraseReviews,
          practiceHistory: state.practiceHistory,
          reviewStreakDays: state.reviewStreakDays,
          motionPreference: 'lively',
          reminder: { enabled: true, hour: 20, minute: 15 },
        },
      },
    });
  });

  it('never exports the app identifier, consent, chat history, or notification id', () => {
    const json = serializeProgressBackup(fullState());
    const backup = createProgressBackup(fullState());

    expect(Object.keys(backup.data).sort()).toEqual([
      'goal', 'learnerProfile', 'motionPreference', 'phraseReviews', 'phrases', 'practice',
      'practiceHistory', 'reminder', 'reviewStreakDays', 'sceneProgress', 'streakDays',
    ]);
    expect(backup.data.reminder).toEqual({ enabled: true, hour: 20, minute: 15 });
    for (const secret of ['client-secret-12345', 'clientId', 'aiConsent', 'acceptedAt', 'chatHistory', 'Private chat reply', 'device-notification-id', 'notificationId']) {
      expect(json).not.toContain(secret);
    }
  });

  it('ignores excluded fields smuggled into an imported backup', () => {
    const parsed = parseProgressBackup(backupJson((backup) => {
      backup.data.clientId = 'attacker-chosen-id';
      backup.data.aiConsent = { version: 9, acceptedAt: '2026-01-01T00:00:00.000Z' };
      backup.data.chatHistory = [{ id: 'x', role: 'you', text: 'hi' }];
      backup.data.reminder.notificationId = 'stale-id';
      backup.extra = true;
    }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.data).not.toHaveProperty('clientId');
    expect(parsed.backup.data).not.toHaveProperty('aiConsent');
    expect(parsed.backup.data).not.toHaveProperty('chatHistory');
    expect(parsed.backup.data.reminder).toEqual({ enabled: true, hour: 20, minute: 15 });
    expect(parsed.backup).not.toHaveProperty('extra');
  });

  it.each([
    ['empty text', ''],
    ['non-JSON text', 'not json {'],
    ['a JSON array', '[]'],
    ['a wrong format', backupJson((backup) => { backup.format = 'other-app-backup'; })],
    ['a missing format', backupJson((backup) => { delete backup.format; })],
    ['an older version', backupJson((backup) => { backup.version = 0; })],
    ['a string version', backupJson((backup) => { backup.version = '1'; })],
    ['an invalid export time', backupJson((backup) => { backup.exportedAt = 'yesterday'; })],
    ['missing data', backupJson((backup) => { delete backup.data; })],
    ['phrases that are not a list', backupJson((backup) => { backup.data.phrases = { hi: 'x' }; })],
    ['scene progress that is a list', backupJson((backup) => { backup.data.sceneProgress = []; })],
    ['a missing reminder', backupJson((backup) => { delete backup.data.reminder; })],
    ['a non-numeric goal', backupJson((backup) => { backup.data.goal = '15'; })],
    ['a missing motion preference', backupJson((backup) => { delete backup.data.motionPreference; })],
  ])('rejects %s', (_name, text) => {
    const parsed = parseProgressBackup(text);

    expect(parsed).toEqual({ ok: false, error: expect.stringContaining('not a Bolo progress backup') });
  });

  it('asks for an update when the backup comes from a newer version', () => {
    expect(parseProgressBackup(backupJson((backup) => { backup.version = 2; }))).toEqual({
      ok: false,
      error: expect.stringContaining('newer version of Bolo'),
    });
  });

  it('rejects oversized files before parsing them', () => {
    const padding = 'x'.repeat(MAX_PROGRESS_BACKUP_BYTES);
    const parse = jest.spyOn(JSON, 'parse');

    expect(parseProgressBackup(backupJson((backup) => { backup.padding = padding; }))).toEqual({
      ok: false,
      error: expect.stringContaining('larger than 2 MB'),
    });
    expect(parse).not.toHaveBeenCalledWith(expect.stringContaining(padding));
  });

  it('counts multi-byte characters toward the size cap', () => {
    expect(exceedsBackupSize('a'.repeat(10), 10)).toBe(false);
    expect(exceedsBackupSize('ह'.repeat(4), 10)).toBe(true);
    expect(exceedsBackupSize('é'.repeat(5), 10)).toBe(false);
    expect(exceedsBackupSize('😀😀😀', 10)).toBe(true);
  });

  it('drops malformed entries and clamps out-of-range numbers', () => {
    const parsed = parseProgressBackup(backupJson((backup) => {
      backup.data.goal = 42;
      backup.data.motionPreference = 'spinning';
      backup.data.phrases.push({ hi: 42 }, { hi: 'नमस्ते', latin: 'dup', en: 'dup' }, 'string');
      backup.data.phraseReviews['धन्यवाद'] = { mastery: 99, intervalDays: -4, dueAt: 'soon', correctReviews: 3, totalReviews: 1 };
      backup.data.phraseReviews['orphan phrase'] = { mastery: 1 };
      backup.data.sceneProgress['Bad Scene!'] = { completions: 1 };
      backup.data.sceneProgress.chai.bestAccuracy = 500;
      backup.data.streakDays.push('not-a-date', 7);
      backup.data.practiceHistory.push({ date: 'nope' }, { date: '2026-10-03', seconds: 10 ** 9, correct: -3 });
      backup.data.learnerProfile.level = 'expert';
      backup.data.learnerProfile.phrasePlaybackRate = 9;
      backup.data.reminder = { enabled: 'yes', hour: 42, minute: -1 };
    }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { data } = parsed.backup;
    expect(data.goal).toBe(10);
    expect(data.motionPreference).toBe('gentle');
    expect(data.phrases.map((phrase) => phrase.hi)).toEqual(['नमस्ते', 'धन्यवाद']);
    expect(data.phraseReviews['धन्यवाद']).toEqual(expect.objectContaining({ mastery: 5, intervalDays: 0, dueAt: dateKey(), correctReviews: 3, totalReviews: 3 }));
    expect(data.phraseReviews).not.toHaveProperty('orphan phrase');
    expect(Object.keys(data.sceneProgress)).toEqual(['chai']);
    expect(data.sceneProgress.chai?.bestAccuracy).toBe(100);
    expect(data.streakDays).not.toContain('not-a-date');
    expect(data.practiceHistory).toEqual([
      { date: '2026-10-02', seconds: 600, correct: 10, answers: 12, reviews: 3 },
      { date: '2026-10-03', seconds: 24 * 60 * 60, correct: 0, answers: 0, reviews: 0 },
    ]);
    expect(data.learnerProfile.level).toBe('new');
    expect(data.learnerProfile.phrasePlaybackRate).toBe(1);
    expect(data.reminder).toEqual({ enabled: false, hour: 23, minute: 0 });
  });

  it('resets a stale day of practice so restored progress starts today fresh', () => {
    const parsed = parseProgressBackup(backupJson((backup) => {
      backup.data.practice = { date: '2020-01-01', chaiDone: true, liveDone: true, seconds: 900 };
    }));

    expect(parsed.ok && parsed.backup.data.practice).toEqual({ date: dateKey(), chaiDone: false, liveDone: false, seconds: 0 });
  });

  it('names backup files by local date', () => {
    expect(progressBackupFileName(new Date(2026, 9, 5, 23, 30))).toBe('bolo-progress-2026-10-05.json');
  });
});
