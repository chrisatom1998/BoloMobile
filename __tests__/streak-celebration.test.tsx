import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useStreakCelebration } from '../src/hooks/use-streak-celebration';
import { hapticStreak } from '../src/lib/haptics';

jest.mock('../src/lib/haptics', () => ({
  hapticStreak: jest.fn(),
}));

function Harness({ ready, streak }: { ready: boolean; streak: number }) {
  useStreakCelebration(streak, ready);
  return <Text>{streak}</Text>;
}

function Grower() {
  const [streak, setStreak] = useState(1);
  useStreakCelebration(streak, true);
  return (
    <Pressable accessibilityLabel="Grow" onPress={() => setStreak(2)}>
      <Text>{streak}</Text>
    </Pressable>
  );
}

describe('streak celebration', () => {
  beforeEach(() => {
    jest.mocked(hapticStreak).mockClear();
  });

  it('does not tap for the streak already on screen', async () => {
    await render(<Harness ready streak={3} />);
    expect(hapticStreak).not.toHaveBeenCalled();
  });

  it('waits until the screen is ready', async () => {
    const view = await render(<Harness ready={false} streak={1} />);
    view.rerender(<Harness ready streak={2} />);
    expect(hapticStreak).not.toHaveBeenCalled();
  });

  it('taps once when the streak grows', async () => {
    const view = await render(<Grower />);
    await fireEvent.press(view.getByLabelText('Grow'));
    expect(hapticStreak).toHaveBeenCalledTimes(1);
  });
});
