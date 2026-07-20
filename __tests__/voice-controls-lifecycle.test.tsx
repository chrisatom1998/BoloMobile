import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';

jest.mock('expo-audio', () => {
  const recorder = {
    isRecording: false,
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(() => {
      recorder.isRecording = true;
    }),
    stop: jest.fn(async () => {
      recorder.isRecording = false;
    }),
    uri: 'file:///cache/pronunciation.m4a',
  };

  return {
    RecordingPresets: { HIGH_QUALITY: {} },
    requestRecordingPermissionsAsync: jest.fn(),
    setAudioModeAsync: jest.fn(async () => undefined),
    useAudioRecorder: jest.fn(() => recorder),
    useAudioRecorderState: jest.fn(() => ({
      durationMillis: 0,
      isRecording: recorder.isRecording,
    })),
    __mockRecorder: recorder,
  };
});

jest.mock('expo-file-system', () => ({
  __deleteMock: jest.fn(),
  File: jest.fn().mockImplementation((uri: string) => {
    const fileSystem = jest.requireMock('expo-file-system') as { __deleteMock: jest.Mock };
    return {
      base64: jest.fn(async () => 'YXVkaW8='),
      delete: fileSystem.__deleteMock,
      exists: true,
      type: 'audio/mp4',
      uri,
    };
  }),
}));

jest.mock('lucide-react-native', () => ({
  Flag: () => null,
  Mic: () => null,
  Sparkles: () => null,
  Square: () => null,
}));

jest.mock('@/components/ai-consent-gate', () => ({
  AiConsentGate: ({ children }: PropsWithChildren) => children,
}));

jest.mock('@/lib/speech', () => ({
  speakText: jest.fn(async () => undefined),
  stopSpeaking: jest.fn(async () => undefined),
}));

jest.mock('@/services/bolo-api', () => ({
  checkPronunciation: jest.fn(),
  reportGeneratedMessage: jest.fn(),
}));

jest.mock('@/state/app-state', () => ({
  useAppState: () => ({ clientId: 'client-12345678' }),
}));

import { requestRecordingPermissionsAsync } from 'expo-audio';

import { PronunciationRecorder } from '../src/components/pronunciation-recorder';
import { VoiceTurnButton } from '../src/components/voice-turn-button';
import { speakText, stopSpeaking } from '../src/lib/speech';
import { checkPronunciation, reportGeneratedMessage } from '../src/services/bolo-api';

