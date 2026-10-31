jest.mock('@/lib/observability', () => ({ observe: jest.fn() }));

let mockLiveApiUrl: string | undefined = 'https://live.example.test';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { get expoConfig() { return { extra: { boloLiveApiUrl: mockLiveApiUrl } }; } },
}));

import { observe } from '../src/lib/observability';
import { BoloApiError, boloApiErrorKind, createLiveCall, isOfflineBoloApiError, parseRetryAfterMs, reportGeneratedMessage, sendMobileChat } from '../src/services/bolo-api';

const observeMock = observe as jest.MockedFunction<typeof observe>;

const input = {
  text: 'Help me practice Hindi.',
  messages: [],
  clientId: 'client-12345678',
};

function response(options: { ok: boolean; status: number; payload?: unknown; invalidJson?: boolean; headers?: Record<string, string> }) {
  return {
    ok: options.ok,
    status: options.status,
    headers: { get: (name: string) => options.headers?.[name] ?? options.headers?.[name.toLowerCase()] ?? null },
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

const offerSdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';

describe('Bolo API shared failure boundary', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mockLiveApiUrl = 'https://live.example.test';
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('preserves a safe 4xx service message and status as an HTTP failure', async () => {
    globalThis.fetch = jest.fn(async () => response({
      ok: false,
      status: 429,
      payload: { error: 'Please wait before trying again.' },
    })) as unknown as typeof fetch;

    const error = await sendMobileChat(input).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BoloApiError);
    expect(error).toMatchObject({
      kind: 'http',
      message: 'Please wait before trying again.',
      status: 429,
    });
    expect((error as BoloApiError).retryAfterMs).toBeUndefined();
  });

  it('honors Retry-After on a 429 as seconds or an HTTP date, bounded', async () => {
    globalThis.fetch = jest.fn(async () => response({ ok: false, status: 429, payload: {}, headers: { 'Retry-After': '120' } })) as unknown as typeof fetch;
    await expect(sendMobileChat(input)).rejects.toMatchObject({ kind: 'http', status: 429, retryAfterMs: 120_000 });
    const now = Date.now();
    expect(parseRetryAfterMs(new Date(now + 90_000).toUTCString(), now)).toBeGreaterThanOrEqual(89_000);
    expect(parseRetryAfterMs('0')).toBeUndefined();
    expect(parseRetryAfterMs('soon')).toBeUndefined();
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs(String(10 * 24 * 60 * 60))).toBe(24 * 60 * 60 * 1000);
    // A 503 with Retry-After is still an ordinary HTTP failure; only 429 carries the header through.
    globalThis.fetch = jest.fn(async () => response({ ok: false, status: 503, payload: {}, headers: { 'Retry-After': '5' } })) as unknown as typeof fetch;
    const error = await sendMobileChat(input).catch((cause: unknown) => cause) as BoloApiError;
    expect(error.retryAfterMs).toBeUndefined();
  });

  it('keeps the HTTP classification for a 5xx response with invalid JSON', async () => {
    globalThis.fetch = jest.fn(async () => response({
      ok: false,
      status: 503,
      invalidJson: true,
    })) as unknown as typeof fetch;

    const error = await sendMobileChat(input).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BoloApiError);
    expect(error).toMatchObject({
      kind: 'http',
      message: 'Bolo could not complete that request.',
      status: 503,
    });
  });

  it('rejects invalid JSON from an otherwise successful response as an invalid payload', async () => {
    globalThis.fetch = jest.fn(async () => response({
      ok: true,
      status: 200,
      invalidJson: true,
    })) as unknown as typeof fetch;

    const error = await sendMobileChat(input).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BoloApiError);
    expect(error).toMatchObject({
      kind: 'invalid_payload',
      message: 'Bolo returned an invalid response. Please try again.',
      status: 200,
    });
  });

  it('keeps a transport failure, caller cancellation, or timeout while reading a successful body as that kind, not as an invalid payload', async () => {
    // Transport: the connection dropped mid-body.
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw new TypeError('Network request failed');
      },
    })) as unknown as typeof fetch;
    await expect(sendMobileChat(input)).rejects.toMatchObject({ kind: 'network', message: 'Bolo is unavailable right now. Check your connection and try again.' });

    // Cancellation: the caller aborted while the body was still arriving.
    const caller = new AbortController();
    const bodyFollowsSignal = (signal?: AbortSignal | null) => new Promise<never>((_resolve, reject) => {
      const rejectAsAborted = () => reject(abortError());
      if (signal?.aborted) rejectAsAborted();
      else signal?.addEventListener('abort', rejectAsAborted, { once: true });
    });
    globalThis.fetch = jest.fn(async (_url: string, init?: RequestInit) => ({ ok: true, status: 200, headers: { get: () => null }, json: () => bodyFollowsSignal(init?.signal) })) as unknown as typeof fetch;
    const canceled = sendMobileChat(input, caller.signal).catch((cause: unknown) => cause);
    await Promise.resolve();
    caller.abort();
    expect(await canceled).toMatchObject({ kind: 'aborted', message: 'The request was canceled.' });

    // Timeout: our own 30 s deadline fired during the body read.
    jest.useFakeTimers();
    const timedOut = sendMobileChat(input).catch((cause: unknown) => cause);
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(30_000);
    expect(await timedOut).toMatchObject({ kind: 'timeout', message: 'The request timed out. Check your connection and try again.' });
  });

  it('rejects a 2xx response that fails validation as an invalid payload', async () => {
    globalThis.fetch = jest.fn(async () => response({ ok: true, status: 200, payload: { transcript: 'x', reply: '', language: 'en' } })) as unknown as typeof fetch;
    await expect(sendMobileChat(input)).rejects.toMatchObject({ kind: 'invalid_payload', status: 200 });
    expect(isOfflineBoloApiError(await sendMobileChat(input).catch((cause: unknown) => cause))).toBe(false);
  });

  it('normalizes a network rejection without exposing the underlying error', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('socket details must stay internal');
    }) as unknown as typeof fetch;

    const error = await sendMobileChat(input).catch((cause: unknown) => cause) as BoloApiError;
    expect(error).toMatchObject({
      name: 'BoloApiError',
      kind: 'network',
      message: 'Bolo is unavailable right now. Check your connection and try again.',
    });
    expect(error.status).toBeUndefined();
    expect(isOfflineBoloApiError(error)).toBe(true);
  });

  it('distinguishes caller cancellation from a timeout', async () => {
    const caller = new AbortController();
    const pending = installPendingFetch();
    const request = sendMobileChat(input, caller.signal);
    const rejection = expect(request).rejects.toMatchObject({
      name: 'BoloApiError',
      kind: 'aborted',
      message: 'The request was canceled.',
    });

    caller.abort();

    await rejection;
    expect(pending.fetchMock).toHaveBeenCalledTimes(1);
    expect(pending.requestSignal()?.aborted).toBe(true);
  });

  it('treats a signal that was already aborted as cancellation, not as offline', async () => {
    const caller = new AbortController();
    caller.abort();
    const pending = installPendingFetch();
    const error = await sendMobileChat(input, caller.signal).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ kind: 'aborted' });
    expect(isOfflineBoloApiError(error)).toBe(false);
    expect(pending.fetchMock).not.toHaveBeenCalled();
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

  it('aborts at the 30-second request deadline as a timeout', async () => {
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
      kind: 'timeout',
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

  it('reports a missing Live URL as configuration and a rejected live-call payload as invalid, never as offline', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockLiveApiUrl = undefined;
    const config = await createLiveCall({ clientId: 'client-12345678', offerSdp, responseLanguage: 'en' }).catch((cause: unknown) => cause);
    expect(config).toMatchObject({ kind: 'config', message: 'Live voice isn’t available right now. You can still type to Asha.' });
    expect(isOfflineBoloApiError(config)).toBe(false);

    mockLiveApiUrl = 'https://live.example.test';
    const invalid = await createLiveCall({ clientId: 'bad id', offerSdp, responseLanguage: 'en' }).catch((cause: unknown) => cause);
    expect(invalid).toMatchObject({ kind: 'invalid_payload', message: 'Bolo could not start this live voice session.' });
    expect(isOfflineBoloApiError(invalid)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    warning.mockRestore();
  });

  it('classifies by kind, so a changed message never changes offline or retry handling', () => {
    const offline = new BoloApiError('Any wording at all', { kind: 'network' });
    const text = new BoloApiError('Bolo is unavailable right now. Check your connection and try again.', { kind: 'http', status: 400 });
    expect(isOfflineBoloApiError(offline)).toBe(true);
    expect(isOfflineBoloApiError(text)).toBe(false);
    expect(boloApiErrorKind(new Error('Bolo is unavailable right now.'))).toBeNull();
    expect(boloApiErrorKind(new BoloApiError('x', { kind: 'timeout' }))).toBe('timeout');
  });

  it('sends exactly the existing report payload without a local report id', async () => {
    const fetchMock = jest.fn(async () => response({ ok: true, status: 200, payload: { reported: true } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await reportGeneratedMessage({ clientId: 'client-12345678', message: '  A reply  ', reason: 'incorrect_or_misleading' });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(body).toEqual({ clientId: 'client-12345678', message: 'A reply', reason: 'incorrect_or_misleading' });
    expect(Object.keys(body)).not.toContain('reportId');
  });
});
