import { renderHook } from '@testing-library/react-native';

import { confirmPhraseSave, createAshaToolEnvironment, liveToolSnapshot, useAshaLiveSession } from '../src/hooks/use-asha-live-session';
import { showAppAlert } from '../src/lib/app-alert';
import { dateKey, defaultLearnerProfile, defaultSceneProgress, emptyPractice } from '../src/lib/storage';
import { prepareSavedPhraseFromText } from '../src/services/bolo-api';
import { useAppState } from '../src/state/app-state';

jest.mock('@/services/bolo-api', () => ({ prepareSavedPhraseFromText: jest.fn() }));
jest.mock('@/state/app-state', () => ({ useAppState: jest.fn() }));
jest.mock('@/lib/app-alert', () => ({ showAppAlert: jest.fn() }));

type AppStateValue = ReturnType<typeof useAppState>;

function appState(overrides: Partial<AppStateValue> = {}): AppStateValue {
  return {
    clientId: 'client-12345678',
    learnerProfile: { ...defaultLearnerProfile(), completed: true, level: 'intermediate' },
    phrases: [{ hi: 'धन्यवाद', latin: 'Dhanyavaad', en: 'Thank you' }],
    sceneProgress: { chai: { ...defaultSceneProgress(), lastBeatIndex: 2 } },
    practice: { ...emptyPractice(), date: dateKey(), seconds: 125, liveDone: true },
    streak: 4,
    duePhrases: [],
    togglePhrase: jest.fn(),
    checkpointScene: jest.fn(),
    markLiveTurn: jest.fn(),
    ...overrides,
  } as unknown as AppStateValue;
}

describe('Asha live session setup', () => {
  it('snapshots today’s learner state for tools', () => {
    expect(liveToolSnapshot(appState())).toMatchObject({ streak: 4, practiceSecondsToday: 125, liveDoneToday: true, duePhraseCount: 0 });
    expect(liveToolSnapshot(appState({ practice: { ...emptyPractice(), date: '2000-01-01', seconds: 900, liveDone: true } }))).toMatchObject({ practiceSecondsToday: 0, liveDoneToday: false });
  });

  it('routes tool side effects through existing app actions', async () => {
    const state = appState();
    const environment = createAshaToolEnvironment({ current: state });
    const phrase = { hi: 'नया', latin: 'Naya', en: 'New' };
    environment.savePhrase(phrase);
    expect(state.togglePhrase).toHaveBeenCalledWith(phrase);
    environment.recordLessonPractice('chai');
    expect(state.checkpointScene).toHaveBeenCalledWith('chai', 2);
    expect(state.markLiveTurn).toHaveBeenCalledWith();
    environment.recordLessonPractice('market');
    expect(state.checkpointScene).toHaveBeenLastCalledWith('market', 0);
    jest.mocked(prepareSavedPhraseFromText).mockResolvedValue(phrase);
    const signal = new AbortController().signal;
    await expect(environment.preparePhrase({ originalText: 'Naya', devanagari: 'नया' }, signal)).resolves.toEqual(phrase);
    expect(prepareSavedPhraseFromText).toHaveBeenCalledWith({ clientId: 'client-12345678', text: 'नया' }, signal);
    await environment.preparePhrase({ originalText: 'Naya' }, signal);
    expect(prepareSavedPhraseFromText).toHaveBeenLastCalledWith({ clientId: 'client-12345678', text: 'Naya' }, signal);
  });

  it('builds mode, context and a tool environment from the latest state', async () => {
    jest.mocked(useAppState).mockReturnValue(appState());
    const { result, rerender } = await renderHook(() => useAshaLiveSession());
    const first = result.current;
    const setup = first();
    expect(setup.mode).toBe('conversation');
    expect(setup.context).toMatchObject({ learnerLevel: 'intermediate', lessonId: 'chai' });
    expect(setup.toolEnvironment?.getSnapshot().phrases).toHaveLength(1);
    jest.mocked(useAppState).mockReturnValue(appState({ phrases: [] }));
    await rerender({});
    expect(result.current).toBe(first);
    expect(setup.toolEnvironment?.getSnapshot().phrases).toHaveLength(0);
  });

  it('asks the learner in the app before saving and treats dismiss or session end as no', async () => {
    const phrase = { hi: 'नया', latin: 'Naya', en: 'New' };
    const buttons = () => jest.mocked(showAppAlert).mock.lastCall?.[2] ?? [];
    const approved = confirmPhraseSave(phrase, new AbortController().signal);
    expect(showAppAlert).toHaveBeenLastCalledWith('Save this phrase?', 'नया\nNaya\nNew', expect.any(Array), expect.objectContaining({ cancelable: true }));
    buttons().find((button) => button.text === 'Save')?.onPress?.();
    await expect(approved).resolves.toBe(true);

    const declined = confirmPhraseSave(phrase, new AbortController().signal);
    buttons().find((button) => button.style === 'cancel')?.onPress?.();
    await expect(declined).resolves.toBe(false);

    const dismissed = confirmPhraseSave(phrase, new AbortController().signal);
    jest.mocked(showAppAlert).mock.lastCall?.[3]?.onDismiss?.();
    await expect(dismissed).resolves.toBe(false);

    const controller = new AbortController();
    const ended = confirmPhraseSave(phrase, controller.signal);
    controller.abort();
    buttons().find((button) => button.text === 'Save')?.onPress?.();
    await expect(ended).resolves.toBe(false);
  });
});
