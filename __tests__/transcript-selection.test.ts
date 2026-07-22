import { romanizeDevanagari } from '../src/lib/devanagari-romanization';
import { sourceTextForDisplayedSelection } from '../src/lib/transcript-selection';

describe('transcript selection source mapping', () => {
  it('returns the original Devanagari phrase for a Romanized visible selection', () => {
    const sourceText = 'You can say, मैं कपड़ों की खरीदारी कर रहा हूँ if you are a man.';
    const displayText = romanizeDevanagari(sourceText);
    const selectedText = 'main kapadon kee khareedaaree kar rahaa hoon';
    const start = displayText.indexOf(selectedText);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(sourceTextForDisplayedSelection({
      displayText,
      end: start + selectedText.length,
      sourceText,
      start,
    })).toBe('मैं कपड़ों की खरीदारी कर रहा हूँ');
  });

  it('keeps exact selected text when the visible and source transcript match', () => {
    expect(sourceTextForDisplayedSelection({
      displayText: 'Hello there.',
      end: 5,
      sourceText: 'Hello there.',
      start: 0,
    })).toBe('Hello');
  });
});
