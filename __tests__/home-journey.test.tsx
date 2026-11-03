// Keep built-in journey fixtures independent of locally imported lessons.
jest.mock('../src/data/creator-lessons', () => ({ creatorLessons: [] }));

import { fireEvent, render, within } from '@testing-library/react-native';
import { FlatList, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { getScene } from '../src/data/scenes';
import { dateKey } from '../src/lib/storage';
import { colors, layout, spacing } from '../src/theme';

const mockRouterPush = jest.fn();
const mockSetGoal = jest.fn();
const mockAppState = {
  duePhrases: [] as { en: string; hi: string; latin: string }[],
  goal: 10 as 5 | 10 | 15,
  hydrated: true,
  phraseReviews: {} as Record<string, { mastery: number; dueAt?: string }>,
  phrases: [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }] as { en: string; hi: string; latin: string }[],
  practice: { chaiDone: true, date: dateKey(), liveDone: false, seconds: 300 },
  practiceHistory: [] as { date: string; seconds: number; correct: number; answers: number; reviews: number }[],
  reviewStreakDays: [] as string[],
  sceneProgress: {} as Record<string, {
    completions: number;
    lastBeatIndex?: number;
    lastPracticedAt?: string | null;
  }>,
  setGoal: mockSetGoal,
  streak: 2,
};
const mockExpand = jest.fn();
const mockAshaSession = {
  available: false,
  expand: mockExpand,
  minimized: false,
  status: 'disconnected' as 'disconnected' | 'connecting' | 'ready' | 'recording' | 'responding',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
}));

jest.mock('@/state/asha-voice-session', () => ({
  useAshaVoiceSession: () => mockAshaSession,
}));

import HomeScreen from '../src/app/(tabs)/index';

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

/** Buttons whose flattened style is the rust `primary` fill. */
function collectFilledButtons(node: unknown, found: string[] = []) {
  if (!node || typeof node === 'string' || typeof node === 'number') return found;
  if (Array.isArray(node)) {
    node.forEach((child) => collectFilledButtons(child, found));
    return found;
  }
  const testNode = node as { children?: unknown[]; props?: { accessibilityRole?: string; style?: StyleProp<ViewStyle>; testID?: string } };
  if (testNode.props?.accessibilityRole === 'button' && StyleSheet.flatten(testNode.props.style)?.backgroundColor === colors.brand) {
    found.push(testNode.props.testID ?? '(no testID)');
  }
  testNode.children?.forEach((child) => collectFilledButtons(child, found));
  return found;
}

async function renderExpanded() {
  const view = await render(<HomeScreen />);
  await fireEvent.press(view.getByTestId('today-next-toggle'));
  return view;
}

