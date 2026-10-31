import { act, fireEvent, render, within } from '@testing-library/react-native';

import type { AshaSessionRecord } from '../src/lib/asha-session-log';
import type { OutboxEntry } from '../src/lib/sync-outbox';
import { getScene } from '../src/data/scenes';

const mockRouterPush = jest.fn();
let mockSessions: AshaSessionRecord[] = [];
let mockOutboxEntries: OutboxEntry[] = [];
let mockFloatingStatus: 'disconnected' | 'connecting' | 'ready' = 'disconnected';
let mockFloatingAvailable = true;
const mockClearChatHistory = jest.fn(async () => true);
const mockClearSessionContent = jest.fn(async () => undefined);
const mockRetry = jest.fn(async (_id: string) => undefined);
const mockDiscard = jest.fn(async (_id: string) => undefined);
const mockShowAppAlert = jest.fn();
const mockDeliveredListeners = new Set<(entry: OutboxEntry) => void>();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockRouterPush }),
}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/lib/app-alert', () => ({ showAppAlert: (...args: unknown[]) => mockShowAppAlert(...args) }));
jest.mock('@/lib/asha-session-log-store', () => ({
  clearAshaSessionContent: () => mockClearSessionContent(),
  useAshaSessionLog: () => mockSessions,
}));
jest.mock('@/lib/sync-outbox', () => ({
  syncOutbox: {
    discard: (id: string) => mockDiscard(id),
    retry: (id: string) => mockRetry(id),
    subscribeDelivered: (listener: (entry: OutboxEntry) => void) => {
      mockDeliveredListeners.add(listener);
      return () => mockDeliveredListeners.delete(listener);
    },
  },
  useSyncOutbox: () => mockOutboxEntries,
}));
jest.mock('@/state/app-state', () => ({ useAppState: () => ({ clearChatHistory: mockClearChatHistory }) }));
jest.mock('@/state/asha-voice-session', () => ({
  useAshaVoiceSession: () => ({ available: mockFloatingAvailable, status: mockFloatingStatus }),
}));

import LastSessionScreen, { CLEAR_CHAT_CONFIRMATION } from '../src/app/last-session';

const session: AshaSessionRecord = {
  schema: 1,
  id: 'session-1',
  startedAt: '2026-10-31T10:00:00.000Z',
  connectedAt: '2026-10-31T10:00:02.000Z',
  endedAt: '2026-10-31T10:03:30.000Z',
  state: 'ended',
  endReason: 'user_ended',
  responseLanguage: 'hi',
  mode: 'lesson',
  lessonId: 'chai',
  rows: [
    { id: 'live-0', speaker: 'you', text: 'Namaste', startMs: 0, endMs: 900 },
    { id: 'live-1', speaker: 'asha', text: 'नमस्ते! आप कैसे हैं?', startMs: 1_000, endMs: 3_000 },
  ],
  learnerTurns: 1,
  savedPhrases: ['नमस्ते'],
  lessonsPracticed: ['chai'],
};

const queued: OutboxEntry = {
  kind: 'report_message',
  sessionId: 'session-1',
  payload: { message: 'नमस्ते! आप कैसे हैं?', reason: 'incorrect_or_misleading', messageId: 'live-1' },
  id: 'entry-1',
  createdAt: '2026-10-31T10:05:00.000Z',
  attempts: 1,
  nextAttemptAt: '2026-10-31T10:05:02.000Z',
  lastError: 'Waiting for a connection.',
  state: 'pending',
};

function alertAction(title: string, label: string) {
  const call = mockShowAppAlert.mock.calls.findLast(([alertTitle]) => alertTitle === title);
  return (call?.[2] as { text?: string; onPress?: () => void }[] | undefined)?.find(({ text }) => text === label);
}

