import { checkPronunciation } from '../src/services/bolo-api';

const input = { audioBase64: 'YXVkaW8=', clientId: 'client-12345678', mimeType: 'audio/mp4', target: { hi: 'नमस्ते', latin: 'Namaste', en: 'Hello' }, lessonTitle: 'Greeting' };
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function respond(payload: unknown) {
  globalThis.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => payload })) as unknown as typeof fetch;
}

it('accepts explicit no-speech coaching as a retry instead of an invalid response', async () => {
  respond({ transcript: '', understood: false, feedback: 'I did not catch anything. Please say Namaste again.' });
  await expect(checkPronunciation(input)).resolves.toMatchObject({ outcome: 'no-speech', understood: false, feedback: 'I did not catch anything. Please say Namaste again.' });
});

it('keeps recognized speech separate from silence', async () => {
  respond({ transcript: 'Namaste', understood: false, feedback: 'Try that sound again.' });
  await expect(checkPronunciation(input)).resolves.toMatchObject({ outcome: 'speech', understood: false });
});

it.each([
  { transcript: '', feedback: 'Retry' },
  { transcript: '', understood: true, feedback: 'Great!' },
  { transcript: '', understood: false, feedback: '' },
  { transcript: null, understood: false, feedback: 'Retry' },
  { transcript: 'Namaste', understood: 'false', feedback: 'Retry' },
])('rejects malformed coaching: %j', async (payload) => {
  respond(payload);
  await expect(checkPronunciation(input)).rejects.toThrow('invalid response');
});
