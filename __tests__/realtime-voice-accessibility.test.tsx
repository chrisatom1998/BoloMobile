import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';

const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: 'utf8') => string };

jest.mock('lucide-react-native', () => ({
  Mic: () => null,
  Radio: () => null,
  MicOff: () => null,
  X: () => null,
}));

jest.mock('@/lib/haptics', () => ({
  hapticSelect: jest.fn(),
  hapticStartRecording: jest.fn(),
  hapticTap: jest.fn(),
}));

const mockDisconnect = jest.fn();
const mockStartTurn = jest.fn(async () => undefined);
const mockFinishTurn = jest.fn(async () => undefined);
let mockVoiceStatus: 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding' = 'ready';

jest.mock('@/hooks/use-realtime-conversation', () => ({
  useRealtimeConversation: () => ({
    disconnect: mockDisconnect,
    finishTurn: mockFinishTurn,
    startTurn: mockStartTurn,
    status: mockVoiceStatus,
    microphoneEnabled: mockVoiceStatus === 'recording',
    isPlaying: mockVoiceStatus === 'responding',
  }),
}));

import { RealtimeVoiceButton } from '../src/components/realtime-voice-button';

const haptics = jest.requireMock('@/lib/haptics') as {
  hapticStartRecording: jest.Mock;
};

