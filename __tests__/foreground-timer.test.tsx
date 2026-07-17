import { renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useForegroundTimer } from '../src/hooks/use-foreground-timer';

describe('foreground practice timer', () => {
  const originalCurrentState = Object.getOwnPropertyDescriptor(AppState, 'currentState');
  let currentState: AppStateStatus;
  let now: number;
  let stateListener: ((state: AppStateStatus) => void) | undefined;
  let removeListener: jest.Mock;

  beforeEach(() => {
    currentState = 'active';
    now = 1_000;
    stateListener = undefined;
    removeListener = jest.fn();
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      get: () => currentState,
    });
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      stateListener = listener;
      return { remove: removeListener };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalCurrentState) Object.defineProperty(AppState, 'currentState', originalCurrentState);
  });

  function transition(nextState: AppStateStatus, at: number) {
    now = at;
    currentState = nextState;
    stateListener?.(nextState);
  }

  it('counts only foreground intervals across inactive, background, and resume events', async () => {
    const { result, unmount } = await renderHook(() => useForegroundTimer());

    now = 3_400;
    expect(result.current.elapsedSeconds()).toBe(2);

    transition('inactive', 3_400);
    now = 9_000;
    expect(result.current.elapsedSeconds()).toBe(2);

    transition('background', 10_000);
    transition('active', 11_000);
    now = 12_800;
    expect(result.current.elapsedSeconds()).toBe(4);

    transition('active', 13_000);
    now = 14_000;
    expect(result.current.elapsedSeconds()).toBe(5);

    await unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it('resets active and background accounting from the current lifecycle state', async () => {
    const { result, unmount } = await renderHook(() => useForegroundTimer());

    now = 6_500;
    expect(result.current.elapsedSeconds()).toBe(6);
    result.current.reset();
    now = 7_900;
    expect(result.current.elapsedSeconds()).toBe(1);

    transition('background', 7_900);
    now = 9_000;
    result.current.reset();
    expect(result.current.elapsedSeconds()).toBe(1);

    transition('active', 10_000);
    now = 11_600;
    expect(result.current.elapsedSeconds()).toBe(2);

    await unmount();
  });
});
