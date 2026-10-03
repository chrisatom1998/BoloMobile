import { canonicalTranscriptSource, displayHindiTranscript, learnerPhraseLatin, alignedHindiWordLabels } from '../src/lib/learner-phrase-display';
import { knownHindiDisplayPhrase } from '../src/lib/known-hindi-phrases';
import { sourceTextForDisplayedSelection } from '../src/lib/transcript-selection';
import { prepareSavedPhraseFromText } from '../src/services/bolo-api';

it('preserves the audit spelling from unknown Hindi chat through prepared and saved/review display', async () => {
  const text = 'Kripayaa paanee dijiye.';
  const hi = 'कृपया पानी दीजिए।';
  expect(knownHindiDisplayPhrase(text)).toBeUndefined();
  expect(displayHindiTranscript(text)).toBe(text);
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ hi, latin: 'Kripya paani deejiye.', en: 'Please give me water.' }) }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  try {
    const prepared = await prepareSavedPhraseFromText({ clientId: 'client-12345678', text, sourceText: text, preserveRomanizedText: true });
    expect(prepared.hi).toBe(hi);
    expect(prepared.latin).toBe(text);
    expect(learnerPhraseLatin(prepared.hi, prepared.latin)).toBe(text);
    expect(alignedHindiWordLabels(hi, text).get('पानी')).toBe('paanee');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally { globalThis.fetch = originalFetch; }
});

it('normalizes a complete authoritative lesson phrase and maps shifted selection offsets to Hindi', () => {
  const input = 'Cheeni kam, kripayaa.';
  const displayed = displayHindiTranscript(input);
  expect(displayed).toBe('Cheeni kam, kripya.');
  expect(learnerPhraseLatin('चीनी कम, कृपया।', input)).toBe(displayed);
  expect(canonicalTranscriptSource(input)).toBe('चीनी कम, कृपया।');
  const start = displayed.indexOf('kripya');
  expect(sourceTextForDisplayedSelection({ sourceText: canonicalTranscriptSource(input), displayText: displayed, start, end: start + 'kripya'.length })).toBe('कृपया');
});

it('does not rewrite English meanings, names, or user-authored Latin text', () => {
  expect(displayHindiTranscript('My friend Paanee is visiting.')).toBe('My friend Paanee is visiting.');
  expect(displayHindiTranscript('my friend Paanee is visiting.', false)).toBe('my friend Paanee is visiting.');
  expect(displayHindiTranscript('Less sugar, please.')).toBe('Less sugar, please.');
  expect(displayHindiTranscript('Cheeni kam, kripayaa.', false)).toBe('Cheeni kam, kripayaa.');
  expect(learnerPhraseLatin('मेरा नाम क्रिस है।', 'Mera naam Chris hai.')).toBe('Mera naam Chris hai.');
});


it('preserves authoritative Hindi punctuation through display and full or partial selections', () => {
  const source = 'चीनी कम, कृपया?!';
  const display = displayHindiTranscript(source);
  expect(display).toBe('Cheeni kam, kripya?!');
  expect(canonicalTranscriptSource(source)).toBe(source);
  expect(sourceTextForDisplayedSelection({ sourceText: source, displayText: display, start: 0, end: display.length })).toBe(source);
  expect(sourceTextForDisplayedSelection({ sourceText: source, displayText: display, start: display.indexOf('kripya'), end: display.length })).toBe('कृपया?!');
  expect(sourceTextForDisplayedSelection({ sourceText: source, displayText: display, start: display.indexOf('kripya'), end: display.indexOf('kripya') + 6 })).toBe('कृपया');
  expect(displayHindiTranscript('नमस्ते?!')).toBe('Namaste?!');
});
