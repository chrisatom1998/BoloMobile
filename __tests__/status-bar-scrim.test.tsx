import { render } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

let mockInsets = { bottom: 0, left: 0, right: 0, top: 59 };

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));

import { StatusBarScrim } from '../src/components/status-bar-scrim';
import { colors, layout } from '../src/theme';

describe('status bar scrim', () => {
  beforeEach(() => {
    mockInsets = { bottom: 0, left: 0, right: 0, top: 59 };
  });

  it('covers the iOS status bar with a paper strip the height of the top inset', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const view = await render(<StatusBarScrim />);

    const scrim = view.getByTestId('status-bar-scrim');
    const style = StyleSheet.flatten(scrim.props.style);
    expect(style.height).toBe(59);
    expect(style.backgroundColor).toBe(colors.background);
    expect(style.position).toBe('absolute');
    expect(scrim.props.pointerEvents).toBe('none');
  });

  it('keeps the Android strip', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const view = await render(<StatusBarScrim />);

    const scrim = view.getByTestId('status-bar-scrim');
    expect(StyleSheet.flatten(scrim.props.style).height).toBe(59);
    expect(scrim.props.pointerEvents).toBe('none');
  });

  it('renders nothing when there is no top inset', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockInsets = { bottom: 0, left: 0, right: 0, top: 0 };
    const view = await render(<StatusBarScrim />);

    expect(view.toJSON()).toBeNull();
  });

  it('renders nothing on web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const view = await render(<StatusBarScrim />);

    expect(view.toJSON()).toBeNull();
  });

  it('fades the strip into the content by default and skips the fade when asked', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const faded = await render(<StatusBarScrim />);
    const fade = faded.getByTestId('status-bar-scrim-fade');
    const fadeStyle = StyleSheet.flatten(fade.props.style);
    expect(fadeStyle.top).toBe(59);
    expect(fadeStyle.height).toBe(layout.statusBarFadeHeight);
    expect(fade.props.pointerEvents).toBe('none');
    await faded.unmount();

    const plain = await render(<StatusBarScrim fade={false} />);
    expect(plain.getByTestId('status-bar-scrim')).toBeTruthy();
    expect(plain.queryByTestId('status-bar-scrim-fade')).toBeNull();
  });
});
