import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pngInfo } from './lib/png.mjs';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
let platform = 'all';
let phase = 'final';
let sawPlatform = false;
let sawPhase = false;
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--platform' && !sawPlatform) {
    sawPlatform = true;
    platform = args[index + 1];
    index += 1;
    if (platform !== 'ios') throw new Error('Unsupported platform argument; use --platform ios or no argument.');
    continue;
  }
  if (argument === '--phase' && !sawPhase) {
    sawPhase = true;
    phase = args[index + 1];
    index += 1;
    if (!['binary', 'final'].includes(phase)) {
      throw new Error('Unsupported release phase; use --phase binary or --phase final.');
    }
    continue;
  }
  throw new Error(`Unsupported release argument: ${argument ?? '(missing value)'}.`);
}
if (phase === 'binary' && platform !== 'ios') {
  throw new Error('The binary release phase is available only with --platform ios.');
}
const iosOnly = platform === 'ios';

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
const easConfig = JSON.parse(readFileSync(resolve(root, 'eas.json'), 'utf8'));
process.env.EAS_BUILD_PROFILE = 'production';
const resolvedConfig = require(resolve(root, 'app.config.js'))({ config: staticConfig });
if (resolvedConfig.ios.bundleIdentifier !== identifier || (!iosOnly && resolvedConfig.android.package !== identifier)) {
  throw new Error('The resolved production identifiers do not match BOLO_APP_IDENTIFIER.');
}
if (resolvedConfig.extra?.eas?.projectId !== projectId || resolvedConfig.owner !== owner) {
  throw new Error('The resolved production app is not linked to the configured Expo owner and EAS project.');
}

const effectiveIosVersion = resolvedConfig.ios?.version ?? resolvedConfig.version;
if (typeof effectiveIosVersion !== 'string' || !/^(0|[1-9]\d*)(\.(0|[1-9]\d*)){2}$/.test(effectiveIosVersion)) {
  throw new Error('The iOS release version must use Bolo\'s X.Y.Z numeric format.');
}
if (resolvedConfig.ios?.buildNumber !== undefined) {
  throw new Error('ios.buildNumber must stay unset because EAS manages production build numbers remotely.');
}
const iosInfoPlist = resolvedConfig.ios?.infoPlist ?? {};
for (const key of ['CFBundleShortVersionString', 'CFBundleVersion', 'ITSAppUsesNonExemptEncryption']) {
  if (Object.prototype.hasOwnProperty.call(iosInfoPlist, key)) {
    throw new Error(`${key} must be controlled by Expo release fields, not ios.infoPlist.`);
  }
}
if (resolvedConfig.ios?.config?.usesNonExemptEncryption !== false) {
  throw new Error('The iOS release must explicitly declare usesNonExemptEncryption false.');
}
if (iosInfoPlist.NSAppTransportSecurity?.NSAllowsArbitraryLoads !== false) {
  throw new Error('The iOS release must explicitly keep NSAllowsArbitraryLoads false.');
}

const privacyManifest = resolvedConfig.ios?.privacyManifests;
if (privacyManifest?.NSPrivacyTracking !== false) {
  throw new Error('The iOS privacy manifest must explicitly declare no tracking.');
}
const expectedCollectedDataTypes = new Set([
  'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyCollectedDataTypeAudioData',
  'NSPrivacyCollectedDataTypeDeviceID',
  'NSPrivacyCollectedDataTypeProductInteraction',
]);
const collectedDataTypes = privacyManifest?.NSPrivacyCollectedDataTypes;
const collectedDataTypeNames = Array.isArray(collectedDataTypes)
  ? new Set(collectedDataTypes.map((entry) => entry.NSPrivacyCollectedDataType))
  : new Set();
