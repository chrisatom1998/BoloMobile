import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { romanizeDevanagari } from '../src/lib/devanagari-romanization';

let mockSceneId = 'chai';
const mockRouterReplace = jest.fn();
const mockRouterDismissTo = jest.fn();
const mockElapsedSeconds = jest.fn(() => 42);
const mockResetTimer = jest.fn();
const mockMarkSceneComplete = jest.fn();
const mockTogglePhrase = jest.fn();
const mockWordDefinitionSheet = jest.fn((_props: unknown) => null);
const mockAppState = {
  aiConsent: true,
  clientId: 'client-12345678',
  learnerProfile: { scriptPreference: 'latin' as const },
  markSceneComplete: mockMarkSceneComplete,
  phrases: [] as { en: string; hi: string; latin: string }[],
  sceneProgress: {} as Record<string, { lastBeatIndex: number }>,
  togglePhrase: mockTogglePhrase,
};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: mockSceneId }),
  useRouter: () => ({ dismissTo: mockRouterDismissTo, replace: mockRouterReplace }),
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

jest.mock('@/components/word-definition-sheet', () => ({
  WordDefinitionSheet: (props: unknown) => mockWordDefinitionSheet(props),
}));

jest.mock('@/hooks/use-foreground-timer', () => ({
  useForegroundTimer: () => ({ elapsedSeconds: mockElapsedSeconds, reset: mockResetTimer }),
}));

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => true),
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

import SceneScreen from '../src/app/scene/[id]';
import { getScene, scenes } from '../src/data/scenes';
import { speakText, stopSpeaking } from '../src/lib/speech';

const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;
const stopSpeakingMock = stopSpeaking as jest.MockedFunction<typeof stopSpeaking>;

function collectTestIds(node: unknown, ids: string[] = []) {
  if (!node || typeof node === 'string' || typeof node === 'number') return ids;
  if (Array.isArray(node)) {
    node.forEach((child) => collectTestIds(child, ids));
    return ids;
  }
  const testNode = node as { children?: unknown[]; props?: { testID?: string } };
  if (testNode.props?.testID) ids.push(testNode.props.testID);
  testNode.children?.forEach((child) => collectTestIds(child, ids));
  return ids;
}

