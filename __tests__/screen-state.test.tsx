import { act, fireEvent, render } from '@testing-library/react-native';

import { OfflineNote, ScreenState } from '../src/components/screen-state';
import { resetNetworkStatusForTests, signalNetworkLost } from '../src/lib/network-signal';
import { screenCopy, voiceStatusTitle } from '../src/lib/screen-copy';

describe('screen states', () => {
  beforeEach(() => {
    resetNetworkStatusForTests();
  });

  it('shows a warm empty state with a labeled action', async () => {
    const onAction = jest.fn();
    const view = await render(
      <ScreenState
        actionLabel="Start lesson"
        body={screenCopy.phrasesEmptyBody}
        onAction={onAction}
        title={screenCopy.phrasesEmptyTitle}
      />,
    );

    expect(view.getByText(screenCopy.phrasesEmptyTitle)).toBeTruthy();
    expect(view.getByText(screenCopy.phrasesEmptyBody)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Start lesson' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('hides the offline note until a request has failed', async () => {
    const view = await render(<OfflineNote />);
    expect(view.queryByTestId('offline-note')).toBeNull();

    await act(async () => {
      signalNetworkLost();
    });
    expect(view.getByText(screenCopy.offlineTitle)).toBeTruthy();
    expect(view.getByText(screenCopy.offlineBody)).toBeTruthy();
  });

  it('names voice failures in Bolo’s voice', () => {
    expect(voiceStatusTitle(screenCopy.offlineBody)).toBe(screenCopy.offlineTitle);
    expect(voiceStatusTitle(screenCopy.micDeniedBody)).toBe(screenCopy.micDeniedTitle);
    expect(voiceStatusTitle('something else')).toBe(screenCopy.voiceErrorTitle);
    expect(screenCopy.micDeniedBody).toMatch(/Microphone access is required/);
  });
});
