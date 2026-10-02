import { act, fireEvent, render } from '@testing-library/react-native';
import * as mockReact from 'react';
import { Alert, AppState, Text } from 'react-native';

import LiveScreen from '../src/app/(tabs)/live';
import SettingsScreen from '../src/app/settings';
import { clearAiVoicePlaybackCache } from '../src/lib/ai-voice-player';
import { speakText, stopSpeaking } from '../src/lib/speech';
import { createAiConsentRecord, storageKeys } from '../src/lib/storage';
import { AppStateProvider, useAppState } from '../src/state/app-state';

let mockFocused = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => mockReact.useEffect(() => mockFocused ? effect() : undefined, [effect, mockFocused]),
}));
jest.mock('lucide-react-native', () => Object.fromEntries(['Activity', 'Bell', 'ChevronRight', 'DatabaseBackup', 'ExternalLink', 'FileText', 'Languages', 'LifeBuoy', 'LockKeyhole', 'ShieldCheck', 'Sparkles', 'Trash2', 'ArrowDown', 'BookmarkPlus', 'Flag', 'MessageCircle', 'Mic', 'MicOff', 'Send', 'Sprout', 'Volume2', 'X', 'Check', 'CircleCheck', 'VolumeX'].map(name => [name, () => null])));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock('react-native-webrtc', () => ({ mediaDevices: {}, RTCPeerConnection: jest.fn() }));
jest.mock('expo-notifications', () => ({ cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined) }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    uri: string;
    exists = true;
    constructor(...parts: string[]) { this.uri = parts.join('/'); }
    write() {}
    delete() { this.exists = false; }
  },
}));
const mockNativePlay = jest.fn();
const mockNativePause = jest.fn();
jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
  createAudioPlayer: jest.fn(() => {
    let listener: (status: object) => void;
    return {
      addListener: (_event: string, callback: typeof listener) => { listener = callback; return { remove: jest.fn() }; },
      play: () => { mockNativePlay(); listener({ didJustFinish: true }); },
      pause: mockNativePause,
      release: jest.fn(),
      seekTo: jest.fn(async () => undefined),
      setPlaybackRate: jest.fn(),
    };
  }),
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return { __esModule: true, default: {
    __store: store,
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null])),
    multiSet: jest.fn(async (entries: [string, string][]) => { entries.forEach(([key, value]) => store.set(key, value)); }),
    setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
    removeItem: jest.fn(async (key: string) => { store.delete(key); }),
  }};
});
jest.mock('@/services/bolo-api', () => ({
  AI_VOICE_TEXT_LIMIT: 240,
  sendMobileChat: jest.fn(),
  deleteMobileData: jest.fn(async () => ({ deleted: true })),
  requestAiVoiceAudio: jest.fn(async () => ({ audioBase64: 'SUQzBAAAAAA=', mimeType: 'audio/mpeg' })),
}));

const api = jest.requireMock('@/services/bolo-api') as { sendMobileChat: jest.Mock; deleteMobileData: jest.Mock; requestAiVoiceAudio: jest.Mock };
const storage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>; multiSet: jest.Mock; setItem: jest.Mock;
};
let currentState: ReturnType<typeof useAppState>;
function Stack({ settings }: { settings: boolean }) {
  currentState = useAppState();
  if (!currentState.hydrated) return null;
  return <><Text testID="state">{JSON.stringify(currentState)}</Text><LiveScreen />{settings ? <SettingsScreen /> : null}</>;
}
function stack(settings = false) { return <AppStateProvider><Stack settings={settings} /></AppStateProvider>; }
type View = Awaited<ReturnType<typeof render>>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
async function flush() { await act(async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); }); }
async function send(view: View, text = 'A pending typed question') {
  await fireEvent.changeText(view.getByLabelText('Message Asha'), text);
  await fireEvent.press(view.getByLabelText('Send message'));
}
async function changeFocus(view: View, focused: boolean) { mockFocused = focused; await view.rerender(stack()); }
async function confirmSettings(view: View, action: 'withdraw' | 'delete') {
  await view.rerender(stack(true));
  await fireEvent.press(view.getByText(action === 'withdraw' ? 'Withdraw consent' : 'Delete my Bolo data'));
  const title = action === 'withdraw' ? 'Withdraw AI processing consent?' : 'Delete your Bolo data?';
  const text = action === 'withdraw' ? 'Withdraw' : 'Delete data';
  const buttons = jest.mocked(Alert.alert).mock.calls.findLast(call => call[0] === title)?.[2];
  const button = buttons?.find(candidate => candidate.text === text);
  expect(button?.onPress).toBeDefined();
  await act(async () => { button!.onPress!(); });
  await flush();
}
function expectNoLateEffects(view?: View) {
  expect(currentState.chatHistory).toEqual([]);
  expect(currentState.practice.liveDone).toBe(false);
  expect(JSON.parse(storage.__store.get(storageKeys.chatHistory) ?? '[]')).toEqual([]);
  expect(api.requestAiVoiceAudio).not.toHaveBeenCalled();
  expect(mockNativePlay).not.toHaveBeenCalled();
  if (view) expect(view.queryByText('Late request failed')).toBeNull();
}

