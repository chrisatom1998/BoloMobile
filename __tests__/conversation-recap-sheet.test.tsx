import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { ConversationRecapSheet, type RecapSheetState } from '../src/components/conversation-recap-sheet';
import { romanizeDevanagari } from '../src/lib/devanagari-romanization';
import type { RecapCorrection } from '../shared/conversation-recap';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 20, left: 0, right: 0, top: 24 }),
}));

const correction: RecapCorrection = {
  sourceId: 'turn-1',
  original: 'मैं चाय चाहता',
  hi: 'मुझे चाय चाहिए।',
  latin: 'Mujhe chai chahiye.',
  en: 'I would like tea.',
  explanation: 'Use chahiye to make a natural request for something.',
};

const secondCorrection: RecapCorrection = {
  sourceId: 'turn-2',
  original: 'Aap ka naam kya?',
  hi: 'आपका नाम क्या है?',
  latin: 'Aapka naam kya hai?',
  en: 'What is your name?',
  explanation: 'Add hai to complete this question.',
};

const readyState: RecapSheetState = { status: 'ready', corrections: [correction, secondCorrection] };

function props(state: RecapSheetState = readyState) {
  return { state, onClose: jest.fn(), onRetry: jest.fn(), onDismiss: jest.fn(), onSave: jest.fn(), savedPhraseKeys: [] as string[] };
}

