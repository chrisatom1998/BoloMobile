import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useConversationRecap } from '../src/hooks/use-conversation-recap';
import type { RecapMessage, RecapResponse } from '../shared/conversation-recap';

jest.mock('@/services/bolo-api', () => ({ getConversationRecap: jest.fn() }));
const { getConversationRecap } = jest.requireMock('@/services/bolo-api') as { getConversationRecap: jest.Mock };
const messages: RecapMessage[] = [{ id: 'you-1', role: 'you', text: 'Main chai chahiye' }, { id: 'asha-1', role: 'asha', text: 'Try mujhe chai chahiye.' }];
const response: RecapResponse = { corrections: [{ sourceId: 'you-1', original: 'Main chai chahiye', hi: 'मुझे चाय चाहिए।', latin: 'Mujhe chai chahiye.', en: 'I would like tea.', explanation: 'Use mujhe to say what you would like.' }] };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function setup() {
  return renderHook(({ enabled = true, clientId = 'client-12345678', history = messages }: { enabled: boolean; clientId: string; history: RecapMessage[] }) => useConversationRecap({ enabled, clientId, history }), { initialProps: { enabled: true, clientId: 'client-12345678', history: messages } });
}

describe('temporary conversation recap lifecycle', () => {
  beforeEach(() => { Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' }); getConversationRecap.mockReset(); getConversationRecap.mockResolvedValue(response); });

  it('only starts explicitly, deduplicates repeated End, and dismisses without scoring or saving', async () => {
    const pending = deferred<RecapResponse>();
    getConversationRecap.mockReturnValue(pending.promise);
    const view = await setup();
    expect(getConversationRecap).not.toHaveBeenCalled();
    await act(async () => { view.result.current.start(messages); view.result.current.start(messages); });
    expect(getConversationRecap).toHaveBeenCalledTimes(1);
    expect(view.result.current.state).toEqual({ status: 'loading' });
    expect(getConversationRecap).toHaveBeenCalledWith({ clientId: 'client-12345678', messages }, expect.any(AbortSignal));
    await act(async () => pending.resolve(response));
    expect(view.result.current.state).toEqual({ status: 'ready', corrections: response.corrections });
    await act(async () => view.result.current.dismiss('you-1'));
    expect(view.result.current.state).toEqual({ status: 'ready', corrections: [] });
    await act(async () => view.result.current.close());
    expect(view.result.current.state).toBeNull();
  });

  it('shows a genuine empty recap without calling the service when no usable learner words exist', async () => {
    const view = await setup();
    await act(async () => view.result.current.start([]));
    expect(view.result.current.state).toEqual({ status: 'ready', corrections: [] });
    expect(getConversationRecap).not.toHaveBeenCalled();
  });

  it('lets an error retry only the same bounded session, never older history', async () => {
    getConversationRecap.mockRejectedValueOnce(new Error('network'));
    const view = await setup();
    await act(async () => view.result.current.start(messages));
    expect(view.result.current.state).toEqual({ status: 'error', message: 'network' });
    await act(async () => view.result.current.retry());
    expect(getConversationRecap).toHaveBeenCalledTimes(2);
    expect(view.result.current.state?.status).toBe('ready');
  });

  it.each(['close', 'disabled', 'identity', 'history', 'unmount'] as const)('aborts and ignores late results after %s', async (reason) => {
    const pending = deferred<RecapResponse>();
    getConversationRecap.mockReturnValue(pending.promise);
    const view = await setup();
    await act(async () => view.result.current.start(messages));
    const signal = getConversationRecap.mock.calls[0]![1] as AbortSignal;
    if (reason === 'close') await act(async () => view.result.current.close());
    if (reason === 'disabled') await view.rerender({ enabled: false, clientId: 'client-12345678', history: messages });
    if (reason === 'identity') await view.rerender({ enabled: true, clientId: 'client-other123', history: messages });
    if (reason === 'history') await view.rerender({ enabled: true, clientId: 'client-12345678', history: [] });
    if (reason === 'unmount') await view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(response));
    if (reason !== 'unmount') expect(view.result.current.state).toBeNull();
    if (reason !== 'unmount') {
      await act(async () => view.result.current.retry());
      expect(getConversationRecap).toHaveBeenCalledTimes(1);
    }
  });

  it.each(['background', 'unmount', 'identity', 'deletion'] as const)('rejects a retained End callback after %s', async (reason) => {
    let listener!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler) => { listener = handler; return { remove: jest.fn() }; });
    const view = await setup();
    const staleStart = view.result.current.start;
    if (reason === 'background') await act(async () => listener('background'));
    if (reason === 'unmount') await view.unmount();
    if (reason === 'identity') await view.rerender({ enabled: true, clientId: 'client-other123', history: messages });
    if (reason === 'deletion') await view.rerender({ enabled: true, clientId: 'client-12345678', history: [] });
    await act(async () => staleStart(messages));
    expect(getConversationRecap).not.toHaveBeenCalled();
  });

  it('invalidates immediately on background and does not restart on foreground', async () => {
    let listener!: (state: AppStateStatus) => void;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler) => { listener = handler; return { remove }; });
    const pending = deferred<RecapResponse>(); getConversationRecap.mockReturnValue(pending.promise);
    const view = await setup();
    await act(async () => view.result.current.start(messages));
    await act(async () => listener('background'));
    expect(getConversationRecap.mock.calls[0]![1].aborted).toBe(true);
    await act(async () => { pending.resolve(response); listener('active'); });
    expect(view.result.current.state).toBeNull();
    expect(getConversationRecap).toHaveBeenCalledTimes(1);
    await view.unmount(); expect(remove).toHaveBeenCalled();
  });

  it('keeps an in-flight recap through a transient iOS inactive overlay', async () => {
    let listener!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler) => { listener = handler; return { remove: jest.fn() }; });
    const pending = deferred<RecapResponse>(); getConversationRecap.mockReturnValue(pending.promise);
    const view = await setup();
    await act(async () => view.result.current.start(messages));
    await act(async () => listener('inactive'));
    expect(getConversationRecap.mock.calls[0]![1].aborted).toBe(false);
    expect(view.result.current.state).toEqual({ status: 'loading' });
    await act(async () => { pending.resolve(response); listener('active'); });
    expect(view.result.current.state).toEqual({ status: 'ready', corrections: response.corrections });
    expect(getConversationRecap).toHaveBeenCalledTimes(1);
  });

  it('can close and start a new recap in one batch without losing the new request', async () => {
    const pending = deferred<RecapResponse>(); getConversationRecap.mockReturnValueOnce(pending.promise);
    const view = await setup();
    await act(async () => view.result.current.start(messages));
    await act(async () => { view.result.current.close(); view.result.current.start(messages); });
    expect(getConversationRecap).toHaveBeenCalledTimes(2);
    expect(view.result.current.state?.status).toBe('ready');
    await act(async () => pending.resolve({ corrections: [] }));
    expect(view.result.current.state).toEqual({ status: 'ready', corrections: response.corrections });
  });

  it('rejects requests while disabled and ignores an older request after a new conversation', async () => {
    const pending = deferred<RecapResponse>(); getConversationRecap.mockReturnValueOnce(pending.promise);
    const view = await setup();
    await view.rerender({ enabled: false, clientId: 'client-12345678', history: messages });
    await act(async () => view.result.current.start(messages));
    expect(getConversationRecap).not.toHaveBeenCalled();
    await view.rerender({ enabled: true, clientId: 'client-12345678', history: messages });
    await act(async () => view.result.current.start(messages));
    await act(async () => view.result.current.close());
    getConversationRecap.mockResolvedValueOnce({ corrections: [] });
    await act(async () => view.result.current.start(messages));
    await act(async () => pending.resolve(response));
    expect(view.result.current.state).toEqual({ status: 'ready', corrections: [] });
  });
});
