import { trimTerminalPunctuation } from '../src/lib/text';

describe('trimTerminalPunctuation', () => {
  it.each([
    ['Hello.', 'Hello'],
    ['Yes!?…', 'Yes'],
    ['My name is …', 'My name is'],
    ['Already clean', 'Already clean'],
    ['Punctuation before spaces!?…   ', 'Punctuation before spaces!?…'],
    ['   ', ''],
  ])('trims terminal punctuation from %p', (value, expected) => {
    expect(trimTerminalPunctuation(value)).toBe(expected);
  });
});
