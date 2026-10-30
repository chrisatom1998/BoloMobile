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
    diagnostics.updateLiveDiagnostics({ mic: { trackEnabled: true, trackState: 'live', packetsSent: 12, bytesSent: 900, audioLevel: 0.0421 } });

    const text = formatLiveDiagnostics(diagnostics.getLiveDiagnostics());
    expect(text).toContain('perm granted | mode realtime | peer recording');
    expect(text).toContain('track on/live | sent 12pkt 900B lvl 0.042');
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

  it('reports a muted or ended track and an error', () => {
    const text = formatLiveDiagnostics({
      permission: 'granted', audioMode: 'realtime', audioModeError: '', peerState: 'recording',
      mic: { trackEnabled: false, trackMuted: true, trackState: 'ended' }, events: 0, inputDeltas: 0, outputDeltas: 0,
      lastEvent: '-', lastError: 'boom',
    });
    expect(text).toContain('track off/ended/muted | sent ?pkt ?B lvl ?');
    expect(text).toContain('error boom');
  });
});
