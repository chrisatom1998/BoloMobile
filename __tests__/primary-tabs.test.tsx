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

const hello = { en: 'Hello', hi: 'नमस्ते', latin: 'namaste' };
const tomorrowReview = { mastery: 1, intervalDays: 1, dueAt: '2026-10-06', lastReviewedAt: '2026-10-05', correctReviews: 1, totalReviews: 1 };
const mockAppState = {
  phraseReviews: {} as Record<string, typeof tomorrowReview>,
  phrases: [hello],
};
let mockCalendarDay = '2026-10-05';

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

jest.mock('@/hooks/use-calendar-day', () => ({
  useCalendarDay: () => mockCalendarDay,
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
    mockAppState.phrases = [];
    const view = await render(<PrimaryTabsLayout />);

    expect(view.queryByTestId('tab-badge')).toBeNull();
    mockAppState.phrases = [hello];
  });

  it('counts every due phrase in the badge', async () => {
    mockAppState.phrases = Array.from({ length: 12 }, (_, index) => ({ ...hello, hi: `${hello.hi}-${index}` }));
    const view = await render(<PrimaryTabsLayout />);

    expect(view.getByTestId('tab-badge').props.children).toBe('9+');
    mockAppState.phrases = [hello];
  });

  it('refreshes the badge after midnight while the tabs stay mounted', async () => {
    jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 9, 5, 23, 30) });
    mockAppState.phraseReviews = { [hello.hi]: tomorrowReview };
    try {
      const view = await render(<PrimaryTabsLayout />);
      expect(view.queryByTestId('tab-badge')).toBeNull();

      jest.setSystemTime(new Date(2026, 9, 6, 0, 1));
      mockCalendarDay = '2026-10-06';
      await view.rerender(<PrimaryTabsLayout />);
      expect(view.getByTestId('tab-badge').props.children).toBe('1');
    } finally {
      jest.useRealTimers();
      mockAppState.phraseReviews = {};
      mockCalendarDay = '2026-10-05';
    }
  });
});
