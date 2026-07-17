import * as WebBrowser from 'expo-web-browser';

import { openPublicPage, publicPageUrls } from '../src/lib/public-pages';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));

describe('public policy pages', () => {
  it('uses the production HTTPS pages required by the store listings', async () => {
    expect(publicPageUrls).toEqual({
      privacy: 'https://74e39779183cf78fed.v2.appdeploy.ai/?page=privacy',
      support: 'https://74e39779183cf78fed.v2.appdeploy.ai/?page=support',
      terms: 'https://74e39779183cf78fed.v2.appdeploy.ai/?page=terms',
    });

    await openPublicPage('privacy');
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(publicPageUrls.privacy);
  });
});
