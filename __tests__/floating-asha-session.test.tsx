import { act, fireEvent, render } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

import { AshaVoiceSessionProvider, isFloatingAshaMinimized, useAshaVoiceSession } from '../src/state/asha-voice-session';

const mockNavigate = jest.fn();
const mockDisconnect = jest.fn();
const mockFinishTurn = jest.fn();
const mockStartTurn = jest.fn();
const mockReplaceLiveChatSnapshot = jest.fn();
const mockMarkLiveTurn = jest.fn();
const mockClearChatHistory = jest.fn();
let mockStatus: 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding' = 'disconnected';
let mockTranscriptSnapshot: ((rows: { id: string; speaker: 'you' | 'asha'; text: string }[]) => void) | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

jest.mock('@/components/floating-asha-bubble', () => {
  const React = jest.requireActual('react');
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual('react-native');
  return {
    FloatingAshaBubble: ({ onEnd, onExpand, status }: { onEnd: () => void; onExpand: () => void; status: string }) => (
      React.createElement(React.Fragment, null,
        React.createElement(MockText, { testID: 'bubble-status' }, status),
        React.createElement(MockPressable, { accessibilityLabel: 'Expand Asha', onPress: onExpand, testID: 'bubble-expand' }),
        React.createElement(MockPressable, { accessibilityLabel: 'End from bubble', onPress: onEnd, testID: 'bubble-end' }),
      )
    ),
  };
});

jest.mock('@/hooks/use-asha-live-session', () => ({
  useAshaLiveSession: () => jest.fn(() => ({})),
}));

jest.mock('@/hooks/use-realtime-conversation', () => ({
  useRealtimeConversation: (options: { onTranscriptSnapshot?: (rows: { id: string; speaker: 'you' | 'asha'; text: string }[]) => void }) => {
    mockTranscriptSnapshot = options.onTranscriptSnapshot;
    return {
      disconnect: mockDisconnect,
      finishTurn: mockFinishTurn,
      isPlaying: mockStatus === 'responding',
      microphoneEnabled: mockStatus === 'recording',
      startTurn: mockStartTurn,
      status: mockStatus,
    };
  },
}));

jest.mock('@/lib/observability', () => ({ observe: jest.fn() }));
jest.mock('@/lib/speech', () => ({ stopSpeaking: jest.fn() }));

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({
    hydrated: true,
    clientId: 'client-12345678',
    aiConsent: true,
    learnerProfile: { responseLanguage: 'en' },
    replaceLiveChatSnapshot: mockReplaceLiveChatSnapshot,
    markLiveTurn: mockMarkLiveTurn,
    clearChatHistory: mockClearChatHistory,
  }),
}));

function Probe() {
  const session = useAshaVoiceSession();
  return (
    <>
      <Text testID="minimized">{session.minimized ? 'yes' : 'no'}</Text>
      <Text testID="available">{session.available ? 'yes' : 'no'}</Text>
      <Pressable accessibilityLabel="Minimize" onPress={session.minimize} testID="minimize" />
      <Pressable accessibilityLabel="Expand" onPress={session.expand} testID="expand" />
      <Pressable accessibilityLabel="End session" onPress={session.endSession} testID="end" />
    </>
  );
}

function renderSession(children: ReactNode = <Probe />) {
  return render(<AshaVoiceSessionProvider>{children}</AshaVoiceSessionProvider>);
}

describe('Asha voice session above the navigator', () => {
  beforeEach(() => {
    mockStatus = 'disconnected';
    mockDisconnect.mockClear();
    mockNavigate.mockClear();
    mockReplaceLiveChatSnapshot.mockClear();
    mockMarkLiveTurn.mockClear();
    mockClearChatHistory.mockClear();
    mockTranscriptSnapshot = undefined;
  });

  it('keeps a minimized session available and restores it from the bubble', async () => {
    const view = await renderSession();
    expect(view.getByTestId('available').props.children).toBe('yes');
    expect(view.queryByTestId('bubble-status')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByTestId('minimize'));
    });
    expect(isFloatingAshaMinimized()).toBe(true);
    expect(view.getByTestId('minimized').props.children).toBe('yes');
    expect(isFloatingAshaMinimized()).toBe(true);
    expect(view.getByTestId('bubble-status').props.children).toBe('disconnected');

    await act(async () => {
      fireEvent.press(view.getByTestId('bubble-expand'));
    });
    expect(view.getByTestId('minimized').props.children).toBe('no');
    expect(isFloatingAshaMinimized()).toBe(false);
    expect(mockNavigate).toHaveBeenCalledWith('/live');
    expect(view.queryByTestId('bubble-status')).toBeNull();
  });

  it('ends the shared session from the bubble', async () => {
    const view = await renderSession();
    await act(async () => {
      fireEvent.press(view.getByTestId('minimize'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('bubble-end'));
    });
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('bubble-status')).toBeNull();
    expect(isFloatingAshaMinimized()).toBe(false);
  });

  it('writes transcript snapshots itself when the conversation screen is not listening', async () => {
    await renderSession();
    mockTranscriptSnapshot?.([
      { id: 'you-1', speaker: 'you', text: 'Namaste' },
      { id: 'asha-1', speaker: 'asha', text: 'Hello' },
    ]);
    expect(mockReplaceLiveChatSnapshot).toHaveBeenCalledWith([], [
      { id: 'you-1', role: 'you', text: 'Namaste' },
      { id: 'asha-1', role: 'asha', text: 'Hello', language: 'en' },
    ]);
    expect(mockMarkLiveTurn).toHaveBeenCalledTimes(1);
  });

  it('keeps snapshot ids from the conversation screen so a later snapshot drops stale rows', async () => {
    function ListeningScreen({ listen }: { listen: boolean }) {
      const { setListeners, snapshotIds } = useAshaVoiceSession();
      useEffect(() => {
        if (!listen) return undefined;
        setListeners({
          onTranscriptSnapshot: (rows) => {
            snapshotIds.current = rows.map((row) => row.id);
          },
        });
        return () => setListeners(null);
      }, [listen, setListeners, snapshotIds]);
      return null;
    }

    const view = await renderSession(<ListeningScreen listen />);
    mockTranscriptSnapshot?.([
      { id: 'you-1', speaker: 'you', text: 'Namaste' },
      { id: 'asha-1', speaker: 'asha', text: 'Hello' },
    ]);
    expect(mockReplaceLiveChatSnapshot).not.toHaveBeenCalled();

    await act(async () => {
      view.rerender(<AshaVoiceSessionProvider><ListeningScreen listen={false} /></AshaVoiceSessionProvider>);
    });
    mockTranscriptSnapshot?.([
      { id: 'you-2', speaker: 'you', text: 'Phir se' },
    ]);
    expect(mockReplaceLiveChatSnapshot).toHaveBeenCalledWith(['you-1', 'asha-1'], [
      { id: 'you-2', role: 'you', text: 'Phir se' },
    ]);
  });
});
