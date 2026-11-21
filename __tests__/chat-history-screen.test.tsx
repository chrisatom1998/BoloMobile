import { act, fireEvent, render } from '@testing-library/react-native';

import { createAshaChatRecord, type AshaChatRecord } from '../src/lib/asha-chat-archive';
import type { ChatMessage } from '../src/state/app-state-types';

const mockRouter = { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn() };
let mockParams: { chatId?: string } = {};
let mockChats: AshaChatRecord[] = [];
let mockChatHistory: ChatMessage[] = [];
let mockAiConsent = true;
let mockFloatingStatus: 'disconnected' | 'ready' = 'disconnected';
const mockClearChatHistory = jest.fn(async () => true);
const mockAppendChatMessages = jest.fn();
const mockArchive = jest.fn(async (_messages: unknown) => true);
const mockRemove = jest.fn(async (_id: string) => undefined);
const mockShowAppAlert = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/lib/app-alert', () => ({ showAppAlert: (...args: unknown[]) => mockShowAppAlert(...args) }));
jest.mock('@/lib/asha-chat-archive-store', () => ({
  archiveAshaChat: (messages: unknown) => mockArchive(messages),
  removeAshaChat: (id: string) => mockRemove(id),
  useAshaChats: () => mockChats,
}));
jest.mock('@/state/app-state', () => ({
  useAppState: () => ({
    aiConsent: mockAiConsent,
    appendChatMessages: mockAppendChatMessages,
    chatHistory: mockChatHistory,
    clearChatHistory: mockClearChatHistory,
  }),
}));
jest.mock('@/state/asha-voice-session', () => ({
  useAshaVoiceSession: () => ({ available: true, status: mockFloatingStatus }),
}));

import ChatHistoryScreen from '../src/app/chat-history';

const base = Date.parse('2026-11-20T18:00:00.000Z');
const typedChat = createAshaChatRecord([
  { id: `you-${base}`, role: 'you', text: 'How do I say thank you?' },
  { id: `asha-${base}`, role: 'asha', text: 'Say dhanyavaad.', language: 'en' },
]) as AshaChatRecord;
const voiceChat = createAshaChatRecord([
  { id: `live-${base + 3_600_000}-1-0`, role: 'asha', text: 'नमस्ते! आप कैसे हैं?', language: 'hi' },
  { id: `live-${base + 3_600_000}-1-1`, role: 'you', text: 'Main theek hoon' },
]) as AshaChatRecord;
const currentChat: ChatMessage[] = [{ id: `you-${base + 7_200_000}`, role: 'you', text: 'What is chai?' }];

function alertAction(text: string) {
  const buttons = mockShowAppAlert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[] | undefined;
  return buttons?.find((button) => button.text === text);
}

