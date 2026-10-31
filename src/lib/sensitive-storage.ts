/**
 * Encrypts Asha chat history and the session log before they are written to
 * AsyncStorage. The AES-256-GCM key lives in the platform keystore
 * (expo-secure-store) on Android and iOS. Web and unit tests have no keystore,
 * so the key falls back to the same key-value store as the ciphertext.
 *
 * Legacy plaintext is rewritten on read. A failed rewrite still returns the
 * old value, so a full disk cannot drop history that is already on the device.
 */
import type { AESEncryptionKey, AESSealedData } from 'expo-crypto';

export const SENSITIVE_VALUE_PREFIX = 'bolo-enc-v1:';
export const HISTORY_SEAL_ACCOUNT = 'bolo-history-seal-v1';

const IV_BYTES = 12;
const KEY_BYTES = 32;

export type SensitiveStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
  multiGet?(keys: readonly string[]): Promise<readonly [string, string | null][]>;
  multiRemove?(keys: readonly string[]): Promise<void>;
};

type KeyMaterial = {
  hex: string;
};

type SecureApi = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
};

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

let secureApi: SecureApi | null | undefined;
let secureKeyPromise: Promise<KeyMaterial> | null = null;
let fallbackKeyPromise: Promise<KeyMaterial> | null = null;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(KEY_BYTES);
  for (let index = 0; index < KEY_BYTES; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = index + 1 < bytes.length ? bytes[index + 1] ?? 0 : 0;
    const third = index + 2 < bytes.length ? bytes[index + 2] ?? 0 : 0;
    const triple = (first << 16) | (second << 8) | third;
    result += BASE64[(triple >>> 18) & 63];
    result += BASE64[(triple >>> 12) & 63];
    result += index + 1 < bytes.length ? BASE64[(triple >>> 6) & 63] : '=';
    result += index + 2 < bytes.length ? BASE64[triple & 63] : '=';
  }
  return result;
}

function base64Value(char: string | undefined): number {
  if (!char) return -1;
  return BASE64.indexOf(char);
}

function base64ToBytes(value: string): Uint8Array {
  const cleaned = value.replace(/[^A-Za-z0-9+/]/gu, '');
  const bytes: number[] = [];
  for (let index = 0; index < cleaned.length; index += 4) {
    const first = base64Value(cleaned[index]);
    const second = base64Value(cleaned[index + 1]);
    const third = base64Value(cleaned[index + 2]);
    const fourth = base64Value(cleaned[index + 3]);
    if (first < 0 || second < 0) break;
    bytes.push(((first << 2) | (second >> 4)) & 255);
    if (third >= 0) bytes.push((((second & 15) << 4) | (third >> 2)) & 255);
    if (fourth >= 0) bytes.push((((third & 3) << 6) | fourth) & 255);
  }
  return Uint8Array.from(bytes);
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function subtleCrypto(): SubtleCrypto | null {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.encrypt !== 'function' || typeof subtle.decrypt !== 'function' || typeof subtle.importKey !== 'function') return null;
  return subtle;
}

async function randomBytes(size: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(size);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  const { getRandomBytesAsync } = await import('expo-crypto');
  return new Uint8Array(await getRandomBytesAsync(size));
}

async function secureStoreApi(): Promise<SecureApi | null> {
  if (secureApi !== undefined) return secureApi;
  try {
    const SecureStore = await import('expo-secure-store');
    if (await SecureStore.isAvailableAsync()) {
      secureApi = {
        get: () => SecureStore.getItemAsync(HISTORY_SEAL_ACCOUNT),
        set: (value) => SecureStore.setItemAsync(HISTORY_SEAL_ACCOUNT, value),
      };
      return secureApi;
    }
  } catch {
    // Expo SecureStore has no web or Jest native module. The key falls back below.
  }
  secureApi = null;
  return null;
}

async function materialize(existing: string | null, persist: (hex: string) => Promise<void>): Promise<KeyMaterial> {
  const reusable = existing && /^[0-9a-f]{64}$/iu.test(existing) ? existing.toLowerCase() : null;
  const hex = reusable ?? bytesToHex(await randomBytes(KEY_BYTES));
  if (hex !== existing?.toLowerCase()) await persist(hex);
  return { hex };
}

