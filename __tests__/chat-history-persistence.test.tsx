import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import { storageKeys } from '../src/lib/storage';
import { AppStateProvider, useAppState } from '../src/state/app-state';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  const storage = {
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
  };
  return { __esModule: true, default: storage };
});

jest.mock('../src/lib/app-alert', () => ({ showAppAlert: jest.fn() }));
jest.mock('../src/lib/observability', () => ({ clearObservability: jest.fn(async () => undefined), observe: jest.fn() }));

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
  multiSet: jest.Mock;
};
const { showAppAlert } = jest.requireMock('../src/lib/app-alert') as { showAppAlert: jest.Mock };
const { observe } = jest.requireMock('../src/lib/observability') as { observe: jest.Mock };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function HistoryHarness() {
  const { appendChatMessages, chatHistory, clearAllData, clearChatHistory, hydrated } = useAppState();
  if (!hydrated) return <Text>Hydrating</Text>;
  return (
    <View>
      <Text testID="history">{chatHistory.map(({ id, text }) => `${id}:${text}`).join('|') || 'empty'}</Text>
      <Pressable
        accessibilityLabel="Append completed voice turn"
        onPress={() => appendChatMessages([
          { id: 'you-new', role: 'you', text: 'My completed turn.' },
          { id: 'asha-new', role: 'asha', text: 'A completed reply.', language: 'en' },
        ])}
      />
      <Pressable
        accessibilityLabel="Append later voice turn"
        onPress={() => appendChatMessages([
          { id: 'you-later', role: 'you', text: 'A stale turn.' },
          { id: 'asha-later', role: 'asha', text: 'A stale reply.', language: 'en' },
        ])}
      />
      <Pressable accessibilityLabel="Clear chat history" onPress={clearChatHistory} />
      <Pressable accessibilityLabel="Clear all data" onPress={() => void clearAllData()} />
    </View>
  );
}

