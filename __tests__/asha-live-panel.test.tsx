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

let mockHookOptions: { onTranscript: (fragment: {
  eventId: string;
  speaker: 'you' | 'asha';
  text: string;
  startMs?: number;
  endMs?: number;
}) => void; mode: string } | undefined;

jest.mock('@/hooks/use-asha-live-conversation', () => ({
  useAshaLiveConversation: (options: typeof mockHookOptions) => {
    mockHookOptions = options;
    return mockVoice;
  },
}));

import { AshaLivePanel } from '../src/components/asha-live-panel';

const context = {
  learnerLevel: 'beginner',
  activeLesson: { id: 'lesson-greetings', title: 'Greetings', objective: 'Introduce yourself' },
};

function props(overrides: Partial<React.ComponentProps<typeof AshaLivePanel>> = {}) {
  return {
    clientId: 'client-12345678',
    context,
    onError: jest.fn(),
    ...overrides,
  };
}

describe('AshaLivePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVoice.backendLoading = false;
    mockVoice.muted = false;
    mockVoice.status = 'disconnected';
    mockVoice.createRecap.mockResolvedValue(null);
    mockHookOptions = undefined;
  });

  it('selects a mode and starts the secure voice session', async () => {
    const onStatusChange = jest.fn();
    const view = await render(<AshaLivePanel {...props({ onStatusChange })} />);

    expect(view.getByText('Ready to start')).toBeTruthy();
    expect(onStatusChange).toHaveBeenLastCalledWith('disconnected');
    await fireEvent.press(view.getByText('Lesson'));
    expect(mockHookOptions?.mode).toBe('lesson');
    await fireEvent.press(view.getByTestId('asha-start-conversation'));
    expect(mockVoice.connect).toHaveBeenCalledTimes(1);
  });

  it('does not start a session while consent keeps the panel disabled', async () => {
    const view = await render(<AshaLivePanel {...props({ disabled: true })} />);
    const start = view.getByTestId('asha-start-conversation');

    expect(start.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(start);
    expect(mockVoice.connect).not.toHaveBeenCalled();
  });

  it('surfaces connection failures through the existing error boundary', async () => {
    const onError = jest.fn();
    mockVoice.connect.mockRejectedValueOnce(new Error('Secure session unavailable'));
    const view = await render(<AshaLivePanel {...props({ onError })} />);

    await fireEvent.press(view.getByTestId('asha-start-conversation'));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Secure session unavailable'));
  });

  it('shows live state, preserves transcript text, and exposes conversation controls', async () => {
    const onError = jest.fn();
    const onSavePhraseRequest = jest.fn();
    const onTranscriptChange = jest.fn();
    mockVoice.status = 'thinking';
    mockVoice.backendLoading = true;
    const view = await render(<AshaLivePanel {...props({ onError, onSavePhraseRequest, onTranscriptChange })} />);

    expect(view.getByText('Checking lesson information…')).toBeTruthy();
    expect(view.getByText('Lesson tools loading')).toBeTruthy();
    await fireEvent.press(view.getByText('Save Phrase'));
    expect(onError).toHaveBeenCalledWith('Wait for an Asha phrase before saving.');

    await act(async () => {
      mockHookOptions?.onTranscript({ eventId: 'you-1', speaker: 'you', text: 'Mera naaam?', startMs: 1, endMs: 2 });
      mockHookOptions?.onTranscript({ eventId: 'asha-1', speaker: 'asha', text: 'आपका नाम क्या है?', startMs: 3, endMs: 4 });
      await Promise.resolve();
    });
    expect(view.getByText('Mera naaam?')).toBeTruthy();
    expect(view.getByText('आपका नाम क्या है?')).toBeTruthy();
    expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'you', text: 'Mera naaam?' });

    await fireEvent.press(view.getByText('Save Phrase'));
    expect(onSavePhraseRequest).toHaveBeenCalledWith('आपका नाम क्या है?');
    await fireEvent.press(view.getByTestId('asha-mute'));
    await fireEvent.press(view.getByTestId('asha-interrupt'));
    await fireEvent.press(view.getByText('Hear Again'));
    await fireEvent.press(view.getByText('Speak Slower'));
    await fireEvent.press(view.getByText('Explain'));
    expect(mockVoice.toggleMute).toHaveBeenCalledTimes(1);
    expect(mockVoice.interrupt).toHaveBeenCalledTimes(1);
    expect(mockVoice.sendGuidance).toHaveBeenCalledTimes(3);

    await fireEvent.press(view.getByText('Show English meaning'));
    expect(view.getByText(/Short English meanings/u)).toBeTruthy();
    expect(mockVoice.sendGuidance).toHaveBeenLastCalledWith(expect.stringContaining('English meaning'));
    await fireEvent.press(view.getByText('Hide Romanization'));
    expect(view.getByText('Show Romanization')).toBeTruthy();

    await fireEvent.press(view.getByText('Delete transcript'));
    expect(view.queryByText('Mera naaam?')).toBeNull();
    expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'you', text: '' });
    expect(onTranscriptChange).toHaveBeenCalledWith({ speaker: 'asha', text: '' });
  });

  it('gracefully ends, retains confirmed recap data, and completes the turn', async () => {
    const onTurnComplete = jest.fn();
    mockVoice.status = 'speaking';
    mockVoice.createRecap.mockResolvedValue({
      corrections: ['Use हूँ after मैं'],
      practicedPhrases: ['मेरा नाम Chris है।'],
      progress: 'Greeting objective practiced',
    });
    const view = await render(<AshaLivePanel {...props({ onTurnComplete })} />);
    await act(async () => {
      mockHookOptions?.onTranscript({ eventId: 'you-2', speaker: 'you', text: 'Mera naam Chris hai.' });
      mockHookOptions?.onTranscript({ eventId: 'asha-2', speaker: 'asha', text: 'आपसे मिलकर खुशी हुई।' });
      await Promise.resolve();
    });

    await fireEvent.press(view.getByTestId('asha-end-chat'));
    await waitFor(() => expect(mockVoice.disconnect).toHaveBeenCalledTimes(1));
    expect(mockVoice.createRecap).toHaveBeenCalledTimes(1);
    expect(view.getByText('Session recap')).toBeTruthy();
    expect(view.getByText(/Greeting objective practiced/u)).toBeTruthy();
    expect(onTurnComplete).toHaveBeenCalledWith({
      language: 'hi',
      reply: 'आपसे मिलकर खुशी हुई।',
      transcript: 'Mera naam Chris hai.',
    });
  });

  it('falls back to a local recap when the backend result is unavailable', async () => {
    mockVoice.status = 'listening';
    const view = await render(<AshaLivePanel {...props()} />);
    await act(async () => {
      mockHookOptions?.onTranscript({ eventId: 'you-3', speaker: 'you', text: 'Namaste' });
      await Promise.resolve();
    });

    await fireEvent.press(view.getByTestId('asha-end-chat'));
    await waitFor(() => expect(view.getByText(/recap unavailable/u)).toBeTruthy());
    expect(view.getAllByText(/Namaste/u)).toHaveLength(2);
  });
});
