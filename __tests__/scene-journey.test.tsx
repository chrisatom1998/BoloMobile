import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

let mockSceneId = 'chai';
const mockRouterReplace = jest.fn();
const mockElapsedSeconds = jest.fn(() => 42);
const mockResetTimer = jest.fn();
const mockMarkSceneComplete = jest.fn();
const mockTogglePhrase = jest.fn();
const mockAppState = {
  aiConsent: true,
  markSceneComplete: mockMarkSceneComplete,
  phrases: [] as { en: string; hi: string; latin: string }[],
  togglePhrase: mockTogglePhrase,
};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: mockSceneId }),
  useRouter: () => ({ replace: mockRouterReplace }),
}));

jest.mock('lucide-react-native', () => ({
  Bookmark: () => null,
  Check: () => null,
  ChevronRight: () => null,
  Heart: () => null,
  RotateCcw: () => null,
  Star: () => null,
  Volume2: () => null,
  X: () => null,
}));

jest.mock('@/components/ai-consent-gate', () => ({
  AiConsentGate: ({ children }: PropsWithChildren) => children,
}));

jest.mock('@/components/pronunciation-recorder', () => ({
  PronunciationRecorder: () => null,
}));

jest.mock('@/hooks/use-foreground-timer', () => ({
  useForegroundTimer: () => ({ elapsedSeconds: mockElapsedSeconds, reset: mockResetTimer }),
}));

jest.mock('@/lib/speech', () => ({
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

import SceneScreen from '../src/app/scene/[id]';
import { scenes } from '../src/data/scenes';
import { speakText, stopSpeaking } from '../src/lib/speech';

const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;
const stopSpeakingMock = stopSpeaking as jest.MockedFunction<typeof stopSpeaking>;

describe('SceneScreen primary journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSceneId = 'chai';
    mockAppState.aiConsent = true;
    mockAppState.phrases = [];
    mockElapsedSeconds.mockReturnValue(42);
    speakTextMock.mockResolvedValue();
  });

  it('locks answers after a wrong choice, completes a correct final turn, and replays', async () => {
    const view = await render(<SceneScreen />);
    const wrong = view.getByLabelText(/Where is the tea\?/u);
    const correct = view.getByLabelText(/One tea, please\./u);

    await fireEvent.press(wrong);
    expect(view.getByText('Not quite—notice the pattern.')).toBeTruthy();
    expect(wrong.props.accessibilityState).toEqual({ disabled: true, selected: true });
    expect(correct.props.accessibilityState).toEqual({ disabled: true, selected: false });

    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
    expect(view.getByText('Turn 2 of 2')).toBeTruthy();
    await fireEvent.press(view.getByLabelText(/Less sugar, please\./u));
    expect(view.getByText('Natural choice!')).toBeTruthy();
    expect(view.getByText('50')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Finish' }));
    expect(mockMarkSceneComplete).toHaveBeenCalledTimes(1);
    expect(mockMarkSceneComplete).toHaveBeenCalledWith('chai', 42, {
      correct: 1,
      score: 50,
      total: 2,
      weakPhrases: ['एक चाय दीजिए।'],
    });
    expect(view.getByText('Scene complete')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Replay scene' }));
    expect(mockResetTimer).toHaveBeenCalledTimes(1);
    expect(view.getByText('Turn 1 of 2')).toBeTruthy();
  });

  it('shows a safe not-found route and returns to the scene catalog', async () => {
    mockSceneId = 'missing-scene';
    const view = await render(<SceneScreen />);

    expect(view.getByText('Scene not found')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Back to scenes' }));
    expect(mockRouterReplace).toHaveBeenCalledWith('/');
  });

  it('keeps the natural answer hidden until the learner answers', async () => {
    const view = await render(<SceneScreen />);

    expect(view.queryByLabelText('Save phrase')).toBeNull();
    expect(view.queryByText('Keep the natural answer')).toBeNull();

    await fireEvent.press(view.getByLabelText(/Where is the tea\?/u));
    expect(view.getByText('Keep the natural answer')).toBeTruthy();
  });

  it('saves and removes the current natural answer', async () => {
    const target = scenes[0].beats[0].choices.find((choice) => choice.correct)!;
    const view = await render(<SceneScreen />);
    await fireEvent.press(view.getByLabelText(/One tea, please\./u));

    const save = view.getByLabelText('Save phrase');
    expect(save.props.accessibilityState).toEqual({ selected: false });
    await fireEvent.press(save);
    expect(mockTogglePhrase).toHaveBeenCalledWith(target);

    mockAppState.phrases = [target];
    await view.rerender(<SceneScreen />);
    const remove = view.getByLabelText('Remove saved phrase');
    expect(remove.props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(remove);
    expect(mockTogglePhrase).toHaveBeenLastCalledWith(target);
  });

  it('renders AI playback failures as alerts and stops playback on unmount', async () => {
    speakTextMock.mockRejectedValueOnce(new Error('AI voice is unavailable.'));
    const view = await render(<SceneScreen />);

    await fireEvent.press(view.getByLabelText('Hear Mira'));
    await waitFor(() => expect(view.getByRole('alert').props.children).toBe('AI voice is unavailable.'));

    await view.unmount();
    expect(stopSpeakingMock).toHaveBeenCalled();
  });
});
