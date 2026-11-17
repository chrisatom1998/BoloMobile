import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import type { LiveTranscriptRow } from '../src/lib/live-transcripts';

type HookOptions = {
  liveSession?: () => { mode?: string } | null;
  muteAssistantAudio?: boolean;
  onConnectionStart?: (signal: AbortSignal) => void;
  onTranscriptSnapshot?: (rows: LiveTranscriptRow[]) => void;
};

const mockBack = jest.fn();
const mockStartTurn = jest.fn(async () => undefined);
const mockFinishTurn = jest.fn(async () => undefined);
const mockDisconnect = jest.fn();
const mockEndAshaCall = jest.fn();
const mockSendMobileChat = jest.fn();
let mockVoice = { status: 'disconnected', microphoneEnabled: false };
let mockConsent = true;
let mockOptions: HookOptions = {};

jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useFocusEffect: (effect: () => void | (() => void)) => jest.requireActual('react').useEffect(effect, [effect]), useRouter: () => ({ back: mockBack }) }));
jest.mock('expo-status-bar', () => ({ setStatusBarStyle: jest.fn() }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(async () => undefined), deactivateKeepAwake: jest.fn(async () => undefined) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/components/ai-consent-gate', () => ({ AiConsentGate: () => { const { Text } = jest.requireActual('react-native'); return <Text>consent notice</Text>; } }));
jest.mock('@/lib/voice', () => ({ endRealtimeVoiceSession: () => mockEndAshaCall() }));
jest.mock('@/state/app-state', () => ({ useAppState: () => ({ aiConsent: mockConsent, clientId: 'mobile-client-123' }) }));
jest.mock('@/services/bolo-api', () => ({
  LIVE_TRANSLATE_MODE: 'live-translate',
  liveVoiceConfigError: () => null,
  sendMobileChat: (...args: unknown[]) => mockSendMobileChat(...args),
}));
jest.mock('@/hooks/use-realtime-conversation', () => ({
  useRealtimeConversation: (options: HookOptions) => {
    mockOptions = options;
    return { ...mockVoice, connect: jest.fn(), disconnect: mockDisconnect, finishTurn: mockFinishTurn, startTurn: mockStartTurn, isPlaying: false };
  },
}));

import LiveTranslateScreen, { LIVE_TRANSLATE_NOTES } from '../src/app/live-translate';

function row(id: string, speaker: 'you' | 'asha', text: string): LiveTranscriptRow {
  return { id, speaker, text, startMs: 0, endMs: 0, fragments: [] };
}

describe('Live Translate screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVoice = { status: 'disconnected', microphoneEnabled: false };
    mockConsent = true;
  });

  it('explains the microphone and privacy before it listens, then starts a muted translate session', async () => {
    const screen = await render(<LiveTranslateScreen />);
    for (const note of LIVE_TRANSLATE_NOTES) expect(screen.getByText(note.text)).toBeTruthy();
    expect(mockStartTurn).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('translate-start'));
    expect(mockEndAshaCall).toHaveBeenCalledTimes(1);
    expect(mockStartTurn).toHaveBeenCalledTimes(1);
    expect(mockOptions.muteAssistantAudio).toBe(true);
    expect(mockOptions.liveSession?.()).toEqual({ mode: 'live-translate' });
  });

  it('asks for AI consent instead of offering to listen', async () => {
    mockConsent = false;
    const screen = await render(<LiveTranslateScreen />);
    expect(screen.getByText('consent notice')).toBeTruthy();
    expect(screen.queryByTestId('translate-start')).toBeNull();
  });

  it('shows Hindi with its English, a word note, and pause and stop while listening', async () => {
    mockVoice = { status: 'recording', microphoneEnabled: true };
    const screen = await render(<LiveTranslateScreen />);
    await act(async () => mockOptions.onTranscriptSnapshot?.([
      row('a', 'you', 'कल हम मौसी के घर चलेंगे।'),
      row('b', 'asha', 'Tomorrow we will go to Mausi’s house. [Mausi: your mother’s sister]'),
      row('c', 'you', 'चाय बना दो ना'),
    ]));
    expect(screen.getByText('कल हम मौसी के घर चलेंगे।')).toBeTruthy();
    expect(screen.getByText('Tomorrow we will go to Mausi’s house.')).toBeTruthy();
    expect(screen.getByText('Mausi: your mother’s sister')).toBeTruthy();
    expect(screen.getByText('Translating…')).toBeTruthy();
    expect(screen.getByTestId('translate-status')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('translate-pause'));
    expect(mockFinishTurn).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('translate-stop'));
    expect(mockDisconnect).toHaveBeenCalledWith('user_ended');
    // Resuming must not end this screen's own session the way starting ends an Asha call.
    expect(mockEndAshaCall).not.toHaveBeenCalled();
  });

  it('asks Asha how to reply to a translated line and shows her suggestion', async () => {
    mockVoice = { status: 'recording', microphoneEnabled: true };
    mockSendMobileChat.mockResolvedValue({ reply: 'Say: Haan ji', structured: { version: 1, phrases: [{ devanagari: 'हाँ जी, थोड़ी और।', romanized: 'Haan ji, thodi aur.', english: 'Yes please, a little more.' }] } });
    const screen = await render(<LiveTranslateScreen />);
    await act(async () => mockOptions.onTranscriptSnapshot?.([row('a', 'you', 'और रोटी चाहिए क्या?'), row('b', 'asha', 'Do you want more roti?')]));
    await fireEvent.press(screen.getByTestId('translate-ask-reply'));
    await waitFor(() => expect(screen.getByText('Haan ji, thodi aur.')).toBeTruthy());
    expect(screen.getByText('Yes please, a little more.')).toBeTruthy();
    expect(mockSendMobileChat.mock.calls[0]![0]).toMatchObject({ clientId: 'mobile-client-123', structuredReply: true });
    expect(mockSendMobileChat.mock.calls[0]![0].messages[0].text).toContain('और रोटी चाहिए क्या?');
  });

  it('keeps earlier lines when listening restarts, switches to big text, and clears on request', async () => {
    mockVoice = { status: 'recording', microphoneEnabled: true };
    const screen = await render(<LiveTranslateScreen />);
    await act(async () => mockOptions.onTranscriptSnapshot?.([row('a', 'you', 'नमस्ते'), row('b', 'asha', 'Hello.')]));
    await act(async () => mockOptions.onConnectionStart?.(new AbortController().signal));
    await act(async () => mockOptions.onTranscriptSnapshot?.([row('c', 'you', 'खाना तैयार है।'), row('d', 'asha', 'Food is ready.')]));
    expect(screen.getByText('Hello.')).toBeTruthy();
    expect(screen.getByText('Food is ready.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('translate-big-text-toggle'));
    expect(screen.getByTestId('translate-big-text')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('translate-clear'));
    expect(screen.queryByText('Food is ready.')).toBeNull();
    // The session still holds its full history; cleared lines must not come back with the next one.
    await act(async () => mockOptions.onTranscriptSnapshot?.([row('c', 'you', 'खाना तैयार है।'), row('d', 'asha', 'Food is ready.'), row('e', 'you', 'चाय पियोगे?'), row('f', 'asha', 'Will you have tea?')]));
    expect(screen.queryByText('Food is ready.')).toBeNull();
    expect(screen.getByText('Will you have tea?')).toBeTruthy();
  });
});
