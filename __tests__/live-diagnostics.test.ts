import { formatLiveDiagnostics } from '@/lib/live-diagnostics';

type Diagnostics = typeof import('@/lib/live-diagnostics');

function load(enabled: boolean): Diagnostics {
  let loaded!: Diagnostics;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: enabled ? { liveDiagnostics: true } : {} } },
    }));
    loaded = require('@/lib/live-diagnostics') as Diagnostics;
  });
  return loaded;
}

describe('live voice diagnostics', () => {
  it('counts events and transcript deltas when enabled', () => {
    const diagnostics = load(true);
    diagnostics.countLiveEvent('session.started');
    diagnostics.countLiveEvent('session.input_transcript.delta');
    diagnostics.countLiveEvent('session.output_transcript.delta');
    diagnostics.countLiveEvent('session.output_transcript.delta');
    diagnostics.updateLiveDiagnostics({ permission: 'granted', audioMode: 'realtime', peerState: 'recording' });
    diagnostics.updateLiveDiagnostics({ mic: { trackEnabled: true, trackState: 'live', packetsSent: 12, bytesSent: 900, audioLevel: 0.0421, totalAudioEnergy: 0.5 } });

    const text = formatLiveDiagnostics(diagnostics.getLiveDiagnostics());
    expect(text).toContain('perm granted | mode realtime | peer recording');
    diagnostics.updateLiveDiagnostics({ audioSession: 'PlayAndRecord/VoiceChat active in:iPhone Microphone' });
    expect(formatLiveDiagnostics(diagnostics.getLiveDiagnostics())).toContain('mode realtime | session PlayAndRecord/VoiceChat active in:iPhone Microphone | peer recording');
    expect(text).toContain('track on/live | sent 12pkt 900B lvl 0.042 peak 0.000 energy 0.500000');
    expect(text).toContain('events 4 (you 1 / asha 2) last session.output_transcript.delta');
  });

  it('stays silent and empty when disabled (production)', () => {
    const diagnostics = load(false);
    expect(diagnostics.liveDiagnosticsEnabled).toBe(false);
    diagnostics.countLiveEvent('session.input_transcript.delta');
    diagnostics.updateLiveDiagnostics({ permission: 'granted' });

    const text = formatLiveDiagnostics(diagnostics.getLiveDiagnostics());
    expect(text).toContain('perm ? |');
    expect(text).toContain('events 0 (you 0 / asha 0)');
  });

  it('clears counters when a new connection starts', () => {
    const diagnostics = load(true);
    diagnostics.countLiveEvent('session.input_transcript.delta');
    diagnostics.resetLiveDiagnostics();

    expect(diagnostics.getLiveDiagnostics().inputDeltas).toBe(0);
  });

  it('keeps the last five event types, with error text', () => {
    const diagnostics = load(true);
    ['session.started', 'a', 'b', 'c', 'd'].forEach((type) => diagnostics.countLiveEvent(type));
    diagnostics.countLiveEvent('error', 'Unknown parameter: session.audio');

    const text = formatLiveDiagnostics(diagnostics.getLiveDiagnostics());
    expect(text).toContain('recent a > b > c > d > error: Unknown parameter: session.audio');
    expect(text).not.toContain('recent session.started');
  });

  it('keeps the loudest mic level seen this call', () => {
    const diagnostics = load(true);
    diagnostics.recordLiveMicStats({ trackEnabled: true, audioLevel: 0.12 });
    diagnostics.recordLiveMicStats({ trackEnabled: true, audioLevel: 0.01, totalAudioEnergy: 0.000042 });

    const text = formatLiveDiagnostics(diagnostics.getLiveDiagnostics());
    expect(text).toContain('lvl 0.010 peak 0.120 energy 0.000042');
  });

  it('reads the audio direction from offer and answer SDP', () => {
    const { sdpAudioDirection } = load(true);
    const answer = 'v=0\r\no=- 1 2 IN IP4 0.0.0.0\r\na=group:BUNDLE 0 1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:0\r\na=recvonly\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=sendrecv\r\n';
    expect(sdpAudioDirection(answer)).toBe('recvonly');
    expect(sdpAudioDirection('v=0\r\nm=audio 9 RTP 111\r\na=sendrecv\r\n')).toBe('sendrecv');
    expect(sdpAudioDirection('v=0\r\nm=application 9 x\r\na=sendrecv\r\n')).toBe('?');
    expect(sdpAudioDirection(undefined)).toBe('?');
  });

  it('reports a muted or ended track and an error', () => {
    const text = formatLiveDiagnostics({
      permission: 'granted', audioMode: 'realtime', audioModeError: '', audioSession: '', peerState: 'recording',
      mic: { trackEnabled: false, trackMuted: true, trackState: 'ended' }, events: 0, inputDeltas: 0, outputDeltas: 0,
      lastEvent: '-', recentEvents: [], lastError: 'boom', micPeak: 0, sdpAudio: 'sendrecv/sendrecv',
    });
    expect(text).toContain('peer recording | sdp sendrecv/sendrecv');
    expect(text).toContain('track off/ended/muted | sent ?pkt ?B lvl ? peak 0.000 energy ?');
    expect(text).toContain('error boom');
  });
});
