import { act, renderHook } from '@testing-library/react-native';

import { useCalendarDay } from '../src/hooks/use-calendar-day';

describe('useCalendarDay', () => {
  afterEach(() => jest.useRealTimers());

  it('re-arms the midnight timer when it fires on the same local day', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 5, 23, 0, 0) });
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const { result, unmount } = await renderHook(() => useCalendarDay());
    expect(result.current).toBe('2026-10-5');

    // The clock moves back an hour, so the first timer fires before midnight.
    jest.setSystemTime(new Date(2026, 9, 5, 22, 0, 0));
    await act(async () => { jest.advanceTimersByTime(60 * 60 * 1000 + 1000); });
    expect(result.current).toBe('2026-10-5');

    await act(async () => { jest.advanceTimersByTime(60 * 60 * 1000); });
    expect(result.current).toBe('2026-10-6');
    const midnightTimers = setTimeoutSpy.mock.results
      .filter((_entry, index) => (setTimeoutSpy.mock.calls[index]?.[1] ?? 0) >= 60 * 60 * 1000)
      .map(({ value }) => value);
    await unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(midnightTimers.at(-1));
  });
});
