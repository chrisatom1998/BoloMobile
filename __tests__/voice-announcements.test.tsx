import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { useVoiceAnnouncements, VOICE_STATE_ANNOUNCEMENTS, voicePhase, voiceStateAnnouncement, type VoiceAnnouncementState } from '../src/hooks/use-voice-announcements';

type Props = { state: VoiceAnnouncementState; line: string };

const idle: VoiceAnnouncementState = { status: 'disconnected', speaking: false, interruptedMessage: null, error: '' };

async function renderAnnouncements(initial: Partial<VoiceAnnouncementState> = {}, line = '') {
  const hook = await renderHook((props: Props) => useVoiceAnnouncements(props.state, props.line), { initialProps: { state: { ...idle, ...initial }, line } });
  const update = async (state: Partial<VoiceAnnouncementState>, nextLine?: string) => {
    await act(async () => {
      await hook.rerender({ state: { ...idle, ...state }, line: nextLine ?? line });
    });
  };
  return { ...hook, update };
}

describe('voice announcements for VoiceOver', () => {
  let announce: jest.SpyInstance;

  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps the session status and playback onto spoken phases', () => {
    expect(voicePhase('recording', false)).toBe('listening');
    expect(voicePhase('recording', true)).toBe('speaking');
    expect(voicePhase('responding', false)).toBe('speaking');
    expect(voicePhase('ready', false)).toBe('muted');
    expect(voicePhase('connecting', true)).toBe('connecting');
    expect(voiceStateAnnouncement('listening', 'listening', null)).toBeNull();
    expect(voiceStateAnnouncement('connecting', 'disconnected', null)).toBeNull();
    expect(voiceStateAnnouncement('listening', 'disconnected', 'Connection lost.')).toBe('Connection lost.');
  });

  it('announces each state change once, including Asha speaking over an open microphone', async () => {
    const { update } = await renderAnnouncements();
    expect(announce).not.toHaveBeenCalled();

    await update({ status: 'connecting' });
    await update({ status: 'recording' });
    await update({ status: 'recording' });
    await update({ status: 'recording', speaking: true });
    await update({ status: 'ready' });
    await update({ status: 'disconnected' });

    expect(announce.mock.calls.map(([message]) => message)).toEqual([
      VOICE_STATE_ANNOUNCEMENTS.connecting,
      VOICE_STATE_ANNOUNCEMENTS.listening,
      VOICE_STATE_ANNOUNCEMENTS.speaking,
      VOICE_STATE_ANNOUNCEMENTS.muted,
      VOICE_STATE_ANNOUNCEMENTS.ended,
    ]);
    expect(VOICE_STATE_ANNOUNCEMENTS.speaking).toMatch(/just talk to interrupt/iu);
  });

  it('reads a finished Asha reply once when her playback stops, never each caption delta', async () => {
    const { update } = await renderAnnouncements({ status: 'recording' });
    await update({ status: 'recording', speaking: true });
    announce.mockClear();

    await update({ status: 'recording', speaking: true }, 'नम');
    await update({ status: 'recording', speaking: true }, 'नमस्ते, आप');
    await update({ status: 'recording', speaking: true }, 'नमस्ते, आप कैसे हैं?');
    expect(announce).not.toHaveBeenCalled();

    await update({ status: 'recording', speaking: false }, 'नमस्ते, आप कैसे हैं?');
    expect(announce.mock.calls.map(([message]) => message)).toEqual(['नमस्ते, आप कैसे हैं?', VOICE_STATE_ANNOUNCEMENTS.listening]);

    // The same line is not read again when the next turn's state flips.
    await update({ status: 'recording', speaking: true }, 'नमस्ते, आप कैसे हैं?');
    await update({ status: 'recording', speaking: false }, 'नमस्ते, आप कैसे हैं?');
    expect(announce.mock.calls.filter(([message]) => message === 'नमस्ते, आप कैसे हैं?')).toHaveLength(1);
  });

  it('reads the last reply when the session ends mid-sentence, with the interruption instead of the generic ending', async () => {
    const { update } = await renderAnnouncements({ status: 'recording', speaking: true }, 'Chai');
    announce.mockClear();
    await update({ status: 'disconnected', interruptedMessage: 'Connection lost. This conversation is saved on your device.' }, 'Chai, please.');
    expect(announce.mock.calls.map(([message]) => message)).toEqual(['Chai, please.', 'Connection lost. This conversation is saved on your device.']);
  });

  it('announces a new error once and typed replies through the returned callback', async () => {
    const { result, update } = await renderAnnouncements();
    await update({ error: 'Live voice needs an internet connection.' });
    await update({ error: 'Live voice needs an internet connection.' });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Live voice needs an internet connection.');

    await act(async () => {
      result.current('Here is a typed correction.');
      result.current('Here is a typed correction.');
    });
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith('Here is a typed correction.');
  });

  it('stays silent on Android, where the live regions already speak', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { result, update } = await renderAnnouncements();
    await update({ status: 'connecting' });
    await update({ status: 'recording' });
    await update({ error: 'Something failed.' });
    await act(async () => {
      result.current('A reply.');
    });
    expect(announce).not.toHaveBeenCalled();
  });
});
