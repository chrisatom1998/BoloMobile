export type AppAlertButton = {
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
  text: string;
};

export type AppAlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};
