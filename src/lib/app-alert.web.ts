import type { AppAlertButton, AppAlertOptions } from '@/lib/app-alert-types';

function content(title: string, message?: string) {
  return message ? `${title}\n\n${message}` : title;
}

export function showAppAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
  _options?: AppAlertOptions,
) {
  const actions = buttons?.length ? buttons : [{ text: 'OK' }];
  const cancel = actions.find((button) => button.style === 'cancel');
  const choices = actions.filter((button) => button !== cancel);
  const alertContent = content(title, message);

  if (actions.length === 1) {
    window.alert(alertContent);
    actions[0]?.onPress?.();
    return;
  }

  if (choices.length === 1) {
    if (window.confirm(alertContent)) choices[0]?.onPress?.();
    else cancel?.onPress?.();
    return;
  }

  const menu = choices.map((button, index) => `${index + 1}. ${button.text}`).join('\n');
  while (true) {
    const selection = window.prompt(`${alertContent}\n\n${menu}`);
    if (selection === null) {
      cancel?.onPress?.();
      return;
    }
    const selectedIndex = Number(selection) - 1;
    if (Number.isInteger(selectedIndex) && choices[selectedIndex]) {
      choices[selectedIndex].onPress?.();
      return;
    }
    window.alert('Choose one of the numbered options, or cancel.');
  }
}
