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
let mockConnectionStart: ((signal: AbortSignal) => void | Promise<void>) | undefined;
let mockSessionEvent: ((event: { type: 'starting' | 'ready' | 'ended'; reason?: string }) => void) | undefined;

let mockRecovery: Promise<void> = Promise.resolve();
let mockErrorListener: ((message: string, details?: { kind?: string }) => void) | undefined;
const mockUnregisterEnder = jest.fn();

jest.mock('@/lib/asha-session-log-store', () => ({
  ensureAshaSessionLogLoaded: jest.fn(() => mockRecovery),
  logAshaSessionEvent: jest.fn(),
  logAshaSessionSnapshot: jest.fn(),
  registerLiveCallEnder: jest.fn(() => mockUnregisterEnder),
}));

import { ensureAshaSessionLogLoaded, logAshaSessionEvent, logAshaSessionSnapshot, registerLiveCallEnder } from '../src/lib/asha-session-log-store';

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
  useRealtimeConversation: (options: {
    onConnectionStart?: (signal: AbortSignal) => void | Promise<void>;
    onError?: (message: string, details?: { kind?: string }) => void;
    onSessionEvent?: (event: { type: 'starting' | 'ready' | 'ended'; reason?: string }) => void;
    onTranscriptSnapshot?: (rows: { id: string; speaker: 'you' | 'asha'; text: string }[]) => void;
  }) => {
    mockConnectionStart = options.onConnectionStart;
    mockErrorListener = options.onError;
    mockSessionEvent = options.onSessionEvent;
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
    mockConnectionStart = undefined;
    mockSessionEvent = undefined;
    mockTranscriptSnapshot = undefined;
    mockErrorListener = undefined;
    mockRecovery = Promise.resolve();
    jest.mocked(logAshaSessionEvent).mockClear();
    jest.mocked(logAshaSessionSnapshot).mockClear();
    jest.mocked(ensureAshaSessionLogLoaded).mockClear();
    jest.mocked(registerLiveCallEnder).mockClear();
    mockUnregisterEnder.mockClear();
  });

  it('waits for session log recovery before the screen may reset chat for a new connection', async () => {
    let finishRecovery!: () => void;
    mockRecovery = new Promise<void>((resolve) => { finishRecovery = resolve; });
    const screenStart = jest.fn(async () => undefined);
    function ListeningScreen() {
      const { setListeners } = useAshaVoiceSession();
      useEffect(() => {
        setListeners({ onConnectionStart: screenStart });
        return () => setListeners(null);
      }, [setListeners]);
      return null;
    }
    await renderSession(<ListeningScreen />);
    let started = false;
    const connection = mockConnectionStart?.(new AbortController().signal);
    void Promise.resolve(connection).then(() => { started = true; });
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    expect(ensureAshaSessionLogLoaded).toHaveBeenCalledTimes(1);
    expect(screenStart).not.toHaveBeenCalled();
    expect(started).toBe(false);
    finishRecovery();
    await connection;
    expect(screenStart).toHaveBeenCalledTimes(1);

    // A connection canceled during recovery never reaches the screen's reset.
    mockRecovery = new Promise<void>((resolve) => { finishRecovery = resolve; });
    const controller = new AbortController();
    const canceled = mockConnectionStart?.(controller.signal);
    controller.abort();
    finishRecovery();
    await canceled;
    expect(screenStart).toHaveBeenCalledTimes(1);
  });

  it('registers the shared call so Delete Bolo data can end it, and forwards error kinds to the screen', async () => {
    const screenError = jest.fn();
    function ListeningScreen() {
      const { setListeners } = useAshaVoiceSession();
      useEffect(() => {
        setListeners({ onError: screenError });
        return () => setListeners(null);
      }, [setListeners]);
      return null;
    }
    const view = await renderSession(<ListeningScreen />);
    expect(registerLiveCallEnder).toHaveBeenCalledWith(mockDisconnect);
    mockErrorListener?.('Bolo is unavailable right now. Check your connection and try again.', { kind: 'network' });
    expect(screenError).toHaveBeenCalledWith('Bolo is unavailable right now. Check your connection and try again.', { kind: 'network' });
    await view.unmount();
    expect(mockUnregisterEnder).toHaveBeenCalled();
  });

  it('writes every transcript snapshot to the session log, whether or not the screen is listening', async () => {
    const screenSnapshot = jest.fn();
    function ListeningScreen() {
      const { setListeners } = useAshaVoiceSession();
      useEffect(() => {
        setListeners({ onTranscriptSnapshot: screenSnapshot });
        return () => setListeners(null);
      }, [setListeners]);
      return null;
    }
    const rows = [{ id: 'you-1', speaker: 'you' as const, text: 'Namaste' }];
    await renderSession();
    mockTranscriptSnapshot?.(rows);
    expect(logAshaSessionSnapshot).toHaveBeenCalledWith(rows);

    await renderSession(<ListeningScreen />);
    mockTranscriptSnapshot?.(rows);
    expect(screenSnapshot).toHaveBeenCalledWith(rows);
    expect(logAshaSessionSnapshot).toHaveBeenCalledTimes(2);
  });

  it('logs session events with the reply language and forwards them to the listening screen', async () => {
    const screenEvent = jest.fn();
    function ListeningScreen() {
      const { setListeners } = useAshaVoiceSession();
      useEffect(() => {
        setListeners({ onSessionEvent: screenEvent });
        return () => setListeners(null);
      }, [setListeners]);
      return null;
    }
    await renderSession(<ListeningScreen />);
    mockSessionEvent?.({ type: 'starting' });
    mockSessionEvent?.({ type: 'ended', reason: 'connection_lost' });
    expect(logAshaSessionEvent).toHaveBeenNthCalledWith(1, { type: 'starting' }, 'en');
    expect(logAshaSessionEvent).toHaveBeenNthCalledWith(2, { type: 'ended', reason: 'connection_lost' }, 'en');
    expect(screenEvent).toHaveBeenCalledTimes(2);
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

  it('runs the conversation screen reset before the shared voice session connects', async () => {
    const resetConversation = jest.fn(async () => undefined);
    function ListeningScreen() {
      const { setListeners } = useAshaVoiceSession();
      useEffect(() => {
        setListeners({ onConnectionStart: resetConversation });
        return () => setListeners(null);
      }, [setListeners]);
      return null;
    }

    await renderSession(<ListeningScreen />);
    const signal = new AbortController().signal;
    await mockConnectionStart?.(signal);
    expect(resetConversation).toHaveBeenCalledWith(signal);
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