describe('ConversationRecapSheet', () => {
  it('shows suggested wording alongside the romanized original and a transcription caveat', async () => {
    const view = await render(<ConversationRecapSheet {...props()} />);

    expect(view.getByRole('header', { name: 'Conversation recap' })).toBeTruthy();
    expect(view.getAllByText('Suggested wording')).toHaveLength(2);
    expect(view.getByText(romanizeDevanagari(correction.original))).toBeTruthy();
    expect(view.getByText(correction.hi)).toBeTruthy();
    expect(view.getByText(correction.latin)).toBeTruthy();
    expect(view.getByText(correction.en)).toBeTruthy();
    expect(view.getByText(correction.explanation)).toBeTruthy();
    expect(view.getByText(/transcription can be wrong/i)).toBeTruthy();
    expect(view.getByText(/only phrases you save/i)).toBeTruthy();
  });

  it('keeps close available while loading, including native modal dismissal', async () => {
    const callbacks = props({ status: 'loading' });
    const view = await render(<ConversationRecapSheet {...callbacks} />);

    expect(view.getByText('Preparing your recap…')).toBeTruthy();
    expect(view.queryByText('No suggestions this time')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Close conversation recap' }));
    await fireEvent(view.getByTestId('conversation-recap-modal'), 'requestClose');
    expect(callbacks.onClose).toHaveBeenCalledTimes(2);
  });

  it('offers an explicit retry when the recap fails', async () => {
    const callbacks = props({ status: 'error', message: 'The connection dropped.' });
    const view = await render(<ConversationRecapSheet {...callbacks} />);

    expect(view.getByRole('alert')).toHaveTextContent('The connection dropped.');
    expect(view.queryByText('No suggestions this time')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Retry conversation recap' }));
    expect(callbacks.onRetry).toHaveBeenCalledTimes(1);
  });

  it('gives an honest empty state without claiming the conversation was perfect', async () => {
    const view = await render(<ConversationRecapSheet {...props({ status: 'ready', corrections: [] })} />);

    expect(view.getByText('No suggestions this time')).toBeTruthy();
    expect(view.getByText('There are no suggestions to review in this recap.')).toBeTruthy();
    expect(view.queryByText(/perfect|no mistakes|all correct/i)).toBeNull();
    expect(view.queryByRole('button', { name: /Practise suggestion/i })).toBeNull();
    expect(view.getByRole('button', { name: 'Close conversation recap' })).toBeTruthy();
  });

  it('shows no more than three suggestions', async () => {
    const corrections = Array.from({ length: 4 }, (_, index) => ({ ...correction, sourceId: `turn-${index}` }));
    const view = await render(<ConversationRecapSheet {...props({ status: 'ready', corrections })} />);

    expect(view.getAllByText('Suggested wording')).toHaveLength(3);
    expect(view.queryByText('Suggestion 4 of 4')).toBeNull();
  });

  it('saves only the explicitly selected suggestion', async () => {
    const callbacks = props();
    const view = await render(<ConversationRecapSheet {...callbacks} />);

    expect(callbacks.onSave).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: `Save suggestion 2 for review: ${secondCorrection.latin}` }));
    expect(callbacks.onSave).toHaveBeenCalledTimes(1);
    expect(callbacks.onSave).toHaveBeenCalledWith(secondCorrection);
  });

  it('disables saving phrases already saved using normalized Hindi keys', async () => {
    const paddedCorrection = { ...correction, hi: `  ${correction.hi}  ` };
    const callbacks = props({ status: 'ready', corrections: [paddedCorrection] });
    const view = await render(<ConversationRecapSheet {...callbacks} savedPhraseKeys={[correction.hi.trim().toLowerCase()]} />);

    const saved = view.getByRole('button', { name: `Suggestion 1 saved for review: ${correction.latin}` });
    expect(saved).toBeDisabled();
    expect(view.getByText('Saved')).toBeTruthy();
    await fireEvent.press(saved);
    expect(callbacks.onSave).not.toHaveBeenCalled();
  });

  it('dismisses either kind of unwanted suggestion without saving it', async () => {
    const callbacks = props();
    const view = await render(<ConversationRecapSheet {...callbacks} />);

    await fireEvent.press(view.getByRole('button', { name: 'Dismiss suggestion 1' }));
    await fireEvent.press(view.getByRole('button', { name: 'Transcription was wrong for suggestion 2' }));
    expect(callbacks.onDismiss.mock.calls).toEqual([[correction.sourceId], [secondCorrection.sourceId]]);
    expect(callbacks.onSave).not.toHaveBeenCalled();
  });

  it('focuses local recall on the English cue and hides every suggested answer', async () => {
    const callbacks = props();
    const view = await render(<ConversationRecapSheet {...callbacks} />);

    await fireEvent.press(view.getByRole('button', { name: `Practise suggestion 1: ${correction.latin}` }));

    expect(view.getByRole('header', { name: 'Practise from memory' })).toBeTruthy();
    expect(view.getByText(correction.en)).toBeTruthy();
    expect(view.queryByText(correction.latin)).toBeNull();
    expect(view.queryByText(correction.hi)).toBeNull();
    expect(view.queryByText(romanizeDevanagari(correction.original))).toBeNull();
    expect(view.queryByText(secondCorrection.en)).toBeNull();
    expect(view.queryByText(correction.explanation)).toBeNull();
    expect(view.queryByRole('button', { name: /Save suggestion/i })).toBeNull();
    expect(callbacks.onSave).not.toHaveBeenCalled();
  });

  it('reveals the phrase for self-check and resets it for another try', async () => {
    const callbacks = props();
    const view = await render(<ConversationRecapSheet {...callbacks} />);

    await fireEvent.press(view.getByRole('button', { name: `Practise suggestion 1: ${correction.latin}` }));
    await fireEvent.press(view.getByRole('button', { name: 'Reveal Hindi for suggestion 1' }));

    expect(view.getByText(correction.latin)).toBeTruthy();
    expect(view.getByText(correction.hi)).toBeTruthy();
    expect(view.getByText('Compare this wording with what you recalled.')).toBeTruthy();
    expect(view.queryByText(/Got it|Needs work|score|mastery/i)).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Try suggestion 1 again' }));
    expect(view.queryByText(correction.latin)).toBeNull();
    expect(view.queryByText(correction.hi)).toBeNull();
    expect(view.getByRole('button', { name: 'Reveal Hindi for suggestion 1' })).toBeTruthy();
    expect(callbacks.onSave).not.toHaveBeenCalled();
    expect(callbacks.onDismiss).not.toHaveBeenCalled();
    expect(callbacks.onRetry).not.toHaveBeenCalled();
  });

  it('returns to the recap and starts each practice attempt with the answer hidden', async () => {
    const view = await render(<ConversationRecapSheet {...props()} />);

    await fireEvent.press(view.getByRole('button', { name: `Practise suggestion 1: ${correction.latin}` }));
    await fireEvent.press(view.getByRole('button', { name: 'Reveal Hindi for suggestion 1' }));
    await fireEvent.press(view.getByRole('button', { name: 'Back to recap' }));
    expect(view.getAllByText('Suggested wording')).toHaveLength(2);

    await fireEvent.press(view.getByRole('button', { name: `Practise suggestion 2: ${secondCorrection.latin}` }));
    expect(view.getByText(secondCorrection.en)).toBeTruthy();
    expect(view.queryByText(secondCorrection.hi)).toBeNull();
    expect(view.queryByText(secondCorrection.latin)).toBeNull();
  });

  it('leaves practice when its source is removed and does not resume it if that source returns', async () => {
    const callbacks = props();
    const view = await render(<ConversationRecapSheet {...callbacks} />);

    await fireEvent.press(view.getByRole('button', { name: `Practise suggestion 1: ${correction.latin}` }));
    await fireEvent.press(view.getByRole('button', { name: 'Reveal Hindi for suggestion 1' }));
    await view.rerender(<ConversationRecapSheet {...callbacks} state={{ status: 'ready', corrections: [secondCorrection] }} />);
    expect(view.getByText('Suggested wording')).toBeTruthy();
    expect(view.queryByText(correction.hi)).toBeNull();

    await view.rerender(<ConversationRecapSheet {...callbacks} />);
    expect(view.getAllByText('Suggested wording')).toHaveLength(2);
  });

  it('resets focused practice through loading and error transitions', async () => {
    const callbacks = props();
    const view = await render(<ConversationRecapSheet {...callbacks} />);

    await fireEvent.press(view.getByRole('button', { name: `Practise suggestion 1: ${correction.latin}` }));
    await view.rerender(<ConversationRecapSheet {...callbacks} state={{ status: 'loading' }} />);
    expect(view.getByText('Preparing your recap…')).toBeTruthy();
    await view.rerender(<ConversationRecapSheet {...callbacks} state={{ status: 'error', message: 'Unavailable.' }} />);
    expect(view.getByText('Unavailable.')).toBeTruthy();
    await view.rerender(<ConversationRecapSheet {...callbacks} />);
    expect(view.getAllByText('Suggested wording')).toHaveLength(2);
  });

  it('honors reduced motion in the page sheet', async () => {
    const callbacks = props();
    const view = await render(<ConversationRecapSheet {...callbacks} />);
    expect(view.getByTestId('conversation-recap-modal').props.animationType).toBe('slide');
    expect(view.getByTestId('conversation-recap-modal').props.presentationStyle).toBe('pageSheet');

    await view.rerender(<ConversationRecapSheet {...callbacks} reducedMotion />);
    expect(view.getByTestId('conversation-recap-modal').props.animationType).toBe('none');
  });

  it('allows scaled text to scroll with unconstrained height and reachable touch targets', async () => {
    const view = await render(<ConversationRecapSheet {...props()} />);
    const assertAccessibleLayout = () => {
      expect(view.getByTestId('conversation-recap-scroll')).toBeTruthy();
      for (const button of view.getAllByRole('button')) {
        const style = StyleSheet.flatten(button.props.style);
        expect(style.minHeight ?? style.height).toBeGreaterThanOrEqual(44);
        expect(style.minWidth ?? style.width).toBeGreaterThanOrEqual(44);
        expect(style.height).toBeUndefined();
        expect(button.props.accessibilityLabel).toBeTruthy();
      }
      for (const text of view.getAllByText(/./)) {
        expect(text.props.allowFontScaling).not.toBe(false);
        expect(text.props.numberOfLines).toBeUndefined();
        expect(text.props.maxFontSizeMultiplier).toBeUndefined();
      }
    };
    assertAccessibleLayout();
    await fireEvent.press(view.getByRole('button', { name: `Practise suggestion 1: ${correction.latin}` }));
    assertAccessibleLayout();
    await fireEvent.press(view.getByRole('button', { name: 'Reveal Hindi for suggestion 1' }));
    assertAccessibleLayout();
  });


  it('restores the save action when a failed save rolls back its saved key', async () => {
    const callbacks = props();
    const view = await render(<ConversationRecapSheet {...callbacks} savedPhraseKeys={[correction.hi.trim().toLowerCase()]} />);
    expect(view.getByRole('button', { name: `Suggestion 1 saved for review: ${correction.latin}` })).toBeDisabled();

    await view.rerender(<ConversationRecapSheet {...callbacks} />);
    const save = view.getByRole('button', { name: `Save suggestion 1 for review: ${correction.latin}` });
    expect(save).toBeEnabled();
    await fireEvent.press(save);
    expect(callbacks.onSave).toHaveBeenCalledWith(correction);
  });

  it('closes focused practice immediately through the accessibility escape gesture', async () => {
    const callbacks = props();
    const view = await render(<ConversationRecapSheet {...callbacks} />);
    await fireEvent.press(view.getByRole('button', { name: `Practise suggestion 1: ${correction.latin}` }));

    await fireEvent(view.getByRole('button', { name: 'Close conversation recap' }), 'accessibilityEscape');
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    expect(callbacks.onSave).not.toHaveBeenCalled();
  });

  it('stacks the header at large text sizes and keeps bottom safe-area space', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 2 }, window: { ...window, fontScale: 2 } }));
    try {
      const view = await render(<ConversationRecapSheet {...props()} />);
      const close = view.getByRole('button', { name: 'Close conversation recap' });
      expect(StyleSheet.flatten(close.parent?.props.style)).toMatchObject({ flexDirection: 'column', alignItems: 'stretch' });
      expect(StyleSheet.flatten(view.getByTestId('conversation-recap-scroll').props.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(36);
    } finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });

});
