jest.mock('@/lib/observability', () => ({ observe: jest.fn() }));

import { observe } from '../src/lib/observability';
import { BoloApiError, sendMobileChat } from '../src/services/bolo-api';

const observeMock = observe as jest.MockedFunction<typeof observe>;

const input = {
  text: 'Help me practice Hindi.',
  messages: [],
  clientId: 'client-12345678',
};

function response(options: { ok: boolean; status: number; payload?: unknown; invalidJson?: boolean }) {
  return {
    ok: options.ok,
    status: options.status,
    json: async () => {
      if (options.invalidJson) throw new SyntaxError('Unexpected token');
      return options.payload;
    },
  };
}

function abortError() {
  return Object.assign(new Error('aborted'), { name: 'AbortError' });
}

function installPendingFetch() {
  let requestSignal: AbortSignal | undefined;
  const fetchMock = jest.fn((_url: string, init?: RequestInit) => new Promise<never>((_resolve, reject) => {
    requestSignal = init?.signal ?? undefined;
    const rejectAsAborted = () => reject(abortError());
    if (requestSignal?.aborted) rejectAsAborted();
    else requestSignal?.addEventListener('abort', rejectAsAborted, { once: true });
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, requestSignal: () => requestSignal };
}

describe('Bolo API shared failure boundary', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('preserves a safe 4xx service message and status', async () => {
    globalThis.fetch = jest.fn(async () => response({
      ok: false,
      status: 429,
      payload: { error: 'Please wait before trying again.' },
    })) as unknown as typeof fetch;

    const error = await sendMobileChat(input).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BoloApiError);
    expect(error).toMatchObject({
      message: 'Please wait before trying again.',
      status: 429,
    });
  });

  it('uses the generic request error for a 5xx response with invalid JSON', async () => {
    globalThis.fetch = jest.fn(async () => response({
      ok: false,
      status: 503,
      invalidJson: true,
    })) as unknown as typeof fetch;

    const error = await sendMobileChat(input).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BoloApiError);
    expect(error).toMatchObject({
      message: 'Bolo could not complete that request.',
      status: 503,
    });
  });

  it('rejects invalid JSON from an otherwise successful response', async () => {
    globalThis.fetch = jest.fn(async () => response({
      ok: true,
      status: 200,
      invalidJson: true,
    })) as unknown as typeof fetch;

    const error = await sendMobileChat(input).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BoloApiError);
    expect(error).toMatchObject({
      message: 'Bolo returned an invalid response. Please try again.',
      status: 200,
    });
  });

  it('normalizes a network rejection without exposing the underlying error', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('socket details must stay internal');
    }) as unknown as typeof fetch;

    await expect(sendMobileChat(input)).rejects.toMatchObject({
      name: 'BoloApiError',
      message: 'Bolo is unavailable right now. Check your connection and try again.',
      status: undefined,
    });
  });

  it('distinguishes caller cancellation from a timeout', async () => {
    const caller = new AbortController();
    const pending = installPendingFetch();
    const request = sendMobileChat(input, caller.signal);
    const rejection = expect(request).rejects.toMatchObject({
      name: 'BoloApiError',
      message: 'The request was canceled.',
    });

    caller.abort();

    await rejection;
    expect(pending.fetchMock).toHaveBeenCalledTimes(1);
    expect(pending.requestSignal()?.aborted).toBe(true);
  });

  it('counts only real failures in diagnostics, not caller cancellations', async () => {
    observeMock.mockClear();
    const caller = new AbortController();
    installPendingFetch();
    const request = sendMobileChat(input, caller.signal).catch((cause: unknown) => cause);
    caller.abort();
    await request;
    expect(observeMock).not.toHaveBeenCalled();

    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    await sendMobileChat(input).catch(() => undefined);
    expect(observeMock).toHaveBeenCalledWith('ai_request_failed', expect.any(Number));
  });

  it('aborts at the 30-second request deadline', async () => {
    jest.useFakeTimers();
    const pending = installPendingFetch();
    const request = sendMobileChat(input);
    let settled = false;
    void request.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    const rejection = expect(request).rejects.toMatchObject({
      name: 'BoloApiError',
      message: 'The request timed out. Check your connection and try again.',
    });

    jest.advanceTimersByTime(29_999);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(pending.requestSignal()?.aborted).toBe(false);

    jest.advanceTimersByTime(1);
    await rejection;
    expect(pending.requestSignal()?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});
