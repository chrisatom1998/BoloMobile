import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock('@/lib/ai-voice-player', () => ({ clearAiVoicePlaybackCache: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      __store: store,
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, store.get(key) ?? null])),
      multiSet: jest.fn(async (entries: [string, string][]) => {
        entries.forEach(([key, value]) => store.set(key, value));
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    },
  };
});
jest.mock('@/lib/app-alert', () => ({ showAppAlert: jest.fn() }));
jest.mock('@/lib/observability', () => ({ clearObservability: jest.fn(async () => undefined), observe: jest.fn() }));

import { TapPressable } from '../src/components/tap-pressable';
import { AppStateProvider, useAppState } from '../src/state/app-state';

const asyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default as {
  __store: Map<string, string>;
  multiGet: jest.Mock;
};

function PhaseProbe() {
  const { hydrated, retryStorageLoad, storagePhase } = useAppState();
  return (
    <>
      <Text testID="phase">{hydrated ? storagePhase : 'pending'}</Text>
      <TapPressable accessibilityLabel="Retry loading progress" onPress={retryStorageLoad} testID="retry-storage" />
    </>
  );
}

describe('stored progress phase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asyncStorage.__store.clear();
  });

  it('reports an error when the phone cannot be read, then retries into ready', async () => {
    asyncStorage.multiGet.mockRejectedValueOnce(new Error('storage unavailable'));
    const view = await render(<AppStateProvider><PhaseProbe /></AppStateProvider>);
    await waitFor(() => expect(view.getByTestId('phase').props.children).toBe('error'));

    asyncStorage.multiGet.mockImplementation(async (keys: string[]) => keys.map((key) => [key, null]));
    fireEvent.press(view.getByTestId('retry-storage'));
    await waitFor(() => expect(view.getByTestId('phase').props.children).toBe('ready'));
  });
});
