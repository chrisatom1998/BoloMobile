import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

let mockAiConsent = false;
const mockSetAiConsent = jest.fn();

jest.mock('lucide-react-native', () => ({
  ShieldCheck: () => null,
}));

jest.mock('@/lib/app-alert', () => ({
  showAppAlert: jest.fn(),
}));

jest.mock('@/lib/public-pages', () => ({
  openPublicPage: jest.fn(async () => undefined),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({ aiConsent: mockAiConsent, setAiConsent: mockSetAiConsent }),
}));

import { AiConsentGate } from '../src/components/ai-consent-gate';
import { showAppAlert } from '../src/lib/app-alert';
import { openPublicPage } from '../src/lib/public-pages';

const showAppAlertMock = showAppAlert as jest.MockedFunction<typeof showAppAlert>;
const openPublicPageMock = openPublicPage as jest.MockedFunction<typeof openPublicPage>;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

type FiberNode = {
  memoizedProps?: Record<string, unknown>;
  return: FiberNode | null;
};

function getOnPress(instance: unknown) {
  let fiber: FiberNode | null | undefined = (instance as { unstable_fiber?: FiberNode }).unstable_fiber;
  while (fiber) {
    const onPress = fiber.memoizedProps?.onPress;
    if (typeof onPress === 'function') return onPress as () => void;
    fiber = fiber.return;
  }
  throw new Error('The rendered element does not have an onPress callback.');
}

describe('AiConsentGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAiConsent = false;
    mockSetAiConsent.mockResolvedValue(true);
    openPublicPageMock.mockResolvedValue();
  });

  it('deduplicates acceptance, exposes pending accessibility state, and reveals children after consent', async () => {
    const saving = deferred<boolean>();
    mockSetAiConsent.mockReturnValue(saving.promise);
    const view = await render(<AiConsentGate><Text>Connected feature</Text></AiConsentGate>);
    const privacyLink = view.getByRole('link', { name: 'Read the public Privacy Policy' });
    const accept = view.getByRole('button', { name: 'I agree and want to continue' });

    expect(view.queryByText('Connected feature')).toBeNull();
    expect(StyleSheet.flatten(privacyLink.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(accept.props.style).minHeight).toBeGreaterThanOrEqual(44);
    const acceptPress = getOnPress(accept);
    await act(async () => {
      acceptPress();
      acceptPress();
      await Promise.resolve();
    });

    expect(mockSetAiConsent).toHaveBeenCalledTimes(1);
    expect(mockSetAiConsent).toHaveBeenCalledWith(true);
    const pending = view.getByRole('button', { name: 'Saving privacy choice…' });
    expect(pending.props.accessibilityState).toEqual({ disabled: true });

    saving.resolve(true);
    await waitFor(() => expect(view.getByRole('button', { name: 'I agree and want to continue' }).props.accessibilityState)
      .toEqual({ disabled: false }));
    mockAiConsent = true;
    await view.rerender(<AiConsentGate><Text>Connected feature</Text></AiConsentGate>);
    expect(view.getByText('Connected feature')).toBeTruthy();
  });

  it('keeps the gate available after a failed save and permits retry', async () => {
    mockSetAiConsent.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const view = await render(<AiConsentGate><Text>Connected feature</Text></AiConsentGate>);

    await fireEvent.press(view.getByRole('button', { name: 'I agree and want to continue' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'I agree and want to continue' }).props.accessibilityState)
      .toEqual({ disabled: false }));
    expect(view.queryByText('Connected feature')).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'I agree and want to continue' }));
    await waitFor(() => expect(mockSetAiConsent).toHaveBeenCalledTimes(2));
  });

  it('opens the privacy policy and surfaces link failures', async () => {
    const view = await render(<AiConsentGate><Text>Connected feature</Text></AiConsentGate>);

    await fireEvent.press(view.getByRole('link', { name: 'Read the public Privacy Policy' }));
    expect(openPublicPageMock).toHaveBeenCalledWith('privacy');

    openPublicPageMock.mockRejectedValueOnce(new Error('Browser unavailable.'));
    await fireEvent.press(view.getByRole('link', { name: 'Read the public Privacy Policy' }));
    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith('Could not open Privacy Policy', 'Browser unavailable.'));
  });

  it('supports screen-specific consent wording without changing the shared defaults', async () => {
    const view = await render(<AiConsentGate actionLabel="Enable live practice" title="Before your first live turn" />);

    expect(view.getByText('Before your first live turn')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Enable live practice' })).toBeTruthy();
    expect(view.queryByText('Before using Asha')).toBeNull();
  });
});
