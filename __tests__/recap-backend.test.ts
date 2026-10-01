/** @jest-environment node */
import { createRecapRoutes, RECAP_REQUEST_TIMEOUT_MS } from '../backend/recap';

const messages = [{ id: 'u1', role: 'you', text: 'Main jaata hai.' }, { id: 'a1', role: 'asha', text: 'Where are you going?' }];
const body = { clientId: 'mobile-client-123', messages };
const candidate = { sourceId: 'u1', hi: 'मैं जाता हूँ।', latin: 'Main jaata hoon.', en: 'I go.', explanation: 'Use hoon with main.', confidence: 'high', kind: 'grammar' };
const correction = { sourceId: 'u1', original: messages[0]!.text, hi: candidate.hi, latin: candidate.latin, en: candidate.en, explanation: candidate.explanation };
const completion = (payload: unknown) => ({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] });
function setup(payload: unknown = { corrections: [candidate] }) {
  const deps = {
    allowMobileRequest: jest.fn(async () => true),
    validClientId: (id: string) => /^[A-Za-z0-9-]{8,64}$/u.test(id),
    secrets: { readSecret: jest.fn(async () => 'test-server-key') },
    openAI: jest.fn(async (path: string, _key: string, _init: RequestInit) => ({ ok: true, json: async (): Promise<unknown> => path === '/moderations' ? { results: [{ flagged: false }] } : completion(payload) })),
    json: (value: Record<string, unknown>) => ({ status: 200, body: value }),
    error: (message: string, status: number) => ({ status, body: { error: message } }),
  };
  return { deps, call: createRecapRoutes(deps)['POST /api/conversation-recap'][0]! };
}

