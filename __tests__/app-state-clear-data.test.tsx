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

import { observe } from '../src/lib/observability';
import { createAiConsentRecord, dateKey, emptyPractice, MAX_DAILY_PRACTICE_SECONDS, storageKeys } from '../src/lib/storage';
import { AppStateProvider, useAppState } from '../src/state/app-state';

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
  multiSet: jest.Mock;
};

function StateHarness() {
  const state = useAppState();
  const [error, setError] = useState('');
  const [consentResult, setConsentResult] = useState('');
  if (!state.hydrated) return <Text>Hydrating</Text>;
  const snapshot = {
    aiConsent: state.aiConsent,
    chatHistory: state.chatHistory,
    clientId: state.clientId,
    goal: state.goal,
    phrases: state.phrases,
    practice: state.practice,
    streakDays: state.streakDays,
  };
  return (
    <View>
      <Text testID="state-snapshot">{JSON.stringify(snapshot)}</Text>
      <Text testID="clear-error">{error}</Text>
      <Text testID="consent-result">{consentResult}</Text>
      <Pressable
        accessibilityLabel="Clear all provider data"
        onPress={() => void state.clearAllData().catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'Clear failed');
        })}
      />
      <Pressable
        accessibilityLabel="Enable AI consent"
        onPress={() => void state.setAiConsent(true).then((saved) => setConsentResult(saved ? 'saved' : 'rejected'))}
      />
      <Pressable accessibilityLabel="Add practice seconds" onPress={() => state.addPracticeSeconds(10)} />
      <Pressable accessibilityLabel="Mark live turn" onPress={() => state.markLiveTurn(10)} />
      <Pressable accessibilityLabel="Mark scene complete" onPress={() => state.markSceneComplete('chai', 10)} />
    </View>
  );
}

function seedEveryStorageKey() {
  const today = dateKey();
  const values: Record<string, string> = {
    [storageKeys.aiConsent]: JSON.stringify(createAiConsentRecord()),
    [storageKeys.chatHistory]: JSON.stringify([{ id: 'asha-old', role: 'asha', text: 'Stored reply.', language: 'en' }]),
    [storageKeys.clientId]: 'client-old-12345',
    [storageKeys.goal]: '15',
    [storageKeys.phrases]: JSON.stringify([{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }]),
    [storageKeys.practice]: JSON.stringify({ date: today, chaiDone: true, liveDone: true, seconds: 120 }),
    [storageKeys.streakDays]: JSON.stringify([today]),
  };
  Object.entries(values).forEach(([key, value]) => asyncStorage.__store.set(key, value));
  return values;
}

function readSnapshot(view: Awaited<ReturnType<typeof render>>) {
  return JSON.parse(String(view.getByTestId('state-snapshot').props.children)) as {
    aiConsent: boolean;
    chatHistory: unknown[];
    clientId: string;
    goal: number;
    phrases: unknown[];
    practice: ReturnType<typeof emptyPractice>;
    streakDays: string[];
  };
}

describe('AppStateProvider clearAllData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asyncStorage.__store.clear();
  });

  it('resets every persisted key atomically and rotates the client identifier', async () => {
    seedEveryStorageKey();
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-old-12345'));

    await fireEvent.press(view.getByLabelText('Clear all provider data'));
    await waitFor(() => expect(readSnapshot(view).clientId).not.toBe('client-old-12345'));

    const next = readSnapshot(view);
    expect(next).toEqual({
      aiConsent: false,
      chatHistory: [],
      clientId: expect.not.stringMatching(/^client-old-12345$/u),
      goal: 10,
      phrases: [],
      practice: emptyPractice(),
      streakDays: [],
    });
    expect(asyncStorage.__store.size).toBe(Object.keys(storageKeys).length);
    expect(asyncStorage.__store.get(storageKeys.aiConsent)).toBe('null');
    expect(asyncStorage.__store.get(storageKeys.chatHistory)).toBe('[]');
    expect(asyncStorage.__store.get(storageKeys.clientId)).toBe(next.clientId);
    expect(asyncStorage.__store.get(storageKeys.goal)).toBe('10');
    expect(asyncStorage.__store.get(storageKeys.phrases)).toBe('[]');
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.practice) ?? 'null')).toEqual(emptyPractice());
    expect(asyncStorage.__store.get(storageKeys.streakDays)).toBe('[]');
    await view.unmount();
  });

  it('rejects a consent change made while a full data clear is in flight', async () => {
    seedEveryStorageKey();
    let releaseClear!: () => void;
    const clearGate = new Promise<void>((resolve) => {
      releaseClear = resolve;
    });
    asyncStorage.multiSet.mockImplementationOnce(async (entries: [string, string][]) => {
      await clearGate;
      entries.forEach(([key, value]) => asyncStorage.__store.set(key, value));
    });
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-old-12345'));

    await fireEvent.press(view.getByLabelText('Clear all provider data'));
    await fireEvent.press(view.getByLabelText('Enable AI consent'));
    await waitFor(() => expect(view.getByTestId('consent-result').props.children).toBe('rejected'));

    releaseClear();
    await waitFor(() => expect(readSnapshot(view).clientId).not.toBe('client-old-12345'));

    expect(readSnapshot(view).aiConsent).toBe(false);
    expect(asyncStorage.__store.get(storageKeys.aiConsent)).toBe('null');
    await view.unmount();
  });

  it('keeps provider state and storage unchanged when the clear write fails', async () => {
    const original = seedEveryStorageKey();
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    asyncStorage.multiSet.mockRejectedValueOnce(new Error('disk full'));
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-old-12345'));
    const before = readSnapshot(view);

    await fireEvent.press(view.getByLabelText('Clear all provider data'));
    await waitFor(() => expect(view.getByTestId('clear-error').props.children).toContain('existing local data was left in place'));

    expect(readSnapshot(view)).toEqual(before);
    expect(observe).toHaveBeenCalledWith('runtime_error');
    expect(Object.fromEntries(asyncStorage.__store)).toEqual(original);
    await view.unmount();
    warning.mockRestore();
  });

  it('caps every runtime practice update at the daily maximum', async () => {
    asyncStorage.__store.set(storageKeys.practice, JSON.stringify({
      ...emptyPractice(),
      seconds: MAX_DAILY_PRACTICE_SECONDS - 5,
    }));
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).practice.seconds).toBe(MAX_DAILY_PRACTICE_SECONDS - 5));

    await fireEvent.press(view.getByLabelText('Add practice seconds'));
    await fireEvent.press(view.getByLabelText('Mark live turn'));
    await fireEvent.press(view.getByLabelText('Mark scene complete'));
    await waitFor(() => expect(readSnapshot(view).practice.seconds).toBe(MAX_DAILY_PRACTICE_SECONDS));
    await waitFor(() => expect(JSON.parse(asyncStorage.__store.get(storageKeys.practice) ?? 'null').seconds)
      .toBe(MAX_DAILY_PRACTICE_SECONDS));
    await view.unmount();
  });
});
