jest.mock('@/lib/sensitive-storage', () => ({
  wrapSensitiveStorage: (storage: unknown) => storage,
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      __store: store,
      getAllKeys: jest.fn(async () => [...store.keys()]),
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null])),
      multiRemove: jest.fn(async (keys: string[]) => {
        keys.forEach((key) => store.delete(key));
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
jest.mock('@/lib/observability', () => ({ observe: jest.fn() }));

import { MAX_ASHA_CHATS, ashaChatKey, createAshaChatRecord, type AshaChatRecord } from '../src/lib/asha-chat-archive';
import type { ChatMessage } from '../src/state/app-state-types';

type Store = typeof import('../src/lib/asha-chat-archive-store');

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
  getAllKeys: jest.Mock;
  setItem: jest.Mock;
};

const base = Date.parse('2026-11-20T18:00:00.000Z');
function chat(index: number): ChatMessage[] {
  return [
    { id: `you-${base + index * 60_000}`, role: 'you', text: `Question ${index}` },
    { id: `asha-${base + index * 60_000}`, role: 'asha', text: `Answer ${index}`, language: 'en' },
  ];
}
function stored(index: number): AshaChatRecord {
  return createAshaChatRecord(chat(index)) as AshaChatRecord;
}

/** A fresh copy of the store, as after an app restart. Storage contents carry over. */
function loadStore(): Store {
  let store!: Store;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    store = require('../src/lib/asha-chat-archive-store') as Store;
  });
  return store;
}

describe('Asha chat history store', () => {
  beforeEach(() => {
    asyncStorage.__store.clear();
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('saves a chat under its own key and lists it again after a restart', async () => {
    const store = loadStore();
    expect(await store.archiveAshaChat(chat(1))).toBe(true);
    expect(store.getAshaChats().map((record) => record.id)).toEqual([stored(1).id]);
    expect(JSON.parse(asyncStorage.__store.get(ashaChatKey(stored(1).id)) ?? 'null')).toEqual(stored(1));

    const restarted = loadStore();
    await restarted.ensureAshaChatsLoaded();
    expect(restarted.getAshaChats()).toEqual([stored(1)]);
  });

  it('saves nothing for an empty chat', async () => {
    const store = loadStore();
    expect(await store.archiveAshaChat([])).toBe(false);
    expect(asyncStorage.setItem).not.toHaveBeenCalled();
    expect(store.getAshaChats()).toEqual([]);
  });

  it('lists newest first and replaces a chat that is saved again after it grew', async () => {
    const store = loadStore();
    await store.archiveAshaChat(chat(1));
    await store.archiveAshaChat(chat(2));
    expect(store.getAshaChats().map((record) => record.messages[0]?.text)).toEqual(['Question 2', 'Question 1']);

    const grown: ChatMessage[] = [...chat(1), { id: `you-${base + 10 * 60_000}`, role: 'you', text: 'One more thing' }];
    await store.archiveAshaChat(grown);
    const chats = store.getAshaChats();
    expect(chats).toHaveLength(2);
    expect(chats[0]?.messages).toHaveLength(3);
    expect([...asyncStorage.__store.keys()]).toHaveLength(2);
  });

  it('drops the oldest chat from memory and disk once the cap is passed', async () => {
    for (let index = 0; index < MAX_ASHA_CHATS; index += 1) {
      asyncStorage.__store.set(ashaChatKey(stored(index).id), JSON.stringify(stored(index)));
    }
    const store = loadStore();
    await store.archiveAshaChat(chat(MAX_ASHA_CHATS));
    expect(store.getAshaChats()).toHaveLength(MAX_ASHA_CHATS);
    expect(asyncStorage.__store.has(ashaChatKey(stored(0).id))).toBe(false);
    expect(asyncStorage.__store.has(ashaChatKey(stored(MAX_ASHA_CHATS).id))).toBe(true);
    expect([...asyncStorage.__store.keys()]).toHaveLength(MAX_ASHA_CHATS);
  });

  it('removes damaged values on load and keeps the good ones', async () => {
    asyncStorage.__store.set(ashaChatKey(stored(1).id), JSON.stringify(stored(1)));
    asyncStorage.__store.set(ashaChatKey('broken'), '{not json');
    // A record stored under another chat's key is not trusted either.
    asyncStorage.__store.set(ashaChatKey('wrong-key'), JSON.stringify(stored(2)));
    asyncStorage.__store.set('bolo-chat-history', 'untouched');
    const store = loadStore();
    await store.ensureAshaChatsLoaded();
    await store.removeAshaChat('nothing');
    expect(store.getAshaChats()).toEqual([stored(1)]);
    expect([...asyncStorage.__store.keys()].sort()).toEqual([ashaChatKey(stored(1).id), 'bolo-chat-history'].sort());
  });

  it('removes one chat and tells subscribers', async () => {
    const store = loadStore();
    await store.archiveAshaChat(chat(1));
    await store.archiveAshaChat(chat(2));
    const listener = jest.fn();
    const unsubscribe = store.subscribeAshaChats(listener);
    await store.removeAshaChat(stored(1).id);
    expect(listener).toHaveBeenCalled();
    expect(store.getAshaChats().map((record) => record.id)).toEqual([stored(2).id]);
    expect(asyncStorage.__store.has(ashaChatKey(stored(1).id))).toBe(false);
    unsubscribe();
  });

  it('deletes everything, including a save still waiting, and does not read old chats back', async () => {
    asyncStorage.__store.set(ashaChatKey(stored(1).id), JSON.stringify(stored(1)));
    const store = loadStore();
    // Not awaited: this save is still waiting on the first load when deletion happens.
    const pending = store.archiveAshaChat(chat(2));
    const deleted = store.deleteAllAshaChats();
    expect(store.getAshaChats()).toEqual([]);
    await deleted;
    expect(await pending).toBe(false);
    await store.ensureAshaChatsLoaded();
    expect(store.getAshaChats()).toEqual([]);
    expect([...asyncStorage.__store.keys()]).toEqual([]);

    // The store still works afterwards.
    expect(await store.archiveAshaChat(chat(3))).toBe(true);
    expect(store.getAshaChats()).toHaveLength(1);
  });

  it('keeps the chat listed and reports false when the write fails', async () => {
    const store = loadStore();
    asyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
    expect(await store.archiveAshaChat(chat(1))).toBe(false);
    expect(store.getAshaChats()).toHaveLength(1);
    // The next save goes through: one failure does not jam the queue.
    expect(await store.archiveAshaChat(chat(2))).toBe(true);
  });
});