describe('chat history provider persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asyncStorage.__store.clear();
    asyncStorage.__store.set(storageKeys.clientId, 'client-12345678');
  });

  it('hydrates history, persists a completed pair atomically, and restores it after remount', async () => {
    asyncStorage.__store.set(storageKeys.chatHistory, JSON.stringify([
      { id: 'asha-saved', role: 'asha', text: 'Previously saved.', language: 'en' },
    ]));
    const first = await render(<AppStateProvider><HistoryHarness /></AppStateProvider>);
    await waitFor(() => expect(first.getByTestId('history').props.children).toBe('asha-saved:Previously saved.'));

    await fireEvent.press(first.getByLabelText('Append completed voice turn'));
    await waitFor(() => expect(first.getByTestId('history').props.children).toBe(
      'asha-saved:Previously saved.|you-new:My completed turn.|asha-new:A completed reply.',
    ));
    await waitFor(() => expect(JSON.parse(asyncStorage.__store.get(storageKeys.chatHistory) ?? '[]')).toEqual([
      { id: 'asha-saved', role: 'asha', text: 'Previously saved.', language: 'en' },
      { id: 'you-new', role: 'you', text: 'My completed turn.' },
      { id: 'asha-new', role: 'asha', text: 'A completed reply.', language: 'en' },
    ]));

    await first.unmount();
    const restored = await render(<AppStateProvider><HistoryHarness /></AppStateProvider>);
    await waitFor(() => expect(restored.getByTestId('history').props.children).toContain('you-new:My completed turn.'));
    await waitFor(() => expect(restored.getByTestId('history').props.children).toContain('asha-new:A completed reply.'));

    await fireEvent.press(restored.getByLabelText('Clear chat history'));
    await waitFor(() => expect(restored.getByTestId('history').props.children).toBe('empty'));
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.chatHistory) ?? 'null')).toEqual([]);
    expect(asyncStorage.__store.get(storageKeys.clientId)).toBe('client-12345678');

    await restored.unmount();
    const cleared = await render(<AppStateProvider><HistoryHarness /></AppStateProvider>);
    await waitFor(() => expect(cleared.getByTestId('history').props.children).toBe('empty'));
    await fireEvent.press(cleared.getByLabelText('Append completed voice turn'));
    await waitFor(() => expect(cleared.getByTestId('history').props.children).toContain('asha-new:A completed reply.'));
    await fireEvent.press(cleared.getByLabelText('Clear all data'));
    await waitFor(() => expect(cleared.getByTestId('history').props.children).toBe('empty'));
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.chatHistory) ?? 'null')).toEqual([]);
    await cleared.unmount();
  });

  it('rolls back an optimistic history append when device persistence fails', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      asyncStorage.multiSet.mockRejectedValueOnce(new Error('disk full'));
      const view = await render(<AppStateProvider><HistoryHarness /></AppStateProvider>);
      await waitFor(() => expect(view.getByTestId('history').props.children).toBe('empty'));

      await fireEvent.press(view.getByLabelText('Append completed voice turn'));

      await waitFor(() => expect(showAppAlert).toHaveBeenCalledWith(
        'Could not save on this device',
        expect.stringContaining('not saved'),
      ));
      await waitFor(() => expect(view.getByTestId('history').props.children).toBe('empty'));
      expect(observe).toHaveBeenCalledWith('runtime_error');
      expect(asyncStorage.__store.has(storageKeys.chatHistory)).toBe(false);
      await view.unmount();
    } finally {
      warning.mockRestore();
    }
  });

  it('does not let an older append write finish after a newer clear', async () => {
    const firstWrite = deferred<void>();
    asyncStorage.multiSet.mockImplementationOnce(async (entries: [string, string][]) => {
      await firstWrite.promise;
      entries.forEach(([key, value]) => asyncStorage.__store.set(key, value));
    });
    const view = await render(<AppStateProvider><HistoryHarness /></AppStateProvider>);
    await waitFor(() => expect(view.getByTestId('history').props.children).toBe('empty'));

    await fireEvent.press(view.getByLabelText('Append completed voice turn'));
    await waitFor(() => expect(view.getByTestId('history').props.children).toContain('asha-new:A completed reply.'));
    await waitFor(() => expect(asyncStorage.multiSet).toHaveBeenCalledTimes(1));

    await fireEvent.press(view.getByLabelText('Clear chat history'));
    await waitFor(() => expect(view.getByTestId('history').props.children).toBe('empty'));
    expect(asyncStorage.multiSet).toHaveBeenCalledTimes(1);

    firstWrite.resolve();
    await waitFor(() => expect(asyncStorage.multiSet).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(JSON.parse(asyncStorage.__store.get(storageKeys.chatHistory) ?? 'null')).toEqual([]));
    await view.unmount();
  }, 20_000);

  it('waits for older writes and ignores stale changes while deleting all local data', async () => {
    const firstWrite = deferred<void>();
    asyncStorage.multiSet.mockImplementationOnce(async (entries: [string, string][]) => {
      await firstWrite.promise;
      entries.forEach(([key, value]) => asyncStorage.__store.set(key, value));
    });
    const originalClientId = asyncStorage.__store.get(storageKeys.clientId);
    const view = await render(<AppStateProvider><HistoryHarness /></AppStateProvider>);
    await waitFor(() => expect(view.getByTestId('history').props.children).toBe('empty'));

    await fireEvent.press(view.getByLabelText('Append completed voice turn'));
    await waitFor(() => expect(view.getByTestId('history').props.children).toContain('asha-new:A completed reply.'));
    await waitFor(() => expect(asyncStorage.multiSet).toHaveBeenCalledTimes(1));

    await fireEvent.press(view.getByLabelText('Clear all data'));
    expect(asyncStorage.multiSet).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('history').props.children).toContain('asha-new:A completed reply.');

    await fireEvent.press(view.getByLabelText('Append later voice turn'));
    expect(view.getByTestId('history').props.children).not.toContain('asha-later:A stale reply.');
    expect(asyncStorage.multiSet).toHaveBeenCalledTimes(1);

    firstWrite.resolve();
    await waitFor(() => expect(asyncStorage.multiSet).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.getByTestId('history').props.children).toBe('empty'));
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.chatHistory) ?? 'null')).toEqual([]);
    expect(asyncStorage.__store.get(storageKeys.clientId)).not.toBe(originalClientId);
    await view.unmount();
  }, 20_000);
});
