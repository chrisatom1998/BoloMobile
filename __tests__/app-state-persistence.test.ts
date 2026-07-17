import AsyncStorage from '@react-native-async-storage/async-storage';

import { persistAiConsentChoice, restoreFailedPersistedState } from '../src/state/app-state';
import { emptyPractice, storageKeys, type PersistedState } from '../src/lib/storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(),
  },
}));

jest.mock('../src/lib/app-alert', () => ({ showAppAlert: jest.fn() }));

const setItemMock = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

function state(goal: 5 | 10 | 15): PersistedState {
  return {
    chatHistory: [],
    phrases: [],
    goal,
    practice: emptyPractice('2026-07-14'),
    streakDays: [],
    clientId: 'client-12345678',
    aiConsent: null,
  };
}

describe('app-state persistence boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setItemMock.mockResolvedValue();
  });

  it('persists a privacy record before returning an enabled consent choice', async () => {
    const consent = await persistAiConsentChoice(true);

    expect(consent).toEqual(expect.objectContaining({ version: expect.any(Number), acceptedAt: expect.any(String) }));
    expect(setItemMock).toHaveBeenCalledWith(storageKeys.aiConsent, JSON.stringify(consent));
  });

  it('rejects a privacy choice when storage cannot save it', async () => {
    setItemMock.mockRejectedValueOnce(new Error('disk full'));

    await expect(persistAiConsentChoice(false)).rejects.toThrow('disk full');
  });

  it('restores failed optimistic values without overwriting a newer change', () => {
    const previous = state(10);
    const failed = state(15);

    expect(restoreFailedPersistedState(failed, previous, failed, ['goal']).goal).toBe(10);
    expect(restoreFailedPersistedState(state(5), previous, failed, ['goal']).goal).toBe(5);
  });
});
