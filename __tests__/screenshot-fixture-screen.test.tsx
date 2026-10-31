import { render, waitFor } from '@testing-library/react-native';

let mockFixtureName = 'phrases';
const mockGetItem = jest.fn<Promise<string | null>, [string]>();
const mockMultiSet = jest.fn<Promise<void>, [[string, string][]]>();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ name: mockFixtureName }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => mockGetItem(key),
    multiSet: (pairs: [string, string][]) => mockMultiSet(pairs),
  },
}));

import ScreenshotFixtureScreen from '../src/app/screenshot-fixture';

const completedProfile = JSON.stringify({
  completed: true,
  displayName: 'Chris',
  level: 'new',
  scriptPreference: 'both',
  primaryGoal: 'conversation',
  responseLanguage: 'en',
  microphoneTested: false,
});

describe('screenshot fixture screen', () => {
  beforeEach(() => {
    mockFixtureName = 'phrases';
    mockGetItem.mockReset();
    mockMultiSet.mockReset();
    mockMultiSet.mockResolvedValue();
  });

  it('writes the fixture and only then exposes the ready marker', async () => {
    mockGetItem.mockImplementation(async (key) => {
      if (key !== 'bolo-learner-profile' || mockMultiSet.mock.calls.length === 0) return null;
      return completedProfile;
    });
    const view = await render(<ScreenshotFixtureScreen />);

    await waitFor(() => {
      expect(view.getByTestId('screenshot-fixture-ready')).toBeTruthy();
    });
    expect(mockMultiSet).toHaveBeenCalledTimes(1);
    const pairs = mockMultiSet.mock.calls[0]?.[0] ?? [];
    expect(pairs.some(([key, value]) => key === 'bolo-phrases' && value.includes('One tea, please.'))).toBe(true);
  });

  it('does not replace a learner who already finished onboarding', async () => {
    mockGetItem.mockResolvedValue(completedProfile);
    const view = await render(<ScreenshotFixtureScreen />);

    expect(await view.findByText('Screenshot fixtures do not replace an existing learner.')).toBeTruthy();
    expect(view.queryByTestId('screenshot-fixture-ready')).toBeNull();
    expect(mockMultiSet).not.toHaveBeenCalled();
  });
});
