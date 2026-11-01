import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

let mockHydrated = false;

jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(async () => undefined),
  preventAutoHideAsync: jest.fn(async () => true),
}));

jest.mock('@/state/app-state', () => ({
  AppStateProvider: ({ children }: PropsWithChildren) => children,
  useAppState: () => ({ hydrated: mockHydrated }),
}));

jest.mock('@/hooks/use-practice-reminder-routing', () => ({
  usePracticeReminderRouting: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: PropsWithChildren) => children,
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Screen = jest.fn(() => null);
  const Stack = Object.assign(
    jest.fn(({ children }) => React.createElement(View, { testID: 'app-stack' }, children)),
    { Screen },
  );
  return { Stack };
});

import * as SplashScreen from 'expo-splash-screen';

import RootLayout from '@/app/_layout';

const preventAutoHideMock = SplashScreen.preventAutoHideAsync as jest.MockedFunction<typeof SplashScreen.preventAutoHideAsync>;
const hideSplashMock = SplashScreen.hideAsync as jest.MockedFunction<typeof SplashScreen.hideAsync>;
// Jest clears mock calls before each test, so capture the module-scope call as soon as the layout is imported.
const preventAutoHideCallsOnImport = preventAutoHideMock.mock.calls.length;

describe('RootLayout native splash hand-off', () => {
  beforeEach(() => {
    mockHydrated = false;
  });

  it('holds the native splash from module scope, before any component renders', () => {
    expect(preventAutoHideCallsOnImport).toBe(1);
  });

  it('hides the splash exactly once, only after persisted app state has hydrated', async () => {
    const screen = await render(<RootLayout />);
    expect(hideSplashMock).not.toHaveBeenCalled();

    mockHydrated = true;
    await screen.rerender(<RootLayout />);
    expect(hideSplashMock).toHaveBeenCalledTimes(1);

    await screen.rerender(<RootLayout />);
    screen.unmount();
    await render(<RootLayout />);
    expect(hideSplashMock).toHaveBeenCalledTimes(1);
  });
});