describe('HomeScreen primary journey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.goal = 10;
    mockAppState.hydrated = true;
    mockAppState.duePhrases = [];
    mockAppState.phraseReviews = {};
    mockAppState.phrases = [{ en: 'Hello', hi: 'नमस्ते', latin: 'namaste' }];
    mockAppState.practice = { chaiDone: true, date: dateKey(), liveDone: false, seconds: 300 };
    mockAppState.practiceHistory = [];
    mockAppState.reviewStreakDays = [];
    mockAppState.sceneProgress = {};
    mockAppState.streak = 2;
    mockAshaSession.available = false;
    mockAshaSession.minimized = false;
    mockAshaSession.status = 'disconnected';
  });

  it('renders the greeting header with the streak pill and keeps Settings navigation working', async () => {
    const view = await render(<HomeScreen />);

    expect(view.getByTestId('today-topbar').children).toHaveLength(2);
    expect(view.getByText('Namaste')).toBeTruthy();
    expect(view.getAllByText('नमस्ते').length).toBeGreaterThanOrEqual(1);
    expect(view.getByText('2 days')).toBeTruthy();

    const settings = view.getByLabelText('Settings');
    expect(settings.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(settings.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent.press(settings);
    expect(mockRouterPush).toHaveBeenCalledWith('/settings');
  });

  it('leads with Asha: portrait, READY pill, heading and one Talk with Asha button', async () => {
    const view = await render(<HomeScreen />);

    const hero = view.getByTestId('today-asha-hero');
    const portrait = within(hero).getByTestId('today-asha-portrait');
    expect(portrait.props.accessibilityRole).toBe('button');
    expect(portrait.props.accessibilityLabel).toBe('Talk to Asha');
    expect(within(view.getByTestId('today-asha-status')).getByText('READY')).toBeTruthy();
    const statusDot = view.getByTestId('today-asha-status').children[0] as unknown as { props: { style: StyleProp<ViewStyle> } };
    expect(StyleSheet.flatten(statusDot.props.style)).toMatchObject({ width: layout.statusDotSize, height: layout.statusDotSize });
    expect(within(hero).getByText('Ready when you are').props.accessibilityLiveRegion).toBe('polite');
    // No body line: on Today a tap only opens the Asha screen, so "Tap Asha to unmute…" would be wrong here.
    expect(view.queryByText('Tap Asha to start talking with her.')).toBeNull();
    expect(within(hero).queryByText(/Tap Asha/u)).toBeNull();
    expect(within(hero).getAllByRole('text').map((node) => node.props.children)).toEqual(['READY', 'Ready when you are']);
    const talk = view.getByTestId('today-talk-with-asha');
    expect(talk.props.accessibilityRole).toBe('button');
    expect(within(talk).getByText('Talk with Asha')).toBeTruthy();
    expect(StyleSheet.flatten(talk.props.style)).toMatchObject({ backgroundColor: colors.brand, minHeight: 52 });
    // Nothing on home may read exactly "Asha": the Maestro flows tap the tab by that label.
    expect(view.queryByText('Asha')).toBeNull();
    expect(view.queryByLabelText('Asha')).toBeNull();
  });

  it('opens the Asha screen from the button and the portrait', async () => {
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByTestId('today-talk-with-asha'));
    await fireEvent.press(view.getByTestId('today-asha-portrait'));

    expect(mockRouterPush).toHaveBeenCalledTimes(2);
    expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/live');
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/live');
    expect(mockExpand).not.toHaveBeenCalled();
  });

  it('expands a minimized shared session instead of pushing a second Asha screen', async () => {
    mockAshaSession.available = true;
    mockAshaSession.minimized = true;
    mockAshaSession.status = 'ready';
    const view = await render(<HomeScreen />);

    await fireEvent.press(view.getByTestId('today-talk-with-asha'));

    expect(mockExpand).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(within(view.getByTestId('today-talk-with-asha')).getByText('Talk with Asha')).toBeTruthy();
  });

  it('sends the SPEAK step’s own action back to a minimized session too', async () => {
    mockAppState.phrases = [];
    mockAppState.practiceHistory = [{ answers: 10, correct: 9, date: dateKey(), reviews: 0, seconds: 300 }];
    mockAshaSession.available = true;
    mockAshaSession.minimized = true;
    mockAshaSession.status = 'ready';
    const view = await renderExpanded();

    expect(view.getByText('STEP 2 OF 2 · SPEAK')).toBeTruthy();
    await fireEvent.press(view.getByTestId('today-next-step'));

    expect(mockExpand).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('scrolls the opened panel into view with the card at the top', async () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const view = await render(<HomeScreen />);

    await fireEvent(view.getByTestId('today-next-card'), 'layout', { nativeEvent: { layout: { height: 100, width: 350, x: 0, y: 480 } } });
    await fireEvent.press(view.getByTestId('today-next-toggle'));
    await fireEvent(view.getByTestId('today-next-details'), 'layout', { nativeEvent: { layout: { height: 400, width: 350, x: 0, y: 0 } } });

    expect(scrollToOffset).toHaveBeenCalledTimes(1);
    // The card's y inside the header plus the list's 16pt top padding, less 16pt of air above the card.
    expect(scrollToOffset).toHaveBeenCalledWith({ animated: true, offset: 480 + spacing.lg - spacing.lg });

    // Collapsing and re-opening scrolls again; a later relayout of the open panel does not.
    await fireEvent(view.getByTestId('today-next-details'), 'layout', { nativeEvent: { layout: { height: 420, width: 350, x: 0, y: 0 } } });
    expect(scrollToOffset).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByTestId('today-next-toggle'));
    await fireEvent.press(view.getByTestId('today-next-toggle'));
    await fireEvent(view.getByTestId('today-next-details'), 'layout', { nativeEvent: { layout: { height: 400, width: 350, x: 0, y: 0 } } });
    expect(scrollToOffset).toHaveBeenCalledTimes(2);
  });

  it('mirrors the shared session status in the pill, heading and rings', async () => {
    mockAshaSession.available = true;
    mockAshaSession.status = 'responding';
    const view = await render(<HomeScreen />);

    expect(within(view.getByTestId('today-asha-status')).getByText('SPEAKING')).toBeTruthy();
    expect(view.getByText('Asha is speaking')).toBeTruthy();
    expect(view.queryByText('Your mic is muted. Tap Asha to speak at any time.')).toBeNull();
    expect(StyleSheet.flatten(view.getByTestId('today-asha-ring-outer').props.style).borderColor).toBe(colors.orb);
    expect(StyleSheet.flatten(view.getByTestId('today-asha-ring-inner').props.style).borderColor).toBe(colors.orbActive);

    mockAshaSession.status = 'recording';
    await view.rerender(<HomeScreen />);
    expect(within(view.getByTestId('today-asha-status')).getByText('LISTENING')).toBeTruthy();
    expect(view.getByText('Your microphone is on')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('today-asha-ring-inner').props.style).borderColor).toBe(colors.orbRecording);

    mockAshaSession.status = 'disconnected';
    await view.rerender(<HomeScreen />);
    expect(within(view.getByTestId('today-asha-status')).getByText('READY')).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('today-asha-ring-outer').props.style).borderColor).toBe(colors.portraitRingFaint);
    expect(StyleSheet.flatten(view.getByTestId('today-asha-ring-inner').props.style).borderColor).toBe(colors.portraitRing);
  });

  it('starts the lesson from the row body without expanding it', async () => {
    mockAppState.reviewStreakDays = [dateKey()];
    const view = await render(<HomeScreen />);

    const row = view.getByTestId('today-next-row');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityState?.expanded).toBeUndefined();
    expect(row.props.accessibilityLabel).toBe('Start lesson, A warm hello, 5 of 10 min today');
    expect(row.props.accessibilityHint).toBe('Starts the lesson');
    expect(view.getByText('STEP 2 OF 3 · NEXT LESSON')).toBeTruthy();
    expect(within(row).getByTestId('today-goal-dial', { includeHiddenElements: true })).toBeTruthy();
    expect(within(row).getByText('A warm hello')).toBeTruthy();

    await fireEvent.press(row);

    expect(mockRouterPush).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-essentials-01' } });
    expect(view.queryByTestId('today-next-details')).toBeNull();
    expect(view.getByTestId('today-next-toggle').props.accessibilityState).toEqual({ expanded: false });
  });

  it('expands and collapses the next lesson from the chevron only', async () => {
    mockAppState.reviewStreakDays = [dateKey()];
    const view = await render(<HomeScreen />);

    const toggle = view.getByTestId('today-next-toggle');
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    expect(toggle.props.accessibilityLabel).toBe('Next lesson, A warm hello, collapsed');
    expect(view.queryByTestId('today-next-details')).toBeNull();
    expect(view.queryByTestId('today-steps')).toBeNull();
    expect(view.queryByTestId('today-current-plan')).toBeNull();
    expect(view.queryByTestId('today-next-step')).toBeNull();
    expect(view.queryByTestId('today-lesson-words')).toBeNull();

    await fireEvent.press(toggle);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(view.getByTestId('today-next-toggle').props.accessibilityState).toEqual({ expanded: true });
    expect(view.getByTestId('today-next-toggle').props.accessibilityLabel).toBe('Next lesson, A warm hello, expanded');
    // The panel opens inside the row's card, under a hairline.
    const card = view.getByTestId('today-next-card');
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({ backgroundColor: colors.paperRaised, borderColor: colors.line, borderWidth: 1 });
    const details = within(card).getByTestId('today-next-details');
    expect(StyleSheet.flatten(details.props.style)).toMatchObject({ borderTopColor: colors.line, borderTopWidth: 1 });
    expect(within(details).getByTestId('today-steps')).toBeTruthy();
    expect(within(details).getByTestId('today-lesson-words')).toBeTruthy();
    expect(within(details).getByTestId('today-current-plan')).toBeTruthy();
    expect(within(details).getByTestId('today-next-step')).toBeTruthy();
    expect(within(details).getByText('Your path')).toBeTruthy();

    await fireEvent.press(view.getByTestId('today-next-toggle'));
    expect(view.getByTestId('today-next-toggle').props.accessibilityState).toEqual({ expanded: false });
    expect(view.getByTestId('today-next-toggle').props.accessibilityLabel).toBe('Next lesson, A warm hello, collapsed');
    expect(view.queryByTestId('today-next-details')).toBeNull();
  });

  it('gives the row body and the chevron full-size touch targets', async () => {
    const view = await render(<HomeScreen />);

    expect(StyleSheet.flatten(view.getByTestId('today-next-row').props.style).minHeight).toBe(72);
    expect(StyleSheet.flatten(view.getByTestId('today-next-row').props.style).minHeight).toBeGreaterThanOrEqual(44);
    const toggle = StyleSheet.flatten(view.getByTestId('today-next-toggle').props.style);
    expect(toggle.width).toBeGreaterThanOrEqual(44);
    expect(toggle.height).toBeGreaterThanOrEqual(44);
    expect(toggle.minWidth).toBeGreaterThanOrEqual(44);
    expect(toggle.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('shows a Play icon affordance in the row body that VoiceOver skips', async () => {
    const view = await render(<HomeScreen />);

    const row = view.getByTestId('today-next-row');
    const affordance = within(row).getByTestId('today-next-start');
    expect(affordance.props.accessible).toBe(false);
    expect(affordance.props.importantForAccessibility).toBe('no');
    // Icon only: no text label, so the text column keeps its width at 393pt.
    expect(within(affordance).queryByText(/./u)).toBeNull();
    expect(view.queryByText('Start')).toBeNull();
    const circle = within(affordance).getByTestId('today-next-start-circle');
    expect(StyleSheet.flatten(circle.props.style)).toMatchObject({ width: layout.playCircleSize, height: layout.playCircleSize, backgroundColor: colors.brandSoft });
    // The row label and hint are unchanged; the affordance is decorative.
    expect(row.props.accessibilityLabel).toBe('Start review, Review your phrases, 5 of 10 min today');
    expect(row.props.accessibilityHint).toBe('Starts the review');
    // Order inside the card row: ring, text column, Play circle, then the chevron outside the row.
    const cardRowIds = collectTestIds(view.getByTestId('today-next-card'));
    expect(cardRowIds.indexOf('today-next-practice')).toBeLessThan(cardRowIds.indexOf('today-next-start-circle'));
    expect(cardRowIds.indexOf('today-next-start-circle')).toBeLessThan(cardRowIds.indexOf('today-next-toggle'));
    expect(collectTestIds(row)).not.toContain('today-next-toggle');
  });

  it('keeps Talk with Asha the only filled button and ends the panel with an outline button', async () => {
    const view = await render(<HomeScreen />);
    expect(collectFilledButtons(view.toJSON())).toEqual(['today-talk-with-asha']);

    await fireEvent.press(view.getByTestId('today-next-toggle'));
    expect(collectFilledButtons(view.toJSON())).toEqual(['today-talk-with-asha']);
    const nextStep = view.getByTestId('today-next-step');
    const nextStepStyle = StyleSheet.flatten(nextStep.props.style);
    expect(nextStepStyle).toMatchObject({ backgroundColor: 'transparent', borderColor: colors.brand, flex: 1 });
    expect(nextStepStyle.borderWidth).toBeGreaterThanOrEqual(1.5);
    expect(nextStepStyle.borderWidth).toBeLessThanOrEqual(2);
    expect(nextStepStyle.minHeight).toBeGreaterThanOrEqual(layout.touchTarget);
    // A phrase is due in this fixture, so the step action is the review.
    expect(nextStep.props.accessibilityLabel).toBe('Start review');
    expect(within(nextStep).getByText('Start review')).toBeTruthy();
    expect(StyleSheet.flatten(within(nextStep).getByText('Start review').props.style).color).toBe(colors.brandText);
    expect(within(view.getByTestId('today-hero-footer')).getByTestId('today-next-step')).toBeTruthy();
    const panelIds = collectTestIds(view.getByTestId('today-next-details'));
    expect(panelIds[panelIds.length - 1]).toBe('today-next-step');
  });

  it('starts the day with review when phrases are due and previews them', async () => {
    mockAppState.phrases = [
      { en: 'Hello', hi: 'नमस्ते', latin: 'namaste' },
      { en: 'Thank you', hi: 'धन्यवाद', latin: 'Dhanyavaad' },
      { en: 'How much is it?', hi: 'कितने का है?', latin: 'Kitne ka hai?' },
      { en: 'Water, please', hi: 'पानी, कृपया', latin: 'Paani, kripya' },
    ];
    const view = await renderExpanded();

    expect(view.getByText('STEP 1 OF 3 · REVIEW')).toBeTruthy();
    expect(view.getByText('Review your phrases')).toBeTruthy();
    expect(view.getByText('4 phrases due. A quick recall keeps them fresh.')).toBeTruthy();
    const preview = view.getByTestId('today-review-preview');
    expect(preview.children).toHaveLength(3);
    expect(within(preview).queryByText('पानी, कृपया')).toBeNull();
    const lastChip = preview.children[2] as unknown as { props: { style: StyleProp<ViewStyle> } };
    expect(StyleSheet.flatten(lastChip.props.style).opacity).toBe(0.5);
    expect(view.getByTestId('today-step-review').props.accessibilityLabel).toBe('Step 1 of 3, Review saved phrases, up next');
    expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toBe('Step 2 of 3, Lesson: A warm hello, later');
    expect(view.getByTestId('today-step-asha').props.accessibilityLabel).toBe('Step 3 of 3, Chat with Asha, later');

    await fireEvent.press(view.getByLabelText('Start review'));
    expect(mockRouterPush).toHaveBeenCalledWith('/review');
  });

  it('previews romanized phrases for Latin-script learners', async () => {
    Object.assign(mockAppState, { learnerProfile: { completed: true, scriptPreference: 'latin' } });
    try {
      const view = await renderExpanded();
      const preview = view.getByTestId('today-review-preview');
      expect(within(preview).getByText(/^namaste$/i)).toBeTruthy();
      expect(within(preview).queryByText('नमस्ते')).toBeNull();
    } finally {
      delete (mockAppState as { learnerProfile?: unknown }).learnerProfile;
    }
  });

  it('moves to the next lesson once review is done, from real scene data', async () => {
    mockAppState.reviewStreakDays = [dateKey()];
    const scene = getScene('plan-essentials-01')!;
    const view = await renderExpanded();

    expect(view.getByText('STEP 2 OF 3 · NEXT LESSON')).toBeTruthy();
    expect(view.getByText('A warm hello')).toBeTruthy();
    // The subtitle names the phrase being taught instead of repeating the title.
    expect(view.getByText(`New phrase: “${scene.subtitle.replace(/[.!?]$/u, '')}”`)).toBeTruthy();
    expect(view.getByText('Start speaking · Lesson 1 of 10')).toBeTruthy();
    for (const word of scene.words) expect(within(view.getByTestId('today-lesson-words')).getAllByText(word).length).toBeGreaterThanOrEqual(1);
    expect(view.getByTestId('today-step-review').props.accessibilityLabel).toBe('Step 1 of 3, Reviewed phrases, done');

    await fireEvent.press(view.getByLabelText('Start lesson'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-essentials-01' } });
  });

  it('skips review when nothing is due', async () => {
    mockAppState.phrases = [];
    const view = await renderExpanded();

    // With nothing due the review step is left out, so a new learner never sees a struck-out "Skipped" row.
    expect(view.getByText('STEP 1 OF 2 · NEXT LESSON')).toBeTruthy();
    expect(view.queryByTestId('today-step-review')).toBeNull();
    expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toMatch(/^Step 1 of 2, /u);
    expect(view.queryByTestId('today-review-preview')).toBeNull();
  });

  it('invites the learner to speak with Asha after the lesson', async () => {
    mockAppState.phrases = [];
    mockAppState.practiceHistory = [{ answers: 10, correct: 9, date: dateKey(), reviews: 0, seconds: 300 }];
    const view = await renderExpanded();

    expect(view.getByText('STEP 2 OF 2 · SPEAK')).toBeTruthy();
    expect(view.getByText('Say it out loud')).toBeTruthy();
    expect(view.getByTestId('today-asha-invite-portrait')).toBeTruthy();
    expect(view.getByText('“Ready? Greet me like a neighbor and tell me your name.”')).toBeTruthy();
    expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toBe('Step 1 of 2, Finished a lesson, done');
    // The hero's portrait and the step's own action both lead to Asha.
    expect(view.getByTestId('today-asha-portrait')).toBeTruthy();

    await fireEvent.press(view.getByTestId('today-next-step'));
    expect(mockRouterPush).toHaveBeenCalledWith('/live');
  });

  it('celebrates a finished day and still offers the next lesson', async () => {
    mockAppState.phrases = [];
    mockAppState.streak = 7;
    mockAppState.practice = { chaiDone: false, date: dateKey(), liveDone: true, seconds: 600 };
    mockAppState.practiceHistory = [{ answers: 10, correct: 9, date: dateKey(), reviews: 0, seconds: 600 }];
    const view = await render(<HomeScreen />);

    expect(view.getByText('DONE FOR TODAY')).toBeTruthy();
    expect(view.getByText('Shabaash!')).toBeTruthy();
    expect(view.getByText('Today’s practice is complete. 7 days in a row. More is optional.')).toBeTruthy();
    // Success reads forest, as the old finished-day card did.
    expect(StyleSheet.flatten(view.getByText('DONE FOR TODAY').props.style).color).toBe(colors.forestText);
    expect(view.getByTestId('today-next-row').props.accessibilityLabel).toBe('Keep going, Shabaash!, 10 of 10 min today');
    expect(view.getByTestId('today-next-toggle').props.accessibilityLabel).toBe('Next lesson, Shabaash!, collapsed');

    await fireEvent.press(view.getByTestId('today-next-toggle'));
    expect(view.getByTestId('today-step-asha').props.accessibilityLabel).toBe('Step 2 of 2, Spoke with Asha, done');
    await fireEvent.press(view.getByLabelText('Keep going'));
    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-essentials-01' } });
  });

  it('routes the streak, the current plan, and the full catalog', async () => {
    const view = await renderExpanded();

    await fireEvent.press(view.getByLabelText('Browse all 10 plans'));
    await fireEvent.press(view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete'));
    await fireEvent.press(view.getByLabelText('2 day practice streak'));

    expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/lesson-plans');
    expect(mockRouterPush).toHaveBeenNthCalledWith(2, { pathname: '/lesson-plans', params: { planId: 'essentials' } });
    expect(mockRouterPush).toHaveBeenNthCalledWith(3, '/progress');
  });

  it('keeps the hero, the next row, the steps and the current plan above the step button', async () => {
    const view = await renderExpanded();

    expect(view.getByText('Your path')).toBeTruthy();
    expect(view.getByText('All plans')).toBeTruthy();
    expect(view.getByText('0 of 10 lessons')).toBeTruthy();
    expect(view.getByTestId('today-plan-segments').children).toHaveLength(10);
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-0').props.style).backgroundColor).toBe(colors.goldIcon);
    expect(StyleSheet.flatten(view.getByTestId('today-plan-segment-1').props.style).backgroundColor).toBe(colors.line);
    expect(view.queryByLabelText('Make a connection, plan 2 of 10, 0 of 10 lessons complete')).toBeNull();
    const testIds = collectTestIds(view.toJSON());
    expect(testIds.indexOf('today-asha-hero')).toBeLessThan(testIds.indexOf('today-talk-with-asha'));
    expect(testIds.indexOf('today-talk-with-asha')).toBeLessThan(testIds.indexOf('today-next-row'));
    expect(testIds.indexOf('today-next-row')).toBeLessThan(testIds.indexOf('today-next-toggle'));
    expect(testIds.indexOf('today-next-toggle')).toBeLessThan(testIds.indexOf('today-steps'));
    expect(testIds.indexOf('today-steps')).toBeLessThan(testIds.indexOf('today-current-plan'));
    expect(testIds.indexOf('today-current-plan')).toBeLessThan(testIds.indexOf('today-next-step'));
    // The plan row is a hairline inside the card, not a second white card.
    const planRow = view.getByLabelText('Start speaking, plan 1 of 10, 0 of 10 lessons complete');
    expect(StyleSheet.flatten(planRow.props.style)).toMatchObject({ borderTopColor: colors.line, borderTopWidth: 1 });
    expect(StyleSheet.flatten(planRow.props.style).backgroundColor).toBeUndefined();
    expect(view.queryByText('Or jump to')).toBeNull();
    expect(view.queryByLabelText('5 minute daily goal')).toBeNull();
  });

  it('advances the current plan card after the prior plan is complete', async () => {
    mockAppState.sceneProgress = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `plan-essentials-${String(index + 1).padStart(2, '0')}`,
        { completions: 1 },
      ]),
    );

    const view = await renderExpanded();

    expect(view.getByText('All plans')).toBeTruthy();
    expect(view.getByLabelText('Make a connection, plan 2 of 10, 0 of 10 lessons complete')).toBeTruthy();
    expect(view.getByTestId('today-step-lesson').props.accessibilityLabel).toBe('Step 2 of 3, Lesson: Ask where someone lives, later');
  });

  it('prioritizes the most recently practiced unfinished lesson and its plan', async () => {
    mockAppState.phrases = [];
    mockAppState.sceneProgress = {
      'plan-essentials-03': { completions: 0, lastBeatIndex: 2, lastPracticedAt: '2026-07-20T12:00:00.000Z' },
      'plan-connection-02': { completions: 0, lastBeatIndex: 1, lastPracticedAt: '2026-07-21T12:00:00.000Z' },
    };

    const view = await renderExpanded();

    expect(view.getByText('STEP 1 OF 2 · CONTINUE LESSON')).toBeTruthy();
    expect(view.getByText('Say you are new')).toBeTruthy();
    expect(view.getByText('Lesson 2 in progress')).toBeTruthy();
    expect(view.getByLabelText('Make a connection, plan 2 of 10, lesson 2 in progress, 0 of 10 lessons complete')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Continue'));

    expect(mockRouterPush).toHaveBeenCalledWith({ pathname: '/scene/[id]', params: { id: 'plan-connection-02' } });
  });

  it('shows daily goal progress inside the next lesson row', async () => {
    const view = await render(<HomeScreen />);

    // The ring is a silent numeral inside the row, hidden from assistive tech; the row's label and the minutes line carry the value.
    const hidden = { includeHiddenElements: true };
    expect(view.queryByTestId('today-goal-dial')).toBeNull();
    const dial = view.getByTestId('today-goal-dial', hidden);
    expect(dial.props.accessibilityRole).toBe('progressbar');
    expect(dial.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 });
    expect(dial.props.accessibilityLabel).toBe('50 percent of daily goal complete');
    expect(dial.props.accessible).toBe(false);
    expect(dial.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(within(dial).getAllByRole('text', hidden).map((node) => node.props.children)).toEqual(['5']);
    expect(view.queryByText('of 10 min', hidden)).toBeNull();
    const row = view.getByTestId('today-next-row');
    expect(within(row).getByTestId('today-goal-dial', hidden)).toBeTruthy();
    const minutes = within(view.getByTestId('today-next-practice')).getByTestId('today-goal-value');
    expect(minutes.props.children).toBe('5 of 10 min today');
    expect(row.props.accessibilityLabel).toBe('Start review, Review your phrases, 5 of 10 min today');

    mockAppState.goal = 15;
    await view.rerender(<HomeScreen />);
    expect(view.getByTestId('today-goal-value').props.children).toBe('5 of 15 min today');
    expect(view.getByTestId('today-goal-dial', hidden).props.accessibilityLabel).toBe('33 percent of daily goal complete');

    mockAppState.practice = { chaiDone: true, date: dateKey(), liveDone: true, seconds: 1200 };
    await view.rerender(<HomeScreen />);
    expect(view.getByTestId('today-goal-dial', hidden).props.accessibilityLabel).toBe('100 percent of daily goal complete');
    expect(view.getByTestId('today-goal-value').props.children).toBe('15+ min today');
    expect(view.getByTestId('today-next-row').props.accessibilityLabel).toBe('Start review, Review your phrases, 15+ min today');
    expect(view.getByText('15+', hidden)).toBeTruthy();
    expect(view.queryByText('min', hidden)).toBeNull();
  });
});
