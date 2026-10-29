import { render } from '@testing-library/react-native';
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
});
