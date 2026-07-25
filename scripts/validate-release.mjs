import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pngInfo } from './lib/png.mjs';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for a public release.`);
  return value;
}

const identifier = required('BOLO_APP_IDENTIFIER');
const projectId = required('BOLO_EAS_PROJECT_ID');
const owner = required('BOLO_EXPO_OWNER');
required('BOLO_PUBLISHER_NAME');
const supportEmail = required('BOLO_SUPPORT_EMAIL');
required('BOLO_REVIEW_FIRST_NAME');
required('BOLO_REVIEW_LAST_NAME');
required('BOLO_REVIEW_EMAIL');
required('BOLO_REVIEW_PHONE');

if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/.test(identifier)) {
  throw new Error('BOLO_APP_IDENTIFIER must be a permanent publisher-owned reverse-domain identifier.');
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
  throw new Error('BOLO_EAS_PROJECT_ID must be a valid EAS project UUID.');
}
if (!/^[a-z0-9][a-z0-9_-]{1,38}$/i.test(owner)) throw new Error('BOLO_EXPO_OWNER must be a valid Expo account name.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) throw new Error('BOLO_SUPPORT_EMAIL must be a valid monitored address.');

const staticConfig = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')).expo;
process.env.EAS_BUILD_PROFILE = 'production';
const resolvedConfig = require(resolve(root, 'app.config.js'))({ config: staticConfig });
if (resolvedConfig.ios.bundleIdentifier !== identifier || resolvedConfig.android.package !== identifier) {
  throw new Error('The resolved production identifiers do not match BOLO_APP_IDENTIFIER.');
}
if (resolvedConfig.extra?.eas?.projectId !== projectId || resolvedConfig.owner !== owner) {
  throw new Error('The resolved production app is not linked to the configured Expo owner and EAS project.');
}

const storeConfig = require(resolve(root, 'store.config.js'));
const publicPages = {
  privacy: resolvedConfig.extra?.publicPrivacyUrl,
  support: resolvedConfig.extra?.publicSupportUrl,
  terms: resolvedConfig.extra?.publicTermsUrl,
};
const storeInfo = storeConfig.apple?.info?.['en-US'];

if (storeInfo?.privacyPolicyUrl !== publicPages.privacy || storeInfo?.supportUrl !== publicPages.support) {
  throw new Error('Apple metadata legal URLs must match the production Expo configuration.');
}

// The in-app module resolves these URLs from the Expo configuration at runtime, so the release
// gate checks that wiring plus the built-in fallbacks it uses when the extra block is missing.
const publicPagesSource = readFileSync(resolve(root, 'src/lib/public-pages.ts'), 'utf8');
const extraKeys = { privacy: 'publicPrivacyUrl', support: 'publicSupportUrl', terms: 'publicTermsUrl' };
function inAppFallbackUrl(page) {
  const match = publicPagesSource.match(new RegExp(`\\b${page}\\s*:\\s*(['"\`])([^'"\`]+)\\1`));
  return match?.[2];
}

if (!publicPagesSource.includes('Constants.expoConfig?.extra')) {
  throw new Error('src/lib/public-pages.ts must read its URLs from the resolved Expo configuration.');
}

for (const [page, url] of Object.entries(publicPages)) {
  if (typeof url !== 'string') throw new Error(`The production ${page} URL is missing.`);
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.searchParams.get('page') !== page) {
    throw new Error(`The production ${page} URL must be HTTPS and identify the ${page} page.`);
  }
  if (!publicPagesSource.includes(extraKeys[page])) {
    throw new Error(`src/lib/public-pages.ts must read the ${page} URL from extra.${extraKeys[page]}.`);
  }
  const fallbackUrl = inAppFallbackUrl(page);
  if (!fallbackUrl) throw new Error(`The in-app ${page} fallback URL could not be read from src/lib/public-pages.ts.`);
  if (!process.env.BOLO_PUBLIC_SITE_URL?.trim() && fallbackUrl !== url) {
    throw new Error(`The in-app ${page} fallback URL does not match the production Expo configuration.`);
  }
}

const resolvedApiUrl = resolvedConfig.extra?.boloApiUrl;
if (typeof resolvedApiUrl !== 'string' || new URL(resolvedApiUrl).protocol !== 'https:') {
  throw new Error('The production Bolo API URL must be an HTTPS URL exposed through the Expo configuration.');
}
const apiSource = readFileSync(resolve(root, 'src/services/bolo-api.ts'), 'utf8');
if (!apiSource.includes('Constants.expoConfig?.extra?.boloApiUrl')) {
  throw new Error('src/services/bolo-api.ts must read its API base from extra.boloApiUrl.');
}

const screenshots = [
  ...['01-home', '02-guided-scene', '03-scene-result', '04-asha'].map((name) => ({ path: `assets/store/screenshots/android/${name}.png`, width: 1080, height: 1920 })),
  ...['01-home', '02-guided-scene', '03-scene-result', '04-asha'].map((name) => ({ path: `assets/store/screenshots/ios/${name}.png`, width: 1320, height: 2868 })),
];
for (const screenshot of screenshots) {
  if (!existsSync(resolve(root, screenshot.path))) throw new Error(`Missing shipping-build screenshot: ${screenshot.path}`);
  const info = pngInfo(resolve(root, screenshot.path), screenshot.path);
  if (info.width !== screenshot.width || info.height !== screenshot.height || info.bitDepth !== 8 || info.colorType !== 2) {
    throw new Error(`${screenshot.path} must be an opaque ${screenshot.width}x${screenshot.height} PNG.`);
  }
}

console.log('Public release validation passed: identity, EAS linkage, metadata, legal URLs, and eight store screenshots are complete. Run "npm run release:validate:live" for the deployed public-site checks.');
