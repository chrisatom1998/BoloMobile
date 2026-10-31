import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      __store: store,
      getAllKeys: jest.fn(async () => [...store.keys()]),
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      multiRemove: jest.fn(async (keys: string[]) => {
        keys.forEach((key) => store.delete(key));
      }),
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

jest.mock('@/lib/practice-reminder', () => ({
  cancelPracticeReminder: jest.fn(async (current: { enabled: boolean }) => ({ ...current, enabled: false, notificationId: null })),
}));
jest.mock('@/services/bolo-api', () => ({
  ...jest.requireActual('@/services/bolo-api'),
  reportGeneratedMessage: jest.fn(async () => ({ reported: true })),
}));

import { clearAiVoicePlaybackCache } from '../src/lib/ai-voice-player';
import { showAppAlert } from '../src/lib/app-alert';
import { ASHA_SESSION_INDEX_KEY, ashaSessionKey, type AshaSessionRecord } from '../src/lib/asha-session-log';
import { getAshaSessions, logAshaSessionEvent, logAshaSessionSnapshot, logAshaSessionTool, registerLiveCallEnder } from '../src/lib/asha-session-log-store';
import { SYNC_OUTBOX_CLEARING_KEY, SYNC_OUTBOX_KEY, syncOutbox } from '../src/lib/sync-outbox';
import { BoloApiError, reportGeneratedMessage } from '../src/services/bolo-api';
import { observe } from '../src/lib/observability';
import { cancelPracticeReminder } from '../src/lib/practice-reminder';
import { createAiConsentRecord, dateKey, emptyPractice, MAX_DAILY_PRACTICE_SECONDS, storageKeys } from '../src/lib/storage';
import { AppStateProvider, useAppState } from '../src/state/app-state';

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
  multiRemove: jest.Mock;
  multiSet: jest.Mock;
  removeItem: jest.Mock;
};
const reportMock = jest.mocked(reportGeneratedMessage);

async function flushMicrotasks() {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

function sessionKeys() {
  return [...asyncStorage.__store.keys()].filter((key) => key.startsWith('bolo-asha-session-v1:')).sort();
}

const storedSession: AshaSessionRecord = {
  schema: 1,
  id: 'session-old',
  startedAt: new Date().toISOString(),
  connectedAt: new Date().toISOString(),
  endedAt: new Date().toISOString(),
  state: 'ended',
  endReason: 'user_ended',
  responseLanguage: 'en',
  rows: [{ id: 'live-0', speaker: 'you', text: 'Namaste', startMs: 0, endMs: 100 }],
  learnerTurns: 1,
  savedPhrases: [],
  lessonsPracticed: [],
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
    motionPreference: state.motionPreference,
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
      <Pressable
        accessibilityLabel="Withdraw AI consent"
        onPress={() => void state.setAiConsent(false).then((saved) => setConsentResult(saved ? 'withdrawn' : 'rejected'))}
      />
      <Pressable accessibilityLabel="Add practice seconds" onPress={() => state.addPracticeSeconds(10)} />
      <Pressable accessibilityLabel="Mark live turn" onPress={() => state.markLiveTurn(10)} />
      <Pressable accessibilityLabel="Mark scene complete" onPress={() => state.markSceneComplete('chai', 10)} />
      <Pressable accessibilityLabel="Use lively movement" onPress={() => state.setMotionPreference('lively')} />
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
    [storageKeys.motionPreference]: 'lively',
    [storageKeys.phrases]: JSON.stringify([{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }]),
    [storageKeys.practice]: JSON.stringify({ date: today, chaiDone: true, liveDone: true, seconds: 120 }),
    [storageKeys.streakDays]: JSON.stringify([today]),
    [ASHA_SESSION_INDEX_KEY]: JSON.stringify([{ id: 'session-old', startedAt: storedSession.startedAt }]),
    [ashaSessionKey('session-old')]: JSON.stringify(storedSession),
    // An orphan written before its index entry could be published.
    [ashaSessionKey('orphan')]: JSON.stringify({ ...storedSession, id: 'orphan' }),
    [SYNC_OUTBOX_KEY]: JSON.stringify([{ id: 'report-old', kind: 'report_message', payload: { message: 'Old reply', reason: 'incorrect_or_misleading' }, createdAt: new Date().toISOString(), attempts: 0, nextAttemptAt: new Date().toISOString(), state: 'pending' }]),
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
    motionPreference: string;
    phrases: unknown[];
    practice: ReturnType<typeof emptyPractice>;
    streakDays: string[];
  };
}

