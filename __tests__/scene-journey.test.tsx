import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, ScrollView, StyleSheet } from 'react-native';

import { romanizeDevanagari } from '../src/lib/devanagari-romanization';

let mockSceneId = 'chai';
const mockRouterReplace = jest.fn();
const mockRouterDismissTo = jest.fn();
const mockElapsedSeconds = jest.fn(() => 42);
const mockResetTimer = jest.fn();
const mockCheckpointScene = jest.fn();
const mockMarkSceneComplete = jest.fn();
const mockTogglePhrase = jest.fn();
const mockWordDefinitionSheet = jest.fn((_props: unknown) => null);
const mockAppState = {
  aiConsent: true,
  checkpointScene: mockCheckpointScene,
  clientId: 'client-12345678',
  learnerProfile: { scriptPreference: 'latin' as const },
  markSceneComplete: mockMarkSceneComplete,
  motionPreference: 'gentle' as 'gentle' | 'lively' | 'reduced',
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
  Eye: () => null,
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
import { wordOrderTokens } from '../src/components/practice-mode';
import { getScene, scenes } from '../src/data/scenes';
import * as shuffleChoiceModule from '../src/lib/shuffle-choices';
import { speakText, stopSpeaking } from '../src/lib/speech';

const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;
const stopSpeakingMock = stopSpeaking as jest.MockedFunction<typeof stopSpeaking>;
const sceneScrollToMock = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => undefined);
const ALTERNATE_COACH_HINDI = 'करीब है—फिर से कोशिश कीजिए।';

function choiceAccessibilityLabel(choice: { en: string; hi: string; latin: string }, answered = false) {
  return answered
    ? `${choice.hi} ${choice.latin} ${choice.en}`
    : `${choice.hi} ${choice.latin}`;
}

