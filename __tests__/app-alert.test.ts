import { showAppAlert as showWebAlert } from '../src/lib/app-alert.web';

describe('app alerts', () => {
  beforeEach(() => {
    Object.defineProperties(window, {
      alert: { configurable: true, value: jest.fn() },
      confirm: { configurable: true, value: jest.fn() },
      prompt: { configurable: true, value: jest.fn() },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(window, 'alert');
    Reflect.deleteProperty(window, 'confirm');
    Reflect.deleteProperty(window, 'prompt');
  });

  it('shows informational web alerts and invokes their action', () => {
    const onPress = jest.fn();
    const alert = window.alert as jest.MockedFunction<typeof window.alert>;

    showWebAlert('Report received', 'Thank you.', [{ text: 'OK', onPress }]);

    expect(alert).toHaveBeenCalledWith('Report received\n\nThank you.');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('invokes either the confirmed action or cancel action on web', () => {
    const cancel = jest.fn();
    const withdraw = jest.fn();
    const confirm = window.confirm as jest.MockedFunction<typeof window.confirm>;
    confirm.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const buttons = [
      { text: 'Cancel', style: 'cancel' as const, onPress: cancel },
      { text: 'Withdraw', style: 'destructive' as const, onPress: withdraw },
    ];
    showWebAlert('Withdraw consent?', 'AI features will stop.', buttons);
    showWebAlert('Withdraw consent?', 'AI features will stop.', buttons);

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(withdraw).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('makes multi-action web alerts selectable', () => {
    const first = jest.fn();
    const second = jest.fn();
    const cancel = jest.fn();
    const prompt = window.prompt as jest.MockedFunction<typeof window.prompt>;
    prompt.mockReturnValue('2');

    showWebAlert('Report reply', 'Choose the main problem.', [
      { text: 'Unsafe or inappropriate', onPress: first },
      { text: 'Incorrect or misleading', onPress: second },
      { text: 'Cancel', style: 'cancel', onPress: cancel },
    ]);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('keeps a multi-action alert open after an invalid choice', () => {
    const selected = jest.fn();
    const cancel = jest.fn();
    const alert = window.alert as jest.MockedFunction<typeof window.alert>;
    const prompt = window.prompt as jest.MockedFunction<typeof window.prompt>;
    prompt.mockReturnValueOnce('typo').mockReturnValueOnce('1');

    showWebAlert('Report reply', 'Choose the main problem.', [
      { text: 'Unsafe or inappropriate', onPress: selected },
      { text: 'Incorrect or misleading', onPress: jest.fn() },
      { text: 'Cancel', style: 'cancel', onPress: cancel },
    ]);

    expect(prompt).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledWith('Choose one of the numbered options, or cancel.');
    expect(selected).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });
});
