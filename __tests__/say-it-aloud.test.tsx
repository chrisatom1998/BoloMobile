import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { HEARD_SAMPLES, HEARD_THRESHOLD_DB, LISTEN_TIMEOUT_MS, nextHeardStreak, SayItAloud, type SayItAloudPhase } from '../src/components/say-it-aloud';

const mockRecorder = { prepareToRecordAsync: jest.fn(async () => undefined), record: jest.fn(), stop: jest.fn(async () => undefined), uri: 'file:///tmp/say.m4a' };
let mockMetering: number | undefined;
let mockGranted = true;
const mockRequestPermission = jest.fn(async () => ({ granted: mockGranted }));

jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: () => mockRequestPermission(),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => ({ isRecording: true, metering: mockMetering }),
}));
jest.mock('@/lib/voice', () => ({ resetVoiceAudioMode: jest.fn(async () => undefined), setVoiceAudioMode: jest.fn(async () => undefined) }));
jest.mock('@/lib/recording-file', () => ({ deleteRecordingUri: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn() }));

function Harness({ onHeard, onSkip }: { onHeard: () => void; onSkip: () => void }) {
  const [phase, setPhase] = useState<SayItAloudPhase>('idle');
  return <SayItAloud onHeard={onHeard} onPhase={setPhase} onSkip={onSkip} phase={phase} />;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMetering = undefined;
  mockGranted = true;
});
afterEach(() => jest.useRealTimers());

describe('nextHeardStreak', () => {
  it('counts only sound above room noise, in a row', () => {
    expect(nextHeardStreak(0, undefined)).toBe(0);
    expect(nextHeardStreak(1, HEARD_THRESHOLD_DB - 10)).toBe(0);
    expect(nextHeardStreak(1, HEARD_THRESHOLD_DB + 5)).toBe(2);
    expect(nextHeardStreak(3, Number.NaN)).toBe(3);
  });
});

describe('SayItAloud', () => {
  it('hears the learner from the phone’s own microphone level and never uploads', async () => {
    const onHeard = jest.fn();
    const view = await render(<Harness onHeard={onHeard} onSkip={jest.fn()} />);
    await fireEvent.press(view.getByTestId('say-it-listen'));
    await waitFor(() => expect(view.getByLabelText('Listening')).toBeTruthy());
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    for (let sample = 0; sample < HEARD_SAMPLES; sample += 1) {
      mockMetering = HEARD_THRESHOLD_DB + 6 + sample;
      await view.rerender(<Harness onHeard={onHeard} onSkip={jest.fn()} />);
    }
    await waitFor(() => expect(view.getByTestId('say-it-heard')).toBeTruthy());
    expect(onHeard).toHaveBeenCalledTimes(1);
    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(jest.requireMock('@/lib/recording-file').deleteRecordingUri).toHaveBeenCalledWith('file:///tmp/say.m4a');
  });

  it('asks again, gently, when nothing loud enough arrives in time', async () => {
    jest.useFakeTimers();
    const view = await render(<Harness onHeard={jest.fn()} onSkip={jest.fn()} />);
    await act(async () => { fireEvent.press(view.getByTestId('say-it-listen')); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(view.getByLabelText('Listening')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(LISTEN_TIMEOUT_MS + 10); await Promise.resolve(); await Promise.resolve(); });
    expect(view.getByTestId('say-it-missed')).toBeTruthy();
    expect(view.getByText('Try once more')).toBeTruthy();
  });

  it('lets the learner move on without a microphone', async () => {
    mockGranted = false;
    const onSkip = jest.fn();
    const view = await render(<Harness onHeard={jest.fn()} onSkip={onSkip} />);
    await fireEvent.press(view.getByTestId('say-it-listen'));
    await waitFor(() => expect(view.getByTestId('say-it-denied')).toBeTruthy());
    expect(mockRecorder.record).not.toHaveBeenCalled();
    const fresh = await render(<Harness onHeard={jest.fn()} onSkip={onSkip} />);
    await fireEvent.press(fresh.getByTestId('say-it-skip'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