function choiceLabel(sceneId: string, beatIndex: number, sourceIndex = 0, answered = false) {
  const choice = getScene(sceneId)?.beats[beatIndex]?.choices[sourceIndex];
  if (!choice) throw new Error(`No choice #${sourceIndex} for ${sceneId} beat ${beatIndex}.`);
  return choiceAccessibilityLabel(choice, answered);
}

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
    mockAppState.motionPreference = 'gentle';
    mockAppState.phrases = [];
    mockAppState.sceneProgress = {};
    mockElapsedSeconds.mockReturnValue(42);
    speakTextMock.mockResolvedValue();
  });

  it('locks answers after a wrong choice, completes a correct final turn, and replays', async () => {
    const view = await render(<SceneScreen />);
    const wrong = view.getByLabelText(choiceLabel('chai', 0, 1));

    await fireEvent.press(wrong);
    expect(view.getByText('Not quite—notice the pattern.')).toBeTruthy();
    expect(view.getByLabelText(choiceLabel('chai', 0, 1, true)).props.accessibilityState).toEqual({ disabled: true, selected: true });
    expect(view.getByLabelText(choiceLabel('chai', 0, 0, true)).props.accessibilityState).toEqual({ disabled: true, selected: false });

    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
    expect(view.getByText('Turn 2 of 2')).toBeTruthy();
    await fireEvent.press(view.getByLabelText(choiceLabel('chai', 1)));
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
    expect(view.getByTestId('scene-completion-scroll')).toBeTruthy();
    expect(view.queryByTestId('scene-scroll')).toBeNull();
    expect(view.getByText('Scene complete')).toBeTruthy();
    const completion = view.getByTestId('scene-completion-motion');
    expect(within(completion).getByTestId('scene-completion-headline').props.accessibilityLanguage).toBe('hi-IN');
    expect(within(completion).getByTestId('scene-completion-gloss').props.children).toBe('Aapne kar dikhaya! · You did it!');
    const completionTestIds = collectTestIds(view.toJSON());
    expect(completionTestIds.indexOf('scene-completion-headline') + 1)
      .toBe(completionTestIds.indexOf('scene-completion-gloss'));
    expect(completionTestIds.indexOf('scene-completion-gloss'))
      .toBeLessThan(completionTestIds.indexOf('scene-completion-title'));

    await fireEvent.press(view.getByRole('button', { name: 'Back to Today' }));
    expect(mockRouterReplace).toHaveBeenCalledWith('/');

    await fireEvent.press(view.getByRole('button', { name: 'Replay scene' }));
    expect(mockResetTimer).toHaveBeenCalledTimes(1);
    expect(view.getByText('Turn 1 of 2')).toBeTruthy();
  });

  it('integrates word-order and recall-reveal beats with the shared scene journey', async () => {
    mockSceneId = 'plan-essentials-06';
    mockAppState.sceneProgress = { [mockSceneId]: { lastBeatIndex: 4 } };
    const wordTarget = getScene(mockSceneId)?.beats[4]?.choices.find((choice) => choice.correct);
    expect(wordTarget).toBeTruthy();
    const wordView = await render(<SceneScreen />);

    expect(wordView.getByTestId('scene-word-order')).toBeTruthy();
    expect(wordView.queryByTestId('scene-choices')).toBeNull();
    for (const token of wordOrderTokens(wordTarget!.hi)) {
      await fireEvent.press(wordView.getByLabelText(`Add word ${token}`));
    }
    await fireEvent.press(wordView.getByLabelText('Check my sentence'));
    expect(wordView.getByText('Natural choice!')).toBeTruthy();
    expect(wordView.getByText('1 correct')).toBeTruthy();
    await fireEvent.press(wordView.getByRole('button', { name: 'Continue' }));
    expect(mockCheckpointScene).toHaveBeenCalledWith(mockSceneId, 5);
    await wordView.unmount();

    mockSceneId = 'plan-essentials-04';
    mockAppState.sceneProgress = { [mockSceneId]: { lastBeatIndex: 9 } };
    const recallTarget = getScene(mockSceneId)?.beats[9]?.choices.find((choice) => choice.correct);
    expect(recallTarget).toBeTruthy();
    const recallView = await render(<SceneScreen />);

    expect(recallView.getByTestId('scene-recall-reveal')).toBeTruthy();
    expect(recallView.queryByText(recallTarget!.hi)).toBeNull();
    await fireEvent.press(recallView.getByLabelText('Reveal the Hindi answer'));
    await fireEvent.press(recallView.getByLabelText('Needs work'));
    expect(recallView.getByText('Keep practicing this phrase.')).toBeTruthy();
    await fireEvent.press(recallView.getByRole('button', { name: 'Finish' }));
    expect(mockMarkSceneComplete).toHaveBeenCalledWith(mockSceneId, 42, {
      correct: 0,
      score: 0,
      total: 1,
      weakPhrases: [recallTarget!.hi],
    });
  });

  it('falls back to choice instructions for a one-token word-order target', async () => {
    mockSceneId = 'plan-essentials-01';
    mockAppState.sceneProgress = { [mockSceneId]: { lastBeatIndex: 4 } };
    const beat = getScene(mockSceneId)!.beats[4]!;
    const target = beat.choices.find((choice) => choice.correct)!;
    const view = await render(<SceneScreen />);

    expect(beat.mode).toBe('wordOrder');
    expect(view.getByTestId('scene-choices')).toBeTruthy();
    expect(view.queryByTestId('scene-word-order')).toBeNull();
    expect(view.getByText(`Choose the Hindi response that means “${target.en}”`)).toBeTruthy();
    expect(view.queryByText(beat.prompt)).toBeNull();

    await fireEvent.press(view.getByLabelText('Show Asha’s hint'));
    expect(view.getByText(`Look for “${target.latin},” the Hindi response for “${target.en}”`)).toBeTruthy();
    expect(view.queryByText(beat.tip)).toBeNull();
  });

  it('reveals natural word order and keeps Asha’s coach note separate across a no-score retry', async () => {
    mockSceneId = 'plan-essentials-06';
    mockAppState.sceneProgress = { [mockSceneId]: { lastBeatIndex: 4 } };
    const target = getScene(mockSceneId)!.beats[4]!.choices.find((choice) => choice.correct)!;
    const view = await render(<SceneScreen />);
    const initialTileOrder = within(view.getByTestId('scene-word-order-choices'))
      .getAllByRole('button')
      .map((button) => String(button.props.accessibilityLabel));

    for (const token of [...wordOrderTokens(target.hi)].reverse()) {
      await fireEvent.press(view.getByLabelText(`Add word ${token}`));
    }
    await fireEvent.press(view.getByLabelText('Check my sentence'));

    const solution = within(view.getByTestId('scene-word-order-solution'));
    expect(solution.getByText('NATURAL ORDER')).toBeTruthy();
    expect(solution.getByText(target.hi)).toBeTruthy();
    expect(solution.getByText(target.latin)).toBeTruthy();
    expect(solution.queryByText(ALTERNATE_COACH_HINDI)).toBeNull();
    const coach = within(view.getByTestId('scene-alternate-coach-note'));
    expect(coach.getByText(ALTERNATE_COACH_HINDI)).toBeTruthy();
    expect(coach.getByText('Karib hai—phir se koshish kijiye.')).toBeTruthy();
    expect(coach.getByText('Close—try again.')).toBeTruthy();
    const recoveryActions = within(view.getByTestId('scene-answer-actions'));
    expect(recoveryActions.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(recoveryActions.getByRole('button', { name: 'Continue' })).toBeTruthy();
    const incorrectTestIds = collectTestIds(view.toJSON());
    expect(incorrectTestIds.indexOf('scene-feedback'))
      .toBeLessThan(incorrectTestIds.indexOf('scene-answer-actions'));
    expect(incorrectTestIds.indexOf('scene-answer-actions'))
      .toBeLessThan(incorrectTestIds.indexOf('scene-save'));
    expect(incorrectTestIds.indexOf('scene-answer-actions'))
      .toBeLessThan(incorrectTestIds.indexOf('scene-words'));
    expect(incorrectTestIds.indexOf('scene-answer-actions'))
      .toBeLessThan(incorrectTestIds.indexOf('scene-pronunciation'));

    await fireEvent.press(view.getByRole('button', { name: 'Try again' }));
    expect(view.queryByTestId('scene-word-order-solution')).toBeNull();
    expect(view.getByText('Your sentence appears here')).toBeTruthy();
    expect(within(view.getByTestId('scene-word-order-choices'))
      .getAllByRole('button')
      .map((button) => String(button.props.accessibilityLabel))).toEqual(initialTileOrder);

    for (const token of wordOrderTokens(target.hi)) {
      await fireEvent.press(view.getByLabelText(`Add word ${token}`));
    }
    await fireEvent.press(view.getByLabelText('Check my sentence'));
    expect(view.getByText('0 correct')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
    expect(mockCheckpointScene).toHaveBeenCalledWith(mockSceneId, 5);
  });

  it('keeps choice order on Try again and cannot add score after the first miss', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const beat = getScene('chai')!.beats[0]!;
    const target = beat.choices.find((choice) => choice.correct)!;
    const wrong = beat.choices.find((choice) => !choice.correct)!;
    const view = await render(<SceneScreen />);
    const initialOrder = within(view.getByTestId('scene-choices'))
      .getAllByRole('button')
      .map((button) => String(button.props.accessibilityLabel));

    await fireEvent.press(view.getByLabelText(choiceAccessibilityLabel(wrong)));
    await fireEvent.press(view.getByRole('button', { name: 'Try again' }));
    expect(within(view.getByTestId('scene-choices'))
      .getAllByRole('button')
      .map((button) => String(button.props.accessibilityLabel))).toEqual(initialOrder);

    await fireEvent.press(view.getByLabelText(choiceAccessibilityLabel(target)));
    expect(view.getByText('0 correct')).toBeTruthy();
    expect(view.queryByText('50')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
    expect(mockCheckpointScene).toHaveBeenCalledWith('chai', 1);
  });

  it('shows target-specific English coaching after a wrong planned-lesson choice', async () => {
    mockSceneId = 'plan-essentials-01';
    const beat = getScene(mockSceneId)!.beats[0]!;
    const wrong = beat.choices.find((choice) => !choice.correct)!;
    expect(wrong.feedback).toBeTruthy();
    const view = await render(<SceneScreen />);

    expect(view.queryByTestId('scene-result-feedback')).toBeNull();
    await fireEvent.press(view.getByLabelText(choiceAccessibilityLabel(wrong)));

    expect(view.getByTestId('scene-result-feedback').props.children).toBe(wrong.feedback);
  });

  it('scrolls recovery actions into view once without animation for reduced motion', async () => {
    mockAppState.motionPreference = 'reduced';
    const view = await render(<SceneScreen />);
    await fireEvent(view.getByTestId('scene-scroll'), 'layout', {
      nativeEvent: { layout: { height: 600, width: 390, x: 0, y: 0 } },
    });
    await fireEvent.press(view.getByLabelText(choiceLabel('chai', 0, 1)));
    sceneScrollToMock.mockClear();

    const actions = view.getByTestId('scene-answer-actions');
    const layout = { nativeEvent: { layout: { height: 112, width: 358, x: 16, y: 940 } } };
    await fireEvent(actions, 'layout', layout);
    await fireEvent(actions, 'layout', layout);

    expect(sceneScrollToMock).toHaveBeenCalledTimes(1);
    expect(sceneScrollToMock).toHaveBeenCalledWith({ animated: false, y: 468 });
  });

  it('scores a resumed scene only over the beats answered after the checkpoint', async () => {
    mockAppState.sceneProgress = { chai: { lastBeatIndex: 1 } };
    const view = await render(<SceneScreen />);
    expect(view.getByText('Turn 2 of 2')).toBeTruthy();

    await fireEvent.press(view.getByLabelText(choiceLabel('chai', 1)));
    await fireEvent.press(view.getByRole('button', { name: 'Finish' }));
    expect(mockMarkSceneComplete).toHaveBeenCalledWith('chai', 42, {
      correct: 1,
      score: 50,
      total: 1,
      weakPhrases: [],
    });

    await fireEvent.press(view.getByRole('button', { name: 'Replay scene' }));
    expect(view.getByText('Turn 1 of 2')).toBeTruthy();
    await fireEvent.press(view.getByLabelText(choiceLabel('chai', 0)));
    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(view.getByLabelText(choiceLabel('chai', 1)));
    await fireEvent.press(view.getByRole('button', { name: 'Finish' }));
    expect(mockMarkSceneComplete).toHaveBeenLastCalledWith('chai', 42, {
      correct: 2,
      score: 100,
      total: 2,
      weakPhrases: [],
    });
  });

  it('ignores a repeated Finish press from the same scene beat', async () => {
    mockAppState.sceneProgress = { chai: { lastBeatIndex: 1 } };
    const view = await render(<SceneScreen />);
    await fireEvent.press(view.getByLabelText(choiceLabel('chai', 1)));
    const finish = view.getByRole('button', { name: 'Finish' });

    await fireEvent.press(finish);
    await fireEvent.press(finish);

    expect(mockMarkSceneComplete).toHaveBeenCalledTimes(1);
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

    await fireEvent.press(view.getByLabelText(choiceLabel('chai', 0, 1)));
    expect(view.getByText('Keep the natural answer')).toBeTruthy();
    expect(view.getByText('Unpack the answer')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Continue' }).props.style).toEqual(expect.objectContaining({
      minHeight: 52,
      width: '100%',
    }));
    const testIds = collectTestIds(view.toJSON());
    expect(testIds.indexOf('scene-feedback')).toBeLessThan(testIds.indexOf('scene-answer-actions'));
    expect(testIds.indexOf('scene-answer-actions')).toBeLessThan(testIds.indexOf('scene-save'));
    expect(testIds.indexOf('scene-save')).toBeLessThan(testIds.indexOf('scene-words'));
    expect(testIds.indexOf('scene-words')).toBeLessThan(testIds.indexOf('scene-pronunciation'));
  });

  it('shows Devanagari and Romanized Hindi before a choice and reveals English for every option after a tap', async () => {
    const beat = getScene('chai')!.beats[0]!;
    const view = await render(<SceneScreen />);
    const choicesBefore = view.getByTestId('scene-choices');
    const buttonsBefore = within(choicesBefore).getAllByRole('button');
    const initialChoiceOrder = buttonsBefore.map((button) => String(button.props.accessibilityLabel));

    expect(buttonsBefore).toHaveLength(3);
    expect([...initialChoiceOrder].sort()).toEqual(beat.choices.map((choice) => choiceAccessibilityLabel(choice)).sort());
    for (const choice of beat.choices) {
      expect(view.getByLabelText(choiceAccessibilityLabel(choice))).toBeTruthy();
      expect(within(choicesBefore).getAllByText(choice.hi)).toHaveLength(1);
      expect(within(choicesBefore).getAllByText(choice.latin)).toHaveLength(1);
      expect(within(choicesBefore).queryAllByText(choice.en)).toHaveLength(0);
    }

    await fireEvent.press(view.getByLabelText(choiceAccessibilityLabel(beat.choices[1]!)));

    const choicesAfter = view.getByTestId('scene-choices');
    const buttonsAfter = within(choicesAfter).getAllByRole('button');
    expect(StyleSheet.flatten(view.getAllByTestId('scene-choice-copy')[0]!.props.style)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
    });
    expect(buttonsAfter.map((button) => String(button.props.accessibilityLabel))).toEqual(
      initialChoiceOrder.map((label) => {
        const choice = beat.choices.find((candidate) => choiceAccessibilityLabel(candidate) === label)!;
        return choiceAccessibilityLabel(choice, true);
      }),
    );
    for (const choice of beat.choices) {
      expect(within(choicesAfter).getAllByText(choice.hi)).toHaveLength(1);
      expect(within(choicesAfter).getAllByText(choice.latin)).toHaveLength(1);
      expect(within(choicesAfter).getAllByText(choice.en)).toHaveLength(1);
      expect(view.getByLabelText(choiceAccessibilityLabel(choice, true))).toBeTruthy();
      expect(view.queryByLabelText(choiceAccessibilityLabel(choice))).toBeNull();
    }
  });

  it('keeps a shuffled order stable and maps a displayed distractor back to its authored result', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const beat = getScene('chai')!.beats[0]!;
    const target = beat.choices[0]!;
    const selectedDistractor = beat.choices[1]!;
    const view = await render(<SceneScreen />);
    const displayOrder = within(view.getByTestId('scene-choices'))
      .getAllByRole('button')
      .map((button) => String(button.props.accessibilityLabel));

    expect(displayOrder).toEqual([
      choiceAccessibilityLabel(beat.choices[1]!),
      choiceAccessibilityLabel(beat.choices[2]!),
      choiceAccessibilityLabel(target),
    ]);
    await view.rerender(<SceneScreen />);
    expect(within(view.getByTestId('scene-choices'))
      .getAllByRole('button')
      .map((button) => String(button.props.accessibilityLabel))).toEqual(displayOrder);

    await fireEvent.press(view.getByLabelText(choiceAccessibilityLabel(selectedDistractor)));

    expect(view.getByLabelText(choiceAccessibilityLabel(selectedDistractor, true)).props.accessibilityState)
      .toEqual({ disabled: true, selected: true });
    expect(view.getByLabelText(choiceAccessibilityLabel(target, true)).props.accessibilityState)
      .toEqual({ disabled: true, selected: false });
    expect(view.getByText('Not quite—notice the pattern.')).toBeTruthy();
    expect(view.getByText('0 correct')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Save phrase'));
    expect(mockTogglePhrase).toHaveBeenCalledWith(target);
  });

  it('creates one shuffle per presentation while ordinary rerenders and reveal keep it stable', async () => {
    const shuffleSpy = jest.spyOn(shuffleChoiceModule, 'shuffleChoices');
    const view = await render(<SceneScreen />);
    expect(shuffleSpy).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByLabelText('Show Asha’s hint'));
    await view.rerender(<SceneScreen />);
    expect(shuffleSpy).toHaveBeenCalledTimes(1);

    await fireEvent.press(view.getByLabelText(choiceLabel('chai', 0)));
    expect(shuffleSpy).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));
    expect(shuffleSpy).toHaveBeenCalledTimes(2);
  });

  it('reshuffles a one-turn lesson on replay even though its beat index stays zero', async () => {
    const activeScene = getScene('chai')!;
    const originalBeats = activeScene.beats;
    const shuffleSpy = jest.spyOn(shuffleChoiceModule, 'shuffleChoices');
    activeScene.beats = [originalBeats[0]!];

    try {
      const view = await render(<SceneScreen />);
      expect(shuffleSpy).toHaveBeenCalledTimes(1);
      await fireEvent.press(view.getByLabelText(choiceLabel('chai', 0)));
      await fireEvent.press(view.getByRole('button', { name: 'Finish' }));
      await fireEvent.press(view.getByRole('button', { name: 'Replay scene' }));

      expect(view.getByText('Turn 1 of 1')).toBeTruthy();
      expect(shuffleSpy).toHaveBeenCalledTimes(2);
      await view.unmount();
    } finally {
      activeScene.beats = originalBeats;
    }
  });

  it('continues from a completed guided lesson to its next sibling', async () => {
    mockSceneId = 'plan-essentials-01';
    mockAppState.sceneProgress = { [mockSceneId]: { lastBeatIndex: 9 } };
    const finalTarget = getScene(mockSceneId)?.beats[9]?.choices.find((choice) => choice.correct);
    expect(finalTarget).toBeTruthy();
    const view = await render(<SceneScreen />);

    await fireEvent.press(view.getByLabelText(choiceAccessibilityLabel(finalTarget!)));
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

    await fireEvent.press(view.getByLabelText(choiceAccessibilityLabel(finalTarget!)));
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
    await fireEvent.press(view.getByLabelText(choiceLabel('chai', 0)));

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
    await fireEvent.press(view.getByLabelText(choiceLabel('chai', 0)));

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

  it('stacks the scene HUD, answer choices, and follow-up controls at accessibility text sizes', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(async () => Dimensions.set({ screen: { ...screen, fontScale: 2 }, window: { ...window, fontScale: 2 } }));

    try {
      const view = await render(<SceneScreen />);
      expect(StyleSheet.flatten(view.getByTestId('scene-progress-header').props.style)).toMatchObject({ flexDirection: 'column' });
      expect(StyleSheet.flatten(view.getByTestId('scene-asha-row').props.style)).toMatchObject({ flexDirection: 'column' });
      expect(StyleSheet.flatten(view.getByTestId('scene-asha-bubble').props.style)).toMatchObject({ alignSelf: 'stretch', flex: 0 });
      expect(StyleSheet.flatten(view.getByLabelText('Hear Asha').props.style)).toMatchObject({ alignSelf: 'flex-end', position: 'relative' });
      expect(StyleSheet.flatten(view.getByLabelText(choiceLabel('chai', 0)).props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column' });

      await fireEvent.press(view.getByLabelText(choiceLabel('chai', 0)));
      expect(StyleSheet.flatten(view.getByTestId('scene-result').props.style)).toMatchObject({ alignItems: 'stretch' });
      expect(StyleSheet.flatten(view.getByRole('button', { name: 'Continue' }).props.style)).toMatchObject({ alignSelf: 'stretch', justifyContent: 'center' });
      expect(StyleSheet.flatten(view.getByTestId('scene-save-row').props.style)).toMatchObject({ alignItems: 'stretch', flexDirection: 'column' });
    }
    finally {
      await act(async () => Dimensions.set({ screen, window }));
    }
  });
});
