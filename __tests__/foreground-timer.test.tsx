import { renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { IDLE_WINDOW_MS, MAX_SESSION_SECONDS, useForegroundTimer } from '../src/hooks/use-foreground-timer';

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

  it('stops crediting time after the idle window when the learner never taps', async () => {
    const { result, unmount } = await renderHook(() => useForegroundTimer());

    now = 1_000 + 30 * 60_000;
    expect(result.current.elapsedSeconds()).toBeLessThanOrEqual(120);
    expect(result.current.elapsedSeconds()).toBe(IDLE_WINDOW_MS / 1000);

    await unmount();
  });

  it('caps a session at one hour even with steady activity', async () => {
    const { result, unmount } = await renderHook(() => useForegroundTimer());

    for (let minute = 1; minute <= 120; minute += 1) {
      now = 1_000 + minute * 60_000;
      result.current.markActive();
    }
    expect(MAX_SESSION_SECONDS).toBe(3_600);
    expect(result.current.elapsedSeconds()).toBe(MAX_SESSION_SECONDS);

    await unmount();
  });

  it('resumes counting from the next tap after an idle gap', async () => {
    const { result, unmount } = await renderHook(() => useForegroundTimer());

    now = 1_000 + 5 * 60_000;
    result.current.markActive();
    expect(result.current.elapsedSeconds()).toBe(IDLE_WINDOW_MS / 1000);

    now += 10_000;
    expect(result.current.elapsedSeconds()).toBe(IDLE_WINDOW_MS / 1000 + 10);

    now += 60_000;
    result.current.markActive();
    now += 20_000;
    expect(result.current.elapsedSeconds()).toBe(IDLE_WINDOW_MS / 1000 + 90);

    await unmount();
  });

  it('treats a foreground resume as activity but not the time spent in the background', async () => {
    const { result, unmount } = await renderHook(() => useForegroundTimer());

    now = 1_000 + 10 * 60_000;
    transition('background', now);
    now += 10 * 60_000;
    transition('active', now);
    now += 30_000;
    expect(result.current.elapsedSeconds()).toBe(IDLE_WINDOW_MS / 1000 + 30);

    await unmount();
  });
});