describe('AppStateProvider clearAllData', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    asyncStorage.__store.clear();
    reportMock.mockResolvedValue({ reported: true });
    // The outbox is module-level: start every test with an empty, unblocked queue.
    await syncOutbox.clear();
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
      motionPreference: 'gentle',
      phrases: [],
      practice: emptyPractice(),
      streakDays: [],
    });
    expect(asyncStorage.__store.size).toBe(Object.keys(storageKeys).length);
    expect(asyncStorage.__store.has(ASHA_SESSION_INDEX_KEY)).toBe(false);
    expect(sessionKeys()).toEqual([]);
    expect(asyncStorage.__store.has(SYNC_OUTBOX_KEY)).toBe(false);
    expect(getAshaSessions()).toEqual([]);
    expect(syncOutbox.getEntries()).toEqual([]);
    expect(asyncStorage.__store.get(storageKeys.aiConsent)).toBe('null');
    expect(asyncStorage.__store.get(storageKeys.chatHistory)).toBe('[]');
    expect(asyncStorage.__store.get(storageKeys.clientId)).toBe(next.clientId);
    expect(asyncStorage.__store.get(storageKeys.goal)).toBe('10');
    expect(asyncStorage.__store.get(storageKeys.motionPreference)).toBe('gentle');
    expect(asyncStorage.__store.get(storageKeys.phrases)).toBe('[]');
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.practice) ?? 'null')).toEqual(emptyPractice());
    expect(asyncStorage.__store.get(storageKeys.streakDays)).toBe('[]');
    expect(clearAiVoicePlaybackCache).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('cancels the scheduled daily reminder before wiping its notification id', async () => {
    seedEveryStorageKey();
    const reminder = { enabled: true, hour: 19, minute: 0, notificationId: 'notif-123' };
    asyncStorage.__store.set(storageKeys.reminder, JSON.stringify(reminder));
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-old-12345'));

    await fireEvent.press(view.getByLabelText('Clear all provider data'));
    await waitFor(() => expect(readSnapshot(view).clientId).not.toBe('client-old-12345'));

    expect(cancelPracticeReminder).toHaveBeenCalledTimes(1);
    expect(cancelPracticeReminder).toHaveBeenCalledWith(reminder);
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.reminder) ?? 'null')).toMatchObject({ enabled: false, notificationId: null });
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

  it('keeps provider state and progress storage unchanged when the clear write fails, having already removed sessions and queued reports', async () => {
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
    const progressKeys = Object.values(storageKeys);
    expect(Object.fromEntries([...asyncStorage.__store].filter(([key]) => progressKeys.includes(key as never)))).toEqual(Object.fromEntries(Object.entries(original).filter(([key]) => progressKeys.includes(key as never))));
    // Generations were invalidated before the first await, so the conversation data is gone either way.
    expect(sessionKeys()).toEqual([]);
    expect(asyncStorage.__store.has(ASHA_SESSION_INDEX_KEY)).toBe(false);
    expect(asyncStorage.__store.has(SYNC_OUTBOX_KEY)).toBe(false);
    expect(clearAiVoicePlaybackCache).not.toHaveBeenCalled();
    await view.unmount();
    warning.mockRestore();
  });

  it('reports when saved sessions or queued reports could not be removed', async () => {
    seedEveryStorageKey();
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    asyncStorage.multiRemove.mockRejectedValueOnce(new Error('disk busy'));
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-old-12345'));
    await fireEvent.press(view.getByLabelText('Clear all provider data'));
    await waitFor(() => expect(view.getByTestId('clear-error').props.children).toContain('could not clear saved Asha sessions or queued reports'));
    expect(readSnapshot(view).clientId).not.toBe('client-old-12345');
    await view.unmount();
    warning.mockRestore();
  });

  it('ends a live call as data_deleted first, and late rows, finalization, tool callbacks, and pending writes cannot re-persist it', async () => {
    seedEveryStorageKey();
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-old-12345'));
    // A live call with a stored transcript so far.
    logAshaSessionEvent({ type: 'starting' }, 'en', { id: 'live-now', at: new Date().toISOString() });
    logAshaSessionEvent({ type: 'ready' }, 'en');
    logAshaSessionSnapshot([{ id: 'live-n-0', speaker: 'you', text: 'Namaste', startMs: 0, endMs: 400 }]);
    await flushMicrotasks();
    expect(asyncStorage.__store.has(ashaSessionKey('live-now'))).toBe(true);
    const order: string[] = [];
    const ender = jest.fn((reason: string) => {
      order.push(`disconnect:${reason}`);
      // The hook finalizes synchronously inside disconnect().
      logAshaSessionEvent({ type: 'ended', reason: reason as 'data_deleted' }, 'en');
    });
    const unregister = registerLiveCallEnder(ender);
    asyncStorage.multiRemove.mockImplementationOnce(async (keys: string[]) => {
      order.push('remove');
      keys.forEach((key) => asyncStorage.__store.delete(key));
    });

    await fireEvent.press(view.getByLabelText('Clear all provider data'));
    // Late work from the ended call arrives while deletion is in progress.
    logAshaSessionSnapshot([{ id: 'live-n-1', speaker: 'asha', text: 'Late reply', startMs: 500, endMs: 900 }]);
    logAshaSessionTool({ savedPhrase: 'देर' });
    logAshaSessionEvent({ type: 'ended', reason: 'connection_lost' }, 'en');
    await waitFor(() => expect(readSnapshot(view).clientId).not.toBe('client-old-12345'));
    await flushMicrotasks();

    expect(ender).toHaveBeenCalledWith('data_deleted');
    expect(order).toEqual(['disconnect:data_deleted', 'remove']);
    expect(sessionKeys()).toEqual([]);
    expect(asyncStorage.__store.has(ASHA_SESSION_INDEX_KEY)).toBe(false);
    expect(getAshaSessions()).toEqual([]);
    unregister();
    await view.unmount();
  });

  it('never sends the next queued report under the rotated client id when deletion happens mid-flush, and a late completion cannot recreate data', async () => {
    seedEveryStorageKey();
    let settleFirst!: () => void;
    reportMock.mockImplementationOnce(() => new Promise((resolve) => { settleFirst = () => resolve({ reported: true }); }));
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-old-12345'));
    await act(async () => {
      await syncOutbox.enqueue({ kind: 'report_message', payload: { message: 'First', reason: 'incorrect_or_misleading' } });
      await syncOutbox.enqueue({ kind: 'report_message', payload: { message: 'Second', reason: 'incorrect_or_misleading' } });
      await flushMicrotasks();
    });
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock.mock.calls[0]?.[0]).toMatchObject({ clientId: 'client-old-12345', message: 'First' });

    await fireEvent.press(view.getByLabelText('Clear all provider data'));
    await waitFor(() => expect(readSnapshot(view).clientId).not.toBe('client-old-12345'));
    await act(async () => {
      settleFirst();
      await flushMicrotasks();
    });
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(syncOutbox.getEntries()).toEqual([]);
    expect(asyncStorage.__store.has(SYNC_OUTBOX_KEY)).toBe(false);
    await view.unmount();
  });

  it('drops pending, in-flight, and failed reports when consent is withdrawn, and re-granting sends none of them', async () => {
    seedEveryStorageKey();
    let settleInFlight!: () => void;
    reportMock
      .mockRejectedValueOnce(new BoloApiError('Bad request', { kind: 'http', status: 400 }))
      .mockImplementationOnce(() => new Promise((resolve) => { settleInFlight = () => resolve({ reported: true }); }));
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-old-12345'));
    await act(async () => {
      await syncOutbox.enqueue({ kind: 'report_message', payload: { message: 'Failed one', reason: 'incorrect_or_misleading' } });
      await flushMicrotasks();
      await syncOutbox.enqueue({ kind: 'report_message', payload: { message: 'In flight', reason: 'incorrect_or_misleading' } });
      await flushMicrotasks();
      await syncOutbox.enqueue({ kind: 'report_message', payload: { message: 'Pending', reason: 'incorrect_or_misleading' } });
      await flushMicrotasks();
    });
    expect(syncOutbox.getEntries().map((entry) => entry.state)).toEqual(['failed', 'in_flight', 'pending']);

    await fireEvent.press(view.getByLabelText('Withdraw AI consent'));
    await waitFor(() => expect(view.getByTestId('consent-result').props.children).toBe('withdrawn'));
    expect(readSnapshot(view).aiConsent).toBe(false);
    expect(syncOutbox.getEntries()).toEqual([]);
    expect(asyncStorage.__store.has(SYNC_OUTBOX_KEY)).toBe(false);
    await act(async () => {
      settleInFlight();
      await flushMicrotasks();
    });

    await fireEvent.press(view.getByLabelText('Enable AI consent'));
    await waitFor(() => expect(readSnapshot(view).aiConsent).toBe(true));
    await act(async () => { await flushMicrotasks(); });
    expect(reportMock).toHaveBeenCalledTimes(2);
    expect(syncOutbox.getEntries()).toEqual([]);
    await view.unmount();
  });

  it('removes reports retained by a failed withdrawal cleanup before consent can be re-granted', async () => {
    // Consent was withdrawn and saved, but the queue removal failed before the app closed:
    // the stored reports and the clearing marker are still there at the next start.
    seedEveryStorageKey();
    asyncStorage.__store.delete(storageKeys.aiConsent);
    asyncStorage.__store.set(SYNC_OUTBOX_CLEARING_KEY, '1');
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-old-12345'));
    expect(readSnapshot(view).aiConsent).toBe(false);
    await act(async () => { await flushMicrotasks(); });
    expect(asyncStorage.__store.has(SYNC_OUTBOX_KEY)).toBe(false);
    expect(asyncStorage.__store.has(SYNC_OUTBOX_CLEARING_KEY)).toBe(false);

    await fireEvent.press(view.getByLabelText('Enable AI consent'));
    await waitFor(() => expect(readSnapshot(view).aiConsent).toBe(true));
    await act(async () => { await flushMicrotasks(); });
    expect(reportMock).not.toHaveBeenCalled();
    expect(syncOutbox.getEntries()).toEqual([]);
    // Reports made under the new consent still send.
    await act(async () => {
      await syncOutbox.enqueue({ kind: 'report_message', payload: { message: 'New reply', reason: 'incorrect_or_misleading' } });
      await flushMicrotasks();
    });
    expect(reportMock).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('removes a queue retained without consent even when no clearing marker was saved', async () => {
    seedEveryStorageKey();
    asyncStorage.__store.delete(storageKeys.aiConsent);
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-old-12345'));
    await act(async () => { await flushMicrotasks(); });
    expect(asyncStorage.__store.has(SYNC_OUTBOX_KEY)).toBe(false);
    await fireEvent.press(view.getByLabelText('Enable AI consent'));
    await waitFor(() => expect(readSnapshot(view).aiConsent).toBe(true));
    await act(async () => { await flushMicrotasks(); });
    expect(reportMock).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('announces a delivered report once for the whole app', async () => {
    seedEveryStorageKey();
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).clientId).toBe('client-old-12345'));
    await act(async () => {
      await syncOutbox.enqueue({ kind: 'report_message', payload: { message: 'A reply', reason: 'incorrect_or_misleading' } });
      await flushMicrotasks();
    });
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(jest.mocked(showAppAlert).mock.calls.filter(([title]) => title === 'Report received')).toHaveLength(1);
    expect(showAppAlert).toHaveBeenCalledWith('Report received', 'Thank you. This reply was sent for review.');
    await view.unmount();
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

  it('persists movement choices through the shared app state', async () => {
    const view = await render(<AppStateProvider><StateHarness /></AppStateProvider>);
    await waitFor(() => expect(readSnapshot(view).motionPreference).toBe('gentle'));

    await fireEvent.press(view.getByLabelText('Use lively movement'));

    await waitFor(() => expect(readSnapshot(view).motionPreference).toBe('lively'));
    await waitFor(() => expect(asyncStorage.__store.get(storageKeys.motionPreference)).toBe('lively'));
    await view.unmount();
  });
});
