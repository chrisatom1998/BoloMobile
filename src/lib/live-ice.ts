/** Live's one-shot SDP exchange must include gathered ICE candidates. */
export async function waitForLiveIceGathering(getState: () => string, signal: AbortSignal) {
  if (signal.aborted) throw new Error('The live voice connection was canceled.');
  if (getState() === 'complete') return;
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearInterval(poll);
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(new Error('The live voice connection was canceled.'));
    const poll = setInterval(() => { if (getState() === 'complete') finish(); }, 50);
    const timeout = setTimeout(() => finish(new Error('The live voice connection could not gather network candidates.')), 5_000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
