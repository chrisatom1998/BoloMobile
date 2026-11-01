import { ASHA_SESSION_INDEX_KEY, ashaSessionKey, type AshaSessionRecord } from '../src/lib/asha-session-log';
import {
  HISTORY_SEAL_ACCOUNT,
  SENSITIVE_VALUE_PREFIX,
  readSensitiveItem,
  revealSensitiveValue,
  wrapSensitiveStorage,
  writeSensitiveItem,
  type SensitiveStore,
} from '../src/lib/sensitive-storage';

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

type MemoryStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
  multiGet(keys: string[]): Promise<[string, string | null][]>;
  multiRemove(keys: string[]): Promise<void>;
  snapshot(): Map<string, string>;
};

function memoryStore(): MemoryStore {
  const values = new Map<string, string>();
  return {
    snapshot: () => values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
    async getAllKeys() {
      return [...values.keys()];
    },
    async multiGet(keys) {
      return keys.map((key) => [key, values.get(key) ?? null]);
    },
    async multiRemove(keys) {
      keys.forEach((key) => values.delete(key));
    },
  };
}

const secret = 'नमस्ते — private Asha reply';

describe('sensitive on-device storage', () => {
  it('encrypts a value so the stored bytes do not contain the plaintext', async () => {
    const store = memoryStore();
    await writeSensitiveItem(store, 'bolo-chat-history', secret);

    const raw = store.snapshot().get('bolo-chat-history') ?? '';
    expect(raw.startsWith(SENSITIVE_VALUE_PREFIX)).toBe(true);
    expect(raw).not.toContain(secret);
    expect(raw).not.toContain('private Asha');
    expect(await readSensitiveItem(store, 'bolo-chat-history')).toBe(secret);
  });

  it('migrates a legacy plaintext value in place and still returns it', async () => {
    const store = memoryStore();
    const legacy = JSON.stringify([{ id: 'asha-1', role: 'asha', text: secret }]);
    store.snapshot().set('bolo-chat-history', legacy);

    await expect(readSensitiveItem(store, 'bolo-chat-history')).resolves.toBe(legacy);

    const raw = store.snapshot().get('bolo-chat-history') ?? '';
    expect(raw.startsWith(SENSITIVE_VALUE_PREFIX)).toBe(true);
    expect(raw).not.toContain(secret);
    expect(await revealSensitiveValue(raw)).toBe(legacy);
    await expect(readSensitiveItem(store, 'bolo-chat-history')).resolves.toBe(legacy);
  });

  it('keeps the legacy plaintext when the encrypted rewrite fails', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = memoryStore();
    const legacy = JSON.stringify([{ text: secret }]);
    store.snapshot().set('bolo-chat-history', legacy);
    store.setItem = async () => {
      throw new Error('disk full');
    };

    await expect(readSensitiveItem(store, 'bolo-chat-history')).resolves.toBe(legacy);
    expect(store.snapshot().get('bolo-chat-history')).toBe(legacy);
    warning.mockRestore();
  });

  it('returns null for a missing value and for a sealed value that cannot be opened', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = memoryStore();
    await expect(readSensitiveItem(store, 'missing')).resolves.toBeNull();
    store.snapshot().set('broken', `${SENSITIVE_VALUE_PREFIX}AAAA`);
    await expect(readSensitiveItem(store, 'broken')).resolves.toBeNull();
    warning.mockRestore();
  });

  it('round-trips Hindi text through the storage wrapper used by the session log', async () => {
    const store = memoryStore();
    const wrapped = wrapSensitiveStorage(store);
    await wrapped.setItem('bolo-asha-session-v1:one', secret);
    await expect(wrapped.getItem('bolo-asha-session-v1:one')).resolves.toBe(secret);
    const raw = store.snapshot().get('bolo-asha-session-v1:one') ?? '';
    expect(raw.startsWith(SENSITIVE_VALUE_PREFIX)).toBe(true);
    expect(raw).not.toContain(secret);
    const [pair] = await wrapped.multiGet(['bolo-asha-session-v1:one']);
    expect(pair?.[1]).toBe(secret);
  });

  it('leaves nothing stored when a delete runs during a plaintext migration', async () => {
    const sessionKey = 'bolo-asha-session-v1:doomed';
    const values = new Map<string, string>([[sessionKey, secret]]);
    let releaseMigrationWrite: () => void = () => undefined;
    let migrationWriteStarted!: () => void;
    const migrationWriteEntered = new Promise<void>((resolve) => {
      migrationWriteStarted = resolve;
    });
    const store = {
      async getItem(key: string) {
        return values.get(key) ?? null;
      },
      async setItem(key: string, value: string) {
        if (key === sessionKey) {
          migrationWriteStarted();
          await new Promise<void>((resolve) => {
            releaseMigrationWrite = resolve;
          });
        }
        values.set(key, value);
      },
      async removeItem(key: string) {
        values.delete(key);
      },
      async multiGet(keys: readonly string[]) {
        return keys.map((key) => [key, values.get(key) ?? null] as [string, string | null]);
      },
      async multiRemove(keys: readonly string[]) {
        keys.forEach((key) => values.delete(key));
      },
    } satisfies SensitiveStore;
    const wrapped = wrapSensitiveStorage(store);
    const migrating = wrapped.multiGet([sessionKey]);
    await migrationWriteEntered;
    let deleted = false;
    const deleting = wrapped.multiRemove([sessionKey]).then(() => {
      deleted = true;
    });
    await Promise.resolve();
    expect(deleted).toBe(false);
    releaseMigrationWrite();
    await migrating;
    await deleting;
    expect(values.has(sessionKey)).toBe(false);
    expect([...values.values()].join('\n')).not.toContain(secret);
  });

  it('stores the encryption key outside AsyncStorage when the platform keystore is unavailable only as a fallback account', async () => {
    const store = memoryStore();
    await writeSensitiveItem(store, 'bolo-chat-history', secret);
    const key = store.snapshot().get(HISTORY_SEAL_ACCOUNT) ?? '';
    expect(key.length).toBeGreaterThan(0);
    expect(key).not.toContain(secret);
    expect(store.snapshot().get('bolo-chat-history')).not.toContain(key);
  });
});

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
};