describe('realtime voice accessibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVoiceStatus = 'ready';
  });

  it('ends audio before requesting a recap and ignores duplicate End taps', async () => {
    const order: string[] = [];
    mockDisconnect.mockImplementation(() => { order.push('disconnect'); });
    const onSessionEnded = jest.fn(() => { order.push('recap'); });
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onSessionEnded={onSessionEnded} />);
    const end = view.getByLabelText('End chat');
    await fireEvent.press(end);
    await fireEvent.press(end);
    expect(order).toEqual(['disconnect', 'recap']);
    await view.unmount();
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it('resolves both Maestro End selectors to the real end-session action', async () => {
    const flow = readFileSync('.maestro/flows/05-realtime-voice-turns.yaml', 'utf8');
    const selectors = [...flow.matchAll(/^- tapOn: "(End[^"\n]+)"/gmu)].map((match) => match[1]);
    expect(selectors).toHaveLength(2);

    for (const selector of selectors) {
      const view = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} />);
      await fireEvent.press(view.getByRole('button', { name: selector }));
      await view.unmount();
    }
    expect(mockDisconnect).toHaveBeenCalledTimes(2);
  });

  it('does not request a recap when cancelling a connection attempt', async () => {
    mockVoiceStatus = 'connecting';
    const onSessionEnded = jest.fn();
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onSessionEnded={onSessionEnded} />);
    await fireEvent.press(view.getByLabelText('End chat'));
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it('uses the large glowing orb as the only visible start control', async () => {
    mockVoiceStatus = 'disconnected';
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onTurnComplete={jest.fn()} />);
    const start = view.getByLabelText('Start a voice conversation');
    const style = StyleSheet.flatten(start.props.style);

    expect(style.width).toBe(168);
    expect(style.height).toBe(168);
    expect(style.backgroundColor).toBe('#E76B48');
    expect(view.queryByText('Start a voice conversation')).toBeNull();
    expect(view.queryByLabelText('End chat')).toBeNull();
    expect(view.queryByText('End chat')).toBeNull();
    await fireEvent.press(start);
    expect(mockStartTurn).toHaveBeenCalledTimes(1);
    expect(haptics.hapticStartRecording).not.toHaveBeenCalled();
  });

  it('keeps both voice actions at least 44 points and exposes disabled state', async () => {
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" disabled onError={jest.fn()} onTurnComplete={jest.fn()} />);
    const start = view.getByLabelText('Unmute microphone');
    const end = view.getByLabelText('End chat');

    const startStyle = StyleSheet.flatten(start.props.style);
    expect(startStyle.width).toBeGreaterThanOrEqual(44);
    expect(startStyle.height).toBeGreaterThanOrEqual(44);
    expect(start.props.accessibilityState).toEqual({ disabled: true });
    const endStyle = StyleSheet.flatten(end.props.style);
    expect(endStyle.minWidth).toBeGreaterThanOrEqual(48);
    expect(endStyle.minHeight).toBeGreaterThanOrEqual(48);
    await fireEvent.press(end);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('uses the orb to unmute and mute the microphone', async () => {
    const ready = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onTurnComplete={jest.fn()} />);
    await fireEvent.press(ready.getByLabelText('Unmute microphone'));
    expect(mockStartTurn).toHaveBeenCalledTimes(1);
    expect(haptics.hapticStartRecording).toHaveBeenCalledTimes(1);
    await ready.unmount();

    mockVoiceStatus = 'recording';
    const recording = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onTurnComplete={jest.fn()} />);
    await fireEvent.press(recording.getByLabelText('Mute microphone'));
    expect(mockFinishTurn).toHaveBeenCalledTimes(1);
  });

  it('allows unmuting while Asha is speaking', async () => {
    mockVoiceStatus = 'responding';
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} />);
    const button = view.getByLabelText('Unmute microphone');
    expect(button.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(button);
    expect(mockStartTurn).toHaveBeenCalledTimes(1);
  });

  it('reclaims vertical space with a still-prominent compact orb', async () => {
    mockVoiceStatus = 'disconnected';
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" compact onError={jest.fn()} onTurnComplete={jest.fn()} />);
    const stage = StyleSheet.flatten(view.getByTestId('realtime-voice-stage').props.style);
    const orb = StyleSheet.flatten(view.getByLabelText('Start a voice conversation').props.style);

    expect(stage.width).toBe(220);
    expect(stage.height).toBe(220);
    expect(orb.width).toBe(148);
    expect(orb.height).toBe(148);
  });

  it('centers the minimal orb in a full-width stage', async () => {
    mockVoiceStatus = 'disconnected';
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onTurnComplete={jest.fn()} size="minimal" />);
    const stage = StyleSheet.flatten(view.getByTestId('realtime-voice-stage').props.style);
    const orb = StyleSheet.flatten(view.getByLabelText('Start a voice conversation').props.style);

    expect(stage.width).toBe('100%');
    expect(stage.alignItems).toBe('center');
    expect(stage.paddingLeft).toBeUndefined();
    expect(stage.paddingRight).toBeUndefined();
    expect(orb.width).toBe(88);
    expect(orb.height).toBe(88);
  });

  it.each(['connecting', 'ready', 'recording', 'responding'] as const)('shows a labeled End chat button while %s', async (status) => {
    mockVoiceStatus = status;
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} />);
    const end = view.getByRole('button', { name: 'End chat' });

    expect(within(end).getByText('End chat')).toBeTruthy();
    expect(end.props.accessibilityHint).toBe('Stops the live voice session.');
    expect(end.props.disabled).not.toBe(true);
  });

  it('keeps End chat usable when the connection is disabled by the host', async () => {
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" enabled={false} disabled onError={jest.fn()} />);
    await fireEvent.press(view.getByRole('button', { name: 'End chat' }));
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'regular', compact: false, size: 'regular' as const, width: 282, height: 282, orbSize: 168 },
    { name: 'compact', compact: true, size: 'regular' as const, width: 220, height: 220, orbSize: 148 },
    { name: 'minimal', compact: false, size: 'minimal' as const, width: '100%', height: 104, orbSize: 88 },
    { name: 'compact minimal', compact: true, size: 'minimal' as const, width: '100%', height: 104, orbSize: 88 },
  ])('places End chat below the unchanged $name orb and helper copy', async ({ compact, size, width, height, orbSize }) => {
    const view = await render(
      <View>
        <RealtimeVoiceButton clientId="client-12345678" compact={compact} onError={jest.fn()} size={size}>
          <Text testID="voice-helper">Your microphone is muted</Text>
        </RealtimeVoiceButton>
      </View>,
    );
    const stage = view.getByTestId('realtime-voice-stage');
    const row = view.getByTestId('realtime-end-row');
    const end = view.getByRole('button', { name: 'End chat' });
    const root = view.toJSON() as { children: { props: { testID?: string } }[] };

    expect(root.children.map((node) => node.props.testID)).toEqual(['realtime-voice-stage', 'voice-helper', 'realtime-end-row']);
    expect(within(stage).queryByRole('button', { name: 'End chat' })).toBeNull();
    expect(within(row).getByText('End chat')).toBeTruthy();
    expect(StyleSheet.flatten(stage.props.style)).toMatchObject({ width, height });
    expect(StyleSheet.flatten(view.getByTestId('realtime-voice-orb').props.style)).toMatchObject({ width: orbSize, height: orbSize });
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ alignSelf: 'stretch', alignItems: 'center' });
    for (const element of [row, end]) {
      const style = StyleSheet.flatten(element.props.style);
      expect(style.position).not.toBe('absolute');
      expect(style.height).toBeUndefined();
      expect(style.top).toBeUndefined();
      expect(style.right).toBeUndefined();
    }
  });

  it('lets the soft-red End chat pill grow and wrap instead of clipping large text', async () => {
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} size="minimal" />);
    const end = view.getByRole('button', { name: 'End chat' });
    const label = within(end).getByText('End chat');
    const style = StyleSheet.flatten(end.props.style);

    expect(style).toMatchObject({ minWidth: 140, minHeight: 48, maxWidth: '100%', backgroundColor: '#FBEDEA', borderColor: '#E4B5AE' });
    expect(style.width).toBeUndefined();
    expect(style.height).toBeUndefined();
    expect(style.maxHeight).toBeUndefined();
    expect(StyleSheet.flatten(label.props.style)).toMatchObject({ color: '#A93B2B', flexShrink: 1 });
    expect(label.props.allowFontScaling).not.toBe(false);
    expect(label.props.maxFontSizeMultiplier).toBeUndefined();
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.adjustsFontSizeToFit).not.toBe(true);
  });
});
