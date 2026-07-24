import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import RootLayout from '@/app/_layout';

let mockHydrated = false;

jest.mock('@/state/app-state', () => ({
  AppStateProvider: ({ children }: PropsWithChildren) => children,
  useAppState: () => ({ hydrated: mockHydrated }),
}));

jest.mock('@/hooks/use-practice-reminder-routing', () => ({
  usePracticeReminderRouting: jest.fn(),
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Screen = jest.fn(({ name }) => React.createElement(View, { testID: `stack-screen-${name}` }));
  const Stack = Object.assign(
    jest.fn(({ children }) => React.createElement(View, { testID: 'app-stack' }, children)),
    { Screen },
  );
  return { Stack };
});

describe('RootLayout hydration gate', () => {
  beforeEach(() => {
    mockHydrated = false;
    jest.clearAllMocks();
  });

  it('does not mount the navigator until persisted app state has hydrated', async () => {
    const screen = await render(<RootLayout />);

    expect(screen.getByTestId('app-hydration-loading')).toBeTruthy();
    expect(screen.getByText('ब')).toBeTruthy();
    expect(screen.queryByTestId('app-stack')).toBeNull();
    expect(screen.queryByTestId('stack-screen-(tabs)')).toBeNull();

    mockHydrated = true;
    await screen.rerender(<RootLayout />);

    expect(screen.queryByTestId('app-hydration-loading')).toBeNull();
    expect(screen.getByTestId('app-stack')).toBeTruthy();
    expect(screen.getByTestId('stack-screen-(tabs)')).toBeTruthy();
    expect(screen.getByTestId('stack-screen-settings')).toBeTruthy();
    expect(screen.getByTestId('stack-screen-privacy')).toBeTruthy();
    expect(screen.getByTestId('stack-screen-scene/[id]')).toBeTruthy();
  });
});
