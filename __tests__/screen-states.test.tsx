import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { EmptyState } from '../src/components/states/EmptyState';
import { ErrorState } from '../src/components/states/ErrorState';
import { LoadingState } from '../src/components/states/LoadingState';
import { StatePreviewProvider, usePreviewPhase } from '../src/components/states/preview-context';
import { StateAction } from '../src/components/states/state-action';
import {
  asAshaPhase,
  asContentPhase,
  isFreshLearner,
  previewPhaseFor,
  selectAshaState,
  selectLessonPlansState,
  selectPhrasesState,
  selectProgressState,
  selectTodayState,
  storagePhaseFromState,
} from '../src/lib/screen-states';
import { statePreviewEnabled } from '../src/lib/state-preview';
import { control } from '../src/theme';

jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});

describe('screen state selection', () => {
  it('reads storage phase from an explicit value, then hydration', () => {
    expect(storagePhaseFromState({ storagePhase: 'error', hydrated: true })).toBe('error');
    expect(storagePhaseFromState({ hydrated: false })).toBe('loading');
    expect(storagePhaseFromState({ hydrated: true })).toBe('ready');
    expect(storagePhaseFromState({})).toBe('ready');
  });

  it('treats a learner with no phrases, practice, or lessons as fresh', () => {
    expect(isFreshLearner({ phrases: [], practiceSeconds: 0, streak: 0 })).toBe(true);
    expect(isFreshLearner({ phrases: [{ hi: 'नमस्ते' }], practiceSeconds: 0, streak: 0 })).toBe(false);
    expect(isFreshLearner({ phrases: [], practiceSeconds: 30, streak: 0 })).toBe(false);
    expect(isFreshLearner({ phrases: [], practiceSeconds: 0, streak: 2 })).toBe(false);
    expect(isFreshLearner({
      phrases: [],
      practiceHistory: [{ reviews: 1, seconds: 0 }],
      practiceSeconds: 0,
      streak: 0,
    })).toBe(false);
    expect(isFreshLearner({
      phrases: [],
      practiceSeconds: 0,
      sceneProgress: { chai: { completions: 0, lastBeatIndex: 2 } },
      streak: 0,
    })).toBe(false);
  });

  it('prefers loading, then error, then an empty collection', () => {
    expect(selectTodayState({ fresh: true, storagePhase: 'loading' })).toBe('loading');
    expect(selectTodayState({ fresh: true, storagePhase: 'error' })).toBe('error');
    expect(selectTodayState({ fresh: true, storagePhase: 'ready' })).toBe('empty');
    expect(selectTodayState({ fresh: false, storagePhase: 'ready' })).toBe('ready');

    expect(selectPhrasesState({ savedCount: 3, storagePhase: 'loading' })).toBe('loading');
    expect(selectPhrasesState({ savedCount: 3, storagePhase: 'error' })).toBe('error');
    expect(selectPhrasesState({ savedCount: 0, storagePhase: 'ready' })).toBe('empty');
    expect(selectPhrasesState({ savedCount: 1, storagePhase: 'ready' })).toBe('ready');

    expect(selectLessonPlansState({ planCount: 0, storagePhase: 'loading' })).toBe('loading');
    expect(selectLessonPlansState({ planCount: 4, storagePhase: 'error' })).toBe('error');
    expect(selectLessonPlansState({ planCount: 0, storagePhase: 'ready' })).toBe('empty');
    expect(selectLessonPlansState({ planCount: 2, storagePhase: 'ready' })).toBe('ready');

    expect(selectProgressState({ hasActivity: false, storagePhase: 'loading' })).toBe('loading');
    expect(selectProgressState({ hasActivity: true, storagePhase: 'error' })).toBe('error');
    expect(selectProgressState({ hasActivity: false, storagePhase: 'ready' })).toBe('empty');
    expect(selectProgressState({ hasActivity: true, storagePhase: 'ready' })).toBe('ready');
  });

  it('orders Asha failures ahead of the connecting spinner', () => {
    expect(selectAshaState({ connecting: true, micDenied: true, offline: true, unavailable: true })).toBe('mic-denied');
    expect(selectAshaState({ connecting: true, micDenied: false, offline: true, unavailable: true })).toBe('offline');
    expect(selectAshaState({ connecting: true, micDenied: false, offline: false, unavailable: true })).toBe('unavailable');
    expect(selectAshaState({ connecting: true, micDenied: false, offline: false, unavailable: false })).toBe('connecting');
    expect(selectAshaState({ connecting: false, micDenied: false, offline: false, unavailable: false })).toBe('ready');
  });

  it('accepts only the phases that belong to a screen', () => {
    expect(previewPhaseFor('today', 'today', 'empty')).toBe('empty');
    expect(previewPhaseFor('today', 'phrases', 'empty')).toBeNull();
    expect(previewPhaseFor('asha', 'asha', 'mic-denied')).toBe('mic-denied');
    expect(previewPhaseFor('asha', 'asha', 'empty')).toBeNull();
    expect(previewPhaseFor('progress', 'progress', null)).toBeNull();
    expect(asContentPhase('empty')).toBe('empty');
    expect(asContentPhase('mic-denied')).toBeNull();
    expect(asContentPhase(null)).toBeNull();
    expect(asAshaPhase('offline')).toBe('offline');
    expect(asAshaPhase('loading')).toBeNull();
    expect(asAshaPhase(null)).toBeNull();
  });

  it('keeps the screenshot fixture out of release builds', () => {
    expect(statePreviewEnabled(false, undefined)).toBe(false);
    expect(statePreviewEnabled(false, '0')).toBe(false);
    expect(statePreviewEnabled(false, '1')).toBe(true);
    expect(statePreviewEnabled(true, undefined)).toBe(true);
  });
});