function endedRecord(text: string): AshaSessionRecord {
  return {
    schema: 1,
    id: 'saved',
    startedAt: '2026-10-30T09:00:00.000Z',
    connectedAt: '2026-10-30T09:00:02.000Z',
    endedAt: '2026-10-30T09:05:00.000Z',
    state: 'ended',
    endReason: 'user_ended',
    responseLanguage: 'en',
    rows: [{ id: 'live-a-0', speaker: 'asha', text, startMs: 0, endMs: 400 }],
    learnerTurns: 1,
    savedPhrases: [],
    lessonsPracticed: [],
  };
}

describe('Asha session log encryption migration', () => {
  beforeEach(() => {
    asyncStorage.__store.clear();
  });

  it('reads a legacy plaintext session, returns the transcript, and rewrites it encrypted', async () => {
    const record = endedRecord(secret);
    asyncStorage.__store.set(ashaSessionKey(record.id), JSON.stringify(record));
    asyncStorage.__store.set(ASHA_SESSION_INDEX_KEY, JSON.stringify([{ id: record.id, startedAt: record.startedAt }]));

    let store!: typeof import('../src/lib/asha-session-log-store');
    let reveal!: typeof revealSensitiveValue;
    jest.isolateModules(() => {
      store = require('../src/lib/asha-session-log-store') as typeof store;
      reveal = (require('../src/lib/sensitive-storage') as typeof import('../src/lib/sensitive-storage')).revealSensitiveValue;
    });

    await store.ensureAshaSessionLogLoaded();
    expect(store.getAshaSessions()[0]?.rows[0]?.text).toBe(secret);

    const rawRecord = asyncStorage.__store.get(ashaSessionKey(record.id)) ?? '';
    const rawIndex = asyncStorage.__store.get(ASHA_SESSION_INDEX_KEY) ?? '';
    expect(rawRecord.startsWith(SENSITIVE_VALUE_PREFIX)).toBe(true);
    expect(rawIndex.startsWith(SENSITIVE_VALUE_PREFIX)).toBe(true);
    expect(rawRecord).not.toContain(secret);
    expect(JSON.parse(await reveal(rawRecord))).toMatchObject({ id: 'saved', rows: [{ text: secret }] });
  });
});
