import { Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type BoloPracticeWidgetProps = {
  streak: number;
  dueReviews: number;
  minutesToday: number;
};

function BoloPracticeWidget(props: BoloPracticeWidgetProps, environment: WidgetEnvironment) {
  'widget';
  const foreground = environment.colorScheme === 'dark' ? '#FFFFFF' : '#172523';
  const muted = environment.colorScheme === 'dark' ? '#BFC9C6' : '#535D5A';
  return (
    <VStack modifiers={[padding({ all: 12 })]}>
      <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle('#AC4828')]}>ब · Bolo</Text>
      <Text modifiers={[font({ size: 24, weight: 'bold' }), foregroundStyle(foreground)]}>{props.streak} day streak</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(muted)]}>{props.dueReviews ? `${props.dueReviews} phrases ready` : `${props.minutesToday} min today`}</Text>
    </VStack>
  );
}

export default createWidget('BoloPracticeWidget', BoloPracticeWidget);
