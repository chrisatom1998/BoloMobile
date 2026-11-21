/**
 * Encrypted persistence for Asha chat history (past chats). Each chat has its
 * own AES-GCM sealed key, so saving one never rewrites the others. There is no
 * index: hydration lists the keys, drops damaged values, and applies the cap.
 * One serialized write queue keeps saves, removals, and deletion in order.
 *
 * A generation guards deletion: Clear chat and Delete Bolo data bump it, so a
 * save that was still waiting when the learner deleted everything is dropped
 * instead of bringing a chat back.
 */
import { useEffect, useSyncExternalStore } from 'react';

import {
  ashaChatIdFromKey,
  ashaChatKey,
  createAshaChatRecord,
  isAshaChatKey,
  pruneAshaChats,
  sanitizeAshaChat,
  type AshaChatRecord,
} from '@/lib/asha-chat-archive';
import { observe } from '@/lib/observability';
import { wrapSensitiveStorage } from '@/lib/sensitive-storage';
import type { ChatMessage } from '@/state/app-state-types';

type LocalStorage = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys?(): Promise<readonly string[]>;
  multiGet?(keys: readonly string[]): Promise<readonly [string, string | null][]>;
  multiRemove?(keys: readonly string[]): Promise<void>;
};

// Lazy like the session log: pure UI tests import this without a native bridge.
function storage(): LocalStorage {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const asyncStorage = (require('@react-native-async-storage/async-storage') as { default: LocalStorage }).default;
  return wrapSensitiveStorage(asyncStorage);
}

async function allChatKeys(): Promise<string[]> {
  const store = storage();
  const keys = typeof store.getAllKeys === 'function' ? await store.getAllKeys() : [];
  return keys.filter(isAshaChatKey);
}

async function readMany(keys: string[]): Promise<[string, string | null][]> {
  const store = storage();
  if (typeof store.multiGet === 'function') return (await store.multiGet(keys)).map(([key, value]) => [key, value]);
  return Promise.all(keys.map(async (key): Promise<[string, string | null]> => [key, await store.getItem(key)]));
}

async function removeMany(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const store = storage();
  if (typeof store.multiRemove === 'function') {
    await store.multiRemove(keys);
    return;
  }
  for (const key of keys) await store.removeItem(key);
}

const EMPTY: AshaChatRecord[] = [];
/** Past chats, newest first. */
let chats: AshaChatRecord[] = EMPTY;
let hydration: Promise<void> | null = null;
let generation = 0;
let writeTail: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function replaceChats(next: AshaChatRecord[]) {
  chats = next.length ? next : EMPTY;
  listeners.forEach((listener) => listener());
}

function reportFailure(message: string, error: unknown) {
  console.warn(message, error);
  observe('runtime_error');
}

/** Runs a storage step after everything already queued, keeping the queue alive on failure. */
function enqueueWrite(step: () => Promise<void>): Promise<void> {
  const result = writeTail.then(step);
  writeTail = result.then(() => undefined, () => undefined);
  return result;
}

async function hydrate() {
  const startedGeneration = generation;
  const loaded: AshaChatRecord[] = [];
  const damaged: string[] = [];
  try {
    const keys = await allChatKeys();
    const values = keys.length ? await readMany(keys) : [];
    for (const [key, value] of values) {
      const record = sanitizeAshaChat(value);
      if (record && record.id === ashaChatIdFromKey(key)) loaded.push(record);
      else damaged.push(key);
    }
  } catch (error) {
    reportFailure('Bolo could not read Asha chat history.', error);
    return;
  }
  // Everything was deleted while this read was in flight; nothing read may come back.
  if (generation !== startedGeneration) return;
  const kept = pruneAshaChats(loaded);
  const keptIds = new Set(kept.map((chat) => chat.id));
  replaceChats(kept);
  const stale = [...damaged, ...loaded.filter((chat) => !keptIds.has(chat.id)).map((chat) => ashaChatKey(chat.id))];
  if (stale.length) void enqueueWrite(() => removeMany(stale)).catch((error: unknown) => reportFailure('Bolo could not tidy Asha chat history.', error));
}

/** Reads chat history once. Later calls resolve immediately. */
export function ensureAshaChatsLoaded(): Promise<void> {
  hydration ??= hydrate();
  return hydration;
}

export function getAshaChats(): AshaChatRecord[] {
  return chats;
}

export function subscribeAshaChats(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Past chats for screens, newest first. Starts loading them on first use. */
export function useAshaChats(): AshaChatRecord[] {
  useEffect(() => {
    void ensureAshaChatsLoaded();
  }, []);
  return useSyncExternalStore(subscribeAshaChats, getAshaChats, getAshaChats);
}

/**
 * Saves the chat that is about to leave the Asha screen. The record is built
 * from `messages` right away, so the caller may clear the screen without
 * waiting. Resolves false when there was nothing to save or the write failed;
 * a failed write still leaves the chat listed until the app closes.
 */
export async function archiveAshaChat(messages: readonly ChatMessage[]): Promise<boolean> {
  const record = createAshaChatRecord(messages);
  if (!record) return false;
  const scheduled = generation;
  // The cap is applied against the stored chats, so they have to be known first.
  await ensureAshaChatsLoaded();
  if (scheduled !== generation) return false;
  const next = pruneAshaChats([record, ...chats.filter((chat) => chat.id !== record.id)]);
  const keptIds = new Set(next.map((chat) => chat.id));
  const evicted = chats.filter((chat) => !keptIds.has(chat.id)).map((chat) => ashaChatKey(chat.id));
  replaceChats(next);
  try {
    await enqueueWrite(async () => {
      // Deleted since this was queued: the deletion decides what stays on disk.
      if (scheduled !== generation) return;
      await storage().setItem(ashaChatKey(record.id), JSON.stringify(record));
      // Make room only after the new chat is safely stored.
      await removeMany(evicted);
    });
    return scheduled === generation;
  } catch (error) {
    reportFailure('Bolo could not save this chat to Asha chat history.', error);
    return false;
  }
}

/** Removes one past chat: the learner deleted it, or reopened it as the current chat. */
export async function removeAshaChat(id: string): Promise<void> {
  await ensureAshaChatsLoaded();
  replaceChats(chats.filter((chat) => chat.id !== id));
  await enqueueWrite(() => removeMany([ashaChatKey(id)]));
}

/**
 * Clear chat and Delete Bolo data: forgets every past chat now, before any
 * await, and then removes every stored chat behind the pending writes.
 */
export function deleteAllAshaChats(): Promise<void> {
  generation += 1;
  replaceChats(EMPTY);
  // Nothing on disk is worth reading after this; a later load must not bring chats back.
  hydration = Promise.resolve();
  return enqueueWrite(async () => {
    await removeMany(await allChatKeys());
  });
}
