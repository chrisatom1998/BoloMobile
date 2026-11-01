import { Platform } from 'react-native';

/** One plain line shown before the OS microphone prompt. No transport jargon. */
export const LIVE_MIC_EXPLAINER = 'Asha needs the microphone to hear you.';

/** Long enough for the explainer to paint before the system dialog covers it. */
export const MICROPHONE_EXPLAINER_PAUSE_MS = 50;

export type LiveMicrophonePhase = 'idle' | 'explaining' | 'denied';

export type MicrophonePermissionSnapshot = {
  granted: boolean;
  canAskAgain: boolean;
};

export function classifyLiveMicrophone(permission: MicrophonePermissionSnapshot): 'granted' | 'prompt' | 'denied' {
  if (permission.granted) return 'granted';
  if (permission.canAskAgain) return 'prompt';
  return 'denied';
}

export function waitForExplainerPaint(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, MICROPHONE_EXPLAINER_PAUSE_MS);
  });
}

type EnsureLiveMicrophoneArgs = {
  getPermission: () => Promise<MicrophonePermissionSnapshot>;
  requestPermission: () => Promise<MicrophonePermissionSnapshot>;
  onPhase: (phase: LiveMicrophonePhase) => void;
  paint?: () => Promise<void>;
  platformOS?: string;
};

/**
 * Reads the current microphone permission before a live session starts.
 * The first undecided tap shows the explainer, then asks the OS.
 * A denial that cannot be asked again never starts a session.
 */
export async function ensureLiveMicrophone({
  getPermission,
  requestPermission,
  onPhase,
  paint = waitForExplainerPaint,
  platformOS = Platform.OS,
}: EnsureLiveMicrophoneArgs): Promise<boolean> {
  if (platformOS === 'web') {
    onPhase('idle');
    return true;
  }
  const current = await getPermission();
  const access = classifyLiveMicrophone(current);
  if (access === 'granted') {
    onPhase('idle');
    return true;
  }
  if (access === 'denied') {
    onPhase('denied');
    return false;
  }
  onPhase('explaining');
  await paint();
  const next = await requestPermission();
  if (next.granted) {
    onPhase('idle');
    return true;
  }
  onPhase('denied');
  return false;
}
