import { buildAlternateFeedback, buildLessonFeedback, englishMeaningsOverlap } from '../src/data/lesson-feedback';

describe('buildLessonFeedback', () => {
  const target = { en: 'I need to go to the station.', latin: 'Station jaana hai.' };

  it('quotes what the learner picked, the intended meaning, and the Latin cue', () => {
    const feedback = buildLessonFeedback(target, { en: 'I like water.' });
    expect(feedback).toBe('You chose “I like water,” but the natural answer here means “I need to go to the station.” Reach for “Station jaana hai.”');
  });

  it('trims trailing terminal punctuation from every embedded phrase', () => {
    const feedback = buildLessonFeedback({ en: 'Yes!', latin: 'Haan.' }, { en: 'No…' });
    expect(feedback).toBe('You chose “No,” but the natural answer here means “Yes.” Reach for “Haan.”');
  });

  it('does not leave a stray space when an ellipsis follows a name placeholder', () => {
    const feedback = buildLessonFeedback(target, { en: 'My name is …' });
    expect(feedback).toContain('You chose “My name is,”');
    expect(feedback).not.toContain('My name is ,');
  });

  it('drops the selected-answer clause for alternate practice modes', () => {
    const feedback = buildAlternateFeedback(target);
    expect(feedback).toBe('The natural answer here means “I need to go to the station.” Reach for “Station jaana hai.”');
  });
});

describe('englishMeaningsOverlap', () => {
  it('treats content-word twins as equivalent even when word order or punctuation differs', () => {
    expect(englishMeaningsOverlap('Please give me a window seat.', 'A window seat, please give me.')).toBe(true);
    expect(englishMeaningsOverlap('Could I get a window seat?', 'I would like a window seat.')).toBe(true);
  });

  it('accepts natural distractors that share stop words but differ in content', () => {
    expect(englishMeaningsOverlap('I need to go to the station.', 'I like water.')).toBe(false);
    expect(englishMeaningsOverlap('One tea, please.', 'One token, please.')).toBe(false);
  });

  it('falls back to raw equality when neither side has content words', () => {
    expect(englishMeaningsOverlap('Yes!', 'Yes.')).toBe(true);
    expect(englishMeaningsOverlap('Yes.', 'No.')).toBe(false);
  });
});
