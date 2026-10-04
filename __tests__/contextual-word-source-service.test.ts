import { getContextualWordDefinition } from '../src/services/bolo-api';

it('sends all Hindi sentences as context without clipping the selected-word instruction', async () => {
  const originalFetch = globalThis.fetch;
  const source = `नमस्ते! ${'आज हम अभ्यास करेंगे। '.repeat(32)}आप कैसे हैं? धन्यवाद!`;
  const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ transcript: '', reply: 'An expression of thanks.', language: 'en' }) }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  try {
    await expect(getContextualWordDefinition({ clientId: 'client-12345678', phrase: source, word: 'धन्यवाद' })).resolves.toBe('An expression of thanks.');
    const [, options] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0]!;
    const body = JSON.parse(options.body as string) as { text: string; messages: { text: string }[] };
    expect(body.messages.map((message) => message.text).join('')).toBe(source);
    expect(body.messages.every((message) => message.text.length <= 600)).toBe(true);
    expect(body.text.length).toBeLessThanOrEqual(500);
    expect(body.text).toContain('Selected Hindi word: "धन्यवाद"');
  } finally { globalThis.fetch = originalFetch; }
});
