// Only iOS needs the voiceChat session; Android and web route audio on their own.
export async function activateVoiceChatSession(_options?: { notifyWebRtc?: boolean }): Promise<string> {
  return 'n/a';
}

export async function restoreDefaultAudioSessionMode(): Promise<void> {}

export async function releaseAudioSessionBeforeCall(): Promise<string> {
  return 'n/a';
}

export async function readAudioSessionState(): Promise<string> {
  return 'n/a';
}

export async function drainAudioSessionEvents(): Promise<string[]> {
  return [];
}
