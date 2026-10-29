import { act, renderHook } from '@testing-library/react-native';

import { SHEET_EXIT_FALLBACK_MS, useSheetDismiss } from '../src/components/sheet-exit';

describe('sheet close animation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports the close only after the exit animation can finish', async () => {
    const onDismissed = jest.fn();
    const hook = await renderHook(
      ({ visible }: { visible: boolean }) => useSheetDismiss(visible, onDismissed),
      { initialProps: { visible: true } },
    );

    await hook.rerender({ visible: false });
    expect(onDismissed).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(SHEET_EXIT_FALLBACK_MS - 1);
    });
    expect(onDismissed).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it('ignores a late close after the sheet opens again', async () => {
    const onDismissed = jest.fn();
    const hook = await renderHook(
      ({ visible }: { visible: boolean }) => useSheetDismiss(visible, onDismissed),
      { initialProps: { visible: true } },
    );

    await hook.rerender({ visible: false });
    await hook.rerender({ visible: true });
    await act(async () => {
      jest.advanceTimersByTime(SHEET_EXIT_FALLBACK_MS);
    });
    expect(onDismissed).not.toHaveBeenCalled();
  });

  it('can finish from the modal dismiss callback before the fallback', async () => {
    const onDismissed = jest.fn();
    const hook = await renderHook(
      ({ visible }: { visible: boolean }) => useSheetDismiss(visible, onDismissed),
      { initialProps: { visible: true } },
    );

    await hook.rerender({ visible: false });
    await act(async () => {
      hook.result.current();
    });
    expect(onDismissed).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(SHEET_EXIT_FALLBACK_MS);
    });
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });
});
