/**
 * A tiny "the network is back" signal. `bolo-api.ts` fires it after any
 * successful request, and the sync outbox listens, so queued work flushes
 * without a connectivity dependency. Kept separate to avoid an import cycle.
 */
const listeners = new Set<() => void>();

export function onNetworkAvailable(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function signalNetworkAvailable() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A listener failure must never break the request that succeeded.
    }
  });
}
