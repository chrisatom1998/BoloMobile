import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { defaultSceneProgress, storageKeys } from '../src/lib/storage';
import { AppStateProvider, useAppState } from '../src/state/app-state';

jest.mock('@/lib/ai-voice-player', () => ({ clearAiVoicePlaybackCache: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  const storage = {
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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function HistoryHarness() {
  const { appendChatMessages, replaceLiveChatSnapshot, chatHistory, clearAllData, clearChatHistory, hydrated } = useAppState();
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
      <Pressable accessibilityLabel="Stream revisable snapshots" onPress={() => {
        replaceLiveChatSnapshot([], [
          { id: 'live-1', role: 'you', text: 'Hello' },
          { id: 'live-2', role: 'you', text: 'there' },
        ]);
        for (let index = 0; index < 50; index += 1) {
          replaceLiveChatSnapshot(['live-1', 'live-2'], [{ id: 'live-1', role: 'you', text: `Hello there ${index}` }]);
        }
      }} />
      <Pressable accessibilityLabel="Clear chat history" onPress={() => { void clearChatHistory(); }} />
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

  it('coalesces streamed revisions, removes merged rows, and persists the final snapshot beside older history', async () => {
    asyncStorage.__store.set(storageKeys.chatHistory, JSON.stringify([{ id: 'old', role: 'asha', text: 'Previous session' }]));
    const view = await render(<AppStateProvider><HistoryHarness /></AppStateProvider>);
    await waitFor(() => expect(view.getByTestId('history').props.children).toBe('old:Previous session'));
    asyncStorage.multiSet.mockClear();
    await fireEvent.press(view.getByLabelText('Stream revisable snapshots'));
    expect(view.getByTestId('history').props.children).toBe('old:Previous session|live-1:Hello there 49');
    await waitFor(() => expect(JSON.parse(asyncStorage.__store.get(storageKeys.chatHistory) ?? '[]')).toEqual([
      { id: 'old', role: 'asha', text: 'Previous session' },
      { id: 'live-1', role: 'you', text: 'Hello there 49' },
    ]));
    const writes = asyncStorage.multiSet.mock.calls.filter(([entries]) => entries.some(([key]: [string, string]) => key === storageKeys.chatHistory));
    expect(writes.length).toBeLessThanOrEqual(2);
    await view.unmount();
    const restored = await render(<AppStateProvider><HistoryHarness /></AppStateProvider>);
    await waitFor(() => expect(restored.getByTestId('history').props.children).toBe('old:Previous session|live-1:Hello there 49'));
    await restored.unmount();
  });

  it('clears only the transcript and confirms persistence without touching saved learning data', async () => {
    const savedPhrase = { hi: 'नमस्ते', latin: 'Namaste', en: 'Hello' };
    const sceneProgress = { chai: { ...defaultSceneProgress(), completions: 2, bestScore: 90, lastPracticedAt: '2026-10-20T12:00:00.000Z' } };
    asyncStorage.__store.set(storageKeys.phrases, JSON.stringify([savedPhrase]));
    asyncStorage.__store.set(storageKeys.sceneProgress, JSON.stringify(sceneProgress));
    asyncStorage.__store.set(storageKeys.goal, JSON.stringify(15));
    asyncStorage.__store.set(storageKeys.chatHistory, JSON.stringify([{ id: 'old', role: 'asha', text: 'Old transcript' }]));
    const before = new Map(asyncStorage.__store);
    const { result, unmount } = await renderHook(() => useAppState(), {
      wrapper: ({ children }: { children: ReactNode }) => <AppStateProvider>{children}</AppStateProvider>,
    });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.phrases).toContainEqual(savedPhrase);
    expect(result.current.sceneProgress).toEqual(sceneProgress);
    const learningBefore = {
      phrases: result.current.phrases,
      sceneProgress: result.current.sceneProgress,
      goal: result.current.goal,
      practice: result.current.practice,
      phraseReviews: result.current.phraseReviews,
    };

    await act(async () => {
      await expect(result.current.clearChatHistory()).resolves.toBe(true);
    });
    expect(result.current.chatHistory).toEqual([]);
    expect({
      phrases: result.current.phrases,
      sceneProgress: result.current.sceneProgress,
      goal: result.current.goal,
      practice: result.current.practice,
      phraseReviews: result.current.phraseReviews,
    }).toEqual(learningBefore);
    for (const [key, value] of before) {
      if (key !== storageKeys.chatHistory) expect(asyncStorage.__store.get(key)).toBe(value);
    }
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.chatHistory) ?? 'null')).toEqual([]);
    await unmount();
  });

  it('reports a failed clear and restores the transcript instead of claiming a fresh persisted chat', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const oldHistory = [{ id: 'old', role: 'asha', text: 'Keep this if clearing fails' }];
    asyncStorage.__store.set(storageKeys.chatHistory, JSON.stringify(oldHistory));
    const { result, unmount } = await renderHook(() => useAppState(), {
      wrapper: ({ children }: { children: ReactNode }) => <AppStateProvider>{children}</AppStateProvider>,
    });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));
      asyncStorage.multiSet.mockRejectedValueOnce(new Error('disk full'));
      await act(async () => {
        await expect(result.current.clearChatHistory()).resolves.toBe(false);
      });
      expect(result.current.chatHistory).toEqual(oldHistory);
      expect(JSON.parse(asyncStorage.__store.get(storageKeys.chatHistory) ?? 'null')).toEqual(oldHistory);
      expect(showAppAlert).toHaveBeenCalledWith('Could not save on this device', expect.any(String));
    } finally {
      await unmount();
      warning.mockRestore();
    }
  });

  it('coalesces clears across screen instances so an earlier failed reset cannot restore a successfully cleared transcript', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const oldHistory = [{ id: 'old', role: 'asha', text: 'Old chat' }];
    asyncStorage.__store.set(storageKeys.chatHistory, JSON.stringify(oldHistory));
    const firstWrite = deferred<void>();
    const { result, unmount } = await renderHook(() => useAppState(), {
      wrapper: ({ children }: { children: ReactNode }) => <AppStateProvider>{children}</AppStateProvider>,
    });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));
      asyncStorage.multiSet.mockImplementationOnce(() => firstWrite.promise);
      let first!: Promise<boolean>;
      let second!: Promise<boolean>;
      await act(async () => {
        first = result.current.clearChatHistory();
        second = result.current.clearChatHistory();
      });
      expect(first).toBe(second);
      expect(result.current.chatHistory).toEqual([]);
      await act(async () => {
        firstWrite.reject(new Error('disk full'));
        expect(await Promise.all([first, second])).toEqual([false, false]);
      });
      expect(result.current.chatHistory).toEqual(oldHistory);
      await act(async () => {
        expect(await result.current.clearChatHistory()).toBe(true);
      });
      expect(result.current.chatHistory).toEqual([]);
      expect(JSON.parse(asyncStorage.__store.get(storageKeys.chatHistory) ?? 'null')).toEqual([]);
    } finally {
      await unmount();
      warning.mockRestore();
    }
  });

  it('runs a fresh clear when a new screen adds messages while an earlier clear is pending', async () => {
    asyncStorage.__store.set(storageKeys.chatHistory, JSON.stringify([{ id: 'old', role: 'asha', text: 'Old chat' }]));
    const firstWrite = deferred<void>();
    const { result, unmount } = await renderHook(() => useAppState(), {
      wrapper: ({ children }: { children: ReactNode }) => <AppStateProvider>{children}</AppStateProvider>,
    });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    asyncStorage.multiSet.mockImplementationOnce(async (entries: [string, string][]) => {
      await firstWrite.promise;
      entries.forEach(([key, value]) => asyncStorage.__store.set(key, value));
    });
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => { first = result.current.clearChatHistory(); });
    await act(async () => {
      result.current.appendChatMessages([
        { id: 'new-you', role: 'you', text: 'New typed question' },
        { id: 'new-asha', role: 'asha', text: 'New typed answer' },
      ]);
    });
    expect(result.current.chatHistory).toHaveLength(2);
    await act(async () => { second = result.current.clearChatHistory(); });
    await act(async () => {
      firstWrite.resolve();
      expect(await Promise.all([first, second])).toEqual([true, true]);
    });
    expect(result.current.chatHistory).toEqual([]);
    expect(JSON.parse(asyncStorage.__store.get(storageKeys.chatHistory) ?? 'null')).toEqual([]);
    await unmount();
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
