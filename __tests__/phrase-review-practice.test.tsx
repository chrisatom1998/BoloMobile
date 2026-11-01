import { act, render, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      __store: store,
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
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
jest.mock('@/lib/ai-voice-player', () => ({ clearAiVoicePlaybackCache: jest.fn() }));
jest.mock('@/lib/asha-session-log-store', () => ({
  deleteAllAshaSessions: jest.fn(async () => undefined),
  endLiveCallForDataDeletion: jest.fn(),
  startAshaSessionRetention: jest.fn(() => jest.fn()),
}));
jest.mock('@/lib/observability', () => ({ clearObservability: jest.fn(async () => undefined), observe: jest.fn() }));
jest.mock('@/lib/practice-widget', () => ({ updatePracticeWidget: jest.fn() }));
jest.mock('@/lib/sync-outbox', () => ({
  syncOutbox: {
    clear: jest.fn(async () => undefined),
    setContext: jest.fn(),
    start: jest.fn(() => jest.fn()),
    subscribeDelivered: jest.fn(() => jest.fn()),
  },
}));

import { dateKey, emptyPractice, MAX_DAILY_PRACTICE_SECONDS, previousDate, storageKeys } from '../src/lib/storage';
import { AppStateProvider, REVIEW_PRACTICE_SECONDS, useAppState } from '../src/state/app-state';

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
};

const savedPhrase = { en: 'Saved phrase', hi: 'saved phrase', latin: 'saved phrase' };
let latestState: ReturnType<typeof useAppState>;

function StateProbe() {
  const state = useAppState();
  useEffect(() => { latestState = state; }, [state]);
  return <Text testID="status">{state.hydrated ? 'Ready' : 'Hydrating'}</Text>;
}

async function renderState() {
  asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([savedPhrase]));
  const view = await render(<AppStateProvider><StateProbe /></AppStateProvider>);
  await waitFor(() => expect(view.getByTestId('status').props.children).toBe('Ready'));
  return view;
}

async function review(hi = savedPhrase.hi) {
  await act(async () => {
    latestState.reviewPhrase(hi, true);
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  });
}

describe('phrase review practice credit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asyncStorage.__store.clear();
  });

  it('credits a fresh-day review to practice, history, and the main streak', async () => {
    const view = await renderState();

    await review();

    await waitFor(() => expect(latestState.practice.seconds).toBe(REVIEW_PRACTICE_SECONDS));
    expect(latestState.streak).toBe(1);
    expect(latestState.streakDays).toContain(dateKey());
    expect(latestState.practiceHistory).toContainEqual(expect.objectContaining({
      date: dateKey(),
      seconds: REVIEW_PRACTICE_SECONDS,
      correct: 1,
      answers: 1,
      reviews: 1,
    }));
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.practice) ?? 'null').seconds).toBe(REVIEW_PRACTICE_SECONDS);
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.streakDays) ?? 'null')).toContain(dateKey());
    await view.unmount();
  });

  it('caps review credit at the daily practice maximum', async () => {
    asyncStorage.__store.set(storageKeys.practice, JSON.stringify({
      ...emptyPractice(),
      seconds: MAX_DAILY_PRACTICE_SECONDS - 5,
    }));
    const view = await renderState();

    await review();

    await waitFor(() => expect(latestState.practice.seconds).toBe(MAX_DAILY_PRACTICE_SECONDS));
    expect(latestState.practiceHistory).toContainEqual(expect.objectContaining({ seconds: 5, reviews: 1 }));
    await view.unmount();
  });

  it('does not credit a phrase that is not saved', async () => {
    const view = await renderState();

    await review('not saved');

    expect(latestState.practice.seconds).toBe(0);
    expect(latestState.practiceHistory).toEqual([]);
    expect(latestState.streakDays).toEqual([]);
    expect(latestState.phraseReviews['not saved']).toBeUndefined();
    await view.unmount();
  });

  it('resets stale practice before adding review credit', async () => {
    asyncStorage.__store.set(storageKeys.practice, JSON.stringify({
      date: previousDate(dateKey()),
      chaiDone: true,
      liveDone: true,
      seconds: 600,
    }));
    const view = await renderState();

    await review();

    await waitFor(() => expect(latestState.practice).toEqual({
      date: dateKey(),
      chaiDone: false,
      liveDone: false,
      seconds: REVIEW_PRACTICE_SECONDS,
    }));
    expect(latestState.practiceHistory).toContainEqual(expect.objectContaining({ seconds: REVIEW_PRACTICE_SECONDS }));
    await view.unmount();
  });
});
