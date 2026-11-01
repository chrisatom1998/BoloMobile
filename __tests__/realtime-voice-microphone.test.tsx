import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { AppState, Text, View } from 'react-native';

import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';

const mockStartTurn = jest.fn(async () => undefined);
let mockVoiceStatus: 'disconnected' | 'ready' | 'recording' = 'disconnected';

jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(),
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

jest.mock('@/hooks/use-realtime-conversation', () => ({
  useRealtimeConversation: () => ({
    disconnect: jest.fn(),
    finishTurn: jest.fn(),
    isPlaying: false,
    microphoneEnabled: mockVoiceStatus === 'recording',
    startTurn: mockStartTurn,
    status: mockVoiceStatus,
  }),
}));

import { RealtimeVoiceButton } from '../src/components/realtime-voice-button';
import { LIVE_MIC_EXPLAINER } from '../src/lib/live-microphone';
import { LIVE_MIC_PERMISSION_MESSAGE } from '../src/lib/live-permission';

const getPermission = jest.mocked(getRecordingPermissionsAsync);
const requestPermission = jest.mocked(requestRecordingPermissionsAsync);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function Harness({ active = true, disabled = false }: { active?: boolean; disabled?: boolean }) {
  const [phase, setPhase] = useState<'idle' | 'explaining' | 'denied'>('idle');
  return (
    <View>
      <RealtimeVoiceButton active={active} clientId="client-12345678" disabled={disabled} onError={jest.fn()} onMicrophonePhase={setPhase} />
      {phase === 'explaining' ? <Text>{LIVE_MIC_EXPLAINER}</Text> : null}
      {phase === 'denied' ? <Text>{LIVE_MIC_PERMISSION_MESSAGE}</Text> : null}
    </View>
  );
}

describe('realtime voice microphone prompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVoiceStatus = 'disconnected';
    mockStartTurn.mockResolvedValue(undefined);
  });

  it('does not start a session from a disabled orb', async () => {
    const view = await render(<Harness disabled />);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Start a voice conversation'));
    });
    expect(getPermission).not.toHaveBeenCalled();
    expect(mockStartTurn).not.toHaveBeenCalled();
  });

  it('explains the microphone before the OS prompt and starts only after it is allowed', async () => {
    const pending = deferred<{ canAskAgain: boolean; granted: boolean; status: string }>();
    getPermission.mockResolvedValue({ canAskAgain: true, granted: false, status: 'undetermined' } as Awaited<ReturnType<typeof getRecordingPermissionsAsync>>);
    requestPermission.mockReturnValue(pending.promise as ReturnType<typeof requestRecordingPermissionsAsync>);
    const view = await render(<Harness />);

    await act(async () => {
      fireEvent.press(view.getByLabelText('Start a voice conversation'));
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(view.getByText(LIVE_MIC_EXPLAINER)).toBeTruthy();
    expect(mockStartTurn).not.toHaveBeenCalled();

    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    expect(mockStartTurn).not.toHaveBeenCalled();

    pending.resolve({ canAskAgain: true, granted: true, status: 'granted' });
    await waitFor(() => expect(mockStartTurn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.queryByText(LIVE_MIC_EXPLAINER)).toBeNull());
  });

  it('does not start a session when the screen leaves view during the microphone prompt', async () => {
    const pending = deferred<{ canAskAgain: boolean; granted: boolean; status: string }>();
    getPermission.mockResolvedValue({ canAskAgain: true, granted: false, status: 'undetermined' } as Awaited<ReturnType<typeof getRecordingPermissionsAsync>>);
    requestPermission.mockReturnValue(pending.promise as ReturnType<typeof requestRecordingPermissionsAsync>);
    const view = await render(<Harness />);

    await act(async () => {
      fireEvent.press(view.getByLabelText('Start a voice conversation'));
    });
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));

    await view.rerender(<Harness active={false} />);
    await act(async () => {
      pending.resolve({ canAskAgain: true, granted: true, status: 'granted' });
      await Promise.resolve();
    });
    await waitFor(() => expect(view.queryByText(LIVE_MIC_EXPLAINER)).toBeNull());
    expect(mockStartTurn).not.toHaveBeenCalled();
  });

  it('offers no session when the microphone was already denied', async () => {
    getPermission.mockResolvedValue({ canAskAgain: false, granted: false, status: 'denied' } as Awaited<ReturnType<typeof getRecordingPermissionsAsync>>);
    const view = await render(<Harness />);

    await act(async () => {
      fireEvent.press(view.getByLabelText('Start a voice conversation'));
      await Promise.resolve();
    });
    expect(view.getByText(LIVE_MIC_PERMISSION_MESSAGE)).toBeTruthy();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(mockStartTurn).not.toHaveBeenCalled();
  });

  it('clears a denial when the app returns with microphone access', async () => {
    const listeners = new Set<(state: string) => void>();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.add(listener as (state: string) => void);
      return { remove: () => listeners.delete(listener as (state: string) => void) };
    });
    getPermission.mockResolvedValue({ canAskAgain: false, granted: false, status: 'denied' } as Awaited<ReturnType<typeof getRecordingPermissionsAsync>>);
    const view = await render(<Harness />);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Start a voice conversation'));
      await Promise.resolve();
    });
    expect(view.getByText(LIVE_MIC_PERMISSION_MESSAGE)).toBeTruthy();

    getPermission.mockResolvedValue({ canAskAgain: false, granted: true, status: 'granted' } as Awaited<ReturnType<typeof getRecordingPermissionsAsync>>);
    await act(async () => {
      listeners.forEach((listener) => listener('active'));
      await Promise.resolve();
    });
    await waitFor(() => expect(view.queryByText(LIVE_MIC_PERMISSION_MESSAGE)).toBeNull());
  });
});
