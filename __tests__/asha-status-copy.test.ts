import { ashaStatusCopy } from '../src/lib/asha-status-copy';

describe('ashaStatusCopy', () => {
  it('uses the Asha screen wording for every live voice status', () => {
    expect(ashaStatusCopy('disconnected')).toEqual({
      body: 'Tap Asha to start talking with her.',
      kicker: 'READY',
      title: 'Ready when you are',
    });
    expect(ashaStatusCopy('connecting')).toEqual({
      body: 'Opening a private live voice session…',
      kicker: 'CONNECTING',
      title: 'Connecting to Asha',
    });
    expect(ashaStatusCopy('ready')).toEqual({
      body: 'Tap Asha to unmute and join the conversation.',
      kicker: 'MUTED',
      title: 'Your microphone is muted',
    });
    expect(ashaStatusCopy('recording')).toEqual({
      body: 'Speak naturally, even while Asha talks. Tap to mute.',
      kicker: 'LISTENING',
      title: 'Your microphone is on',
    });
    expect(ashaStatusCopy('responding')).toEqual({
      body: 'Your mic is muted. Tap Asha to speak at any time.',
      kicker: 'SPEAKING',
      title: 'Asha is speaking',
    });
  });
});
