/**
 * Regression: the build/oct29-asha commit 485820e turned expo-audio straight back on inside
 * releaseAudioSessionBeforeCall. expo-audio's setIsAudioActiveAsync(true) calls
 * AVAudioSession.setActive(true), so the session was active again before the live call set
 * PlayAndRecord + voiceChat, and the iPhone microphone sent silence to Asha.
 *
 * This runs the real voice.ts and voice-session.ios.ts against a fake AVAudioSession and
 * checks the session the call actually configures.
 */
type SessionEvent = { step: string; active: boolean };

const mockSession = { active: true, category: 'Playback', events: [] as SessionEvent[] };

function mockRecord(step: string) {
  mockSession.events.push({ step, active: mockSession.active });
}

jest.mock('expo', () => ({
  requireOptionalNativeModule: () => ({
    activateVoiceChat: jest.fn(async () => {
      mockRecord('activateVoiceChat');
      mockSession.category = 'PlayAndRecord/VoiceChat';
      mockSession.active = true;
      return 'PlayAndRecord/VoiceChat active';
    }),
    restoreDefaultMode: jest.fn(async () => undefined),
    readSessionState: jest.fn(async () => ''),
    drainSessionEvents: jest.fn(async () => []),
  }),
}));
jest.mock('expo-audio', () => ({
  // Mirrors expo-audio 57 on iOS: this flips AVAudioSession.setActive immediately.
  setIsAudioActiveAsync: jest.fn(async (active: boolean) => {
    mockSession.active = active;
    mockRecord(`setIsAudioActive:${active}`);
  }),
  setAudioModeAsync: jest.fn(async (mode: { allowsRecording?: boolean }) => {
    mockRecord(`setAudioMode:${mode.allowsRecording ? 'PlayAndRecord' : 'Playback'}`);
    mockSession.category = mode.allowsRecording ? 'PlayAndRecord' : 'Playback';
  }),
}));
jest.mock('react-native-webrtc', () => ({
  RTCAudioSession: { audioSessionDidActivate: jest.fn(), audioSessionDidDeactivate: jest.fn() },
}));
jest.mock('@/lib/voice-session', () => jest.requireActual('../src/lib/voice-session.ios'));
jest.mock('@/lib/live-diagnostics', () => ({ noteLiveAudioEvent: jest.fn() }));

import { resetVoiceAudioMode, setVoiceAudioMode } from '../src/lib/voice';

describe('live call audio-session order on iOS', () => {
  beforeEach(async () => {
    await resetVoiceAudioMode();
    // Start like the app does after launch, a lesson clip, or an earlier call: session still active.
    mockSession.active = true;
    mockSession.category = 'Playback';
    mockSession.events = [];
  });

  it('keeps the session inactive from the pre-call release until voiceChat takes it', async () => {
    await setVoiceAudioMode('realtime');

    const steps = mockSession.events.map((event) => event.step);
    const release = steps.indexOf('setIsAudioActive:false');
    const voiceChat = steps.indexOf('activateVoiceChat');
    expect(release).toBeGreaterThanOrEqual(0);
    expect(voiceChat).toBeGreaterThan(release);

    // Nothing between the release and voiceChat may turn the old session back on.
    expect(steps.slice(release + 1, voiceChat)).not.toContain('setIsAudioActive:true');
    // expo-audio rewrites the category for the call while the session is still off.
    expect(mockSession.events.find((event) => event.step === 'setAudioMode:PlayAndRecord')).toEqual({ step: 'setAudioMode:PlayAndRecord', active: false });
    expect(mockSession.events[voiceChat]).toEqual({ step: 'activateVoiceChat', active: false });

    // expo-audio is back on once the call owns an active voiceChat session, for later playback.
    expect(steps.slice(voiceChat + 1)).toContain('setIsAudioActive:true');
    expect(mockSession).toMatchObject({ active: true, category: 'PlayAndRecord/VoiceChat' });
  });

  it('does the same for a second call after hanging up', async () => {
    await setVoiceAudioMode('realtime');
    await resetVoiceAudioMode();
    mockSession.active = true;
    mockSession.events = [];

    await setVoiceAudioMode('realtime');

    expect(mockSession.events.find((event) => event.step === 'activateVoiceChat')).toEqual({ step: 'activateVoiceChat', active: false });
  });
});
