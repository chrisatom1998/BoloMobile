import { ashaStatusCopy } from '../src/lib/asha-status-copy';

describe('ashaStatusCopy', () => {
  it('uses the Asha screen wording for every live voice status', () => {
    expect(ashaStatusCopy('disconnected')).toEqual({
      kicker: 'READY',
      title: 'Ready when you are',
    });
    expect(ashaStatusCopy('connecting')).toEqual({
      kicker: 'CONNECTING',
      title: 'Connecting to Asha',
    });
    expect(ashaStatusCopy('ready')).toEqual({
      kicker: 'MUTED',
      title: 'Your microphone is muted',
    });
    expect(ashaStatusCopy('recording')).toEqual({
      kicker: 'LISTENING',
      title: 'Your microphone is on',
    });
    expect(ashaStatusCopy('responding')).toEqual({
      kicker: 'SPEAKING',
      title: 'Asha is speaking',
    });
  });

  it('has no body line: on Today a tap only opens the Asha screen', () => {
    for (const status of ['disconnected', 'connecting', 'ready', 'recording', 'responding'] as const) {
      expect(ashaStatusCopy(status)).not.toHaveProperty('body');
    }
  });
});
