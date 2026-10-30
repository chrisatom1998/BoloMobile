import { act, fireEvent, render } from '@testing-library/react-native';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AshaMinimizeButton, AshaMinimizedCover, AshaSwipeToMinimize } from '../src/components/asha-minimize-control';
import { FloatingAshaBubble } from '../src/components/floating-asha-bubble';

jest.mock('expo-image', () => {
  const React = jest.requireActual('react');
  const { View: NativeView } = jest.requireActual('react-native');
  return { Image: (props: { testID?: string }) => React.createElement(NativeView, props) };
});

jest.mock('expo-router', () => ({
  usePathname: () => '/progress',
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({ motionPreference: 'reduced' }),
}));

jest.mock('lucide-react-native', () => ({
  ChevronDown: () => null,
  X: () => null,
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function Phone({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;
}

describe('floating Asha controls', () => {
  it('minimizes from the header control and explains the resting screen', async () => {
    const onPress = jest.fn();
    const onExpand = jest.fn();
    const view = await render(
      <View>
        <AshaMinimizeButton onPress={onPress} />
        <AshaSwipeToMinimize onMinimize={onPress}>
          <View testID="asha-header" />
        </AshaSwipeToMinimize>
        <AshaMinimizedCover onExpand={onExpand} statusLabel="LISTENING" />
      </View>,
    );

    expect(view.getByTestId('asha-header')).toBeTruthy();
    expect(view.getByText('LISTENING')).toBeTruthy();
    expect(view.getByText('Asha is still with you')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByLabelText('Minimize Asha'));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Bring Asha back'));
    });
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('shows Asha’s portrait and ends or expands from the bubble', async () => {
    const onEnd = jest.fn();
    const onExpand = jest.fn();
    const view = await render(
      <Phone>
        <FloatingAshaBubble isPlaying status="responding" onEnd={onEnd} onExpand={onExpand} />
      </Phone>,
    );

    expect(view.getByLabelText('Asha is speaking. Tap to return to the conversation.')).toBeTruthy();
    expect(view.getByTestId('asha-bubble-speaking')).toBeTruthy();
    expect(view.getByTestId('asha-bubble-portrait')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByLabelText('End live voice session'));
    });
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('asha-bubble').props.accessible).toBe(true);
    await act(async () => {
      fireEvent(view.getByTestId('asha-bubble'), 'accessibilityTap');
    });
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('uses a quiet label when the session is not live', async () => {
    const view = await render(
      <Phone>
        <FloatingAshaBubble isPlaying={false} status="disconnected" onEnd={jest.fn()} onExpand={jest.fn()} />
      </Phone>,
    );
    expect(view.getByLabelText('Asha. Tap to return to the conversation.')).toBeTruthy();
    expect(view.queryByTestId('asha-bubble-speaking')).toBeNull();
  });
});
