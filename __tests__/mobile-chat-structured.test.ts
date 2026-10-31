/** @jest-environment node */
import {
  normalizeStructuredMobileChatReply,
  readableReply,
  sanitizeStructuredReply,
  STRUCTURED_REPLY_FORMAT,
  STRUCTURED_REPLY_JSON_SCHEMA,
  structuredReplyInstructions,
  wantsStructuredReply,
} from '../backend/mobile-chat-structured';
import { sanitizeStructuredReply as clientSanitize } from '../src/lib/structured-reply';

const modelJson = {
  version: 1,
  intro: 'Less sugar in your tea? Ask the waiter politely:',
  phrases: [{ devanagari: 'चाय में चीनी कम डालिए।', romanized: 'chaay mein cheeni kam daaliye.', english: 'Please put less sugar in the tea.' }],
  corrections: [{ youSaid: { devanagari: 'डालो', romanized: 'daalo' }, say: { devanagari: 'डालिए', romanized: 'daaliye', english: 'please put' }, note: 'daalo is for friends.' }],
  outro: null,
};

describe('structured mobile-chat reference', () => {
  it('only opts in for structured-v1 requests in English mode', () => {
    expect(STRUCTURED_REPLY_FORMAT).toBe('structured-v1');
    expect(wantsStructuredReply({ replyFormat: 'structured-v1', responseLanguage: 'en' })).toBe(true);
    expect(wantsStructuredReply({ replyFormat: 'structured-v1' })).toBe(true);
    expect(wantsStructuredReply({ replyFormat: 'structured-v1', responseLanguage: 'hi' })).toBe(false);
    expect(wantsStructuredReply({ replyFormat: 'structured-v2' })).toBe(false);
    expect(wantsStructuredReply({})).toBe(false);
    expect(wantsStructuredReply(null)).toBe(false);
  });

  it('ships a strict JSON schema and matching instructions', () => {
    expect(STRUCTURED_REPLY_JSON_SCHEMA.strict).toBe(true);
    expect(STRUCTURED_REPLY_JSON_SCHEMA.schema.required).toEqual(['version', 'intro', 'phrases', 'corrections', 'outro']);
    expect(STRUCTURED_REPLY_JSON_SCHEMA.schema.properties.phrases.items.required).toEqual(['devanagari', 'romanized', 'english']);
    const instructions = structuredReplyInstructions();
    expect(instructions).toContain('Devanagari script only');
    expect(instructions).toContain('exactly one Latin-letter romanization');
    expect(instructions).toContain('"corrections"');
  });

  it('normalizes valid model JSON into a readable reply plus the structured block', () => {
    const result = normalizeStructuredMobileChatReply({ transcript: 'Less sugar please', language: 'en', modelOutput: JSON.stringify(modelJson) });
    expect(result).not.toBeNull();
    expect(result!.structured).toEqual({
      version: 1,
      intro: modelJson.intro,
      phrases: modelJson.phrases,
      corrections: modelJson.corrections,
    });
    expect(result!.reply).toBe([
      'Less sugar in your tea? Ask the waiter politely:',
      'चाय में चीनी कम डालिए। (chaay mein cheeni kam daaliye.) — Please put less sugar in the tea.',
      'You said डालो (daalo). Say डालिए (daaliye) — please put. daalo is for friends.',
    ].join('\n'));
    expect(result!.transcript).toBe('Less sugar please');
    expect(result!.language).toBe('en');
    // The app's own sanitizer accepts exactly what the server emits.
    expect(clientSanitize(result!.structured)).toEqual(result!.structured);
  });

  it('accepts fenced JSON and already-parsed objects', () => {
    const fenced = normalizeStructuredMobileChatReply({ transcript: '', language: 'en', modelOutput: `\`\`\`json\n${JSON.stringify(modelJson)}\n\`\`\`` });
    expect(fenced?.structured?.phrases).toHaveLength(1);
    const parsed = normalizeStructuredMobileChatReply({ transcript: '', language: 'en', modelOutput: modelJson });
    expect(parsed?.structured?.corrections).toHaveLength(1);
  });

  it('returns plain text as the reply when the model ignored the schema', () => {
    const result = normalizeStructuredMobileChatReply({ transcript: '', language: 'en', modelOutput: 'You can say: चाय में चीनी कम डालिए (chaay mein cheeni kam daaliye).' });
    expect(result).toEqual({ transcript: '', language: 'en', reply: 'You can say: चाय में चीनी कम डालिए (chaay mein cheeni kam daaliye).' });
  });

  it('returns null for invalid JSON blocks so the server can fall back', () => {
    const badScript = { ...modelJson, phrases: [{ devanagari: 'chaay', romanized: 'chaay', english: 'tea' }] };
    expect(normalizeStructuredMobileChatReply({ transcript: '', language: 'en', modelOutput: JSON.stringify(badScript) })).toBeNull();
    expect(normalizeStructuredMobileChatReply({ transcript: '', language: 'en', modelOutput: '{"version": 1' })).toBeNull();
    expect(normalizeStructuredMobileChatReply({ transcript: '', language: 'en', modelOutput: '' })).toBeNull();
  });

  it('validates with the same limits as the app', () => {
    expect(sanitizeStructuredReply({ version: 1, intro: 'नमस्ते' })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, phrases: Array.from({ length: 9 }, () => modelJson.phrases[0]) })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, phrases: [{ devanagari: 'चाय', romanized: 'chaay', english: '' }] })).toBeUndefined();
    expect(sanitizeStructuredReply({ version: 1, corrections: [{ youSaid: {}, say: { devanagari: 'डालिए', romanized: 'daaliye' } }] })).toBeUndefined();
    const ok = sanitizeStructuredReply({ version: 1, phrases: [modelJson.phrases[0]], unknown: true });
    expect(ok).toEqual({ version: 1, phrases: modelJson.phrases });
    expect(readableReply(ok!)).toBe('चाय में चीनी कम डालिए। (chaay mein cheeni kam daaliye.) — Please put less sugar in the tea.');
  });
});