describe('Chat history screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockChats = [voiceChat, typedChat];
    mockChatHistory = [];
    mockAiConsent = true;
    mockFloatingStatus = 'disconnected';
  });

  it('explains itself when nothing is saved yet', async () => {
    mockChats = [];
    const view = await render(<ChatHistoryScreen />);
    expect(view.getByTestId('chat-history-empty')).toBeTruthy();
    expect(view.getByText('No past chats yet')).toBeTruthy();
    expect(view.queryByTestId('chat-history-list')).toBeNull();
    expect(view.getByText(/Saved on this device only\. Nothing is uploaded\. Bolo keeps your 30 most recent chats\./u)).toBeTruthy();
  });

  it('lists past chats newest first with a title, preview, and kind, and opens the one tapped', async () => {
    const view = await render(<ChatHistoryScreen />);
    const rows = view.getAllByTestId('chat-history-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.props.accessibilityLabel).toMatch(/^Voice call: Main theek hoon\. .+ · 2 messages$/u);
    expect(rows[1]?.props.accessibilityLabel).toMatch(/^Typed chat: How do I say thank you\?\. .+ · 2 messages$/u);
    expect(view.getByText('Say dhanyavaad.')).toBeTruthy();
    expect(view.queryByTestId('chat-history-current')).toBeNull();

    await fireEvent.press(rows[1]!);
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/chat-history', params: { chatId: typedChat.id } });
  });

  it('shows the chat that is open now and goes back to it', async () => {
    mockChatHistory = currentChat;
    const view = await render(<ChatHistoryScreen />);
    const current = view.getByTestId('chat-history-current');
    expect(current.props.accessibilityLabel).toBe('Current chat, 1 message');
    expect(view.getByText('What is chai?')).toBeTruthy();
    await fireEvent.press(current);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('links to the last voice call details', async () => {
    const view = await render(<ChatHistoryScreen />);
    await fireEvent.press(view.getByText('Last voice call details'));
    expect(mockRouter.push).toHaveBeenCalledWith('/last-session');
  });

  it('shows a past chat read-only, with Hindi lines marked as Hindi', async () => {
    mockParams = { chatId: voiceChat.id };
    const view = await render(<ChatHistoryScreen />);
    expect(view.getByTestId('chat-history-summary').props.accessibilityLabel).toMatch(/^Voice call, .+, 2 messages$/u);
    expect(view.getByTestId('chat-history-transcript').props.accessibilityLabel).toBe('Transcript, 2 lines, read only');
    expect(view.getByLabelText('Asha: नमस्ते! आप कैसे हैं?').props.accessibilityLanguage).toBe('hi-IN');
    expect(view.getByLabelText('You: Main theek hoon')).toBeTruthy();
  });

  it('continues a past chat: saves the open chat, swaps in the old one, and returns to Asha', async () => {
    mockParams = { chatId: typedChat.id };
    mockChatHistory = currentChat;
    const view = await render(<ChatHistoryScreen />);
    await act(async () => {
      fireEvent.press(view.getByTestId('chat-history-continue'));
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(mockArchive).toHaveBeenCalledWith(currentChat);
    expect(mockClearChatHistory).toHaveBeenCalledTimes(1);
    expect(mockAppendChatMessages).toHaveBeenCalledWith(typedChat.messages);
    expect(mockRemove).toHaveBeenCalledWith(typedChat.id);
    expect(mockArchive.mock.invocationCallOrder[0]).toBeLessThan(mockClearChatHistory.mock.invocationCallOrder[0] ?? 0);
    expect(mockClearChatHistory.mock.invocationCallOrder[0]).toBeLessThan(mockAppendChatMessages.mock.invocationCallOrder[0] ?? 0);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/live');
  });

  it('keeps the past chat when the open chat cannot be cleared', async () => {
    mockParams = { chatId: typedChat.id };
    mockChatHistory = currentChat;
    mockClearChatHistory.mockResolvedValueOnce(false);
    const view = await render(<ChatHistoryScreen />);
    await act(async () => {
      fireEvent.press(view.getByTestId('chat-history-continue'));
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(mockAppendChatMessages).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(view.getByRole('alert').props.children).toBe('This chat could not be opened. Please try again.');
  });

  it('does not overwrite the open chat with an older copy of itself', async () => {
    mockParams = { chatId: typedChat.id };
    mockChatHistory = [...typedChat.messages, { id: `you-${base + 5_000}`, role: 'you', text: 'A newer line' }];
    const view = await render(<ChatHistoryScreen />);
    await act(async () => {
      fireEvent.press(view.getByTestId('chat-history-continue'));
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(mockArchive).not.toHaveBeenCalled();
    expect(mockClearChatHistory).not.toHaveBeenCalled();
    expect(mockAppendChatMessages).not.toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalledWith(typedChat.id);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/live');
  });

  it.each([
    ['during a voice call', () => { mockFloatingStatus = 'ready'; }, 'End your voice call to continue this chat.'],
    ['without AI consent', () => { mockAiConsent = false; }, 'Turn on Asha in the Asha tab to continue this chat. You can still read it here.'],
  ])('cannot continue a chat %s, but can still read it', async (_name, arrange, note) => {
    arrange();
    mockParams = { chatId: typedChat.id };
    const view = await render(<ChatHistoryScreen />);
    const button = view.getByTestId('chat-history-continue');
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    expect(view.getByText(note)).toBeTruthy();
    await fireEvent.press(button);
    expect(mockClearChatHistory).not.toHaveBeenCalled();
    expect(view.getByLabelText('You: How do I say thank you?')).toBeTruthy();
  });

  it('deletes one chat only after confirmation', async () => {
    mockParams = { chatId: typedChat.id };
    const view = await render(<ChatHistoryScreen />);
    await fireEvent.press(view.getByLabelText('Delete this chat'));
    expect(mockShowAppAlert).toHaveBeenLastCalledWith('Delete this chat?', expect.stringMatching(/removed from this device/u), expect.any(Array));
    expect(alertAction('Cancel')).toMatchObject({ style: 'cancel' });
    expect(mockRemove).not.toHaveBeenCalled();
    await act(async () => {
      alertAction('Delete chat')?.onPress?.();
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
    });
    expect(mockRemove).toHaveBeenCalledWith(typedChat.id);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockClearChatHistory).not.toHaveBeenCalled();
  });

  it('says so when the chat is gone', async () => {
    mockParams = { chatId: 'you-1' };
    const view = await render(<ChatHistoryScreen />);
    expect(view.getByTestId('chat-history-missing')).toBeTruthy();
    await fireEvent.press(view.getByText('Back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
