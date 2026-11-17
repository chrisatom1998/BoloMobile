import { buildReplyPrompt, formatListeningTime, pairTranslationLines, splitTranslationNote } from '@/lib/live-translate';
import type { LiveTranscriptRow } from '@/lib/live-transcripts';
import { createLiveCall } from '@/services/bolo-api';

function row(id: string, speaker: 'you' | 'asha', text: string): LiveTranscriptRow {
  return { id, speaker, text, startMs: 0, endMs: 0, fragments: [] };
}

describe('Live Translate pairing', () => {
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
    const prompt = buildReplyPrompt({ hindi: 'और रोटी चाहिए क्या?', english: 'Do you want more roti?' });
    expect(prompt).toContain('और रोटी चाहिए क्या?');
    expect(prompt).toContain('Do you want more roti?');
    expect(prompt).toContain('romanization');
  });

  it('still rejects unknown live modes before any request', async () => {
    const offerSdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
    await expect(createLiveCall({ clientId: 'mobile-client-123', offerSdp, responseLanguage: 'en', mode: 'freestyle' as never }))
      .rejects.toMatchObject({ message: 'Bolo could not start this live voice session.' });
  });
});
