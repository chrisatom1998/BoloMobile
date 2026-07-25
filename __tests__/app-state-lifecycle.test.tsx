import { act, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Text, View } from 'react-native';

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

import { showAppAlert } from '../src/lib/app-alert';
import { observe } from '../src/lib/observability';
import { AI_CONSENT_VERSION, createAiConsentRecord, dateKey, storageKeys } from '../src/lib/storage';
import { AppStateProvider, useAppStateValue } from '../src/state/app-state';

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
  multiGet: jest.Mock;
  multiSet: jest.Mock;
  removeItem: jest.Mock;
};
const showAppAlertMock = showAppAlert as jest.MockedFunction<typeof showAppAlert>;
const observeMock = observe as jest.MockedFunction<typeof observe>;

function StateProbe() {
  const state = useAppStateValue();
  if (!state.hydrated) return <Text testID="status">Hydrating</Text>;
  return (
    <View>
      <Text testID="status">Ready</Text>
      <Text testID="snapshot">{JSON.stringify({
        aiConsent: state.aiConsent,
        clientId: state.clientId,
        goal: state.goal,
        phrases: state.phrases.length,
        practice: state.practice,
      })}</Text>
    </View>
  );
}

function readSnapshot(view: Awaited<ReturnType<typeof render>>) {
  return JSON.parse(String(view.getByTestId('snapshot').props.children)) as {
    aiConsent: boolean;
    clientId: string;
    goal: number;
    phrases: number;
    practice: { chaiDone: boolean; date: string; liveDone: boolean; seconds: number };
  };
}

describe('AppStateProvider hydration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asyncStorage.__store.clear();
  });

  it('opens with temporary defaults and warns the learner when storage cannot be read', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    asyncStorage.multiGet.mockRejectedValueOnce(new Error('storage unavailable'));

    const view = await render(<AppStateProvider><StateProbe /></AppStateProvider>);
    await waitFor(() => expect(view.getByTestId('status').props.children).toBe('Ready'));

    const snapshot = readSnapshot(view);
    expect(snapshot.goal).toBe(10);
    expect(snapshot.phrases).toBe(0);
    expect(snapshot.aiConsent).toBe(false);
    expect(snapshot.clientId).not.toBe('loading-client');
    expect(warning).toHaveBeenCalledWith('Bolo could not load local progress.', expect.any(Error));
    expect(observeMock).toHaveBeenCalledWith('runtime_error');
    expect(showAppAlertMock).toHaveBeenCalledWith(
      'Could not load saved progress',
      expect.stringContaining('temporary defaults'),
    );

    await view.unmount();
    warning.mockRestore();
  });

  it('deletes a stale consent record that no longer matches the current privacy version', async () => {
    asyncStorage.__store.set(storageKeys.aiConsent, JSON.stringify({
      version: AI_CONSENT_VERSION - 1,
      acceptedAt: new Date().toISOString(),
    }));

    const view = await render(<AppStateProvider><StateProbe /></AppStateProvider>);
    await waitFor(() => expect(view.getByTestId('status').props.children).toBe('Ready'));

    expect(readSnapshot(view).aiConsent).toBe(false);
    await waitFor(() => expect(asyncStorage.removeItem).toHaveBeenCalledWith(storageKeys.aiConsent));
    expect(asyncStorage.__store.has(storageKeys.aiConsent)).toBe(false);
    await view.unmount();
  });

  it('keeps a current consent record and persists a rotated client identifier', async () => {
    asyncStorage.__store.set(storageKeys.aiConsent, JSON.stringify(createAiConsentRecord()));

    const view = await render(<AppStateProvider><StateProbe /></AppStateProvider>);
    await waitFor(() => expect(view.getByTestId('status').props.children).toBe('Ready'));

    expect(readSnapshot(view).aiConsent).toBe(true);
    expect(asyncStorage.removeItem).not.toHaveBeenCalled();
    await waitFor(() => expect(asyncStorage.__store.get(storageKeys.clientId)).toBe(readSnapshot(view).clientId));
    await view.unmount();
  });
});

describe('AppStateProvider day rollover', () => {
  let stateListener: ((status: AppStateStatus) => void) | undefined;
  let removeListener: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    asyncStorage.__store.clear();
    stateListener = undefined;
    removeListener = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      stateListener = listener;
      return { remove: removeListener };
    });
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 20, 23, 59, 50));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function seedYesterdayPractice() {
    asyncStorage.__store.set(storageKeys.practice, JSON.stringify({
      date: dateKey(),
      chaiDone: true,
      liveDone: true,
      seconds: 420,
    }));
  }

  it('resets the practice day when the scheduled midnight timer fires', async () => {
    seedYesterdayPractice();
    const view = await render(<AppStateProvider><StateProbe /></AppStateProvider>);
    await waitFor(() => expect(view.getByTestId('status').props.children).toBe('Ready'));
    expect(readSnapshot(view).practice).toEqual({ date: '2026-07-20', chaiDone: true, liveDone: true, seconds: 420 });

    jest.setSystemTime(new Date(2026, 6, 21, 0, 0, 5));
    await act(async () => { jest.advanceTimersByTime(30_000); });

    await waitFor(() => expect(readSnapshot(view).practice)
      .toEqual({ date: '2026-07-21', chaiDone: false, liveDone: false, seconds: 0 }));
    await waitFor(() => expect(JSON.parse(asyncStorage.__store.get(storageKeys.practice) ?? 'null').date).toBe('2026-07-21'));

    await view.unmount();
    expect(removeListener).toHaveBeenCalled();
  });

  it('refreshes the day when the app returns to the foreground after midnight', async () => {
    seedYesterdayPractice();
    const view = await render(<AppStateProvider><StateProbe /></AppStateProvider>);
    await waitFor(() => expect(view.getByTestId('status').props.children).toBe('Ready'));
    expect(stateListener).toBeDefined();

    await act(async () => { stateListener?.('background'); });
    expect(readSnapshot(view).practice.date).toBe('2026-07-20');

    jest.setSystemTime(new Date(2026, 6, 21, 7, 30, 0));
    await act(async () => { stateListener?.('active'); });

    await waitFor(() => expect(readSnapshot(view).practice)
      .toEqual({ date: '2026-07-21', chaiDone: false, liveDone: false, seconds: 0 }));
    await view.unmount();
  });

  it('leaves the practice day untouched when the app resumes on the same day', async () => {
    seedYesterdayPractice();
    const view = await render(<AppStateProvider><StateProbe /></AppStateProvider>);
    await waitFor(() => expect(view.getByTestId('status').props.children).toBe('Ready'));
    asyncStorage.multiSet.mockClear();

    await act(async () => { stateListener?.('active'); });

    expect(readSnapshot(view).practice).toEqual({ date: '2026-07-20', chaiDone: true, liveDone: true, seconds: 420 });
    expect(asyncStorage.multiSet).not.toHaveBeenCalled();
    await view.unmount();
  });
});
