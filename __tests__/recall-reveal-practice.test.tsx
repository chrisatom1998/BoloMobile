import { fireEvent, render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => ({
  Check: () => null,
  Eye: () => null,
  X: () => null,
}));

jest.mock('@/lib/haptics', () => ({
  hapticSelect: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
}));

import { RecallRevealPractice } from '../src/components/recall-reveal-practice';
import { hapticSuccess, hapticWarning } from '../src/lib/haptics';

const hapticSuccessMock = hapticSuccess as jest.MockedFunction<typeof hapticSuccess>;
const hapticWarningMock = hapticWarning as jest.MockedFunction<typeof hapticWarning>;

function renderPractice(onResolve = jest.fn(), disabled = false) {
  return render(
    <RecallRevealPractice
      disabled={disabled}
      onResolve={onResolve}
      targetEn="I am well."
      targetHi="मैं ठीक हूँ।"
      targetLatin="Main theek hoon."
    />,
  );
}

describe('RecallRevealPractice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the Hindi hidden until the learner explicitly reveals it', async () => {
    const view = await renderPractice();

    expect(view.getByText('I am well.')).toBeTruthy();
    expect(view.getByTestId('scene-recall-reveal-hidden')).toBeTruthy();
    expect(view.queryByText('मैं ठीक हूँ।')).toBeNull();
    expect(view.queryByLabelText('Needs work')).toBeNull();

    await fireEvent.press(view.getByLabelText('Reveal the Hindi answer'));

    expect(view.getByTestId('scene-recall-reveal-answer')).toBeTruthy();
    expect(view.getByText('मैं ठीक हूँ।')).toBeTruthy();
    expect(view.getByText('Main theek hoon.')).toBeTruthy();
    expect(view.getByLabelText('Needs work')).toBeTruthy();
    expect(view.getByLabelText('Got it')).toBeTruthy();
  });

  it('scores Got it exactly once and locks both grades', async () => {
    const onResolve = jest.fn();
    const view = await renderPractice(onResolve);

    await fireEvent.press(view.getByLabelText('Reveal the Hindi answer'));
    await fireEvent.press(view.getByLabelText('Got it'));
    await fireEvent.press(view.getByLabelText('Needs work'));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith('correct');
    expect(hapticSuccessMock).toHaveBeenCalledTimes(1);
    expect(hapticWarningMock).not.toHaveBeenCalled();
    expect(view.getByLabelText('Got it').props.accessibilityState).toEqual({ disabled: true });
    expect(view.getByLabelText('Needs work').props.accessibilityState).toEqual({ disabled: true });
  });

  it('reports Needs work as an incorrect result', async () => {
    const onResolve = jest.fn();
    const view = await renderPractice(onResolve);

    await fireEvent.press(view.getByLabelText('Reveal the Hindi answer'));
    await fireEvent.press(view.getByLabelText('Needs work'));

    expect(onResolve).toHaveBeenCalledWith('incorrect');
    expect(hapticWarningMock).toHaveBeenCalledTimes(1);
    expect(hapticSuccessMock).not.toHaveBeenCalled();
  });

  it('cannot reveal or score while the parent disables the practice', async () => {
    const onResolve = jest.fn();
    const view = await renderPractice(onResolve, true);
    const reveal = view.getByLabelText('Reveal the Hindi answer');

    expect(reveal.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(reveal);

    expect(view.getByTestId('scene-recall-reveal-hidden')).toBeTruthy();
    expect(onResolve).not.toHaveBeenCalled();
  });
});
