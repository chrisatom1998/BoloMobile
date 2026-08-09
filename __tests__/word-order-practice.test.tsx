import { fireEvent, render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => ({
  Check: () => null,
  RotateCcw: () => null,
  X: () => null,
}));

jest.mock('@/lib/haptics', () => ({
  hapticSelect: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
}));

import { WordOrderPractice } from '../src/components/word-order-practice';
import { hapticSuccess, hapticWarning } from '../src/lib/haptics';

const hapticSuccessMock = hapticSuccess as jest.MockedFunction<typeof hapticSuccess>;
const hapticWarningMock = hapticWarning as jest.MockedFunction<typeof hapticWarning>;

function shuffledLabels(view: Awaited<ReturnType<typeof render>>) {
  return view.getAllByLabelText(/^Add word /u).map((tile) => String(tile.props.accessibilityLabel).replace('Add word ', ''));
}

describe('WordOrderPractice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shuffles the tiles away from the pre-solved order and refuses to check until every tile is placed', async () => {
    const onResolve = jest.fn();
    const view = await render(
      <WordOrderPractice
        onResolve={onResolve}
        targetHi="मैं ठीक हूँ।"
        targetLatin="Main theek hoon."
      />,
    );

    // Deterministic shuffle: the on-screen order must not just be the solution.
    expect(shuffledLabels(view)).not.toEqual(['मैं', 'ठीक', 'हूँ।']);

    const check = view.getByLabelText('Check my sentence');
    expect(check.props.accessibilityState).toEqual({ disabled: true });

    await fireEvent.press(view.getByLabelText('Add word मैं'));
    await fireEvent.press(view.getByLabelText('Add word ठीक'));

    // Two of three placed — still cannot lock the answer in.
    expect(view.getByLabelText('Check my sentence').props.accessibilityState).toEqual({ disabled: true });
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('resolves as correct when the learner assembles the exact target order', async () => {
    const onResolve = jest.fn();
    const view = await render(
      <WordOrderPractice
        onResolve={onResolve}
        targetHi="मैं ठीक हूँ।"
        targetLatin="Main theek hoon."
      />,
    );

    await fireEvent.press(view.getByLabelText('Add word मैं'));
    await fireEvent.press(view.getByLabelText('Add word ठीक'));
    await fireEvent.press(view.getByLabelText('Add word हूँ।'));
    await fireEvent.press(view.getByLabelText('Check my sentence'));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('correct');
    expect(hapticSuccessMock).toHaveBeenCalledTimes(1);
    expect(hapticWarningMock).not.toHaveBeenCalled();
  });

  it('resolves as incorrect and locks further edits when the order does not match', async () => {
    const onResolve = jest.fn();
    const view = await render(
      <WordOrderPractice
        onResolve={onResolve}
        targetHi="मैं ठीक हूँ।"
        targetLatin="Main theek hoon."
      />,
    );

    await fireEvent.press(view.getByLabelText('Add word हूँ।'));
    await fireEvent.press(view.getByLabelText('Add word मैं'));
    await fireEvent.press(view.getByLabelText('Add word ठीक'));
    await fireEvent.press(view.getByLabelText('Check my sentence'));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('incorrect');
    expect(hapticWarningMock).toHaveBeenCalledTimes(1);

    // After resolving, all controls stay disabled so a second check cannot double-score.
    expect(view.getByLabelText('Check my sentence').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(view.getByLabelText('Check my sentence'));
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('supports Undo and Clear so learners can revise before checking', async () => {
    const onResolve = jest.fn();
    const view = await render(
      <WordOrderPractice
        onResolve={onResolve}
        targetHi="मैं ठीक हूँ।"
        targetLatin="Main theek hoon."
      />,
    );

    await fireEvent.press(view.getByLabelText('Add word मैं'));
    await fireEvent.press(view.getByLabelText('Add word हूँ।'));
    await fireEvent.press(view.getByLabelText('Undo last word'));
    await fireEvent.press(view.getByLabelText('Add word ठीक'));
    await fireEvent.press(view.getByLabelText('Add word हूँ।'));
    await fireEvent.press(view.getByLabelText('Check my sentence'));

    expect(onResolve).toHaveBeenCalledWith('correct');

    // Rebuild the component and clear from a fresh state to prove Clear empties the tray.
    const view2 = await render(
      <WordOrderPractice
        onResolve={jest.fn()}
        targetHi="मैं ठीक हूँ।"
        targetLatin="Main theek hoon."
      />,
    );
    await fireEvent.press(view2.getByLabelText('Add word मैं'));
    await fireEvent.press(view2.getByLabelText('Clear sentence tray'));
    expect(view2.getByLabelText('Undo last word').props.accessibilityState).toEqual({ disabled: true });
  });

  it('honors the disabled prop so pronunciation activity cannot double-place tiles', async () => {
    const onResolve = jest.fn();
    const view = await render(
      <WordOrderPractice
        disabled
        onResolve={onResolve}
        targetHi="मैं ठीक हूँ।"
        targetLatin="Main theek hoon."
      />,
    );

    expect(view.getByLabelText('Add word मैं').props.accessibilityState).toEqual({ disabled: true, selected: false });
    await fireEvent.press(view.getByLabelText('Add word मैं'));
    expect(view.getByLabelText('Check my sentence').props.accessibilityState).toEqual({ disabled: true });
    expect(onResolve).not.toHaveBeenCalled();
  });
});
