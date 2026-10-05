import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      __store: store,
      multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null])),
      multiSet: jest.fn(async (entries: [string, string][]) => {
        entries.forEach(([key, value]) => store.set(key, value));
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    },
  };
});

jest.mock('@/lib/app-alert', () => ({ showAppAlert: jest.fn() }));
jest.mock('@/lib/observability', () => ({ clearObservability: jest.fn(async () => undefined), observe: jest.fn() }));
jest.mock('@/lib/ai-voice-player', () => ({ clearAiVoicePlaybackCache: jest.fn() }));
jest.mock('@/lib/practice-widget', () => ({ updatePracticeWidget: jest.fn() }));
jest.mock('@/lib/practice-reminder', () => ({ cancelPracticeReminder: jest.fn() }));

import { showAppAlert } from '../src/lib/app-alert';
import { parseProgressBackup, serializeProgressBackup, type RestorableProgress } from '../src/lib/progress-backup';
import { createAiConsentRecord, dateKey, defaultLearnerProfile, storageKeys } from '../src/lib/storage';
import { AppStateProvider, useAppState } from '../src/state/app-state';

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
  multiSet: jest.Mock;
};

const today = dateKey();
const deviceReminder = { enabled: true, hour: 9, minute: 0, notificationId: 'device-notification' };

function backupProgress(): RestorableProgress {
  const json = serializeProgressBackup({
    phrases: [{ hi: 'धन्यवाद', latin: 'dhanyavaad', en: 'Thank you' }],
    goal: 5,
    practice: { date: today, chaiDone: true, liveDone: false, seconds: 240 },
    streakDays: ['2026-09-30', today],
    learnerProfile: { ...defaultLearnerProfile(), completed: true, displayName: 'Restored', level: 'intermediate' },
    sceneProgress: { market: { completions: 2, bestScore: 80, bestAccuracy: 90, totalCorrect: 18, totalAnswers: 20, lastPracticedAt: null, lastBeatIndex: 0, weakPhrases: [] } },
    phraseReviews: { 'धन्यवाद': { mastery: 3, intervalDays: 7, dueAt: '2026-10-12', lastReviewedAt: null, correctReviews: 3, totalReviews: 3 } },
    practiceHistory: [{ date: '2026-09-30', seconds: 600, correct: 5, answers: 6, reviews: 1 }],
    reviewStreakDays: ['2026-09-30'],
    motionPreference: 'reduced',
    reminder: { enabled: false, hour: 7, minute: 30, notificationId: null },
  });
  const parsed = parseProgressBackup(json);
  if (!parsed.ok) throw new Error(parsed.error);
  const { reminder: _reminder, ...progress } = parsed.backup.data;
  return progress;
}

function seedDevice() {
  const values: Record<string, string> = {
    [storageKeys.aiConsent]: JSON.stringify(createAiConsentRecord()),
    [storageKeys.chatHistory]: JSON.stringify([{ id: 'asha-old', role: 'asha', text: 'Stored reply.', language: 'en' }]),
    [storageKeys.clientId]: 'client-device-12345',
    [storageKeys.goal]: '15',
    [storageKeys.motionPreference]: 'lively',
    [storageKeys.phrases]: JSON.stringify([{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }]),
    [storageKeys.reminder]: JSON.stringify(deviceReminder),
  };
  Object.entries(values).forEach(([key, value]) => asyncStorage.__store.set(key, value));
  return values;
}

function Harness({ progress }: { progress: RestorableProgress }) {
  const state = useAppState();
  const [result, setResult] = useState('');
  if (!state.hydrated) return <Text>Hydrating</Text>;
  const snapshot = {
    aiConsent: state.aiConsent,
    chatHistory: state.chatHistory,
    clientId: state.clientId,
    goal: state.goal,
    learnerProfile: state.learnerProfile,
    motionPreference: state.motionPreference,
    phraseReviews: state.phraseReviews,
    phrases: state.phrases,
    reminder: state.reminder,
    sceneProgress: state.sceneProgress,
  };
  return (
    <View>
      <Text testID="snapshot">{JSON.stringify(snapshot)}</Text>
      <Text testID="result">{result}</Text>
      <Pressable accessibilityLabel="Restore" onPress={() => void state.restoreProgress(progress).then((saved) => setResult(saved ? 'saved' : 'failed'))} />
    </View>
  );
}

function readSnapshot(view: Awaited<ReturnType<typeof render>>) {
  return JSON.parse(String(view.getByTestId('snapshot').props.children)) as Record<string, any>;
}

describe('AppStateProvider restoreProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asyncStorage.__store.clear();
  });

  it('replaces and persists learning progress without touching identity, consent, chat, or reminders', async () => {
    seedDevice();
    const progress = backupProgress();
    const view = await render(<AppStateProvider><Harness progress={progress} /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-device-12345'));

    await fireEvent.press(view.getByLabelText('Restore'));
    await waitFor(() => expect(view.getByTestId('result').props.children).toBe('saved'));

    const snapshot = readSnapshot(view);
    expect(snapshot).toEqual(expect.objectContaining({
      aiConsent: true,
      chatHistory: [{ id: 'asha-old', role: 'asha', text: 'Stored reply.', language: 'en' }],
      clientId: 'client-device-12345',
      goal: 5,
      learnerProfile: progress.learnerProfile,
      motionPreference: 'reduced',
      phraseReviews: progress.phraseReviews,
      phrases: progress.phrases,
      reminder: deviceReminder,
      sceneProgress: progress.sceneProgress,
    }));
    expect(asyncStorage.__store.get(storageKeys.goal)).toBe('5');
    expect(asyncStorage.__store.get(storageKeys.motionPreference)).toBe('reduced');
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.phrases) ?? 'null')).toEqual(progress.phrases);
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.sceneProgress) ?? 'null')).toEqual(progress.sceneProgress);
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.practice) ?? 'null')).toEqual(progress.practice);
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.streakDays) ?? 'null')).toEqual(progress.streakDays);
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.practiceHistory) ?? 'null')).toEqual(progress.practiceHistory);
    expect(asyncStorage.__store.get(storageKeys.clientId)).toBe('client-device-12345');
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.reminder) ?? 'null')).toEqual(deviceReminder);

    const written = asyncStorage.multiSet.mock.calls.at(-1)?.[0] as [string, string][];
    const writtenKeys = written.map(([key]) => key);
    for (const excluded of [storageKeys.clientId, storageKeys.aiConsent, storageKeys.chatHistory, storageKeys.reminder]) {
      expect(writtenKeys).not.toContain(excluded);
    }
    await view.unmount();
  });

  it('rolls back and reports when the restored progress cannot be saved', async () => {
    const original = seedDevice();
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const view = await render(<AppStateProvider><Harness progress={backupProgress()} /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-device-12345'));
    const before = readSnapshot(view);
    asyncStorage.multiSet.mockRejectedValueOnce(new Error('disk full'));

    await fireEvent.press(view.getByLabelText('Restore'));
    await waitFor(() => expect(view.getByTestId('result').props.children).toBe('failed'));

    expect(readSnapshot(view)).toEqual(before);
    expect(asyncStorage.__store.get(storageKeys.goal)).toBe(original[storageKeys.goal]);
    expect(asyncStorage.__store.get(storageKeys.phrases)).toBe(original[storageKeys.phrases]);
    expect(showAppAlert).toHaveBeenCalledWith('Could not save on this device', expect.stringContaining('previous progress was kept'));
    warning.mockRestore();
    await view.unmount();
  });
});
