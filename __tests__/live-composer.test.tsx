import { act, fireEvent, render } from '@testing-library/react-native';

import type { createLiveStyles } from '../src/app/(tabs)/live';
import { LiveComposer } from '../src/components/live-composer';

jest.mock('lucide-react-native', () => ({ Send: () => null }));
jest.mock('@/theme', () => ({ useTheme: () => ({ colors: { muted: '#777', white: '#fff' } }) }));

const styles = {} as ReturnType<typeof createLiveStyles>;

function deferred() {
  let resolve!: (accepted: boolean) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<boolean>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('typed message draft acknowledgement', () => {
  it.each(['declined', 'rejected'] as const)('retains the exact draft after a %s send and allows retry', async (outcome) => {
    const request = deferred();
    const onSend = jest.fn().mockReturnValueOnce(request.promise).mockResolvedValueOnce(true);
    const view = await render(<LiveComposer disabled={false} onSend={onSend} styles={styles} />);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), '  Please keep my words.  ');
    await fireEvent.press(view.getByLabelText('Send message'));
    expect(view.getByLabelText('Message Asha').props.value).toBe('  Please keep my words.  ');
    expect(view.getByLabelText('Send message').props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      if (outcome === 'declined') request.resolve(false);
      else request.reject(new Error('Offline'));
      await Promise.resolve();
    });
    expect(view.getByLabelText('Message Asha').props.value).toBe('  Please keep my words.  ');
    expect(view.getByLabelText('Send message').props.accessibilityState.disabled).toBe(false);

    await fireEvent.press(view.getByLabelText('Send message'));
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(onSend).toHaveBeenLastCalledWith('Please keep my words.');
    expect(view.getByLabelText('Message Asha').props.value).toBe('');
  });

  it('blocks rapid duplicate native submits before state updates', async () => {
    const request = deferred();
    const onSend = jest.fn(() => request.promise);
    const view = await render(<LiveComposer disabled={false} onSend={onSend} styles={styles} />);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Send once.');
    const submit = view.getByLabelText('Message Asha').props.onSubmitEditing;
    await act(async () => {
      void submit();
      void submit();
    });
    expect(onSend).toHaveBeenCalledTimes(1);
    await act(async () => { request.resolve(true); });
    expect(view.getByLabelText('Message Asha').props.value).toBe('');
  });

  it.each([true, false])('preserves a newer native draft when the previous request resolves %s', async (accepted) => {
    const request = deferred();
    const view = await render(<LiveComposer disabled={false} onSend={() => request.promise} styles={styles} />);
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Original question.');
    // Simulate a queued native edit delivered after the input becomes locked.
    const nativeChange = view.getByLabelText('Message Asha').props.onChangeText;
    await fireEvent.press(view.getByLabelText('Send message'));
    await act(async () => { nativeChange('My newer draft.'); });
    await act(async () => { request.resolve(accepted); });
    expect(view.getByLabelText('Message Asha').props.value).toBe('My newer draft.');
  });

  it('ignores an old completion after navigating away and opening another composer', async () => {
    const request = deferred();
    const previous = await render(<LiveComposer disabled={false} onSend={() => request.promise} styles={styles} />);
    await fireEvent.changeText(previous.getByLabelText('Message Asha'), 'Old question.');
    await fireEvent.press(previous.getByLabelText('Send message'));
    await previous.unmount();
    const current = await render(<LiveComposer disabled={false} onSend={jest.fn()} styles={styles} />);
    await fireEvent.changeText(current.getByLabelText('Message Asha'), 'New visit.');
    await act(async () => { request.resolve(true); });
    expect(current.getByLabelText('Message Asha').props.value).toBe('New visit.');
  });
});
