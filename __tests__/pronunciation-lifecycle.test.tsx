import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

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
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
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
  Mic: () => null,
  Square: () => null,
}));

jest.mock('@/lib/speech', () => ({
  stopSpeaking: jest.fn(async () => undefined),
}));

import { VoiceTurnButton } from '../src/components/voice-turn-button';

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

async function flushAsyncWork() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe('pronunciation recording lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    expoAudio.__mockRecorder.isRecording = false;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('automatically stops and submits exactly once at 15 seconds', async () => {
    const onRecordingReady = jest.fn(async () => undefined);
    const view = await render(<VoiceTurnButton idleLabel="Record pronunciation" onRecordingReady={onRecordingReady} />);

    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await waitFor(() => expect(view.getByLabelText('Stop recording')).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(14_999);
      await flushAsyncWork();
    });
    expect(expoAudio.__mockRecorder.stop).not.toHaveBeenCalled();
    expect(onRecordingReady).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await flushAsyncWork();
    });
    await waitFor(() => expect(onRecordingReady).toHaveBeenCalledTimes(1));

    expect(expoAudio.__mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(onRecordingReady).toHaveBeenCalledWith({ audioBase64: 'YXVkaW8=', mimeType: 'audio/mp4' });
    expect(fileSystem.__deleteMock).toHaveBeenCalled();
    expect(expoAudio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false, playsInSilentMode: true });
    expect(view.getByLabelText('Record pronunciation').props.accessibilityState).toEqual({ disabled: false });

    await view.unmount();
  });

  it('surfaces a submission failure and releases the recording resources', async () => {
    const onRecordingReady = jest.fn(async () => {
      throw new Error('Pronunciation service unavailable.');
    });
    const view = await render(<VoiceTurnButton idleLabel="Record pronunciation" onRecordingReady={onRecordingReady} />);

    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await waitFor(() => expect(view.getByLabelText('Stop recording')).toBeTruthy());
    await fireEvent.press(view.getByLabelText('Stop recording'));

    await waitFor(() => expect(view.getByText('Pronunciation service unavailable.')).toBeTruthy());
    expect(fileSystem.__deleteMock).toHaveBeenCalled();
    expect(expoAudio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false, playsInSilentMode: true });
    expect(view.getByLabelText('Record pronunciation').props.accessibilityState).toEqual({ disabled: false });

    await view.unmount();
  });

  it('stops and deletes an active recording on unmount without submitting it later', async () => {
    const onRecordingReady = jest.fn(async () => undefined);
    const view = await render(<VoiceTurnButton idleLabel="Record pronunciation" onRecordingReady={onRecordingReady} />);

    await fireEvent.press(view.getByLabelText('Record pronunciation'));
    await waitFor(() => expect(view.getByLabelText('Stop recording')).toBeTruthy());

    await view.unmount();
    await flushAsyncWork();
    expect(expoAudio.__mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(fileSystem.__deleteMock).toHaveBeenCalledTimes(1);
    expect(expoAudio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false, playsInSilentMode: true });

    await act(async () => {
      jest.advanceTimersByTime(15_000);
      await flushAsyncWork();
    });
    expect(onRecordingReady).not.toHaveBeenCalled();
  });
});