describe('typed reply privacy and lifecycle with real Settings, provider and speech', () => {
  let appStateHandlers: Set<(state: string) => void>;
  beforeEach(() => {
    jest.clearAllMocks();
    api.sendMobileChat.mockReset();
    api.requestAiVoiceAudio.mockReset().mockImplementation(async () => ({ audioBase64: 'SUQzBAAAAAA=', mimeType: 'audio/mpeg' }));
    storage.setItem.mockReset().mockImplementation(async (key: string, value: string) => { storage.__store.set(key, value); });
    storage.multiSet.mockReset().mockImplementation(async (entries: [string, string][]) => { entries.forEach(([key, value]) => storage.__store.set(key, value)); });
    storage.__store.clear();
    storage.__store.set(storageKeys.aiConsent, JSON.stringify(createAiConsentRecord()));
    storage.__store.set(storageKeys.clientId, 'client-old-12345');
    storage.__store.set(storageKeys.motionPreference, 'reduced');
    mockFocused = true;
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    appStateHandlers = new Set();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      const callback = handler as (state: string) => void;
      appStateHandlers.add(callback);
      return { remove: () => appStateHandlers.delete(callback) };
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => { void stopSpeaking(); clearAiVoicePlaybackCache(); });
  async function changeAppState(state: 'active' | 'background' | 'inactive') {
    await act(async () => {
      Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
      appStateHandlers.forEach(handler => handler(state));
    });
  }

  it.each(['blur', 'background', 'unmount'] as const)('cancels on %s and ignores a late success after returning', async boundary => {
    const pending = deferred<{ reply: string; language: 'en' }>();
    api.sendMobileChat.mockReturnValueOnce(pending.promise);
    const view = await render(stack()); await flush(); await send(view);
    const signal = api.sendMobileChat.mock.calls[0][1] as AbortSignal;
    if (boundary === 'blur') { await changeFocus(view, false); await changeFocus(view, true); }
    else if (boundary === 'unmount') await view.unmount();
    else { await changeAppState(boundary); await changeAppState('active'); }
    expect(signal.aborted).toBe(true);
    if (boundary !== 'unmount') expect(view.getByLabelText('Message Asha').props.editable).toBe(true);
    await act(async () => pending.resolve({ reply: `Late reply after ${boundary}`, language: 'en' })); await flush();
    expectNoLateEffects();
    if (boundary !== 'unmount') await view.unmount();
  });

  it('keeps an in-flight typed reply valid through a transient inactive overlay', async () => {
    const pending = deferred<{ reply: string; language: 'en' }>();
    api.sendMobileChat.mockReturnValueOnce(pending.promise);
    const view = await render(stack()); await flush(); await send(view, 'Continue this question');
    const signal = api.sendMobileChat.mock.calls[0][1] as AbortSignal;
    await changeAppState('inactive');
    expect(signal.aborted).toBe(false);
    await act(async () => pending.resolve({ reply: 'A reply during an inactive overlay.', language: 'en' })); await flush();
    expect(currentState.chatHistory.map(row => row.text)).toEqual(['Continue this question', 'A reply during an inactive overlay.']);
    await changeAppState('active');
    expect(view.getByLabelText('Message Asha').props.editable).toBe(true);
    expect(mockNativePlay).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it.each(['withdraw', 'delete'] as const)('cancels at Settings %s while privacy storage is held, without a blur', async action => {
    const pending = deferred<{ reply: string; language: 'en' }>();
    const saving = deferred<void>();
    api.sendMobileChat.mockReturnValueOnce(pending.promise);
    const view = await render(stack()); await flush(); await send(view);
    const oldClientId = currentState.clientId;
    const signal = api.sendMobileChat.mock.calls[0][1] as AbortSignal;
    if (action === 'withdraw') storage.setItem.mockImplementationOnce(async (key: string, value: string) => { await saving.promise; storage.__store.set(key, value); });
    else storage.multiSet.mockImplementationOnce(async (entries: [string, string][]) => { await saving.promise; entries.forEach(([key, value]) => storage.__store.set(key, value)); });
    await confirmSettings(view, action);
    expect(currentState.aiConsent).toBe(true); // Persisted privacy choice has not changed yet.
    expect(signal.aborted).toBe(true);
    expect(view.getByLabelText('Message Asha').props.editable).toBe(true);
    await send(view, 'Must not send while privacy write is pending');
    expect(api.sendMobileChat).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ reply: `Late ${action} response`, language: 'en' })); await flush();
    expectNoLateEffects();
    await act(async () => saving.resolve()); await flush();
    expect(currentState.aiConsent).toBe(false);
    if (action === 'delete') expect(currentState.clientId).not.toBe(oldClientId);
    await act(async () => { await currentState.setAiConsent(true); });
    api.sendMobileChat.mockResolvedValueOnce({ reply: `New ${action} response`, language: 'en' });
    await send(view, 'Newly authorized question'); await flush();
    expect(currentState.chatHistory.map(row => row.text)).toEqual(['Newly authorized question', `New ${action} response`]);
    expect(mockNativePlay).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it.each(['blur', 'withdraw', 'delete'].flatMap(boundary => ['resolve', 'reject'].map(outcome => ({ boundary, outcome }))))('keeps request B pending when A later $outcome after $boundary', async ({ boundary, outcome }) => {
    const a = deferred<{ reply: string; language: 'en' }>();
    const b = deferred<{ reply: string; language: 'en' }>();
    api.sendMobileChat.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const view = await render(stack()); await flush(); await send(view, 'Question A');
    if (boundary === 'blur') { await changeFocus(view, false); await changeFocus(view, true); }
    else {
      await confirmSettings(view, boundary as 'withdraw' | 'delete');
      await act(async () => { await currentState.setAiConsent(true); });
    }
    await send(view, 'Question B');
    expect(api.sendMobileChat).toHaveBeenCalledTimes(2);
    await act(async () => { if (outcome === 'resolve') a.resolve({ reply: 'Stale answer A', language: 'en' }); else a.reject(new Error('Late request failed')); }); await flush();
    expect(view.getByLabelText('Message Asha').props.editable).toBe(false);
    expect(view.getByLabelText('Selectable chat text: Question B')).toBeTruthy();
    expectNoLateEffects(view);
    await act(async () => b.resolve({ reply: `Current answer B ${boundary} ${outcome}`, language: 'en' })); await flush();
    expect(currentState.chatHistory.map(row => row.text)).toEqual(['Question B', `Current answer B ${boundary} ${outcome}`]);
    expect(mockNativePlay).toHaveBeenCalledTimes(1);
    expect(view.getByLabelText('Message Asha').props.editable).toBe(true);
    await view.unmount();
  });

  it.each(['blur', 'background'] as const)('rejects a stale submit callback after %s', async boundary => {
    const view = await render(stack()); await flush();
    await fireEvent.changeText(view.getByLabelText('Message Asha'), 'Stale submit');
    const submit = view.getByLabelText('Message Asha').props.onSubmitEditing as () => void;
    if (boundary === 'blur') await changeFocus(view, false);
    else await changeAppState('background');
    await act(async () => submit());
    expect(api.sendMobileChat).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('rejects typed handles without consent or for a deleted identity', async () => {
    const view = await render(stack()); await flush();
    const oldClientId = currentState.clientId;
    expect(currentState.beginTypedReply('obsolete-client')).toBeNull();
    await act(async () => { await currentState.clearAllData(); });
    expect(currentState.beginTypedReply(currentState.clientId)).toBeNull();
    await act(async () => { await currentState.setAiConsent(true); });
    expect(currentState.beginTypedReply(oldClientId)).toBeNull();
    const handle = currentState.beginTypedReply(currentState.clientId);
    expect(handle).not.toBeNull();
    handle!.release();
    const canceled = currentState.beginTypedReply(currentState.clientId)!;
    const abort = jest.spyOn(canceled.controller, 'abort');
    canceled.controller.abort();
    await act(async () => { await currentState.setAiConsent(false); });
    expect(handle!.controller.signal.aborted).toBe(false); // Released work has no registry owner.
    expect(abort).toHaveBeenCalledTimes(1); // Aborted work releases even without settlement.
    await view.unmount();
  });

  it('persists and speaks a valid completed turn, keeping practice on ordinary blur', async () => {
    api.sendMobileChat.mockResolvedValueOnce({ reply: 'An ordinary authorized reply.', language: 'en' });
    const view = await render(stack()); await flush(); await send(view, 'A valid question'); await flush();
    expect(currentState.chatHistory.map(row => row.text)).toEqual(['A valid question', 'An ordinary authorized reply.']);
    expect(JSON.parse(storage.__store.get(storageKeys.chatHistory) ?? '[]')).toHaveLength(2);
    expect(mockNativePlay).toHaveBeenCalledTimes(1);
    expect(currentState.practice.liveDone).toBe(true);
    await changeFocus(view, false); await flush();
    expect(currentState.practice.seconds).toBeGreaterThan(0);
    await view.unmount();
  });

  it.each(['withdraw', 'delete'] as const)('recovers after a failed %s persistence without reviving the canceled request', async action => {
    const pending = deferred<{ reply: string; language: 'en' }>();
    api.sendMobileChat.mockReturnValueOnce(pending.promise);
    const view = await render(stack()); await flush(); await send(view);
    const signal = api.sendMobileChat.mock.calls[0][1] as AbortSignal;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    if (action === 'withdraw') storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    else storage.multiSet.mockRejectedValueOnce(new Error('disk full'));
    await confirmSettings(view, action);
    expect(signal.aborted).toBe(true);
    expect(currentState.aiConsent).toBe(true);
    expect(currentState.clientId).toBe('client-old-12345');
    await act(async () => pending.reject(new Error('Late request failed'))); await flush();
    expectNoLateEffects(view);
    api.sendMobileChat.mockResolvedValueOnce({ reply: `Recovered ${action} answer`, language: 'en' });
    await send(view, 'Try again'); await flush();
    expect(currentState.chatHistory.map(row => row.text)).toEqual(['Try again', `Recovered ${action} answer`]);
    await view.unmount();
  });

  it.each(['blur', 'background', 'withdraw', 'delete'] as const)('aborts pending TTS on %s without later chunks, playback, or cached canceled audio', async boundary => {
    const pendingAudio = deferred<{ audioBase64: string; mimeType: 'audio/mpeg' }>();
    const reply = `A uniquely ${boundary} canceled answer has many words. `.repeat(18);
    api.sendMobileChat.mockResolvedValueOnce({ reply, language: 'en' });
    api.requestAiVoiceAudio.mockImplementationOnce(() => pendingAudio.promise).mockImplementationOnce(() => pendingAudio.promise);
    const view = await render(stack()); await flush(); await send(view); await flush();
    expect(currentState.practice.liveDone).toBe(true);
    const started = api.requestAiVoiceAudio.mock.calls.map(call => ({ text: call[0] as string, signal: call[1] as AbortSignal }));
    expect(started).toHaveLength(2);
    expect(started.every(call => call.signal instanceof AbortSignal)).toBe(true);
    if (boundary === 'blur') await changeFocus(view, false);
    else if (boundary === 'background') await changeAppState('background');
    else await confirmSettings(view, boundary);
    expect(started.every(call => call.signal.aborted)).toBe(true);
    await act(async () => pendingAudio.resolve({ audioBase64: 'SUQzBAAAAAA=', mimeType: 'audio/mpeg' })); await flush();
    expect(api.requestAiVoiceAudio).toHaveBeenCalledTimes(2);
    expect(mockNativePlay).not.toHaveBeenCalled();
    await changeAppState('background'); await changeFocus(view, false); await flush();
    if (boundary === 'delete') {
      expect(currentState.practice.liveDone).toBe(false);
      expect(currentState.practice.seconds).toBe(0);
    }
    await changeAppState('active'); await changeFocus(view, true);
    // A fresh authorized request for the exact same text must fetch anew.
    await act(async () => { await currentState.setAiConsent(true); await speakText(started[0]!.text); });
    expect(api.requestAiVoiceAudio).toHaveBeenCalledTimes(3);
    await view.unmount();
  });
  it('prevents same-tick background checkpoints after a completed deletion before React commits', async () => {
    const pendingAudio = deferred<{ audioBase64: string; mimeType: 'audio/mpeg' }>();
    api.sendMobileChat.mockResolvedValueOnce({ reply: 'An old-identity reply before same-tick deletion.', language: 'en' });
    api.requestAiVoiceAudio.mockReturnValueOnce(pendingAudio.promise);
    const view = await render(stack()); await flush(); await send(view); await flush();
    expect(currentState.practice.liveDone).toBe(true);
    await act(async () => {
      await currentState.clearAllData();
      Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
      appStateHandlers.forEach(handler => handler('background'));
    });
    await flush();
    expect(currentState.practice.seconds).toBe(0);
    expect(JSON.parse(storage.__store.get(storageKeys.practice) ?? '{}').seconds).toBe(0);
    await act(async () => pendingAudio.resolve({ audioBase64: 'SUQzBAAAAAA=', mimeType: 'audio/mpeg' }));
    await view.unmount();
  });
});
