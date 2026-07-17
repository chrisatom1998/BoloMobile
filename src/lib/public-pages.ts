import * as WebBrowser from 'expo-web-browser';

export const publicPageUrls = {
  privacy: 'https://74e39779183cf78fed.v2.appdeploy.ai/?page=privacy',
  support: 'https://74e39779183cf78fed.v2.appdeploy.ai/?page=support',
  terms: 'https://74e39779183cf78fed.v2.appdeploy.ai/?page=terms',
} as const;

export type PublicPage = keyof typeof publicPageUrls;

export async function openPublicPage(page: PublicPage) {
  try {
    await WebBrowser.openBrowserAsync(publicPageUrls[page]);
  } catch {
    throw new Error(`Bolo could not open its ${page} page. Check your connection and try again.`);
  }
}
