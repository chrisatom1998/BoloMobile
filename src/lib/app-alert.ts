import { Alert } from 'react-native';

import type { AppAlertButton, AppAlertOptions } from '@/lib/app-alert-types';

export function showAppAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
  options?: AppAlertOptions,
) {
  if (options !== undefined) Alert.alert(title, message, buttons, options);
  else if (buttons !== undefined) Alert.alert(title, message, buttons);
  else if (message !== undefined) Alert.alert(title, message);
  else Alert.alert(title);
}
