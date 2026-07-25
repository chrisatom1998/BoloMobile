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

  it('prefers the URLs published through the resolved Expo configuration', () => {
    jest.isolateModules(() => {
      jest.doMock('expo-constants', () => ({
        __esModule: true,
        default: {
          expoConfig: {
            extra: {
              publicPrivacyUrl: 'https://pages.example.test/?page=privacy',
              publicSupportUrl: 'https://pages.example.test/?page=support',
              publicTermsUrl: 'http://pages.example.test/?page=terms',
            },
          },
        },
      }));

      const { publicPageUrls: configured } = require('../src/lib/public-pages') as {
        publicPageUrls: Record<string, string>;
      };

      expect(configured.privacy).toBe('https://pages.example.test/?page=privacy');
      expect(configured.support).toBe('https://pages.example.test/?page=support');
      expect(configured.terms).toBe('https://74e39779183cf78fed.v2.appdeploy.ai/?page=terms');
    });
  });
});