describe('state components', () => {
  it('gives every action a 44 point target, a label, and a button role', async () => {
    const onPress = jest.fn();
    const view = await render(<StateAction accessibilityLabel="Retry loading today's plan" label="Retry" onPress={onPress} testID="retry" />);
    const button = view.getByTestId('retry');
    const style = typeof button.props.style === 'function' ? button.props.style({ pressed: false }) : button.props.style;
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe("Retry loading today's plan");
    expect(StyleSheet.flatten(style).minHeight).toBe(control.minTarget);
    expect(StyleSheet.flatten(style).minWidth).toBe(control.minTarget);
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders an empty state with one action and a header', async () => {
    const onAction = jest.fn();
    const view = await render(
      <EmptyState
        accessibilityLabel="Start your first lesson"
        actionLabel="Start your first lesson"
        body="Nothing planned yet, and no progress to look back on."
        onAction={onAction}
        testID="today-empty"
        title="A fresh start"
      />,
    );
    expect(view.getByText('A fresh start').props.accessibilityRole).toBe('header');
    expect(view.getByText('Nothing planned yet, and no progress to look back on.')).toBeTruthy();
    fireEvent.press(view.getByTestId('today-empty-action'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders an error as an alert with retry', async () => {
    const onAction = jest.fn();
    const view = await render(
      <ErrorState
        accessibilityLabel="Retry loading saved phrases"
        actionLabel="Retry"
        body="Your saved lines are still on this phone. Try again."
        onAction={onAction}
        testID="phrases-error"
        title="Phrases didn't load"
      />,
    );
    expect(view.getByTestId('phrases-error').props.accessibilityRole).toBe('alert');
    fireEvent.press(view.getByLabelText('Retry loading saved phrases'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('announces loading without offering an action', async () => {
    const view = await render(<LoadingState body="One moment." testID="today-loading" title="Getting today ready" />);
    expect(view.getByTestId('today-loading').props.accessibilityRole).toBe('progressbar');
    expect(view.getByTestId('today-loading').props.accessibilityLabel).toBe('Getting today ready');
    expect(view.queryByLabelText(/Retry|Start/u)).toBeNull();
    expect(view.getByText('One moment.')).toBeTruthy();
  });

  it('passes a forced phase only to the matching screen', async () => {
    function Probe() {
      const plans = usePreviewPhase('lesson-plans');
      const today = usePreviewPhase('today');
      return <Text>{`${plans ?? 'none'}:${today ?? 'none'}`}</Text>;
    }
    const view = await render(
      <StatePreviewProvider phase="error" screen="lesson-plans">
        <Probe />
      </StatePreviewProvider>,
    );
    expect(view.getByText('error:none')).toBeTruthy();
  });
});
