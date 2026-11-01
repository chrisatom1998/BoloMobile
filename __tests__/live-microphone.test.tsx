import {
  LIVE_MIC_EXPLAINER,
  classifyLiveMicrophone,
  ensureLiveMicrophone,
} from '../src/lib/live-microphone';
import { ashaInviteAction, ashaInviteLine, ashaInviteSharing } from '../src/lib/asha-invite';

describe('live microphone access', () => {
  it('asks only when the system will still show a prompt', () => {
    expect(classifyLiveMicrophone({ granted: true, canAskAgain: false })).toBe('granted');
    expect(classifyLiveMicrophone({ granted: false, canAskAgain: true })).toBe('prompt');
    expect(classifyLiveMicrophone({ granted: false, canAskAgain: false })).toBe('denied');
  });

  it('shows the explainer before requesting, and stops when the prompt is denied', async () => {
    const order: string[] = [];
    const allowed = await ensureLiveMicrophone({
      getPermission: async () => ({ granted: false, canAskAgain: true }),
      requestPermission: async () => {
        order.push('request');
        return { granted: false, canAskAgain: false };
      },
      onPhase: (phase) => order.push(phase),
      paint: async () => { order.push('paint'); },
      platformOS: 'ios',
    });

    expect(allowed).toBe(false);
    expect(order).toEqual(['explaining', 'paint', 'request', 'denied']);
    expect(LIVE_MIC_EXPLAINER).not.toMatch(/WebRTC|GPT-Live|version/iu);
  });

  it('does not request again after a previous denial', async () => {
    const requestPermission = jest.fn();
    const phases: string[] = [];
    const allowed = await ensureLiveMicrophone({
      getPermission: async () => ({ granted: false, canAskAgain: false }),
      requestPermission,
      onPhase: (phase) => phases.push(phase),
      platformOS: 'android',
    });

    expect(allowed).toBe(false);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(phases).toEqual(['denied']);
  });

  it('starts only after the microphone is already allowed', async () => {
    const requestPermission = jest.fn();
    const allowed = await ensureLiveMicrophone({
      getPermission: async () => ({ granted: true, canAskAgain: false }),
      requestPermission,
      onPhase: jest.fn(),
      platformOS: 'ios',
    });

    expect(allowed).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('leaves web permission to the browser session', async () => {
    const getPermission = jest.fn();
    const allowed = await ensureLiveMicrophone({
      getPermission,
      requestPermission: jest.fn(),
      onPhase: jest.fn(),
      platformOS: 'web',
    });

    expect(allowed).toBe(true);
    expect(getPermission).not.toHaveBeenCalled();
  });
});

describe('Asha invite copy', () => {
  it('stays in plain language', () => {
    const copy = `${ashaInviteLine} ${ashaInviteSharing} ${ashaInviteAction}`;
    expect(copy).not.toMatch(/WebRTC|GPT-Live|version/iu);
    expect(ashaInviteAction).toBe('Talk with Asha');
  });
});