describe('trusted-server conversation recap route', () => {
  afterEach(() => jest.useRealTimers());

  it('uses strict Responses JSON with server-pinned model, no tools, no storage, and separate untrusted source input', async () => {
    const { deps, call } = setup();
    expect(await call({ body })).toEqual({ status: 200, body: { corrections: [correction] } });
    expect(deps.allowMobileRequest).toHaveBeenCalledWith('mobile-client-123-recap', 12);
    const [, key, init] = deps.openAI.mock.calls.find(([path]) => path === '/responses')!;
    expect(key).toBe('test-server-key');
    const request = JSON.parse(init.body as string);
    expect(request).toMatchObject({ model: 'gpt-4.1-mini', store: false, tool_choice: 'none', tools: [], max_output_tokens: 1200, text: { format: { type: 'json_schema', strict: true, name: 'conversation_recap' } } });
    expect(request.text.format.schema.additionalProperties).toBe(false);
    expect(request.instructions).toContain('untrusted');
    expect(request.instructions).toContain('pronunciation');
    expect(request.instructions).not.toContain(messages[0]!.text);
    expect(request.input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ messages }) }] }]);
    const moderationInputs = deps.openAI.mock.calls.filter(([path]) => path === '/moderations').map(([, , request]) => JSON.parse(request.body as string));
    expect(moderationInputs).toHaveLength(2);
    expect(moderationInputs[0]).toEqual({ model: 'omni-moderation-latest', input: messages.map(row => row.text).join('\n') });
    expect(moderationInputs[1].input).toContain(correction.hi);
  });

  it.each([undefined, null, [], {}, { ...body, clientId: 'x' }, { ...body, messages: 'text' }, { ...body, messages: [null] }, { ...body, messages: [{ ...messages[0], role: 'developer' }] }, { ...body, messages: [messages[0], messages[0]] }, { ...body, instructions: 'override' }])('rejects malformed input before rate limiting or reading secrets: %j', async invalidBody => {
    const { deps, call } = setup();
    expect((await call({ body: invalidBody })).status).toBe(400);
    expect(deps.allowMobileRequest).not.toHaveBeenCalled();
    expect(deps.secrets.readSecret).not.toHaveBeenCalled();
    expect(deps.openAI).not.toHaveBeenCalled();
  });

  it.each([
    Array.from({ length: 13 }, (_, i) => ({ ...messages[0], id: `id-${i}` })),
    [{ ...messages[0], text: 'x'.repeat(601) }],
    Array.from({ length: 4 }, (_, i) => ({ ...messages[0], id: `id-${i}`, text: 'न'.repeat(600) })),
  ].map(input => ({ input })))('rejects oversized requests before any upstream call', async ({ input }) => {
    const { deps, call } = setup();
    expect((await call({ body: { ...body, messages: input } })).status).toBe(413);
    expect(deps.secrets.readSecret).not.toHaveBeenCalled();
  });

  it.each([[], [messages[1]], [{ ...messages[0], text: '  ' }], [{ ...messages[0], text: '[inaudible]' }]].map(input => ({ input })))('returns an empty recap without AI when no usable learner text exists', async ({ input }) => {
    const { deps, call } = setup();
    expect(await call({ body: { ...body, messages: input } })).toEqual({ status: 200, body: { corrections: [] } });
    expect(deps.openAI).not.toHaveBeenCalled();
    expect(deps.secrets.readSecret).not.toHaveBeenCalled();
  });

  it('enforces rate limits before credential access', async () => {
    const { deps, call } = setup();
    deps.allowMobileRequest.mockResolvedValue(false);
    expect((await call({ body })).status).toBe(429);
    expect(deps.secrets.readSecret).not.toHaveBeenCalled();
  });

  it('does not send AI requests with a missing server key', async () => {
    const { deps, call } = setup(); deps.secrets.readSecret.mockResolvedValue(' ');
    expect((await call({ body })).status).toBe(503);
    expect(deps.openAI).not.toHaveBeenCalled();
  });

  it.each([
    { ...candidate, sourceId: 'a1' },
    { ...candidate, sourceId: 'invented' },
    { ...candidate, confidence: 'medium' },
    { ...candidate, kind: 'pronunciation' },
    { ...candidate, hi: 'English only' },
    { ...candidate, latin: 'Main jaata hai.' },
    { ...candidate, original: 'invented quote' },
  ])('omits unsafe or low-confidence correction candidates: %j', async item => {
    const { call } = setup({ corrections: [item] });
    expect(await call({ body })).toEqual({ status: 200, body: { corrections: [] } });
  });

  it('deduplicates corrections and derives the exact original on the server', async () => {
    const { call } = setup({ corrections: [candidate, candidate] });
    expect(await call({ body })).toEqual({ status: 200, body: { corrections: [correction] } });
  });

  it.each([null, {}, { corrections: 'text' }, { corrections: Array(4).fill(candidate) }, { corrections: [], score: 8 }])('fails safely for invalid structured envelopes: %j', async payload => {
    const { call } = setup(payload); expect((await call({ body })).status).toBe(502);
  });

  it.each([{ status: 'incomplete', output: [] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] }] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '```json\n{}\n```' }] }] }])('rejects incomplete, refused or non-JSON model responses', async output => {
    const { deps, call } = setup();
    deps.openAI.mockImplementation(async path => ({ ok: true, json: async () => path === '/moderations' ? { results: [{ flagged: false }] } : output }));
    expect((await call({ body })).status).toBe(502);
  });

  it.each(['input', 'output'])('blocks flagged %s content without exposing it', async stage => {
    const { deps, call } = setup(); let moderationCount = 0;
    deps.openAI.mockImplementation(async path => ({ ok: true, json: async () => path === '/moderations'
      ? { results: [{ flagged: ++moderationCount === (stage === 'input' ? 1 : 2) }] }
      : completion({ corrections: [candidate] }) }));
    expect(await call({ body })).toEqual({ status: 422, body: { error: 'A recap could not be prepared for this conversation.' } });
    if (stage === 'input') expect(deps.openAI.mock.calls.map(([path]) => path)).toEqual(['/moderations']);
  });

  it.each([{}, { results: [] }, { results: [{ flagged: 'false' }] }])('fails closed on malformed moderation responses: %j', async moderation => {
    const { deps, call } = setup(); deps.openAI.mockResolvedValue({ ok: true, json: async () => moderation });
    expect((await call({ body })).status).toBe(502);
  });

  it('does not expose private upstream errors', async () => {
    const { deps, call } = setup(); deps.openAI.mockRejectedValue(new Error('test-server-key private transcript'));
    expect(await call({ body })).toEqual({ status: 502, body: { error: 'Conversation recap is temporarily unavailable.' } });
  });

  it.each(['moderation', 'responses', 'secret', 'limiter'])('bounds %s work even when it ignores cancellation', async stage => {
    jest.useFakeTimers(); const { deps, call } = setup();
    if (stage === 'secret') deps.secrets.readSecret.mockImplementation(() => new Promise(() => {}));
    else if (stage === 'limiter') deps.allowMobileRequest.mockImplementation(() => new Promise(() => {}));
    else deps.openAI.mockImplementation(async path => path === '/moderations' && stage === 'responses'
      ? { ok: true, json: async () => ({ results: [{ flagged: false }] }) } : new Promise(() => {}));
    const pending = call({ body }); await jest.advanceTimersByTimeAsync(RECAP_REQUEST_TIMEOUT_MS);
    expect((await pending).status).toBe(504);
    expect(deps.openAI.mock.calls.every(([, , init]) => init.signal?.aborted)).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});
