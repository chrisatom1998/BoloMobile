import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

const mockUseRealtimeConversation = jest.fn((_options?: unknown) => ({
  disconnect: jest.fn(),
  finishTurn: jest.fn(),
  isPlaying: false,
  microphoneEnabled: false,
  startTurn: jest.fn(async () => undefined),
  status: 'ready' as const,
}));

jest.mock('@/hooks/use-realtime-conversation', () => ({
  useRealtimeConversation: (options: unknown) => mockUseRealtimeConversation(options),
}));

jest.mock('lucide-react-native', () => ({
  Mic: () => null,
  MicOff: () => null,
  X: () => null,
}));

jest.mock('@/lib/haptics', () => ({
  hapticSelect: jest.fn(),
  hapticStartRecording: jest.fn(),
  hapticTap: jest.fn(),
}));

import { RealtimeVoiceButton } from '../src/components/realtime-voice-button';
import { BoloApiError } from '../src/services/bolo-api';

describe('shared realtime voice control', () => {
  beforeEach(() => {
    mockUseRealtimeConversation.mockClear();
  });

  it('renders an existing session without starting another one', async () => {
    const startTurn = jest.fn(async () => undefined);
    const view = await render(
      <RealtimeVoiceButton
        clientId="client-12345678"
        onError={jest.fn()}
        voice={{
          disconnect: jest.fn(),
          finishTurn: jest.fn(),
          microphoneEnabled: false,
          startTurn,
          status: 'ready',
        }}
      >
        <Text>Asha</Text>
      </RealtimeVoiceButton>,
    );

    expect(mockUseRealtimeConversation).not.toHaveBeenCalled();
    expect(view.getByLabelText('Unmute microphone')).toBeTruthy();
  });

  it('reports a failed start with its typed API kind, and other failures without one', async () => {
    const onError = jest.fn();
    const startTurn = jest.fn()
      .mockRejectedValueOnce(new BoloApiError('Bolo is unavailable right now. Check your connection and try again.', { kind: 'network' }))
      .mockRejectedValueOnce(new Error('Microphone permission denied'));
    const view = await render(
      <RealtimeVoiceButton clientId="client-12345678" onError={onError} voice={{ disconnect: jest.fn(), finishTurn: jest.fn(), microphoneEnabled: false, startTurn, status: 'disconnected' }} />,
    );
    await fireEvent.press(view.getByLabelText('Start a voice conversation'));
    await fireEvent.press(view.getByLabelText('Start a voice conversation'));
    expect(onError).toHaveBeenNthCalledWith(1, 'Bolo is unavailable right now. Check your connection and try again.', { kind: 'network' });
    expect(onError).toHaveBeenNthCalledWith(2, 'Microphone permission denied', {});
  });

  it('forwards session events to the hook when it owns the session', async () => {
    const onSessionEvent = jest.fn();
    await render(<RealtimeVoiceButton clientId="client-12345678" onError={jest.fn()} onSessionEvent={onSessionEvent} />);
    expect(mockUseRealtimeConversation).toHaveBeenCalledWith(expect.objectContaining({ onSessionEvent }));
  });
});
