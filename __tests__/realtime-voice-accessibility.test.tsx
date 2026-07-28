import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('lucide-react-native', () => ({
  Mic: () => null,
  Radio: () => null,
  Send: () => null,
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
let mockVoiceStatus: 'disconnected' | 'ready' | 'recording' = 'ready';

jest.mock('@/hooks/use-realtime-conversation', () => ({
  useRealtimeConversation: () => ({
    disconnect: mockDisconnect,
    finishTurn: mockFinishTurn,
    startTurn: mockStartTurn,
    status: mockVoiceStatus,
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

  it('uses the large glowing orb as the only visible start control', async () => {
    mockVoiceStatus = 'disconnected';
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onTurnComplete={jest.fn()} />);
    const start = view.getByLabelText('Start a voice conversation');
    const style = StyleSheet.flatten(start.props.style);

    expect(style.width).toBe(168);
    expect(style.height).toBe(168);
    expect(style.backgroundColor).toBe('#E76B48');
    expect(view.queryByText('Start a voice conversation')).toBeNull();
    expect(view.queryByLabelText('End live voice session')).toBeNull();
    await fireEvent.press(start);
    expect(mockStartTurn).toHaveBeenCalledTimes(1);
    expect(haptics.hapticStartRecording).not.toHaveBeenCalled();
  });

  it('keeps both voice actions at least 44 points and exposes disabled state', async () => {
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" disabled onError={jest.fn()} onTurnComplete={jest.fn()} />);
    const start = view.getByLabelText('Speak');
    const end = view.getByLabelText('End live voice session');

    const startStyle = StyleSheet.flatten(start.props.style);
    expect(startStyle.width).toBeGreaterThanOrEqual(44);
    expect(startStyle.height).toBeGreaterThanOrEqual(44);
    expect(start.props.accessibilityState).toEqual({ disabled: true });
    const endStyle = StyleSheet.flatten(end.props.style);
    expect(endStyle.width).toBeGreaterThanOrEqual(44);
    expect(endStyle.height).toBeGreaterThanOrEqual(44);
  });

  it('uses the orb to start a ready turn and finish a recording turn', async () => {
    const ready = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onTurnComplete={jest.fn()} />);
    await fireEvent.press(ready.getByLabelText('Speak'));
    expect(mockStartTurn).toHaveBeenCalledTimes(1);
    expect(haptics.hapticStartRecording).toHaveBeenCalledTimes(1);
    await ready.unmount();

    mockVoiceStatus = 'recording';
    const recording = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onTurnComplete={jest.fn()} />);
    await fireEvent.press(recording.getByLabelText('Send turn'));
    expect(mockFinishTurn).toHaveBeenCalledTimes(1);
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

  it('offsets the compact end button beyond the orb hit rect', async () => {
    const compact = await render(<RealtimeVoiceButton clientId="client-12345678" compact onError={jest.fn()} onTurnComplete={jest.fn()} />);
    const compactEnd = StyleSheet.flatten(compact.getByLabelText('End live voice session').props.style);

    // In the 220pt compact stage, right -16 starts the 48pt end button at x=188, beyond the 148pt orb's x=184 edge.
    expect(compactEnd.right).toBe(-16);
    await compact.unmount();

    const regular = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onTurnComplete={jest.fn()} />);
    const regularEnd = StyleSheet.flatten(regular.getByLabelText('End live voice session').props.style);
    expect(regularEnd.right ?? 0).toBe(0);
  });

  it('centers the minimal orb while keeping the end action outside its hit rect', async () => {
    const view = await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onTurnComplete={jest.fn()} size="minimal" />);
    const stage = StyleSheet.flatten(view.getByTestId('realtime-voice-stage').props.style);
    const orb = StyleSheet.flatten(view.getByLabelText('Speak').props.style);
    const end = StyleSheet.flatten(view.getByLabelText('End live voice session').props.style);

    expect(stage.paddingRight ?? 0).toBe(0);
    expect((stage.width - orb.width) / 2 + orb.width / 2).toBe(stage.width / 2);

    const orbRight = (stage.width - orb.width) / 2 + orb.width;
    const endLeft = stage.width - end.width - end.right;
    expect(endLeft - orbRight).toBeGreaterThanOrEqual(8);
  });
});
