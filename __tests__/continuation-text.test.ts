import { appendContinuationText, continuationTail } from '../src/lib/continuation-text';

describe('Realtime continuation text', () => {
  it('removes a repeated phrase at the continuation boundary', () => {
    expect(appendContinuationText(
      'You can say तुम्हें चुनना',
      'You can say तुम्हें चुनना होगा।',
    )).toBe('You can say तुम्हें चुनना होगा।');
  });

  it('removes one repeated boundary word without dropping later repetition', () => {
    expect(appendContinuationText('That is very', 'very, very useful.')).toBe('That is very, very useful.');
  });

  it('keeps unrelated continuation text intact', () => {
    expect(appendContinuationText('The first part', 'and the final part.')).toBe('The first part and the final part.');
  });

  it('provides only the recent spoken tail for the continuation prompt', () => {
    expect(continuationTail('one two three four five', 3)).toBe('three four five');
  });
});
