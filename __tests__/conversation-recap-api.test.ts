import { getConversationRecap } from '../src/services/bolo-api';
import type { RecapMessage } from '../shared/conversation-recap';

jest.mock('@/lib/observability', () => ({ observe: jest.fn() }));

const messages: RecapMessage[] = [{ id: 'u1', role: 'you', text: 'Main jaata hai.' }, { id: 'a1', role: 'asha', text: 'Try again.' }];
const correction = { sourceId: 'u1', original: 'Main jaata hai.', hi: 'मैं जाता हूँ।', latin: 'Main jaata hoon.', en: 'I go.', explanation: 'Use hoon with main.' };
const originalFetch = globalThis.fetch;
function respond(payload: unknown, status = 200) {
  globalThis.fetch = jest.fn(async () => ({ ok: status === 200, status, json: async () => payload })) as unknown as typeof fetch;
}

describe('conversation recap API', () => {
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('posts bounded whole messages to a dedicated endpoint and validates the result', async () => {
    respond({ corrections: [correction] });
    expect(await getConversationRecap({ clientId: 'client-12345678', messages })).toEqual({ corrections: [correction] });
    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/api\/conversation-recap$/u), expect.objectContaining({ method: 'POST', body: JSON.stringify({ clientId: 'client-12345678', messages }) }));
  });

  it('does not make a request without usable learner text', async () => {
    respond({ corrections: [] });
    expect(await getConversationRecap({ clientId: 'client-12345678', messages: [messages[1]!] })).toEqual({ corrections: [] });
    expect(await getConversationRecap({ clientId: 'client-12345678', messages: [{ ...messages[0]!, text: 'x'.repeat(601) }] })).toEqual({ corrections: [] });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    { corrections: [{ ...correction, original: 'Invented quote' }] },
    { corrections: [{ ...correction, sourceId: 'a1', original: 'Try again.' }] },
    { corrections: [{ ...correction, hi: 'Not Devanagari' }] },
    { corrections: [correction, correction] },
    { reply: 'A recap in free text' },
  ])('fails safely for invalid server output: %j', async payload => {
    respond(payload);
    await expect(getConversationRecap({ clientId: 'client-12345678', messages })).rejects.toMatchObject({ name: 'BoloApiError', message: 'Bolo returned an invalid response. Please try again.' });
  });

  it.each(['', undefined, null, {}, 123456789])('rejects invalid client IDs before making a request: %j', async clientId => {
    respond({ corrections: [] });
    await expect(getConversationRecap({ clientId: clientId as string, messages })).rejects.toMatchObject({ name: 'BoloApiError' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('rejects an already canceled request before making a request', async () => {
    respond({ corrections: [] });
    const controller = new AbortController(); controller.abort();
    await expect(getConversationRecap({ clientId: 'client-12345678', messages }, controller.signal)).rejects.toMatchObject({ name: 'BoloApiError', message: 'The request was canceled.' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
