import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
const publicPagesSource = readFileSync(resolve(root, 'src/lib/public-pages.ts'), 'utf8');
const publicPages = {
  privacy: resolvedConfig.extra?.publicPrivacyUrl,
  support: resolvedConfig.extra?.publicSupportUrl,
  terms: resolvedConfig.extra?.publicTermsUrl,
};
const publicPageHtml = new Map();
const storeInfo = storeConfig.apple?.info?.['en-US'];

if (storeInfo?.privacyPolicyUrl !== publicPages.privacy || storeInfo?.supportUrl !== publicPages.support) {
  throw new Error('Apple metadata legal URLs must match the production Expo configuration.');
}

for (const [page, url] of Object.entries(publicPages)) {
  if (typeof url !== 'string') throw new Error(`The production ${page} URL is missing.`);
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.searchParams.get('page') !== page) {
    throw new Error(`The production ${page} URL must be HTTPS and identify the ${page} page.`);
  }
  if (!publicPagesSource.includes(`${page}: '${url}'`)) {
    throw new Error(`The in-app ${page} URL does not match the production Expo configuration.`);
  }
  let response;
  try {
    response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown network error';
    throw new Error(`${url} could not be loaded within 10 seconds: ${message}`);
  }
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    throw new Error(`${url} did not return an HTML page.`);
  }
  const html = await response.text();
  if (!html.includes('<title>Bolo Hindi</title>') || !html.includes('id="root"')) {
    throw new Error(`${url} did not return the Bolo public-site shell.`);
  }
  publicPageHtml.set(page, html);
}

const privacyHtml = publicPageHtml.get('privacy') || '';
const bundleMatch = privacyHtml.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i)
  || privacyHtml.match(/<script[^>]+src=["']([^"']+)["'][^>]+type=["']module["']/i);
if (!bundleMatch) throw new Error('The public privacy page did not reference its application bundle.');
const publicBundleUrl = new URL(bundleMatch[1], publicPages.privacy);
let bundleResponse;
try {
  bundleResponse = await fetch(publicBundleUrl, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown network error';
  throw new Error(`The public privacy bundle could not be loaded within 10 seconds: ${message}`);
}
if (!bundleResponse.ok) throw new Error(`The public privacy bundle returned HTTP ${bundleResponse.status}.`);
const publicBundle = await bundleResponse.text();
const requiredPrivacyFacts = [
  'WebRTC media stream',
  'short-lived OpenAI Realtime credential',
  'audio track disabled',
  'Send turn',
  'segments microphone audio in memory without creating a recording file',
  'Support requests contain the name, email',
  'up to 100 recent typed and transcribed Asha chat messages',
  'unencrypted storage on this device',
  'Clear chat',
  'does not delete reports',
];
for (const fact of requiredPrivacyFacts) {
  if (!publicBundle.includes(fact)) {
    throw new Error(`The deployed public policy is stale: missing “${fact}”.`);
  }
}

function pngSize(relativePath) {
  const file = readFileSync(resolve(root, relativePath));
  if (file.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${relativePath} is not a PNG.`);
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20), colorType: file.readUInt8(25) };
}

const screenshots = [
  ...['01-home', '02-guided-scene', '03-scene-result', '04-asha'].map((name) => ({ path: `assets/store/screenshots/android/${name}.png`, width: 1080, height: 1920 })),
  ...['01-home', '02-guided-scene', '03-scene-result', '04-asha'].map((name) => ({ path: `assets/store/screenshots/ios/${name}.png`, width: 1320, height: 2868 })),
];
for (const screenshot of screenshots) {
  if (!existsSync(resolve(root, screenshot.path))) throw new Error(`Missing shipping-build screenshot: ${screenshot.path}`);
  const info = pngSize(screenshot.path);
  if (info.width !== screenshot.width || info.height !== screenshot.height || info.colorType !== 2) {
    throw new Error(`${screenshot.path} must be an opaque ${screenshot.width}x${screenshot.height} PNG.`);
  }
}

console.log('Public release validation passed: identity, EAS linkage, metadata, legal URLs, and eight store screenshots are complete.');
