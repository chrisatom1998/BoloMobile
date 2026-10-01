jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

import { prepareSavedPhraseFromText } from '../src/services/bolo-api';

const phrase = { hi: 'मैं अच्छा हूँ', latin: 'Main achchha hoon', en: 'I am good.' };

describe('saved phrase endpoint contract', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => phrase });
    globalThis.fetch = fetchMock as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('prepares the screenshot Romanized selection through the structured phrase endpoint', async () => {
    await expect(prepareSavedPhraseFromText({ clientId: 'client-12345678', text: 'Main achchha hoon' })).resolves.toEqual(phrase);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/prepare-saved-phrase$/u);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({ clientId: 'client-12345678', text: 'Main achchha hoon' });
  });

  it('sends the entire selected excerpt without substituting the broader source or spending its limit on a prompt', async () => {
    const text = `${'a'.repeat(475)} and the final sentence`;
    await prepareSavedPhraseFromText({ clientId: 'client-12345678', text, sourceText: 'नमस्ते। मैं अच्छा हूँ। धन्यवाद।' });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).text).toBe(text);
  });

  it.each([
    { ...phrase, hi: phrase.latin },
    { ...phrase, latin: phrase.hi },
    { ...phrase, en: '' },
    { ...phrase, en: 'x'.repeat(501) },
  ])('rejects malformed prepared phrase fields before they reach the picker', async (payload) => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => payload });
    await expect(prepareSavedPhraseFromText({ clientId: 'client-12345678', text: phrase.latin })).rejects.toThrow();
  });

  it('preserves the endpoint rate-limit message', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: 'You have reached the hourly phrase limit. Please try again later.' }) });
    await expect(prepareSavedPhraseFromText({ clientId: 'client-12345678', text: phrase.latin })).rejects.toThrow('hourly phrase limit');
  });

  it('does not request work after cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(prepareSavedPhraseFromText({ clientId: 'client-12345678', text: phrase.latin }, controller.signal)).rejects.toThrow('canceled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks for a shorter selection rather than silently truncating an initially oversized excerpt', async () => {
    await expect(prepareSavedPhraseFromText({ clientId: 'client-12345678', text: 'a'.repeat(501) })).rejects.toThrow('shorter');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
