import { buildReplyContext, formatListeningTime, pairTranslationLines, REPLY_HELP_QUESTION, splitTranslationNote } from '@/lib/live-translate';
import { createLiveTranscriptStore, type LiveTranscriptRow } from '@/lib/live-transcripts';
import { buildMobileChatPayload, createLiveCall } from '@/services/bolo-api';

function row(id: string, speaker: 'you' | 'asha', text: string): LiveTranscriptRow {
  return { id, speaker, text, startMs: 0, endMs: 0, fragments: [] };
}

describe('Live Translate pairing', () => {
  it('gives each line its own translation when the store merges two close English replies', () => {
    const store = createLiveTranscriptStore('t');
    store.append('you', { delta: 'खाना तैयार है।', start_ms: 0, end_ms: 500 });
    store.append('asha', { delta: 'Food is ', start_ms: 1000, end_ms: 1500 });
    store.append('asha', { delta: 'ready.', start_ms: 1500, end_ms: 2000 });
    store.append('you', { delta: 'चाय बना दो ना', start_ms: 2500, end_ms: 2900 });
    const rows = store.append('asha', { delta: 'Please make tea.', start_ms: 3000, end_ms: 3500 })!.rows;
    expect(rows.filter((entry) => entry.speaker === 'asha')).toHaveLength(1);
    expect(pairTranslationLines(rows).map(({ hindi, english, pending }) => ({ hindi, english, pending }))).toEqual([
      { hindi: 'खाना तैयार है।', english: 'Food is ready.', pending: false },
      { hindi: 'चाय बना दो ना', english: 'Please make tea.', pending: false },
    ]);
  });

  it('pairs each heard line with the translation that follows it', () => {
    expect(pairTranslationLines([
      row('a', 'you', 'खाना तैयार है।'),
      row('b', 'asha', 'Food is ready.'),
      row('c', 'you', 'चाय बना दो ना'),
    ])).toEqual([
      { id: 'a', hindi: 'खाना तैयार है।', english: 'Food is ready.', note: '', pending: false },
      { id: 'c', hindi: 'चाय बना दो ना', english: '', note: '', pending: true },
    ]);
  });

  it('gives a late translation to the oldest line still waiting', () => {
    const lines = pairTranslationLines([
      row('a', 'you', 'पहला'),
      row('b', 'you', 'दूसरा'),
      row('c', 'asha', 'First'),
      row('d', 'asha', 'Second'),
    ]);
    expect(lines.map((line) => line.english)).toEqual(['First', 'Second']);
  });

  it('adds follow-on translation text to the newest line and keeps a translation with nothing heard', () => {
    expect(pairTranslationLines([row('x', 'asha', 'Hello.')])).toEqual([{ id: 'x', hindi: '', english: 'Hello.', note: '', pending: false }]);
    const lines = pairTranslationLines([row('a', 'you', 'नमस्ते'), row('b', 'asha', 'Hello.'), row('c', 'asha', 'How are you?')]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.english).toBe('Hello. How are you?');
  });

  it('skips lines that were never translated once newer ones arrive', () => {
    const lines = pairTranslationLines([
      row('a', 'you', 'एक'), row('b', 'you', 'दो'), row('c', 'you', 'तीन'), row('d', 'you', 'चार'),
      row('e', 'asha', 'Two'),
    ]);
    expect(lines.map((line) => line.english)).toEqual(['', 'Two', '', '']);
  });

  it('splits a trailing word note and hides one that is still streaming', () => {
    expect(splitTranslationNote('Tomorrow we will go to Mausi’s house. [Mausi: your mother’s sister]'))
      .toEqual({ english: 'Tomorrow we will go to Mausi’s house.', note: 'Mausi: your mother’s sister' });
    expect(splitTranslationNote('We will go to Mausi’s house. [Mausi: your mo')).toEqual({ english: 'We will go to Mausi’s house.', note: '' });
    expect(splitTranslationNote('He said [unclear]')).toEqual({ english: 'He said [unclear]', note: '' });
  });

  it('formats listening time and builds the reply question from the line', () => {
    expect(formatListeningTime(0)).toBe('0:00');
    expect(formatListeningTime(252_900)).toBe('4:12');
    const context = buildReplyContext({ hindi: 'और रोटी चाहिए क्या?', english: 'Do you want more roti?' });
    expect(context).toContain('और रोटी चाहिए क्या?');
    expect(context).toContain('Do you want more roti?');
    expect(REPLY_HELP_QUESTION).toContain('romanization');
  });

  it('keeps the reply question within the chat server\u2019s 500 character message limit', () => {
    const long = { hindi: 'क'.repeat(400), english: 'x'.repeat(400) };
    const payload = buildMobileChatPayload({ clientId: 'mobile-client-123', messages: [{ id: 'a', role: 'you', text: buildReplyContext(long) }], responseLanguage: 'en', structuredReply: true, text: REPLY_HELP_QUESTION });
    expect(payload.text!.length).toBeLessThanOrEqual(500);
    expect(payload.messages[0]!.text.length).toBeLessThanOrEqual(600);
  });

  it('still rejects unknown live modes before any request', async () => {
    const offerSdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
    await expect(createLiveCall({ clientId: 'mobile-client-123', offerSdp, responseLanguage: 'en', mode: 'freestyle' as never }))
      .rejects.toMatchObject({ message: 'Bolo could not start this live voice session.' });
  });
});
