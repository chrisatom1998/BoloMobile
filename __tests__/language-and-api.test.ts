jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { boloLiveApiUrl: 'https://live.example.test' } } } }));

import { splitAiVoiceText } from '../src/lib/speech-text';
import {
  AI_VOICE_TEXT_LIMIT,
  buildMobileChatPayload,
  checkPronunciation,
  createLiveCall,
  deleteMobileData,
  getBoloApiUrl,
  getBoloLiveApiUrl,
  MOBILE_LANGUAGE_MODE,
  OPENAI_LIVE_MODEL,
  prepareSavedPhraseFromText,
  requestAiVoiceAudio,
  sendMobileChat,
} from '../src/services/bolo-api';
import type { ChatMessage } from '../src/state/app-state-types';

function expectDefined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected the value to be defined.');
  return value;
}

describe('connected coaching contract', () => {
  it('uses only the release-validated Expo API URL when a public environment override is present', () => {
    const previous = process.env.EXPO_PUBLIC_BOLO_API_URL;
    process.env.EXPO_PUBLIC_BOLO_API_URL = ' https://staging.example.test/ ';
    try {
      expect(getBoloApiUrl()).toBe('https://api-v2.appdeploy.ai/app/74e39779183cf78fed');
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_BOLO_API_URL;
      else process.env.EXPO_PUBLIC_BOLO_API_URL = previous;
    }
  });

  it('uses a valid HTTPS API base and ignores HTTP configuration', () => {
    const constants = jest.requireMock('expo-constants').default;
    constants.expoConfig.extra.boloApiUrl = 'https://api.example.test/app/bolo/';
    expect(getBoloApiUrl()).toBe('https://api.example.test/app/bolo');
    constants.expoConfig.extra.boloApiUrl = 'http://api.example.test';
    expect(getBoloApiUrl()).toBe('https://api-v2.appdeploy.ai/app/74e39779183cf78fed');
    delete constants.expoConfig.extra.boloApiUrl;
  });

  it('requires an independent trusted live server URL and never falls back to typed coaching', () => {
    const constants = jest.requireMock('expo-constants').default;
    const original = constants.expoConfig.extra.boloLiveApiUrl;
    try {
      const invalidLiveUrls = [
        undefined,
        '',
        'http://live.example.test',
        `https://user${':'}pass@live.example.test`,
        `https://live.example.test?${'client=embedded-config'}`,
      ];
      for (const value of invalidLiveUrls) {
        constants.expoConfig.extra.boloLiveApiUrl = value;
        expect(getBoloLiveApiUrl).toThrow('Live voice is not configured');
      }
      constants.expoConfig.extra.boloLiveApiUrl = 'https://live.example.test/base/';
      expect(getBoloLiveApiUrl()).toBe('https://live.example.test/base');
    } finally { constants.expoConfig.extra.boloLiveApiUrl = original; }
  });

  it('splits long mixed-language replies into bounded AI-voice requests', () => {
    const text = `${'A'.repeat(230)} sentence end. नमस्ते, आपका स्वागत है। ${'B'.repeat(260)}`;
    const chunks = splitAiVoiceText(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= AI_VOICE_TEXT_LIMIT)).toBe(true);
    expect(chunks.join('').replace(/\s+/g, ' ').trim()).toBe(text.replace(/\s+/g, ' ').trim());
  });

  it('requests bounded server-generated AI voice audio', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ audioBase64: 'SUQzBAAAAAA=', mimeType: 'audio/mpeg' }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(requestAiVoiceAudio(`  ${'hello '.repeat(60)}  `)).resolves.toEqual({
        audioBase64: 'SUQzBAAAAAA=',
        mimeType: 'audio/mpeg',
      });
      const [, init] = expectDefined(fetchMock.mock.calls[0]);
      const payload = JSON.parse(String(init?.body)) as { text: string; coach?: string };
      expect(expectDefined(fetchMock.mock.calls[0])[0]).toBe('https://api-v2.appdeploy.ai/app/74e39779183cf78fed/api/phrase-audio');
      expect(payload.text).toHaveLength(AI_VOICE_TEXT_LIMIT);
      expect(payload.coach).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('marks Hindi AI voice audio with the lesson locale', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ audioBase64: 'SUQzBAAAAAA=', mimeType: 'audio/mpeg' }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await requestAiVoiceAudio('सीट 12A मिल गई है।', undefined, 'hi');
      const [, init] = expectDefined(fetchMock.mock.calls[0]);
      expect(JSON.parse(String(init?.body))).toEqual({
        text: 'सीट 12A मिल गई है।',
        language: 'hi',
        locale: 'hi-IN',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects malformed AI voice audio', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ audioBase64: 'not base64', mimeType: 'text/plain' }),
    })) as unknown as typeof fetch;

    try {
      await expect(requestAiVoiceAudio('Hello')).rejects.toThrow('Bolo returned an invalid response.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sends the explicit English-default language mode and bounded context', () => {
    const messages: ChatMessage[] = Array.from({ length: 12 }, (_, index) => ({
      id: String(index),
      role: index % 2 ? 'asha' : 'you',
      text: `${index}-${'x'.repeat(700)}`,
    }));
    const payload = buildMobileChatPayload({
      text: `  ${'hello'.repeat(120)}  `,
      messages,
      clientId: 'client-12345678',
    });

    expect(MOBILE_LANGUAGE_MODE).toBe('english-unless-hindi-requested');
    expect(payload.languageMode).toBe(MOBILE_LANGUAGE_MODE);
    expect(payload.text).toHaveLength(500);
    expect(payload.messages).toHaveLength(10);
    expect(expectDefined(payload.messages[0]).text.startsWith('2-')).toBe(true);
    expect(payload.messages.every((message) => message.text.length <= 600)).toBe(true);
  });

  it('adds an explicit response-language instruction without changing the saved learner text contract', () => {
    const english = buildMobileChatPayload({
      text: 'How do I say thank you?',
      messages: [],
      clientId: 'client-12345678',
      responseLanguage: 'en',
    });
    const hindi = buildMobileChatPayload({
      text: 'How do I say thank you?',
      messages: [],
      clientId: 'client-12345678',
      responseLanguage: 'hi',
    });

    expect(english.text).toBe('You are Asha, a calm Hindi conversation coach. Respond in English. Write every Hindi word or phrase in Devanagari so speech synthesis follows Hindi phonetics, and include a short Latin transliteration in parentheses only when it helps the learner. Check factual claims and calculations before answering; compute prices and change carefully. How do I say thank you?');
    expect(hindi.text).toBe('You are Asha, a calm Hindi conversation coach. Respond in natural Hindi written in Devanagari. Use standard Indian Hindi vocabulary and phrasing. Check factual claims and calculations before answering; compute prices and change carefully. How do I say thank you?');
    expect(english.languageMode).toBe(MOBILE_LANGUAGE_MODE);
    expect(hindi.languageMode).toBe(MOBILE_LANGUAGE_MODE);
    expect(english.responseLanguage).toBe('en');
    expect(hindi.responseLanguage).toBe('hi');
  });

  it('never instructs Asha away from Devanagari in either response language', () => {
    const instructions = (['en', 'hi'] as const).map((responseLanguage) => expectDefined(buildMobileChatPayload({
      text: 'How do I say thank you?',
      messages: [],
      clientId: 'client-12345678',
      responseLanguage,
    }).text));

    expect(expectDefined(instructions[1])).toContain('Respond in natural Hindi written in Devanagari');
    for (const instruction of instructions) {
      expect(instruction).toContain('Devanagari');
      expect(instruction).not.toMatch(/never use devanagari/iu);
      expect(instruction).not.toMatch(/(?:romani[sz]ed?|latin script) only/iu);
    }
  });

  it('keeps the full maximum-length learner message when a response-language instruction is added', () => {
    const learnerText = 'x'.repeat(500);
    const payload = buildMobileChatPayload({
      text: `  ${learnerText}  `,
      messages: [],
      clientId: 'client-12345678',
      responseLanguage: 'hi',
    });

    expect(payload.text).toBe(`You are Asha, a calm Hindi conversation coach. Respond in natural Hindi written in Devanagari. Use standard Indian Hindi vocabulary and phrasing. Check factual claims and calculations before answering; compute prices and change carefully. ${learnerText}`);
  });

  it('rejects a malformed successful response instead of passing it to the UI', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    try {
      await expect(sendMobileChat({
        text: 'Hello',
        messages: [],
        clientId: 'client-12345678',
      })).rejects.toThrow('Bolo returned an invalid response.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('accepts an empty transcript for text-only chat replies', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ transcript: '', reply: 'Hello!', language: 'en' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ transcript: '   ', reply: 'नमस्ते!', language: 'hi' }),
      });
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      await expect(sendMobileChat({
        text: 'Hello',
        messages: [],
        clientId: 'client-12345678',
      })).resolves.toEqual({ transcript: '', reply: 'Hello!', language: 'en' });
      await expect(sendMobileChat({
        text: 'Namaste',
        messages: [],
        clientId: 'client-12345678',
      })).resolves.toEqual({ transcript: '   ', reply: 'नमस्ते!', language: 'hi' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('prepares a complete Romanized saved phrase from selected transcript text', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        transcript: '',
        reply: '```json\n{"hi":"आप कैसे हैं?","latin":"Aap kaise hain?","en":"How are you?"}\n```',
        language: 'en',
      }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(prepareSavedPhraseFromText({
        clientId: 'client-12345678',
        text: 'How are you?',
      })).resolves.toEqual({
        hi: 'आप कैसे हैं?',
        latin: 'Aap kaise hain?',
        en: 'How are you?',
      });
      const [, init] = expectDefined(fetchMock.mock.calls[0]);
      const payload = JSON.parse(String(init?.body)) as { messages: unknown[]; text: string };
      expect(payload.messages).toEqual([]);
      expect(payload.text).not.toContain('Never use Devanagari.');
      expect(payload.text).toContain('Use Devanagari only in "hi"');
      expect(payload.text).toContain('How are you?');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('prepares a Romanized selection from its retained Devanagari source instead of requiring JSON from the chat service', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        transcript: '',
        reply: 'I am shopping for clothes.',
        language: 'en',
      }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(prepareSavedPhraseFromText({
        clientId: 'client-12345678',
        sourceText: 'मैं कपड़ों की खरीदारी कर रहा हूँ',
        text: 'Main kapadon kee khareedaaree kar rahaa hoon',
      })).resolves.toEqual({
        hi: 'मैं कपड़ों की खरीदारी कर रहा हूँ',
        latin: 'Main kapadon kee khareedaaree kar rahaa hoon',
        en: 'I am shopping for clothes.',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = expectDefined(fetchMock.mock.calls[0]);
      const payload = JSON.parse(String(init?.body)) as { responseLanguage?: string; text: string };
      expect(payload.responseLanguage).toBeUndefined();
      expect(payload.text).toContain('Phrase: "मैं कपड़ों की खरीदारी कर रहा हूँ"');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects prepared phrases containing non-Romanized script', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        transcript: '',
        reply: '{"hi":"नमस्ते","latin":"नमस्ते","en":"Hello"}',
        language: 'en',
      }),
    })) as unknown as typeof fetch;

    try {
      await expect(prepareSavedPhraseFromText({
        clientId: 'client-12345678',
        text: 'Hello',
      })).rejects.toThrow('Bolo could not prepare that phrase.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects blank or oversized generated text before it reaches the UI or TTS', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ transcript: 'Hello', reply: '   ', language: 'en' }),
      });
      await expect(sendMobileChat({
        text: 'Hello',
        messages: [],
        clientId: 'client-12345678',
      })).rejects.toThrow('Bolo returned an invalid response.');

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ transcript: 'Namaste', feedback: '' }),
      });
      await expect(checkPronunciation({
        audioBase64: 'audio',
        clientId: 'client-12345678',
        mimeType: 'audio/mp4',
        target: { hi: 'Namaste', latin: 'Namaste', en: 'Hello' },
        lessonTitle: 'Greeting',
      })).rejects.toThrow('Bolo returned an invalid response.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('exchanges the real offer and bounded history through the backend, without client credentials', async () => {
    const originalFetch = globalThis.fetch;
    const answerSdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ answerSdp, sessionId: 'live-session-123' }) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const history = Array.from({ length: 15 }, () => ({ role: 'you' as const, text: 'a'.repeat(900) }));
      await expect(createLiveCall({ clientId: 'client-12345678', offerSdp: answerSdp, responseLanguage: 'hi', history })).resolves.toEqual({ answerSdp, sessionId: 'live-session-123' });
      expect(OPENAI_LIVE_MODEL).toBe('gpt-live-1');
      expect(fetchMock).toHaveBeenCalledWith('https://live.example.test/api/live-call', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ clientId: 'client-12345678', offerSdp: answerSdp, responseLanguage: 'hi', history: history.slice(-10).map((row) => ({ ...row, text: row.text.slice(0, 600) })) }),
      }));
    } finally { globalThis.fetch = originalFetch; }
  });

  it('rejects invalid local offers without a network call and rejects malformed responses', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ value: 'session-credential-placeholder', expires_at: 123 }) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(createLiveCall({ clientId: 'client-12345678', offerSdp: 'not SDP', responseLanguage: 'en' })).rejects.toThrow('could not start');
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(createLiveCall({ clientId: 'client-12345678', offerSdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', responseLanguage: 'en' })).rejects.toThrow('invalid response');
    } finally { globalThis.fetch = originalFetch; }
  });

  it('requests deletion using only the current random app identifier', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ deleted: true, reportsDeleted: 2 }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(deleteMobileData('client-12345678')).resolves.toEqual({ deleted: true, reportsDeleted: 2 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = expectDefined(fetchMock.mock.calls[0]);
      expect(url).toBe('https://api-v2.appdeploy.ai/app/74e39779183cf78fed/api/delete-mobile-data');
      expect(init).toMatchObject({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: 'client-12345678' }),
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
