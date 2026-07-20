import * as Haptics from 'expo-haptics';

function fireAndForget(promise: Promise<unknown>) {
  promise.catch(() => undefined);
}

export function hapticTap() {
  fireAndForget(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticSelect() {
  fireAndForget(Haptics.selectionAsync());
}

export function hapticSuccess() {
  fireAndForget(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function hapticWarning() {
  fireAndForget(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export function hapticStartRecording() {
  fireAndForget(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}