async function importedSubtleKey(hex: string): Promise<CryptoKey | null> {
  const subtle = subtleCrypto();
  if (!subtle) return null;
  // Import on each use. Jest replaces the Web Crypto mocks between tests, which
  // invalidates a CryptoKey captured earlier in the process.
  return subtle.importKey('raw', asBufferSource(hexToBytes(hex)), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function rememberKey(slot: 'secure' | 'fallback', create: () => Promise<KeyMaterial>): Promise<KeyMaterial> {
  const current = slot === 'secure' ? secureKeyPromise : fallbackKeyPromise;
  if (current) return current;
  const pending = create().catch((error: unknown) => {
    if (slot === 'secure') secureKeyPromise = null;
    else fallbackKeyPromise = null;
    throw error;
  });
  if (slot === 'secure') secureKeyPromise = pending;
  else fallbackKeyPromise = pending;
  return pending;
}

async function loadKey(store: SensitiveStore): Promise<KeyMaterial> {
  const secure = await secureStoreApi();
  if (secure) {
    return rememberKey('secure', async () => materialize(await secure.get(), (hex) => secure.set(hex)));
  }
  const material = await rememberKey('fallback', async () => materialize(
    await store.getItem(HISTORY_SEAL_ACCOUNT),
    (hex) => store.setItem(HISTORY_SEAL_ACCOUNT, hex),
  ));
  if ((await store.getItem(HISTORY_SEAL_ACCOUNT)) !== material.hex) {
    await store.setItem(HISTORY_SEAL_ACCOUNT, material.hex);
  }
  return material;
}

async function sealWithExpo(plaintext: Uint8Array, iv: Uint8Array, keyHex: string): Promise<Uint8Array> {
  const { AESEncryptionKey, aesEncryptAsync } = await import('expo-crypto');
  const key = await AESEncryptionKey.import(keyHex, 'hex');
  const sealed = await aesEncryptAsync(plaintext, key, { nonce: { bytes: iv } });
  const ciphertext = await sealed.ciphertext({ encoding: 'bytes', includeTag: true });
  return typeof ciphertext === 'string' ? base64ToBytes(ciphertext) : new Uint8Array(ciphertext);
}

async function openWithExpo(iv: Uint8Array, ciphertext: Uint8Array, keyHex: string): Promise<Uint8Array> {
  const { AESEncryptionKey, AESSealedData, aesDecryptAsync } = await import('expo-crypto');
  const key: AESEncryptionKey = await AESEncryptionKey.import(keyHex, 'hex');
  const sealed: AESSealedData = AESSealedData.fromParts(iv, ciphertext, 16);
  const plain = await aesDecryptAsync(sealed, key);
  return typeof plain === 'string' ? base64ToBytes(plain) : new Uint8Array(plain);
}

async function seal(plaintext: string, key: KeyMaterial): Promise<string> {
  const iv = await randomBytes(IV_BYTES);
  const encoded = new TextEncoder().encode(plaintext);
  const cryptoKey = await importedSubtleKey(key.hex);
  const subtle = subtleCrypto();
  const cipher = cryptoKey && subtle
    ? new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: asBufferSource(iv) }, cryptoKey, asBufferSource(encoded)))
    : await sealWithExpo(encoded, iv, key.hex);
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return bytesToBase64(packed);
}

async function open(payload: string, key: KeyMaterial): Promise<string> {
  const packed = base64ToBytes(payload);
  if (packed.length < IV_BYTES + 16) throw new Error('sealed value is too short');
  const iv = packed.slice(0, IV_BYTES);
  const cipher = packed.slice(IV_BYTES);
  const cryptoKey = await importedSubtleKey(key.hex);
  const subtle = subtleCrypto();
  const plain = cryptoKey && subtle
    ? new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: asBufferSource(iv) }, cryptoKey, asBufferSource(cipher)))
    : await openWithExpo(iv, cipher, key.hex);
  return new TextDecoder().decode(plain);
}

export function isSensitiveEnvelope(value: string): boolean {
  return value.startsWith(SENSITIVE_VALUE_PREFIX);
}

export async function sealSensitiveValue(store: SensitiveStore, plaintext: string): Promise<string> {
  return SENSITIVE_VALUE_PREFIX + await seal(plaintext, await loadKey(store));
}

function defaultStore(): SensitiveStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@react-native-async-storage/async-storage') as { default: SensitiveStore }).default;
}

export async function revealSensitiveValue(stored: string, store?: SensitiveStore): Promise<string> {
  if (!isSensitiveEnvelope(stored)) return stored;
  return open(stored.slice(SENSITIVE_VALUE_PREFIX.length), await loadKey(store ?? defaultStore()));
}

export async function writeSensitiveItem(store: SensitiveStore, key: string, value: string): Promise<void> {
  await store.setItem(key, await sealSensitiveValue(store, value));
}

export async function readSensitiveItem(store: SensitiveStore, key: string): Promise<string | null> {
  const raw = await store.getItem(key);
  if (raw == null) return null;
  if (!isSensitiveEnvelope(raw)) {
    try {
      await writeSensitiveItem(store, key, raw);
    } catch (error) {
      console.warn('Bolo could not encrypt saved history.', error);
    }
    return raw;
  }
  try {
    return await revealSensitiveValue(raw, store);
  } catch (error) {
    console.warn('Bolo could not read encrypted history.', error);
    return null;
  }
}

export function wrapSensitiveStorage<T extends SensitiveStore>(store: T): T {
  return {
    ...store,
    async getItem(key: string) {
      return readSensitiveItem(store, key);
    },
    async setItem(key: string, value: string) {
      await writeSensitiveItem(store, key, value);
    },
    async multiGet(keys: readonly string[]) {
      const pairs = store.multiGet
        ? await store.multiGet(keys)
        : await Promise.all(keys.map(async (key) => [key, await store.getItem(key)] as [string, string | null]));
      const decoded: [string, string | null][] = [];
      for (const [key, value] of pairs) {
        if (value == null) {
          decoded.push([key, null]);
          continue;
        }
        if (!isSensitiveEnvelope(value)) {
          try {
            await writeSensitiveItem(store, key, value);
          } catch (error) {
            console.warn('Bolo could not encrypt saved history.', error);
          }
          decoded.push([key, value]);
          continue;
        }
        try {
          decoded.push([key, await revealSensitiveValue(value, store)]);
        } catch (error) {
          console.warn('Bolo could not read encrypted history.', error);
          decoded.push([key, null]);
        }
      }
      return decoded;
    },
  } as T;
}