const requestPermissionMock = requestRecordingPermissionsAsync as jest.MockedFunction<typeof requestRecordingPermissionsAsync>;
const speakTextMock = speakText as jest.MockedFunction<typeof speakText>;
const stopSpeakingMock = stopSpeaking as jest.MockedFunction<typeof stopSpeaking>;
const checkPronunciationMock = checkPronunciation as jest.MockedFunction<typeof checkPronunciation>;
const reportGeneratedMessageMock = reportGeneratedMessage as jest.MockedFunction<typeof reportGeneratedMessage>;
const expoAudio = jest.requireMock('expo-audio') as {
  __mockRecorder: {
    isRecording: boolean;
    prepareToRecordAsync: jest.Mock;
    record: jest.Mock;
    stop: jest.Mock;
  };
  setAudioModeAsync: jest.Mock;
};
const fileSystem = jest.requireMock('expo-file-system') as { __deleteMock: jest.Mock };
let appStateListener: ((state: AppStateStatus) => void) | undefined;

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('voice control lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    expoAudio.__mockRecorder.isRecording = false;
    appStateListener = undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    requestPermissionMock.mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
    checkPronunciationMock.mockResolvedValue({ transcript: 'Namaste', feedback: 'Keep the first vowel short.' });
    reportGeneratedMessageMock.mockResolvedValue({ reported: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts only one permission flow when the record button is tapped twice before permission resolves', async () => {
    const permission = deferred<Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>>();
    requestPermissionMock.mockReturnValue(permission.promise);
    const view = await render(<VoiceTurnButton idleLabel="Record pronunciation" onRecordingReady={jest.fn()} />);

    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await fireEvent.press(view.getByLabelText('Record pronunciation'));

    await act(async () => {
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });
    expect(requestPermissionMock).toHaveBeenCalledTimes(1);
    permission.resolve({ granted: false } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
    await waitFor(() => expect(view.getByText(/Microphone access is required/u)).toBeTruthy());
  });

  it('reports the whole recording and submission lifecycle and stops existing playback before recording', async () => {
    const submission = deferred<void>();
    const onActivityChange = jest.fn();
    const onRecordingReady = jest.fn(() => submission.promise);
    const view = await render(
      <VoiceTurnButton
        idleLabel="Record pronunciation"
        onActivityChange={onActivityChange}
        onRecordingReady={onRecordingReady}
      />,
    );

    await waitFor(() => expect(onActivityChange).toHaveBeenLastCalledWith(false));
    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await waitFor(() => expect(view.getByLabelText('Stop recording')).toBeTruthy());
    expect(stopSpeakingMock).toHaveBeenCalledTimes(1);
    expect(onActivityChange).toHaveBeenLastCalledWith(true);

    await fireEvent.press(view.getByLabelText('Stop recording'));
    await waitFor(() => expect(onRecordingReady).toHaveBeenCalledTimes(1));
    expect(view.getByLabelText('Record pronunciation').props.accessibilityState).toEqual({ disabled: true });
    expect(onActivityChange).toHaveBeenLastCalledWith(true);

    submission.resolve();
    await waitFor(() => expect(onActivityChange).toHaveBeenLastCalledWith(false));
  });

  it('discards an active recording without submission when the app leaves the foreground', async () => {
    const onRecordingReady = jest.fn();
    const view = await render(<VoiceTurnButton idleLabel="Record pronunciation" onRecordingReady={onRecordingReady} />);
    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await waitFor(() => expect(view.getByLabelText('Stop recording')).toBeTruthy());

    await act(async () => {
      appStateListener?.('background');
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });

    expect(expoAudio.__mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(onRecordingReady).not.toHaveBeenCalled();
    expect(fileSystem.__deleteMock).toHaveBeenCalledTimes(1);
    expect(expoAudio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false, playsInSilentMode: true });
    expect(view.getByText(/stopped when Bolo left the foreground/u)).toBeTruthy();
    await view.unmount();
  });

  it('waits through a transient inactive permission prompt before recording', async () => {
    const permission = deferred<Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>>();
    requestPermissionMock.mockReturnValue(permission.promise);
    const view = await render(<VoiceTurnButton idleLabel="Record pronunciation" onRecordingReady={jest.fn()} />);
    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await act(async () => {
      appStateListener?.('inactive');
      permission.resolve({ granted: true } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });

    expect(expoAudio.__mockRecorder.record).not.toHaveBeenCalled();
    await act(async () => {
      appStateListener?.('active');
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });
    await waitFor(() => expect(view.getByLabelText('Stop recording')).toBeTruthy());
    expect(expoAudio.__mockRecorder.record).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('does not start recording when permission resolves after the app backgrounds', async () => {
    const permission = deferred<Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>>();
    requestPermissionMock.mockReturnValue(permission.promise);
    const view = await render(<VoiceTurnButton idleLabel="Record pronunciation" onRecordingReady={jest.fn()} />);
    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await act(async () => {
      appStateListener?.('background');
      permission.resolve({ granted: true } as Awaited<ReturnType<typeof requestRecordingPermissionsAsync>>);
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });

    await waitFor(() => expect(view.getByLabelText('Record pronunciation')).toBeTruthy());
    expect(expoAudio.__mockRecorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(expoAudio.__mockRecorder.record).not.toHaveBeenCalled();
    expect(view.getByText(/stopped when Bolo left the foreground/u)).toBeTruthy();
    await view.unmount();
  });

  it('ignores pronunciation feedback that resolves after unmount', async () => {
    const request = deferred<{ transcript: string; feedback: string }>();
    let requestSignal: AbortSignal | undefined;
    checkPronunciationMock.mockImplementation((_input, signal) => {
      requestSignal = signal;
      return request.promise;
    });
    const view = await render(<PronunciationRecorder
      lessonTitle="Order chai"
      target={{ hi: 'Namaste', latin: 'Namaste', en: 'Hello' }}
    />);

    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await waitFor(() => expect(view.getByLabelText('Stop recording')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Stop recording'));
    await waitFor(() => expect(checkPronunciationMock).toHaveBeenCalledTimes(1));

    await view.unmount();
    expect(requestSignal?.aborted).toBe(true);
    await act(async () => {
      request.resolve({ transcript: 'Namaste', feedback: 'Late feedback.' });
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });

    expect(speakTextMock).not.toHaveBeenCalled();
  });

  it('submits at most one pronunciation report while the first request is pending', async () => {
    const pendingReport = deferred<{ reported: true }>();
    reportGeneratedMessageMock.mockReturnValue(pendingReport.promise);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<PronunciationRecorder
      lessonTitle="Order chai"
      target={{ hi: 'Namaste', latin: 'Namaste', en: 'Hello' }}
    />);

    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await waitFor(() => expect(view.getByLabelText('Stop recording')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Stop recording'));
    await waitFor(() => expect(view.getByText('Keep the first vowel short.')).toBeTruthy());
    await fireEvent.press(view.getByText('Report feedback'));

    const prompt = alert.mock.calls.find(([title]) => title.startsWith('Report Mira'));
    const submit = (prompt?.[2] as { onPress?: () => void }[] | undefined)?.[0].onPress;
    await act(async () => {
      submit?.();
      submit?.();
      await Promise.resolve();
    });

    expect(reportGeneratedMessageMock).toHaveBeenCalledTimes(1);
    pendingReport.resolve({ reported: true });
    await waitFor(() => expect(view.getByText('Reported')).toBeTruthy());
  });

  it('does not mark replacement feedback as reported when the prior report finishes later', async () => {
    const replacementFeedback = deferred<{ transcript: string; feedback: string }>();
    const pendingReport = deferred<{ reported: true }>();
    let reportSignal: AbortSignal | undefined;
    checkPronunciationMock
      .mockResolvedValueOnce({ transcript: 'Namaste', feedback: 'First feedback.' })
      .mockReturnValueOnce(replacementFeedback.promise);
    reportGeneratedMessageMock.mockImplementation((_input, signal) => {
      reportSignal = signal;
      return pendingReport.promise;
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await render(<PronunciationRecorder
      lessonTitle="Order chai"
      target={{ hi: 'Namaste', latin: 'Namaste', en: 'Hello' }}
    />);

    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await waitFor(() => expect(view.getByLabelText('Stop recording')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Stop recording'));
    await waitFor(() => expect(view.getByText('First feedback.')).toBeTruthy());

    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await waitFor(() => expect(view.getByLabelText('Stop recording')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Stop recording'));
    await fireEvent.press(view.getByText('Report feedback'));
    const prompt = alert.mock.calls.find(([title]) => title.startsWith('Report Mira'));
    const submit = (prompt?.[2] as { onPress?: () => void }[] | undefined)?.[0].onPress;
    await act(async () => {
      submit?.();
      await Promise.resolve();
    });

    replacementFeedback.resolve({ transcript: 'Namaste', feedback: 'Replacement feedback.' });
    await waitFor(() => expect(view.getByText('Replacement feedback.')).toBeTruthy());
    expect(reportSignal?.aborted).toBe(true);

    pendingReport.resolve({ reported: true });
    await act(async () => {
      await pendingReport.promise;
      await Promise.resolve();
    });
    expect(view.getByText('Report feedback')).toBeTruthy();
    expect(view.queryByText('Reported')).toBeNull();
  });
});
