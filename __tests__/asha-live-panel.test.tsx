import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => ({
  CircleStop: () => null,
  Gauge: () => null,
  Languages: () => null,
  Mic: () => null,
  MicOff: () => null,
  RotateCcw: () => null,
  Save: () => null,
}));

const mockVoice = {
  backendLoading: false,
  connect: jest.fn(async () => undefined),
  createRecap: jest.fn(async () => null as unknown),
  disconnect: jest.fn(async () => undefined),
  interrupt: jest.fn(),
  muted: false,
  sendGuidance: jest.fn(),
  status: 'disconnected' as 'disconnected' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'reconnecting',
  toggleMute: jest.fn(),
};

let mockHookOptions: { onTranscript: (fragment: { eventId: string; speaker: 'you' | 'asha'; text: string; startMs?: number; endMs?: number }) => void; mode: string } | undefined;

jest.mock('@/hooks/use-asha-live-conversation', () => ({
  useAshaLiveConversation: (options: typeof mockHookOptions) => {
    mockHookOptions = options;
    return mockVoice;
  },
}));

import { AshaLivePanel } from '../src/components/asha-live-panel';

const context = { learnerLevel: 'beginner', lessonId: 'lesson-greetings', lessonTitle: 'Greetings', learningObjective: 'Introduce yourself' };

function props(overrides: Partial<React.ComponentProps<typeof AshaLivePanel>> = {}) {
  return { clientId: 'client-12345678', context, onError: jest.fn(), ...overrides };
}

describe('AshaLivePanel compact progressive disclosure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVoice.backendLoading = false;
    mockVoice.muted = false;
    mockVoice.status = 'disconnected';
    mockVoice.createRecap.mockResolvedValue(null);
    mockHookOptions = undefined;
  });

  it('keeps the previous orb-first design and hides advanced controls by default', async () => {
    const view = await render(<AshaLivePanel {...props()} size="minimal" />);
    expect(view.getByTestId('realtime-voice-orb')).toBeTruthy();
    expect(view.getByText('Conversation options')).toBeTruthy();
    expect(view.queryByText('Lesson')).toBeNull();
    expect(view.queryByText('Save phrase')).toBeNull();
  });

  it('selects a mode through disclosure and starts the secure session from the orb', async () => {
    const onStatusChange = jest.fn();
    const view = await render(<AshaLivePanel {...props({ onStatusChange })} />);
    await fireEvent.press(view.getByText('Conversation options'));
    await fireEvent.press(view.getByText('Lesson'));
    expect(mockHookOptions?.mode).toBe('lesson');
    await fireEvent.press(view.getByTestId('realtime-voice-orb'));
    expect(mockVoice.connect).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenLastCalledWith('disconnected');
  });

  it('does not start while consent keeps the compact control disabled', async () => {
    const view = await render(<AshaLivePanel {...props({ disabled: true })} />);
    const start = view.getByTestId('realtime-voice-orb');
    expect(start.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(start);
    expect(mockVoice.connect).not.toHaveBeenCalled();
  });

  it('surfaces connection failures through the existing error boundary', async () => {
    const onError = jest.fn();
    mockVoice.connect.mockRejectedValueOnce(new Error('Secure session unavailable'));
    const view = await render(<AshaLivePanel {...props({ onError })} />);
    await fireEvent.press(view.getByTestId('realtime-voice-orb'));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Secure session unavailable'));
  });

  it('preserves transcript text and reveals session actions only on demand', async () => {
    const onSavePhraseRequest = jest.fn();
    const onTranscriptChange = jest.fn();
    mockVoice.status = 'thinking';
    mockVoice.backendLoading = true;
    const view = await render(<AshaLivePanel {...props({ onSavePhraseRequest, onTranscriptChange })} />);
    expect(view.getByText('Checking lesson information…')).toBeTruthy();
    expect(view.queryByText('Save phrase')).toBeNull();
    await fireEvent.press(view.getByText('Conversation options'));
    expect(view.getByText('Save phrase')).toBeTruthy();

    await act(async () => {
      mockHookOptions?.onTranscript({ eventId: 'you-1', speaker: 'you', text: 'Mera naaam?', startMs: 1, endMs: 2 });
      mockHookOptions?.onTranscript({ eventId: 'asha-1', speaker: 'asha', text: 'आपका नाम क्या है?', startMs: 3, endMs: 4 });
    });
    expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'you', text: 'Mera naaam?' });
    await fireEvent.press(view.getByText('Save phrase'));
    expect(onSavePhraseRequest).toHaveBeenCalledWith('आपका नाम क्या है?');
    await fireEvent.press(view.getByText('Interrupt'));
    await fireEvent.press(view.getByText('Hear again'));
    await fireEvent.press(view.getByText('Speak slower'));
    await fireEvent.press(view.getByText('Explain'));
    expect(mockVoice.interrupt).toHaveBeenCalledTimes(1);
    expect(mockVoice.sendGuidance).toHaveBeenCalledTimes(3);
  });

  it('shows a compact live state without opening the advanced controls', async () => {
    mockVoice.status = 'listening';
    const view = await render(<AshaLivePanel {...props()} />);
    expect(view.getByText('Listening…')).toBeTruthy();
    expect(view.queryByText('Save phrase')).toBeNull();
  });

  it('ends gracefully, retains the confirmed recap, and completes the turn', async () => {
    const onTurnComplete = jest.fn();
    mockVoice.status = 'speaking';
    mockVoice.createRecap.mockResolvedValue({ corrections: ['Use हूँ after मैं'], practicedPhrases: ['मेरा नाम Chris है।'], progress: 'Greeting objective practiced' });
    const view = await render(<AshaLivePanel {...props({ onTurnComplete })} />);
    await act(async () => {
      mockHookOptions?.onTranscript({ eventId: 'you-2', speaker: 'you', text: 'Mera naam Chris hai.' });
      mockHookOptions?.onTranscript({ eventId: 'asha-2', speaker: 'asha', text: 'आपसे मिलकर खुशी हुई।' });
    });
    await fireEvent.press(view.getByTestId('asha-end-chat'));
    await waitFor(() => expect(mockVoice.disconnect).toHaveBeenCalledTimes(1));
    expect(view.getByText('Session recap')).toBeTruthy();
    expect(view.getByText(/Greeting objective practiced/u)).toBeTruthy();
    expect(onTurnComplete).toHaveBeenCalledWith({ language: 'hi', reply: 'आपसे मिलकर खुशी हुई।', transcript: 'Mera naam Chris hai.' });
  });
});
