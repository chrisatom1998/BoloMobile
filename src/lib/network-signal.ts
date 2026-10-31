/**
 * A tiny "the network is back" signal. `bolo-api.ts` fires it after any
 * successful request, and the sync outbox listens, so queued work flushes
 * without a connectivity dependency. Kept separate to avoid an import cycle.
 *
 * The same module remembers the last reachability the app has actually seen.
 * It stays `unknown` until a request succeeds or fails, so a fresh launch
 * does not claim the phone is offline.
 */
const listeners = new Set<() => void>();

export type NetworkStatus = 'unknown' | 'online' | 'offline';

let status: NetworkStatus = 'unknown';
const statusListeners = new Set<() => void>();

function setStatus(next: NetworkStatus) {
  if (status === next) return;
  status = next;
  statusListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A listener failure must never break the request that reported it.
    }
  });
}

export function getNetworkStatus() {
  return status;
}

export function subscribeNetworkStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

/** Test isolation. Production code never resets a status the device reported. */
export function resetNetworkStatusForTests() {
  status = 'unknown';
}

export function onNetworkAvailable(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function signalNetworkLost() {
  setStatus('offline');
}

export function signalNetworkAvailable() {
  setStatus('online');
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A listener failure must never break the request that succeeded.
    }
  });
}
