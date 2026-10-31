import * as Haptics from 'expo-haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Heavy: 'heavy', Light: 'light', Medium: 'medium', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Error: 'error', Success: 'success', Warning: 'warning' },
}));

import {
  hapticCallEnded,
  hapticCallStarted,
  hapticLessonComplete,
  hapticStreak,
  hapticSuccess,
  hapticWarning,
  hapticsReducedMotion,
  setHapticsReducedMotion,
} from '../src/lib/haptics';

describe('haptic moments', () => {
  beforeEach(() => {
    setHapticsReducedMotion(false);
    jest.mocked(Haptics.impactAsync).mockClear();
    jest.mocked(Haptics.notificationAsync).mockClear();
  });

  afterEach(() => {
    setHapticsReducedMotion(false);
  });

  it('uses a soft impact for a correct answer and a light one for again', () => {
    hapticSuccess();
    hapticWarning();
    expect(Haptics.impactAsync).toHaveBeenNthCalledWith(1, Haptics.ImpactFeedbackStyle.Soft);
    expect(Haptics.impactAsync).toHaveBeenNthCalledWith(2, Haptics.ImpactFeedbackStyle.Light);
  });

  it('marks a finished lesson and a new streak with one success notification', () => {
    hapticLessonComplete();
    hapticStreak();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  it('taps softly when a call starts and lightly when it ends', () => {
    hapticCallStarted();
    hapticCallEnded();
    expect(Haptics.impactAsync).toHaveBeenNthCalledWith(1, Haptics.ImpactFeedbackStyle.Soft);
    expect(Haptics.impactAsync).toHaveBeenNthCalledWith(2, Haptics.ImpactFeedbackStyle.Light);
  });

  it('stays quiet when Reduce Motion is on', () => {
    setHapticsReducedMotion(true);
    expect(hapticsReducedMotion()).toBe(true);
    hapticSuccess();
    hapticWarning();
    hapticLessonComplete();
    hapticStreak();
    hapticCallStarted();
    hapticCallEnded();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });
});
