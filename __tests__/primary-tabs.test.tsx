import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

jest.mock('expo-router/unstable-native-tabs', () => {
  const React = jest.requireActual('react');
  const { Text, View } = jest.requireActual('react-native');
  const Trigger = ({ children, name }: PropsWithChildren<{ name: string }>) => React.createElement(View, { testID: `tab-${name}` }, children);
  Trigger.Icon = () => null;
  Trigger.Label = ({ children }: PropsWithChildren) => React.createElement(Text, null, children);
  Trigger.Badge = ({ children }: PropsWithChildren) => React.createElement(Text, { testID: 'tab-badge' }, children);
  const NativeTabs = Object.assign(
    ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => React.createElement(View, { testID: 'native-tabs', ...props }, children),
    { Trigger },
  );
  return { NativeTabs };
});

let mockDuePhrases = [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }];

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({ duePhrases: mockDuePhrases }),
}));

import PrimaryTabsLayout from '../src/app/(tabs)/_layout';

describe('primary tab navigation', () => {
  it('keeps the learning loop visible and surfaces due phrase count without changing tab routes', async () => {
    const view = await render(<PrimaryTabsLayout />);

    expect(view.getByTestId('native-tabs')).toBeTruthy();
    expect(view.getByTestId('tab-index')).toBeTruthy();
    expect(view.getByTestId('tab-live')).toBeTruthy();
    expect(view.getByTestId('tab-phrases')).toBeTruthy();
    expect(view.getByTestId('tab-progress')).toBeTruthy();
    expect(view.getByText('Today')).toBeTruthy();
    expect(view.getByText('Asha')).toBeTruthy();
    expect(view.getByText('Phrases')).toBeTruthy();
    expect(view.getByText('Progress')).toBeTruthy();
    expect(view.getByTestId('tab-badge').props.children).toBe('1');
    expect(view.getByTestId('native-tabs').props.disableTransparentOnScrollEdge).toBe(true);
  });

  it('does not show an empty badge when nothing is due', async () => {
    mockDuePhrases = [];
    const view = await render(<PrimaryTabsLayout />);

    expect(view.queryByTestId('tab-badge')).toBeNull();
    mockDuePhrases = [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }];
  });
});
