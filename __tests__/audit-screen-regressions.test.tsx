import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as mockReact from 'react';

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockCompleteOnboarding = jest.fn();
const mockReviewPhrase = jest.fn();
const mockDiagnosticsSnapshot = {
  days: {
    '2026-07-20': {
      ai_request_succeeded: { count: 0, totalDurationMs: 100 },
    },
  },
};

let mockAppState: Record<string, unknown>;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => mockReact.useEffect(effect, [effect]),
  useRouter: () => mockRouter,
}));

jest.mock('expo-audio', () => ({
  AudioModule: {
    getRecordingPermissionsAsync: jest.fn(async () => ({ granted: false })),
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: false })),
  },
}));

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

jest.mock('@/state/app-state', () => ({
  useAppState: () => mockAppState,
  useAppStateValue: () => mockAppState,
  useAppActions: () => mockAppState,
}));

jest.mock('@/lib/speech', () => ({
  hasOfflineSpeech: jest.fn(() => false),
  speakText: jest.fn(),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('@/lib/observability', () => ({
  getObservabilitySnapshot: jest.fn(async () => mockDiagnosticsSnapshot),
  observe: jest.fn(),
}));

jest.mock('@/services/bolo-api', () => ({
  prepareSavedPhraseFromText: jest.fn(),
}));

import DiagnosticsScreen from '../src/app/diagnostics';
import OnboardingScreen from '../src/app/onboarding';
import ProgressScreen, { createProgressStyles } from '../src/app/(tabs)/progress';
import ReviewScreen from '../src/app/review';
import { TranscriptPhrasePicker } from '../src/components/transcript-phrase-picker';
import { darkColors } from '../src/theme';

const boloApi = jest.requireMock('../src/services/bolo-api') as { prepareSavedPhraseFromText: jest.Mock };
const speech = jest.requireMock('../src/lib/speech') as { speakText: jest.Mock };

const phrase = { hi: 'आप कैसे हैं?', latin: 'Aap kaise hain?', en: 'How are you?' };

describe('previously uncovered audit screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = {
      aiConsent: false,
      completeOnboarding: mockCompleteOnboarding,
      duePhrases: [phrase],
      learnerProfile: {
        completed: true,
        level: 'new',
        microphoneTested: false,
        primaryGoal: 'conversation',
        responseLanguage: 'en',
        scriptPreference: 'both',
      },
      phraseReviews: {},
      phrases: [phrase],
      practiceHistory: [],
      reviewPhrase: mockReviewPhrase,
      reviewStreak: 0,
      sceneProgress: {},
      streak: 0,
    };
    boloApi.prepareSavedPhraseFromText.mockResolvedValue(phrase);
  });

  it('does not display an infinite diagnostics average for a zero-count counter', async () => {
    const view = await render(<DiagnosticsScreen />);

    await waitFor(() => expect(view.getByText('ai request succeeded')).toBeTruthy());
    expect(view.queryByText(/Infinity/u)).toBeNull();
    expect(view.getByText('0')).toBeTruthy();
  });

  it('disables connected review audio when consent is absent and no bundled clip exists', async () => {
    const view = await render(<ReviewScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Reveal answer' }));

    expect(view.getByRole('button', { name: `Hear ${phrase.hi}` }).props.accessibilityState).toEqual({ disabled: true });
    expect(speech.speakText).not.toHaveBeenCalled();
  });

  it('saves transcript phrases with distinct Devanagari and Romanized fields', async () => {
    const onSave = jest.fn();
    const view = await render(
      <TranscriptPhrasePicker
        aiConsent
        clientId="client-12345678"
        message={{ id: 'message-1', role: 'asha', text: 'How are you?' }}
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );
    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    expect(boloApi.prepareSavedPhraseFromText).toHaveBeenCalledWith({ clientId: 'client-12345678', text: 'How are you?' }, expect.any(AbortSignal));
    await waitFor(() => expect(view.getByLabelText('Hindi phrase').props.value).toBe(phrase.hi));
    await fireEvent.press(view.getByRole('button', { name: 'Save phrase' }));

    expect(onSave).toHaveBeenCalledWith(phrase);
  });

  it('starts from only the excerpt highlighted in the chat message', async () => {
    const view = await render(
      <TranscriptPhrasePicker
        aiConsent
        clientId="client-12345678"
        message={{ id: 'message-1', role: 'asha', text: 'Namaste. Aap kaise hain?' }}
        onClose={jest.fn()}
        onSave={jest.fn()}
        selectedText="Aap kaise hain?"
      />,
    );

    expect(view.getByLabelText('Selected transcript text').props.value).toBe('Aap kaise hain?');
    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    expect(boloApi.prepareSavedPhraseFromText).toHaveBeenCalledWith(
      { clientId: 'client-12345678', text: 'Aap kaise hain?' },
      expect.any(AbortSignal),
    );
  });

  it('still saves the highlighted excerpt when automatic phrase preparation is unavailable', async () => {
    const onSave = jest.fn();
    boloApi.prepareSavedPhraseFromText.mockRejectedValueOnce(new Error('Could not connect to the server.'));
    const view = await render(
      <TranscriptPhrasePicker
        aiConsent
        clientId="client-12345678"
        message={{ id: 'message-1', role: 'asha', text: 'Namaste. Aap kaise hain?' }}
        onClose={jest.fn()}
        onSave={onSave}
        selectedText="Aap kaise hain?"
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Add Romanized + English' }));
    await waitFor(() => expect(view.getByRole('alert').props.children).toContain('save manually'));
    await fireEvent.changeText(view.getByLabelText('Hindi phrase'), 'आप कैसे हैं?');
    await fireEvent.changeText(view.getByLabelText('Romanized Hindi phrase'), 'Aap kaise hain?');
    await fireEvent.changeText(view.getByLabelText('English phrase meaning'), 'How are you?');
    await fireEvent.press(view.getByRole('button', { name: 'Save phrase' }));

    expect(onSave).toHaveBeenCalledWith({
      hi: 'आप कैसे हैं?',
      latin: 'Aap kaise hain?',
      en: 'How are you?',
    });
  });

  it('keeps the onboarding daily goal numeric through selection and submission', async () => {
    const view = await render(<OnboardingScreen />);
    await fireEvent.press(view.getByRole('radio', { name: '5 minutes' }));
    await fireEvent.press(view.getByRole('button', { name: 'Build my practice plan' }));

    expect(mockCompleteOnboarding).toHaveBeenCalledWith(expect.any(Object), 5);
  });

  it('renders the progress dashboard for an empty learning history', async () => {
    const view = await render(<ProgressScreen />);

    expect(view.getByText('Your Hindi is taking root.')).toBeTruthy();
    expect(view.getByText('Last 7 days')).toBeTruthy();
  });

  it('keeps the progress hero dark and legible in dark mode', () => {
    const styles = createProgressStyles(darkColors);

    expect(styles.hero.backgroundColor).toBe(darkColors.heroBase);
    expect(styles.heroTitle.color).toBe(darkColors.white);
    expect(styles.heroBody.color).toBe(darkColors.heroSubtle);
  });
});
