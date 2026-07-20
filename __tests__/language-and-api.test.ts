import { splitAiVoiceText } from '../src/lib/speech-text';
import { buildRealtimeSessionConfig } from '../src/lib/realtime-session';
import {
  AI_VOICE_TEXT_LIMIT,
  buildMobileChatPayload,
  checkPronunciation,
  createRealtimeClientSecret,
  deleteMobileData,
  getBoloApiUrl,
  MOBILE_LANGUAGE_MODE,
  OPENAI_REALTIME_MODEL,
  prepareSavedPhraseFromText,
  requestAiVoiceAudio,
  sendMobileChat,
} from '../src/services/bolo-api';
import type { ChatMessage } from '../src/state/app-state-types';

describe('connected coaching contract', () => {
  it('uses the Expo public API URL override and normalizes a trailing slash', () => {
    const previous = process.env.EXPO_PUBLIC_BOLO_API_URL;
    process.env.EXPO_PUBLIC_BOLO_API_URL = ' https://staging.example.test/ ';
    try {
      expect(getBoloApiUrl()).toBe('https://staging.example.test');
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_BOLO_API_URL;
      else process.env.EXPO_PUBLIC_BOLO_API_URL = previous;
    }
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
      const [, init] = fetchMock.mock.calls[0];
      const payload = JSON.parse(String(init?.body)) as { text: string };
      expect(fetchMock.mock.calls[0][0]).toBe('https://api-v2.appdeploy.ai/app/74e39779183cf78fed/api/phrase-audio');
      expect(payload.text).toHaveLength(AI_VOICE_TEXT_LIMIT);
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
      role: index % 2 ? 'mira' : 'you',
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
    expect(payload.messages[0].text.startsWith('2-')).toBe(true);
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

    expect(english.text).toBe('Respond in English. Write every Hindi word or phrase only in Romanized Latin script. Never use Devanagari. How do I say thank you?');
    expect(hindi.text).toBe('Respond in natural Hindi written only in Romanized Latin script. Never use Devanagari. How do I say thank you?');
    expect(english.languageMode).toBe(MOBILE_LANGUAGE_MODE);
    expect(hindi.languageMode).toBe(MOBILE_LANGUAGE_MODE);
  });

  it('keeps the full maximum-length learner message when a response-language instruction is added', () => {
    const learnerText = 'x'.repeat(500);
    const payload = buildMobileChatPayload({
      text: `  ${learnerText}  `,
      messages: [],
      clientId: 'client-12345678',
      responseLanguage: 'hi',
    });

    expect(payload.text).toBe(`Respond in natural Hindi written only in Romanized Latin script. Never use Devanagari. ${learnerText}`);
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
      const [, init] = fetchMock.mock.calls[0];
      const payload = JSON.parse(String(init?.body)) as { messages: unknown[]; text: string };
      expect(payload.messages).toEqual([]);
      expect(payload.text).not.toContain('Never use Devanagari.');
      expect(payload.text).toContain('Use Devanagari only in "hi"');
      expect(payload.text).toContain('How are you?');
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

  it('requests only a short-lived GPT Realtime client secret from the backend', async () => {
    const originalFetch = globalThis.fetch;
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ value: 'temporary-client-secret', expires_at: expiresAt }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await expect(createRealtimeClientSecret('client-12345678')).resolves.toEqual({
        value: 'temporary-client-secret',
        expires_at: expiresAt,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api-v2.appdeploy.ai/app/74e39779183cf78fed/api/realtime-token',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            clientId: 'client-12345678',
            model: OPENAI_REALTIME_MODEL,
            languageMode: MOBILE_LANGUAGE_MODE,
          }),
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects a standard API key returned to the mobile client', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ value: 'sk-proj-must-not-reach-client', expires_at: Math.floor(Date.now() / 1000) + 60 }),
    })) as unknown as typeof fetch;

    try {
      await expect(createRealtimeClientSecret('client-12345678')).rejects.toThrow('Bolo returned an invalid response.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('configures native Realtime speech-to-speech with deterministic turns and the selected response language', () => {
    const englishSession = buildRealtimeSessionConfig(OPENAI_REALTIME_MODEL, 'en');
    const hindiSession = buildRealtimeSessionConfig(OPENAI_REALTIME_MODEL, 'hi');

    expect(englishSession).toMatchObject({
      type: 'realtime',
      model: 'gpt-realtime-2.1',
      output_modalities: ['audio'],
      audio: {
        input: {
          transcription: { model: 'gpt-4o-mini-transcribe' },
          turn_detection: null,
        },
        output: { voice: 'marin' },
      },
    });
    expect(englishSession.instructions).toContain('Reply in concise, natural English');
    expect(hindiSession.instructions).toContain('Reply in concise, natural Hindi written only in Romanized Latin script');
    expect(englishSession.instructions).toContain('Never use Devanagari');
    expect(hindiSession.instructions).toContain('Never use Devanagari');
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
      const [url, init] = fetchMock.mock.calls[0];
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
