import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn() };
const mockCompleteOnboarding = jest.fn(async (..._args: unknown[]) => true);
const mockObserve = jest.fn();
let mockAppState: Record<string, unknown>;

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ mode: 'recalibrate' }),
  useRouter: () => mockRouter,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/lib/offline-voice-player', () => ({
  playOfflineSpeech: jest.fn(async () => true),
}));

jest.mock('@/lib/observability', () => ({
  observe: (...args: unknown[]) => mockObserve(...args),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

import OnboardingScreen from '../src/app/onboarding';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('OnboardingScreen finish', () => {
  beforeEach(() => {
    mockAppState = {
      completeOnboarding: mockCompleteOnboarding,
      goal: 10,
      learnerProfile: {
        completed: true,
        level: 'beginner',
        microphoneTested: false,
        primaryGoal: 'travel',
        responseLanguage: 'en',
        scriptPreference: 'both',
      },
    };
  });

  async function openLastStep() {
    const view = await render(<OnboardingScreen />);
    await fireEvent.press(view.getByTestId('onboarding-continue'));
    return view;
  }

  it('stays on the screen and explains when the completed setup cannot be stored', async () => {
    mockCompleteOnboarding.mockRejectedValueOnce(new Error('disk full'));
    const view = await openLastStep();

    await fireEvent.press(view.getByRole('button', { name: 'Save my practice plan' }));

    await waitFor(() => expect(view.getByTestId('onboarding-save-error').props.children).toBe("Couldn't save your setup. Try again."));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockObserve).not.toHaveBeenCalledWith('onboarding_completed');
    expect(view.getByTestId('onboarding-start').props.accessibilityState).toEqual({ disabled: false });

    // A rolled-back write (resolved false) is treated the same way.
    mockCompleteOnboarding.mockResolvedValueOnce(false);
    await fireEvent.press(view.getByRole('button', { name: 'Save my practice plan' }));
    await waitFor(() => expect(mockCompleteOnboarding).toHaveBeenCalledTimes(2));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(view.getByTestId('onboarding-save-error')).toBeTruthy();
  });

  it('disables cancel while saving and does nothing after the screen is gone', async () => {
    const pending = deferred<boolean>();
    mockCompleteOnboarding.mockReturnValueOnce(pending.promise);
    const view = await openLastStep();

    await fireEvent.press(view.getByRole('button', { name: 'Save my practice plan' }));
    const cancel = view.getByRole('button', { name: 'Cancel recalibration' });
    expect(cancel.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(cancel);
    expect(mockRouter.back).not.toHaveBeenCalled();

    // Left by another route (system back, deep link) while the write is still pending.
    await view.unmount();
    pending.resolve(true);
    await waitFor(() => expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockObserve).not.toHaveBeenCalledWith('onboarding_completed');

    // A failure after unmount is dropped as well, with no state update on a gone screen.
    const failing = deferred<boolean>();
    mockCompleteOnboarding.mockReturnValueOnce(failing.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const second = await openLastStep();
    await fireEvent.press(second.getByRole('button', { name: 'Save my practice plan' }));
    await second.unmount();
    failing.reject(new Error('disk full'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('navigates once after the setup is stored and ignores a second tap while saving', async () => {
    const pending = deferred<boolean>();
    mockCompleteOnboarding.mockReturnValueOnce(pending.promise);
    const view = await openLastStep();

    const start = view.getByRole('button', { name: 'Save my practice plan' });
    await fireEvent.press(start);
    expect(view.getByTestId('onboarding-start').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(start);
    expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    pending.resolve(true);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockObserve).toHaveBeenCalledWith('onboarding_completed');
    expect(view.queryByTestId('onboarding-save-error')).toBeNull();
  });
});
