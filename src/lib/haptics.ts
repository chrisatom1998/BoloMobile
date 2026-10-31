import * as Haptics from 'expo-haptics';

/**
 * Reduce Motion (system or the in-app Reduced setting) turns haptics off.
 * The root layout keeps this flag current. It starts on so a tap before the
 * first accessibility read still answers.
 */
let reducedMotion = false;

export function setHapticsReducedMotion(reduced: boolean) {
  reducedMotion = reduced;
}

export function hapticsReducedMotion() {
  return reducedMotion;
}

function fire(run: () => Promise<unknown>) {
  if (reducedMotion) return;
  run().catch(() => undefined);
}

export function hapticTap() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticSelect() {
  fire(() => Haptics.selectionAsync());
}

/** A correct review or lesson answer. Soft, not a notification buzz. */
export function hapticSuccess() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

/** Again, or a miss. A light tap, not an error notification. */
export function hapticWarning() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticStartRecording() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** The lesson completion screen. One success tap, once per finish. */
export function hapticLessonComplete() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** The practice streak grew. Same quiet success as finishing a lesson. */
export function hapticStreak() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** The live call reached ready. Fired after connect, not during audio setup. */
export function hapticCallStarted() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

/** The learner ended the live call, or the call dropped after it had started. */
export function hapticCallEnded() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}
