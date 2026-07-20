import { Platform } from 'react-native';

import type { BoloPracticeWidgetProps } from '@/widgets/bolo-practice-widget';

export function updatePracticeWidget(props: BoloPracticeWidgetProps) {
  if (Platform.OS !== 'ios') return;
  void import('@/widgets/bolo-practice-widget').then(({ default: widget }) => {
    widget.updateSnapshot(props);
  }).catch(() => undefined);
}