describe('SceneScreen primary journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSceneId = 'chai';
    mockAppState.aiConsent = true;
    mockAppState.phrases = [];
    mockAppState.sceneProgress = {};
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

    await fireEvent.press(view.getByRole('button', { name: 'Back to Today' }));
    expect(mockRouterReplace).toHaveBeenCalledWith('/');

    await fireEvent.press(view.getByRole('button', { name: 'Replay scene' }));
    expect(mockResetTimer).toHaveBeenCalledTimes(1);
    expect(view.getByText('Turn 1 of 2')).toBeTruthy();
  });

  it('scores a resumed scene only over the beats answered after the checkpoint', async () => {
    mockAppState.sceneProgress = { chai: { lastBeatIndex: 1 } };
    const view = await render(<SceneScreen />);
    expect(view.getByText('Turn 2 of 2')).toBeTruthy();

    await fireEvent.press(view.getByLabelText(/Less sugar, please\./u));
    await fireEvent.press(view.getByRole('button', { name: 'Finish' }));
    expect(mockMarkSceneComplete).toHaveBeenCalledWith('chai', 42, {
      correct: 1,
      score: 50,
      total: 1,
      weakPhrases: [],
    });

    await fireEvent.press(view.getByRole('button', { name: 'Replay scene' }));
    expect(view.getByText('Turn 1 of 2')).toBeTruthy();
    await fireEvent.press(view.getByLabelText(/One tea, please\./u));
    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(view.getByLabelText(/Less sugar, please\./u));
    await fireEvent.press(view.getByRole('button', { name: 'Finish' }));
    expect(mockMarkSceneComplete).toHaveBeenLastCalledWith('chai', 42, {
      correct: 2,
      score: 100,
      total: 2,
      weakPhrases: [],
    });
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
    expect(view.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(view.getAllByText('Ask for one cup of tea.')).toHaveLength(1);
    expect(view.queryByText('Use “एक” for one and “दीजिए” to make the request polite.')).toBeNull();

    await fireEvent.press(view.getByLabelText('Show Asha’s hint'));
    expect(view.getByText('Use “एक” for one and “दीजिए” to make the request polite.')).toBeTruthy();
    expect(view.getByLabelText('Hide Asha’s hint').props.accessibilityState).toEqual({ expanded: true });

    await fireEvent.press(view.getByLabelText(/Where is the tea\?/u));
    expect(view.getByText('Keep the natural answer')).toBeTruthy();
    expect(view.getByText('Unpack the answer')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Continue' }).props.style).toEqual(expect.objectContaining({
      minHeight: 52,
      width: '100%',
    }));
    const testIds = collectTestIds(view.toJSON());
    expect(testIds.indexOf('scene-feedback')).toBeLessThan(testIds.indexOf('scene-save'));
    expect(testIds.indexOf('scene-save')).toBeLessThan(testIds.indexOf('scene-words'));
    expect(testIds.indexOf('scene-words')).toBeLessThan(testIds.indexOf('scene-pronunciation'));
    expect(testIds.indexOf('scene-pronunciation')).toBeLessThan(testIds.indexOf('scene-continue'));
  });

  it('continues from a completed guided lesson to its next sibling', async () => {
    mockSceneId = 'plan-essentials-01';
    mockAppState.sceneProgress = { [mockSceneId]: { lastBeatIndex: 9 } };
    const finalTarget = getScene(mockSceneId)?.beats[9]?.choices.find((choice) => choice.correct);
    expect(finalTarget).toBeTruthy();
    const view = await render(<SceneScreen />);

    await fireEvent.press(view.getByLabelText(`${finalTarget!.hi}. ${finalTarget!.latin}. ${finalTarget!.en}`));
    await fireEvent.press(view.getByRole('button', { name: 'Finish' }));
    const completionTestIds = collectTestIds(view.toJSON());
    expect(completionTestIds.indexOf('scene-completion-primary')).toBeLessThan(completionTestIds.indexOf('scene-completion-secondary'));
    expect(completionTestIds.indexOf('scene-completion-secondary')).toBeLessThan(completionTestIds.indexOf('scene-completion-tertiary'));
    const backToToday = view.getByRole('button', { name: 'Back to Today' });
    expect(backToToday.props.style).toEqual(expect.objectContaining({ minHeight: 44 }));
    await fireEvent.press(backToToday);
    expect(mockRouterReplace).toHaveBeenCalledWith('/');
    await fireEvent.press(view.getByRole('button', { name: 'Next lesson' }));

    expect(mockRouterReplace).toHaveBeenCalledWith({
      pathname: '/scene/[id]',
      params: { id: 'plan-essentials-02' },
    });
  });

  it('returns the final guided lesson to its completed plan', async () => {
    mockSceneId = 'plan-essentials-10';
    mockAppState.sceneProgress = { [mockSceneId]: { lastBeatIndex: 9 } };
    const finalTarget = getScene(mockSceneId)?.beats[9]?.choices.find((choice) => choice.correct);
    expect(finalTarget).toBeTruthy();
    const view = await render(<SceneScreen />);

    await fireEvent.press(view.getByLabelText(`${finalTarget!.hi}. ${finalTarget!.latin}. ${finalTarget!.en}`));
    await fireEvent.press(view.getByRole('button', { name: 'Finish' }));
    await fireEvent.press(view.getByRole('button', { name: 'View completed plan' }));

    expect(mockRouterDismissTo).toHaveBeenCalledWith({
      pathname: '/lesson-plans',
      params: { planId: 'essentials' },
    });
  });

  it('saves and removes the current natural answer', async () => {
    const target = scenes[0]?.beats[0]?.choices.find((choice) => choice.correct)!;
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

  it('shows Romanized Hindi word chips while preserving the source word for definitions', async () => {
    const view = await render(<SceneScreen />);
    await fireEvent.press(view.getByLabelText(/One tea, please\./u));

    expect(view.getByText('Unpack the answer')).toBeTruthy();
    for (const word of ['एक', 'चाय', 'दीजिए']) {
      const romanizedWord = romanizeDevanagari(word);
      expect(view.getByText(romanizedWord)).toBeTruthy();
      expect(view.getByRole('button', { name: `Explain ${romanizedWord} in the answer` })).toBeTruthy();
      expect(view.queryByRole('button', { name: `Explain ${word} in the answer` })).toBeNull();
    }
    expect(view.queryByRole('button', { name: 'Explain One in the answer' })).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: `Explain ${romanizeDevanagari('एक')} in the answer` }));
    expect(mockWordDefinitionSheet).toHaveBeenLastCalledWith(expect.objectContaining({
      initialWord: 'एक',
      phrase: 'एक चाय दीजिए।',
      visible: true,
    }));
  });

  it('renders AI playback failures as alerts and stops playback on unmount', async () => {
    const view = await render(<SceneScreen />);

    // Consume the situation's auto-play before arming the manual-playback failure.
    await waitFor(() => expect(speakTextMock).toHaveBeenCalled());
    expect(view.queryByRole('alert')).toBeNull();

    speakTextMock.mockRejectedValueOnce(new Error('AI voice is unavailable.'));
    await fireEvent.press(view.getByLabelText('Hear Asha'));
    await waitFor(() => expect(view.getByRole('alert').props.children).toBe('AI voice is unavailable.'));

    await view.unmount();
    expect(stopSpeakingMock).toHaveBeenCalled();
  });
});
