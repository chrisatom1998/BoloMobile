import { Alert } from 'react-native';

import { showAppAlert } from '../src/lib/app-alert';

describe('native app alerts', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves React Native Alert behavior', () => {
    const onPress = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    showAppAlert('Remove saved phrase?', 'नमस्ते', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress },
    ]);

    expect(alert).toHaveBeenCalledWith('Remove saved phrase?', 'नमस्ते', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress },
    ]);
  });
});
