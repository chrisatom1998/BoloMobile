import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

const mockAppState = {
  aiConsent: true,
  checkpointScene: jest.fn(),
  clientId: 'client-12345678',
  markSceneComplete: jest.fn(),
  phrases: [] as { en: string; hi: string; latin: string }[],
  sceneProgress: {} as Record<string, { lastBeatIndex: number }>,
  togglePhrase: jest.fn(),
};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'chai' }),
  useRouter: () => ({ replace: jest.fn() }),
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
  useForegroundTimer: () => ({ elapsedSeconds: () => 0, reset: jest.fn() }),
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
import { hasOfflineSpeech, speakText } from '../src/lib/speech';

const hasOfflineSpeechMock = hasOfflineSpeech as jest.MockedFunction<typeof hasOfflineSpeech>;
const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;

describe('scene situation auto-play', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState.aiConsent = true;
    mockAppState.phrases = [];
    mockAppState.sceneProgress = {};
    hasOfflineSpeechMock.mockReturnValue(true);
    speakTextMock.mockResolvedValue();
  });

  it('speaks the Hindi situation followed by its exact English translation on mount', async () => {
    const view = await render(<SceneScreen />);

    await waitFor(() => expect(speakTextMock).toHaveBeenCalledWith('नमस्ते! क्या लेंगे?\nHello! What will you have?'));
    expect(speakTextMock).toHaveBeenCalledTimes(1);
    expect(view.getByText('Hello! What will you have?')).toBeTruthy();
    expect(view.getByText('Ask for one cup of tea.')).toBeTruthy();
  });

  it('speaks the next situation line after the learner advances a turn', async () => {
    const view = await render(<SceneScreen />);
    await waitFor(() => expect(speakTextMock).toHaveBeenCalledWith('नमस्ते! क्या लेंगे?\nHello! What will you have?'));

    await fireEvent.press(view.getByLabelText('एक चाय दीजिए। Ek chai dijiye.'));
    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(speakTextMock).toHaveBeenCalledWith('चीनी कम या ज़्यादा?\nLess sugar or more?'));
  });

  it('replays the ordered Hindi and English response prompt from Hear Asha', async () => {
    const view = await render(<SceneScreen />);
    await waitFor(() => expect(speakTextMock).toHaveBeenCalledTimes(1));
    speakTextMock.mockClear();

    await fireEvent.press(view.getByLabelText('Hear Asha'));

    expect(speakTextMock).toHaveBeenCalledWith('नमस्ते! क्या लेंगे?\nHello! What will you have?');
    expect(speakTextMock).toHaveBeenCalledTimes(1);
  });

  it('does not append the situation translation to answer feedback', async () => {
    const view = await render(<SceneScreen />);
    await waitFor(() => expect(speakTextMock).toHaveBeenCalledTimes(1));
    speakTextMock.mockClear();

    await fireEvent.press(view.getByLabelText('एक चाय दीजिए। Ek chai dijiye.'));

    expect(speakTextMock).toHaveBeenCalledWith('ज़रूर! चीनी कम या ज़्यादा?');
    expect(speakTextMock).not.toHaveBeenCalledWith(expect.stringContaining('Hello! What will you have?'));
  });

  it('stays silent without AI consent when the line has no bundled audio', async () => {
    mockAppState.aiConsent = false;
    hasOfflineSpeechMock.mockReturnValue(false);
    const view = await render(<SceneScreen />);

    await waitFor(() => expect(view.getByText('Ask for one cup of tea.')).toBeTruthy());
    expect(speakTextMock).not.toHaveBeenCalled();
  });

  it('speaks bundled offline audio without AI consent', async () => {
    mockAppState.aiConsent = false;
    hasOfflineSpeechMock.mockReturnValue(true);
    const view = await render(<SceneScreen />);

    await waitFor(() => expect(speakTextMock).toHaveBeenCalledWith('नमस्ते! क्या लेंगे?'));
    expect(speakTextMock).not.toHaveBeenCalledWith(expect.stringContaining('Hello! What will you have?'));

    speakTextMock.mockClear();
    await fireEvent.press(view.getByLabelText('Hear Asha'));
    expect(speakTextMock).toHaveBeenCalledWith('नमस्ते! क्या लेंगे?');
    expect(speakTextMock).not.toHaveBeenCalledWith(expect.stringContaining('Hello! What will you have?'));
  });

  it('keeps a failed auto-play silent instead of alerting the learner', async () => {
    speakTextMock.mockRejectedValueOnce(new Error('AI voice is unavailable.'));
    const view = await render(<SceneScreen />);

    await waitFor(() => expect(speakTextMock).toHaveBeenCalledWith('नमस्ते! क्या लेंगे?\nHello! What will you have?'));
    expect(view.queryByRole('alert')).toBeNull();
  });
});