if (
  !Array.isArray(collectedDataTypes)
  || collectedDataTypes.length !== expectedCollectedDataTypes.size
  || collectedDataTypeNames.size !== expectedCollectedDataTypes.size
  || [...expectedCollectedDataTypes].some((type) => !collectedDataTypeNames.has(type))
  || collectedDataTypes.some((entry) => (
    entry.NSPrivacyCollectedDataTypeLinked !== true
    || entry.NSPrivacyCollectedDataTypeTracking !== false
    || entry.NSPrivacyCollectedDataTypePurposes?.length !== 1
    || entry.NSPrivacyCollectedDataTypePurposes[0] !== 'NSPrivacyCollectedDataTypePurposeAppFunctionality'
  ))
) {
  throw new Error('The iOS privacy manifest must keep the four reviewed app-owned data declarations with tracking disabled.');
}

if (easConfig.cli?.appVersionSource !== 'remote') {
  throw new Error('eas.json must keep cli.appVersionSource set to remote for production iOS builds.');
}
const productionBuildProfile = easConfig.build?.production ?? {};
const iosAutoIncrement = productionBuildProfile.ios?.autoIncrement ?? productionBuildProfile.autoIncrement;
if (iosAutoIncrement !== true && iosAutoIncrement !== 'buildNumber') {
  throw new Error('eas.json production must explicitly auto-increment the iOS buildNumber.');
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

function requiredAppleText(field, value, maximumCodePoints) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Apple metadata ${field} is required for Bolo's iOS release.`);
  }
  if ([...value].length > maximumCodePoints) {
    throw new Error(`Apple metadata ${field} exceeds the ${maximumCodePoints}-character limit.`);
  }
}

for (const [field, maximumCodePoints] of [
  ['title', 30],
  ['subtitle', 30],
  ['promoText', 170],
  ['description', 4_000],
  ['releaseNotes', 4_000],
]) {
  requiredAppleText(field, storeInfo?.[field], maximumCodePoints);
}
if (!Array.isArray(storeInfo?.keywords) || !storeInfo.keywords.length || storeInfo.keywords.some((keyword) => (
  typeof keyword !== 'string' || [...keyword.trim()].length < 3 || keyword.includes(',')
))) {
  throw new Error('Apple metadata keywords must be nonempty terms of at least three characters without commas.');
}
if (Buffer.byteLength(storeInfo.keywords.join(','), 'utf8') > 100) {
  throw new Error('Apple metadata keywords exceed Apple\'s 100-byte limit.');
}
if (!Array.isArray(storeConfig.apple?.categories) || storeConfig.apple.categories.length === 0) {
  throw new Error('Apple metadata must declare at least one App Store category.');
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
  // The pages are served by the in-repo website at /privacy, /terms, and /support.
  if (parsed.protocol !== 'https:' || parsed.pathname.replace(/\/+$/u, '') !== `/${page}` || parsed.search !== '') {
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

if (phase === 'final') {
  const screenshots = [
    ...(iosOnly ? [] : ['01-home', '02-guided-scene', '03-scene-result', '04-asha'].map((name) => ({ path: `assets/store/screenshots/android/${name}.png`, width: 1080, height: 1920 }))),
    ...['01-lesson', '02-path', '03-home', '04-asha'].map((name) => ({ path: `assets/store/screenshots/ios/${name}.png`, width: 1320, height: 2868 })),
  ];
  for (const screenshot of screenshots) {
    if (!existsSync(resolve(root, screenshot.path))) throw new Error(`Missing shipping-build screenshot: ${screenshot.path}`);
    const info = pngInfo(resolve(root, screenshot.path), screenshot.path);
    if (info.width !== screenshot.width || info.height !== screenshot.height || info.bitDepth !== 8 || info.colorType !== 2) {
      throw new Error(`${screenshot.path} must be an opaque ${screenshot.width}x${screenshot.height} PNG.`);
    }
  }
}

console.log(phase === 'binary'
  ? 'Static iOS binary validation passed: identity, EAS linkage, Apple metadata, and configured legal URLs are complete. Screenshot validation is deferred to release:validate:ios before metadata or public release.'
  : iosOnly
    ? 'Static iOS release validation passed: identity, EAS linkage, Apple metadata, configured legal URLs, and four iPhone screenshots are complete.'
    : 'Static all-platform release validation passed: identity, EAS linkage, metadata, configured legal URLs, and eight store screenshots are complete. The release preflight will now verify the deployed public policy.');
