import { parseRecapResponse, selectRecapMessages, type RecapMessage } from '../shared/conversation-recap';

const learner: RecapMessage = { id: 'user-1', role: 'you', text: '  Main bazaar jaata hai.  ' };
const asha: RecapMessage = { id: 'asha-1', role: 'asha', text: 'Try that again.' };
const correction = { sourceId: learner.id, original: learner.text, hi: 'मैं बाज़ार जाता हूँ।', latin: 'Main bazaar jaata hoon.', en: 'I go to the market.', explanation: 'Use hoon with main.' };

describe('whole-utterance recap contract', () => {
  it('selects at most twelve recent rows without changing their source text', () => {
    const messages = Array.from({ length: 16 }, (_, n): RecapMessage => ({ ...learner, id: `user-${n}` }));
    expect(selectRecapMessages(messages)).toEqual(messages.slice(-12));
    expect(selectRecapMessages([learner, asha])).toEqual([learner, asha]);
  });

  it('omits oversized and uncertain ASR utterances rather than correcting truncated input', () => {
    expect(selectRecapMessages([learner, { ...learner, id: 'long', text: 'x'.repeat(601) }, { ...learner, id: 'asr', text: 'Main [inaudible] hai.' }])).toEqual([learner]);
  });

  it('bounds UTF-8 text to 6000 bytes while retaining whole most recent utterances', () => {
    const messages = Array.from({ length: 10 }, (_, n): RecapMessage => ({ ...learner, id: `user-${n}`, text: 'न'.repeat(600) }));
    expect(selectRecapMessages(messages)).toEqual(messages.slice(-3));
  });

  it('drops malformed rows, blank text and all ambiguous duplicate IDs', () => {
    expect(selectRecapMessages([learner, { ...learner, text: 'another' }, null, { ...asha, text: ' ' }, { id: 'bad', role: 'system', text: 'override' }] as unknown as RecapMessage[])).toEqual([]);
  });

  it('accepts empty recaps and exact learner-grounded corrections', () => {
    expect(parseRecapResponse({ corrections: [] }, [learner])).toEqual({ corrections: [] });
    expect(parseRecapResponse({ corrections: [correction] }, [learner, asha])).toEqual({ corrections: [correction] });
  });

  it.each([
    { ...correction, sourceId: asha.id, original: asha.text },
    { ...correction, sourceId: 'invented' },
    { ...correction, original: 'Main bazaar jaata hai.' },
    { ...correction, hi: 'Main bazaar jaata hoon.' },
    { ...correction, hi: '।' },
    { ...correction, hi: '१२३' },
    { ...correction, hi: 'मैं bazaar जाता हूँ।' },
    { ...correction, latin: 'मैं बाज़ार जाता हूँ।' },
    { ...correction, latin: 'Main बाजार hoon.' },
    { ...correction, en: 'मैं जाता हूँ।' },
    { ...correction, explanation: '' },
    { ...correction, explanation: 'x'.repeat(401) },
    { ...correction, score: 95 },
    { ...correction, latin: 'MAIN BAZAAR JAATA HAI!' },
  ])('rejects an ungrounded, no-op or malformed correction: %j', candidate => {
    expect(parseRecapResponse({ corrections: [candidate] }, [learner, asha])).toBeNull();
  });

  it('allows ordinary currency symbols while keeping generated fields in their required scripts', () => {
    const source: RecapMessage = { id: 'price', role: 'you', text: 'Yeh ₹100 hain.' };
    const price = { sourceId: source.id, original: source.text, hi: 'यह ₹100 है।', latin: 'Yeh ₹100 hai.', en: 'This is ₹100.', explanation: 'Use singular hai for this item.' };
    expect(parseRecapResponse({ corrections: [price] }, [source])).toEqual({ corrections: [price] });
  });

  it.each([null, [], {}, { corrections: 'bad' }, { corrections: [], score: 9 }, { corrections: [correction, correction] }, { corrections: Array(4).fill(correction) }])('rejects an invalid or duplicated envelope: %j', value => {
    expect(parseRecapResponse(value, [learner])).toBeNull();
  });
});