describe('Last session screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessions = [];
    mockOutboxEntries = [];
    mockFloatingStatus = 'disconnected';
    mockFloatingAvailable = true;
    mockClearChatHistory.mockResolvedValue(true);
    mockClearSessionContent.mockResolvedValue(undefined);
  });

  it('explains that nothing is saved yet and offers to start voice', async () => {
    const view = await render(<LastSessionScreen />);
    expect(view.getByRole('header', { name: 'No saved sessions yet' })).toBeTruthy();
    expect(view.getByText(/saved on this device/u)).toBeTruthy();
    expect(view.getByText(/needs an internet connection/u)).toBeTruthy();
    const start = view.getByLabelText('Start a voice conversation with Asha');
    expect(start.props.accessibilityRole).toBe('button');
    await fireEvent.press(start);
    expect(mockRouterPush).toHaveBeenCalledWith('/live');
    expect(view.queryByTestId('last-session-transcript')).toBeNull();
    expect(view.queryByLabelText('Clear Asha chat history')).toBeNull();
  });

  it('lists every saved session newest first, each with its details and a read-only transcript', async () => {
    const older = { ...session, id: 'older', startedAt: '2026-10-30T10:00:00.000Z', rows: [{ id: 'old-0', speaker: 'you' as const, text: 'Yesterday', startMs: 0, endMs: 100 }] };
    const oldest = { ...older, id: 'oldest', startedAt: '2026-10-29T10:00:00.000Z', rows: [{ id: 'oldest-0', speaker: 'asha' as const, text: 'दो दिन पहले', startMs: 0, endMs: 100 }] };
    // Stored order is oldest first and may be unsorted; the list sorts by start time.
    mockSessions = [oldest, session, older];
    const view = await render(<LastSessionScreen />);
    expect(view.getByText('3 saved sessions · newest first')).toBeTruthy();
    const summaries = view.getAllByTestId('last-session-summary');
    expect(summaries).toHaveLength(3);
    const summary = summaries[0]!;
    expect(summary.props.accessibilityLabel).toMatch(/^Latest session, .+, 4 minutes, Completed, Hindi replies, lesson mode, lesson .+, 1 learner turn$/u);
    expect(summaries[1]!.props.accessibilityLabel).toMatch(/^Earlier session, /u);
    expect(summaries[2]!.props.accessibilityLabel).toMatch(/^Earlier session, /u);
    // Newest first: today's transcript, then yesterday's, then the oldest, with Devanagari kept readable.
    const transcripts = view.getAllByTestId('last-session-transcript');
    expect(transcripts.map((transcript) => transcript.props.accessibilityLabel)).toEqual(['Transcript, 2 lines, read only', 'Transcript, 1 line, read only', 'Transcript, 1 line, read only']);
    expect(within(transcripts[1]!).getByLabelText('You: Yesterday')).toBeTruthy();
    const oldestLine = within(transcripts[2]!).getByLabelText('Asha: दो दिन पहले');
    expect(oldestLine.props.accessibilityLanguage).toBe('hi-IN');
    expect(within(oldestLine).getByText('दो दिन पहले').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ fontFamily: 'Tiro Devanagari Hindi' })]));
    expect(within(summary).getByText('Hindi replies')).toBeTruthy();
    expect(within(summary).getByText('Lesson mode')).toBeTruthy();
    expect(within(summary).getByText(getScene('chai')!.title)).toBeTruthy();
    expect(within(summary).getByText('4 minutes')).toBeTruthy();
    expect(within(summary).getByText('Completed')).toBeTruthy();
    expect(view.queryByText('Interrupted')).toBeNull();

    const transcript = transcripts[0]!;
    expect(within(transcript).getByLabelText('You: Namaste')).toBeTruthy();
    const reply = within(transcript).getByLabelText('Asha: नमस्ते! आप कैसे हैं?');
    expect(reply.props.accessibilityLanguage).toBe('hi-IN');
    expect(view.getAllByText('Saved phrases: नमस्ते')).toHaveLength(3);
    expect(view.queryByTestId('last-session-empty')).toBeNull();
    expect(view.getAllByText(/Saved on this device only/u)).toHaveLength(1);
    expect(view.getAllByLabelText('Clear Asha chat history')).toHaveLength(1);
  });

  it('describes a typed chat saved when a new voice conversation started', async () => {
    mockSessions = [{
      ...session,
      id: 'typed',
      mode: undefined,
      lessonId: undefined,
      savedPhrases: [],
      lessonsPracticed: [],
      endReason: 'new_conversation',
      rows: [
        { id: 'you-1761900000000', speaker: 'you', text: 'How do I say thank you?', startMs: 0, endMs: 0 },
        { id: 'asha-1761900004000', speaker: 'asha', text: 'धन्यवाद (dhanyavaad).', startMs: 4_000, endMs: 4_000 },
      ],
    }];
    const view = await render(<LastSessionScreen />);
    expect(view.getByText('1 saved session · newest first')).toBeTruthy();
    expect(view.getByText('Completed')).toBeTruthy();
    expect(view.getByText('Typed chat')).toBeTruthy();
    expect(view.getByText('Saved when you started a new voice conversation.')).toBeTruthy();
    expect(view.getByTestId('last-session-summary').props.accessibilityLabel).toMatch(/Completed, Hindi replies, typed chat, 1 learner turn$/u);
    expect(view.getByLabelText('You: How do I say thank you?')).toBeTruthy();
    expect(view.getByLabelText('Asha: धन्यवाद (dhanyavaad).').props.accessibilityLanguage).toBe('hi-IN');
  });

  it('labels an interrupted session with why it stopped, and an active one as in progress', async () => {
    mockSessions = [{ ...session, state: 'interrupted', endReason: 'connection_lost', endedAt: undefined, responseLanguage: 'en', mode: 'beginner', lessonId: undefined, savedPhrases: [], rows: [session.rows[0]!] }];
    const view = await render(<LastSessionScreen />);
    expect(view.getByText('Interrupted')).toBeTruthy();
    expect(view.getByText('The connection dropped before the session ended.')).toBeTruthy();
    expect(view.getByText('English replies')).toBeTruthy();
    expect(view.getByText('Beginner mode')).toBeTruthy();
    expect(view.getByText('1 second')).toBeTruthy();
    expect(view.queryByText(/Saved phrases/u)).toBeNull();
    expect(view.getByLabelText('You: Namaste').props.accessibilityLanguage).toBeUndefined();

    mockSessions = [{ ...session, state: 'active', endReason: undefined, endedAt: undefined }];
    await act(async () => { view.rerender(<LastSessionScreen />); });
    expect(view.getByText('In progress')).toBeTruthy();
  });

  it.each([
    ['backgrounded', 'The session ended when you left Bolo.'],
    ['app_terminated', 'Bolo closed before the session ended.'],
    ['start_failed', 'The call could not start.'],
    ['config_changed', 'Settings changed, so the session ended.'],
  ] as const)('describes a %s end as interrupted', async (endReason, copy) => {
    mockSessions = [{ ...session, state: 'interrupted', endReason }];
    const view = await render(<LastSessionScreen />);
    expect(view.getByText(copy)).toBeTruthy();
    expect(view.getByText('Interrupted')).toBeTruthy();
  });

  it('shows only the reports associated with this session, with Retry and Discard, and never announces a delivery itself', async () => {
    mockSessions = [session];
    mockOutboxEntries = [
      queued,
      { ...queued, id: 'entry-2', state: 'failed', lastError: 'Bolo stopped retrying after too many attempts.' },
      { ...queued, id: 'unrelated', sessionId: undefined, payload: { message: 'Typed reply', reason: 'unsafe_or_inappropriate' } },
    ];
    const view = await render(<LastSessionScreen />);
    expect(view.getByRole('header', { name: 'Reports waiting to send' })).toBeTruthy();
    expect(view.getAllByTestId('queued-report-row')).toHaveLength(2);
    // A report without a session stays on the Asha screen; it belongs to no card here.
    expect(view.queryByText(/Typed reply/u)).toBeNull();
    expect(view.getByText(/Waiting to send\./u)).toBeTruthy();
    expect(view.getByText(/Couldn’t send\. Bolo stopped retrying/u)).toBeTruthy();
    await fireEvent.press(view.getByLabelText(/^Retry report:/u));
    expect(mockRetry).toHaveBeenCalledWith('entry-2');
    const discards = view.getAllByLabelText(/^Discard report:/u);
    await fireEvent.press(discards[1]!);
    expect(mockDiscard).toHaveBeenCalledWith('entry-2');

    // Entries that vanish without a delivery (discard, consent withdrawal, Delete Bolo data) are not "received".
    mockOutboxEntries = [mockOutboxEntries[2]!];
    await act(async () => { view.rerender(<LastSessionScreen />); });
    expect(mockShowAppAlert).not.toHaveBeenCalledWith('Report received', expect.anything());
    // The provider announces a delivery once for the whole app; this screen, which can overlay
    // Asha, must not repeat it.
    await act(async () => {
      mockDeliveredListeners.forEach((listener) => listener(queued));
    });
    expect(mockShowAppAlert).not.toHaveBeenCalledWith('Report received', expect.anything());
    await view.unmount();
    expect(mockDeliveredListeners.size).toBe(0);
  });

  it('shows a cleared session as metadata only while keeping its report retries', async () => {
    mockSessions = [{ ...session, rows: [], savedPhrases: [], lessonsPracticed: [], contentClearedAt: '2026-10-31T11:00:00.000Z' }];
    mockOutboxEntries = [queued];
    const view = await render(<LastSessionScreen />);
    expect(view.getByRole('header', { name: 'Transcript cleared' })).toBeTruthy();
    expect(view.queryByTestId('last-session-transcript')).toBeNull();
    expect(view.queryByLabelText('You: Namaste')).toBeNull();
    expect(view.queryByText(/Saved phrases/u)).toBeNull();
    expect(view.getByTestId('last-session-summary').props.accessibilityLabel).toMatch(/transcript cleared$/u);
    expect(view.getByText('Completed')).toBeTruthy();
    expect(view.getAllByTestId('queued-report-row')).toHaveLength(1);
    expect(view.queryByTestId('last-session-empty')).toBeNull();
  });

  it('clears all saved chat only after confirmation that discloses pending reports, and reports a failure', async () => {
    mockSessions = [session];
    const view = await render(<LastSessionScreen />);
    const clear = view.getByLabelText('Clear Asha chat history');
    expect(clear.props.accessibilityRole).toBe('button');
    expect(clear.props.accessibilityState).toEqual({ disabled: false });
    await fireEvent.press(clear);
    expect(mockShowAppAlert).toHaveBeenLastCalledWith('Clear Asha chat?', CLEAR_CHAT_CONFIRMATION, expect.any(Array));
    expect(CLEAR_CHAT_CONFIRMATION).toMatch(/Pending reports will still be sent under your existing AI consent/u);
    expect(alertAction('Clear Asha chat?', 'Cancel')).toMatchObject({ style: 'cancel' });
    expect(mockClearSessionContent).not.toHaveBeenCalled();

    await act(async () => {
      alertAction('Clear Asha chat?', 'Clear chat')?.onPress?.();
      await Promise.resolve();
    });
    expect(mockClearChatHistory).toHaveBeenCalledTimes(1);
    expect(mockClearSessionContent).toHaveBeenCalledTimes(1);
    expect(view.queryByRole('alert')).toBeNull();

    mockClearSessionContent.mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.press(view.getByLabelText('Clear Asha chat history'));
    await act(async () => {
      alertAction('Clear Asha chat?', 'Clear chat')?.onPress?.();
      await Promise.resolve();
    });
    expect(view.getByRole('alert').props.children).toBe('The chat could not be cleared. Please try again.');
  });

  it('disables Clear during a live call and returns to the empty state after Delete Bolo data', async () => {
    mockSessions = [session];
    mockFloatingStatus = 'ready';
    const view = await render(<LastSessionScreen />);
    const clear = view.getByLabelText('Clear Asha chat history');
    expect(clear.props.accessibilityState).toEqual({ disabled: true });
    expect(clear.props.accessibilityHint).toMatch(/End the live voice session/u);
    await fireEvent.press(clear);
    expect(mockShowAppAlert).not.toHaveBeenCalled();

    mockSessions = [];
    await act(async () => { view.rerender(<LastSessionScreen />); });
    expect(view.getByTestId('last-session-empty')).toBeTruthy();
  });
});
