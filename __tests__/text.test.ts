import { trimTerminalPunctuation } from '../src/lib/text';

describe('trimTerminalPunctuation', () => {
  it.each([
    'Hello.',
    'Yes!?…',
    'My name is …',
    'Already clean',
    'Punctuation before spaces!?…   ',
    '   ',
  ])('stays byte-identical to the former local implementation for %p', (value) => {
    const previousResult = value.replace(/[.!?…]+$/u, '').trimEnd();

    expect(trimTerminalPunctuation(value)).toBe(previousResult);
  });
});
