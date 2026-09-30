type AudioStats = {
  type?: string;
  kind?: string;
  mediaType?: string;
  audioLevel?: number;
  totalAudioEnergy?: number;
  totalSamplesDuration?: number;
};
type StatsReport = { forEach: (callback: (stats: AudioStats) => void) => void };

/** RTC energy is a UI estimate, not proof of speech completion or delivery. */
export function observeLivePlayback(
  getStats: (() => Promise<StatsReport>) | undefined,
  onChange: ((playing: boolean) => void) | undefined,
) {
  if (!getStats || !onChange) return () => undefined;
  let closed = false;
  let polling = false;
  let playing = false;
  let lastEnergy = 0;
  let lastDuration = 0;
  let lastAudibleAt = 0;
  const interval = setInterval(() => {
    if (closed || polling) return;
    polling = true;
    void getStats().then((report) => {
      if (closed) return;
      let audible = false;
      report.forEach((stats) => {
        if (stats.type !== 'inbound-rtp' || (stats.kind ?? stats.mediaType) !== 'audio') return;
        if (typeof stats.audioLevel === 'number') audible ||= stats.audioLevel > 0.008;
        if (typeof stats.totalAudioEnergy === 'number' && typeof stats.totalSamplesDuration === 'number') {
          const duration = stats.totalSamplesDuration - lastDuration;
          const energy = stats.totalAudioEnergy - lastEnergy;
          if (duration > 0 && energy > 0) audible ||= Math.sqrt(energy / duration) > 0.008;
          lastEnergy = stats.totalAudioEnergy;
          lastDuration = stats.totalSamplesDuration;
        }
      });
      if (audible) lastAudibleAt = Date.now();
      const next = audible || (playing && Date.now() - lastAudibleAt < 600);
      if (next !== playing) onChange(playing = next);
    }).catch(() => {
      // Some WebRTC implementations do not expose audio energy statistics.
    }).finally(() => { polling = false; });
  }, 150);
  return () => {
    closed = true;
    clearInterval(interval);
    if (playing) onChange(false);
  };
}
