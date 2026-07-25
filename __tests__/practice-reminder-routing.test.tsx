import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockRemove = jest.fn();
const mockClearLastResponse = jest.fn(async () => undefined);
const mockGetLastResponse = jest.fn();
const mockSetNotificationHandler = jest.fn((_handler: { handleNotification(): Promise<unknown> }) => undefined);
type MockNotificationResponse = {
  actionIdentifier: string;
  notification: { request: { content: { data: { url: unknown } }; identifier: string } };
};
let responseListener: ((value: MockNotificationResponse) => void) | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'default',
  addNotificationResponseReceivedListener: jest.fn((listener) => {
    responseListener = listener;
    return { remove: mockRemove };
  }),
  clearLastNotificationResponseAsync: () => mockClearLastResponse(),
  getLastNotificationResponseAsync: () => mockGetLastResponse(),
  setNotificationHandler: mockSetNotificationHandler,
}));

import { practiceReminderRoute, usePracticeReminderRouting } from '../src/hooks/use-practice-reminder-routing';

function expectDefined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected the value to be defined.');
  return value;
}

function response(identifier = 'reminder-1', url: unknown = '/review', actionIdentifier = 'default'): MockNotificationResponse {
  return {
    actionIdentifier,
    notification: { request: { content: { data: { url } }, identifier } },
  };
}

describe('practice reminder routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    responseListener = null;
    mockGetLastResponse.mockResolvedValue(null);
  });

  it('accepts only the default action for the internal review route', () => {
    expect(practiceReminderRoute(response(), 'default')).toBe('/review');
    expect(practiceReminderRoute(response('2', '/settings'), 'default')).toBeNull();
    expect(practiceReminderRoute(response('3', '/review', 'dismiss'), 'default')).toBeNull();
  });

  it('opens a cold-start reminder response after hydration', async () => {
    mockGetLastResponse.mockResolvedValue(response());
    await renderHook(() => usePracticeReminderRouting(true));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/review'));
    expect(mockClearLastResponse).toHaveBeenCalledTimes(1);
    expect(mockSetNotificationHandler).toHaveBeenCalledWith({
      handleNotification: expect.any(Function),
    });
    await expect(expectDefined(mockSetNotificationHandler.mock.calls[0])[0].handleNotification()).resolves.toEqual({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });

  it('handles a foreground response once and removes its listener', async () => {
    const hook = await renderHook(() => usePracticeReminderRouting(true));
    await waitFor(() => expect(responseListener).not.toBeNull());

    await act(async () => {
      responseListener?.(response());
      responseListener?.(response());
    });
    expect(mockPush).toHaveBeenCalledTimes(1);

    await hook.unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
