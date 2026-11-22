import {
  MAX_ASHA_CHATS,
  ashaChatHasVoice,
  ashaChatKey,
  ashaChatPreview,
  ashaChatTitle,
  chatMessageTime,
  createAshaChatRecord,
  isAshaChatKey,
  pruneAshaChats,
  sanitizeAshaChat,
  type AshaChatRecord,
} from '../src/lib/asha-chat-archive';
import type { ChatMessage } from '../src/state/app-state-types';

const started = Date.parse('2026-11-20T18:00:00.000Z');
const typed: ChatMessage[] = [
  { id: `you-${started}`, role: 'you', text: '  How do I say   thank you?  ' },
  { id: `asha-${started}`, role: 'asha', text: 'Say dhanyavaad.', language: 'en' },
  { id: `you-${started + 60_000}`, role: 'you', text: 'And please?' },
  { id: `asha-${started + 60_000}`, role: 'asha', text: 'Say kripya.', language: 'en' },
];

describe('Asha chat history records', () => {
  it('reads the time the app embeds in message ids', () => {
    expect(chatMessageTime(`you-${started}`)).toBe(started);
    expect(chatMessageTime(`asha-${started}`)).toBe(started);
    expect(chatMessageTime(`live-${started}-2-14`)).toBe(started);
    expect(chatMessageTime('asha-1')).toBeNull();
    expect(chatMessageTime('welcome')).toBeNull();
  });

  it('builds a record keyed by the first message, dated by its first and last messages', () => {
    const record = createAshaChatRecord(typed, new Date('2026-11-21T00:00:00.000Z'));
    expect(record).toMatchObject({
      schema: 1,
      id: `you-${started}`,
      startedAt: '2026-11-20T18:00:00.000Z',
      updatedAt: '2026-11-20T18:01:00.000Z',
    });
    expect(record?.messages).toHaveLength(4);
    // Archiving the same chat again produces the same id, so it replaces rather than duplicates.
    expect(createAshaChatRecord(typed)?.id).toBe(record?.id);
  });

  it('keeps nothing for an empty chat and falls back to now for ids without a time', () => {
    expect(createAshaChatRecord([])).toBeNull();
    const now = new Date('2026-11-21T09:30:00.000Z');
    const record = createAshaChatRecord([{ id: 'asha-1', role: 'asha', text: 'Hello' }], now);
    expect(record).toMatchObject({ id: 'asha-1', startedAt: now.toISOString(), updatedAt: now.toISOString() });
  });

  it('titles a chat with what the learner first said and previews the latest reply', () => {
    const record = createAshaChatRecord(typed) as AshaChatRecord;
    expect(ashaChatTitle(record)).toBe('How do I say thank you?');
    expect(ashaChatPreview(record)).toBe('Say kripya.');
    expect(ashaChatHasVoice(record)).toBe(false);

    const voice = createAshaChatRecord([{ id: `live-${started}-1-0`, role: 'asha', text: 'नमस्ते! आप कैसे हैं?', language: 'hi' }]) as AshaChatRecord;
    expect(ashaChatTitle(voice)).toBe('नमस्ते! आप कैसे हैं?');
    // The only line is already the title; it is not repeated underneath.
    expect(ashaChatPreview(voice)).toBeNull();
    expect(ashaChatHasVoice(voice)).toBe(true);

    const long = createAshaChatRecord([{ id: `you-${started}`, role: 'you', text: 'word '.repeat(60) }]) as AshaChatRecord;
    expect(ashaChatTitle(long).length).toBeLessThanOrEqual(80);
    expect(ashaChatTitle(long).endsWith('…')).toBe(true);
  });

  it('keeps only the newest chats, newest first', () => {
    const many = Array.from({ length: MAX_ASHA_CHATS + 5 }, (_, index) => (
      createAshaChatRecord([{ id: `you-${started + index * 1_000}`, role: 'you', text: `Chat ${index}` }]) as AshaChatRecord
    ));
    const kept = pruneAshaChats(many);
    expect(kept).toHaveLength(MAX_ASHA_CHATS);
    expect(ashaChatTitle(kept[0]!)).toBe(`Chat ${MAX_ASHA_CHATS + 4}`);
    expect(ashaChatTitle(kept.at(-1)!)).toBe('Chat 5');
  });

  it('accepts its own stored value and rejects damaged ones', () => {
    const record = createAshaChatRecord(typed) as AshaChatRecord;
    expect(sanitizeAshaChat(JSON.stringify(record))).toEqual(record);
    expect(sanitizeAshaChat(null)).toBeNull();
    expect(sanitizeAshaChat('not json')).toBeNull();
    expect(sanitizeAshaChat(JSON.stringify({ ...record, schema: 2 }))).toBeNull();
    expect(sanitizeAshaChat(JSON.stringify({ ...record, updatedAt: 'yesterday' }))).toBeNull();
    expect(sanitizeAshaChat(JSON.stringify({ ...record, messages: [] }))).toBeNull();
    // One bad message means the value was damaged; a partial chat is not shown.
    expect(sanitizeAshaChat(JSON.stringify({ ...record, messages: [...record.messages, { id: 'x', role: 'robot', text: 'hi' }] }))).toBeNull();
  });

  it('recognises its own storage keys', () => {
    expect(isAshaChatKey(ashaChatKey('you-1'))).toBe(true);
    expect(isAshaChatKey(ashaChatKey(''))).toBe(false);
    expect(isAshaChatKey('bolo-asha-session-v1:abc')).toBe(false);
  });
});
