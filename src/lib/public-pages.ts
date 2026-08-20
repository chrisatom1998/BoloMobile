import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';

const DEFAULT_PUBLIC_PAGE_URLS = {
  privacy: 'https://74e39779183cf78fed.v2.appdeploy.ai/privacy',
  support: 'https://74e39779183cf78fed.v2.appdeploy.ai/support',
  terms: 'https://74e39779183cf78fed.v2.appdeploy.ai/terms',
} as const;

export type PublicPage = keyof typeof DEFAULT_PUBLIC_PAGE_URLS;

function configuredUrl(key: 'publicPrivacyUrl' | 'publicSupportUrl' | 'publicTermsUrl', page: PublicPage) {
  const value = Constants.expoConfig?.extra?.[key];
  return typeof value === 'string' && value.startsWith('https://') ? value : DEFAULT_PUBLIC_PAGE_URLS[page];
}

export const publicPageUrls: Record<PublicPage, string> = {
  privacy: configuredUrl('publicPrivacyUrl', 'privacy'),
  support: configuredUrl('publicSupportUrl', 'support'),
  terms: configuredUrl('publicTermsUrl', 'terms'),
};

export async function openPublicPage(page: PublicPage) {
  try {
    await WebBrowser.openBrowserAsync(publicPageUrls[page]);
  } catch {
    throw new Error(`Bolo could not open its ${page} page. Check your connection and try again.`);
  }
}
