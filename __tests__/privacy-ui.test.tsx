import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

jest.mock('lucide-react-native', () => ({
  ExternalLink: () => null,
  MapPin: () => null,
}));

jest.mock('@/lib/app-alert', () => ({
  showAppAlert: jest.fn(),
}));

jest.mock('@/lib/public-pages', () => ({
  openPublicPage: jest.fn(async () => undefined),
}));

import PrivacyScreen from '../src/app/privacy';
import { showAppAlert } from '../src/lib/app-alert';
import { openPublicPage } from '../src/lib/public-pages';

const openPublicPageMock = openPublicPage as jest.MockedFunction<typeof openPublicPage>;
const showAppAlertMock = showAppAlert as jest.MockedFunction<typeof showAppAlert>;

describe('privacy rendered UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openPublicPageMock.mockResolvedValue();
  });

  it('renders the complete privacy summary with accessible public links', async () => {
    const view = await render(<PrivacyScreen />);

    for (const heading of [
      'Data stored on your device',
      'Data processed for AI coaching',
      'Reports and retention',
      'Microphone behavior',
      'Delete data or withdraw consent',
      'Children',
      'Service providers and international processing',
    ]) {
      expect(view.getByText(heading)).toBeTruthy();
    }

    const privacy = view.getByRole('link', { name: 'Public Privacy Policy' });
    const support = view.getByRole('link', { name: 'Support and privacy requests' });
    const terms = view.getByRole('link', { name: 'Terms of Use' });
    for (const link of [privacy, support, terms]) {
      expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(44);
      await fireEvent.press(link);
    }

    expect(openPublicPageMock.mock.calls).toEqual([
      ['privacy'],
      ['support'],
      ['terms'],
    ]);
  });

  it('surfaces a public-policy navigation failure as an app alert', async () => {
    openPublicPageMock.mockRejectedValueOnce(new Error('No network connection.'));
    const view = await render(<PrivacyScreen />);

    await fireEvent.press(view.getByRole('link', { name: 'Public Privacy Policy' }));

    await waitFor(() => expect(showAppAlertMock).toHaveBeenCalledWith(
      'Could not open Privacy Policy',
      'No network connection.',
    ));
  });

});
