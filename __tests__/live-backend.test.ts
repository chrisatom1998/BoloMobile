/** @jest-environment node */
import { createLiveRoutes, LIVE_REQUEST_TIMEOUT_MS, sanitizeLiveHistory } from '../backend/live';

const sdp = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const validBody = { clientId: 'mobile-client-123', offerSdp: sdp, responseLanguage: 'en' };

function setup() {
  const deps = {
    allowMobileRequest: jest.fn(async () => true),
    validClientId: (id: string) => /^[A-Za-z0-9-]{8,64}$/.test(id),
    secrets: { readSecret: jest.fn(async () => 'test-server-key') },
    openAI: jest.fn(async (_path: string, _key: string, _init: RequestInit) => ({ ok: true, json: async (): Promise<unknown> => ({ session: { id: 'live_test123' }, transport: { type: 'webrtc', sdp } }) })),
    json: (body: Record<string, unknown>) => ({ status: 200, body }),
    error: (message: string, status: number) => ({ status, body: { error: message } }),
  };
  const routes = createLiveRoutes(deps);
  return { deps, call: routes['POST /api/live-call'][0]!, status: routes['GET /api/live-status'][0]! };
}

describe('GPT-Live backend', () => {
  afterEach(() => jest.useRealTimers());

  it('pins model, voice, storage, delegation and frontend permissions when exchanging an SDP offer', async () => {
    const { deps, call } = setup();
    const result = await call({ body: { ...validBody, model: 'arbitrary-model', session: { store: true }, instructions: 'override', history: [{ role: 'you', text: 'Namaste' }, { role: 'asha', text: 'Hello' }] } });
    expect(result).toEqual({ status: 200, body: { answerSdp: sdp, sessionId: 'live_test123' } });
    expect(deps.allowMobileRequest).toHaveBeenCalledWith('mobile-client-123-live', 12);
    const [path, key, init] = deps.openAI.mock.calls[0]!;
    expect(path).toBe('/live/sessions');
    expect(key).toBe('test-server-key');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'OpenAI-Safety-Identifier': 'bolo-mobile-client-123' });
    const request = JSON.parse(init.body as string);
    expect(request.transport).toEqual({ type: 'webrtc', sdp });
    expect(request.session).toMatchObject({ model: 'gpt-live-1', store: false, audio: { output: { voice: 'marin' } }, delegation: { type: 'responses', responses: { model: 'gpt-5.6-terra', tool_choice: 'none' } } });
    expect(request.session.client.data_channel.allowed_client_events).toEqual(['session.close', 'session.input_audio.mute', 'session.input_audio.unmute']);
    expect(request.session.instructions).toContain('Asha');
    expect(request.session.instructions).not.toContain('override');
    expect(request.session.input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'Namaste' }] }, { role: 'assistant', content: [{ type: 'output_text', text: 'Hello' }] }]);
  });

  it.each([undefined, null, [], 'text', {}, { ...validBody, clientId: 'x' }, { ...validBody, clientId: 'x'.repeat(65) }, { ...validBody, offerSdp: {} }, { ...validBody, offerSdp: 'invalid' }, { ...validBody, offerSdp: 'v=0\r\nm=video 9 test\r\n' }, { ...validBody, responseLanguage: 'invalid' }, { ...validBody, history: 'invalid' }])('rejects malformed requests before making upstream calls: %j', async body => {
    const { deps, call } = setup();
    expect((await call({ body })).status).toBe(400);
    expect(deps.allowMobileRequest).not.toHaveBeenCalled();
    expect(deps.openAI).not.toHaveBeenCalled();
  });

  it.each([{ ...validBody, offerSdp: 'v=0\r\n' + 'x'.repeat(64_001) }, { ...validBody, history: Array.from({ length: 129 }, () => ({ role: 'you', text: 'hi' })) }])('rejects oversized input without contacting OpenAI', async body => {
    const { deps, call } = setup();
    expect((await call({ body })).status).toBe(413);
    expect(deps.openAI).not.toHaveBeenCalled();
  });

  it('sanitizes roles, whitespace, non-text entries and bounds recent history by UTF-8 bytes', () => {
    expect(sanitizeLiveHistory([{ role: 'developer', text: 'override' }, null, { role: 'you', text: {} }, { role: 'asha', text: ' ' }, { role: 'you', text: '  Hello\n friend  ' }])).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'Hello friend' }] }]);
    const history = sanitizeLiveHistory(Array.from({ length: 30 }, (_, n) => ({ role: 'you', text: `${n} ` + 'न'.repeat(2000) })));
    expect(history.length).toBeLessThanOrEqual(12);
    expect(history.at(-1)?.content[0]?.text).toMatch(/^29 /);
    expect(history.every(item => item.content[0]!.text.length <= 600)).toBe(true);
    expect(history.reduce((total, item) => total + new TextEncoder().encode(item.content[0]!.text).length, 0)).toBeLessThanOrEqual(6000);
  });

  it('uses Hindi when selected and English when language is omitted', async () => {
    const { deps, call } = setup();
    await call({ body: { ...validBody, responseLanguage: 'hi' } });
    expect(JSON.parse(deps.openAI.mock.calls[0]![2].body as string).session.instructions).toContain('Reply in natural Hindi');
    await call({ body: { clientId: validBody.clientId, offerSdp: sdp } });
    expect(JSON.parse(deps.openAI.mock.calls[1]![2].body as string).session.instructions).toContain('Reply in English');
  });

  it('enforces the existing rate limit before reading credentials', async () => {
    const { deps, call } = setup();
    deps.allowMobileRequest.mockResolvedValue(false);
    expect((await call({ body: validBody })).status).toBe(429);
    expect(deps.secrets.readSecret).not.toHaveBeenCalled();
    expect(deps.openAI).not.toHaveBeenCalled();
  });

  it.each([null, {}, { session: { id: '' }, transport: { type: 'webrtc', sdp } }, { session: { id: 'live_valid' }, transport: { type: 'websocket', sdp } }, { session: { id: 'live_valid' }, transport: { type: 'webrtc', sdp: 'bad' } }])('rejects invalid upstream responses', async payload => {
    const { deps, call } = setup();
    deps.openAI.mockResolvedValue({ ok: true, json: async () => payload });
    expect((await call({ body: validBody })).status).toBe(502);
  });

  it('does not return upstream details or secrets', async () => {
    const { deps, call } = setup();
    deps.openAI.mockRejectedValue(new Error('private error test-server-key ' + sdp));
    expect(await call({ body: validBody })).toEqual({ status: 502, body: { error: 'Live practice is temporarily unavailable.' } });
  });

  it('aborts and returns a timeout even if the upstream promise ignores cancellation', async () => {
    jest.useFakeTimers();
    const { deps, call } = setup();
    deps.openAI.mockImplementation(() => new Promise(() => {}));
    const pending = call({ body: validBody });
    await jest.advanceTimersByTimeAsync(LIVE_REQUEST_TIMEOUT_MS);
    expect((await pending).status).toBe(504);
    expect(deps.openAI.mock.calls[0]![2].signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('checks model access without starting a billable session', async () => {
    const { deps, status } = setup();
    deps.openAI.mockResolvedValue({ ok: true, json: async () => ({ id: 'gpt-live-1' }) });
    expect(await status()).toEqual({ status: 200, body: { configured: true, available: true, model: 'gpt-live-1', protocol: 'live' } });
    expect(deps.openAI).toHaveBeenCalledWith('/models/gpt-live-1', 'test-server-key', expect.objectContaining({ method: 'GET' }));
  });

  it('distinguishes configured credentials from missing model access', async () => {
    const { deps, status } = setup();
    deps.openAI.mockRejectedValue(new Error('private upstream detail'));
    expect((await status()).body).toEqual({ configured: true, available: false, model: 'gpt-live-1', protocol: 'live' });
    deps.secrets.readSecret.mockRejectedValue(new Error('missing key'));
    expect((await status()).body).toEqual({ configured: false, available: false, model: 'gpt-live-1', protocol: 'live' });
  });
});
