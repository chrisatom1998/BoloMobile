import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const specs = [
  { path: 'assets/images/icon.png', width: 1024, height: 1024, colorType: 2 },
  { path: 'assets/images/android-icon-foreground.png', width: 1024, height: 1024, colorType: 6 },
  { path: 'assets/images/android-icon-monochrome.png', width: 1024, height: 1024, colorType: 6 },
  { path: 'assets/images/splash-icon.png', width: 1024, height: 1024, colorType: 6 },
  { path: 'assets/images/favicon.png', width: 64, height: 64, colorType: 6 },
  { path: 'assets/store/app-store-icon.png', width: 1024, height: 1024, colorType: 2 },
  { path: 'assets/store/play-store-icon.png', width: 512, height: 512, colorType: 6, maxBytes: 1_000_000 },
  { path: 'assets/store/play-store-feature.png', width: 1024, height: 500, colorType: 2 },
];

function pngInfo(relativePath) {
  const file = readFileSync(resolve(root, relativePath));
  const signature = file.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a' || file.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error(`${relativePath} is not a valid PNG.`);
  }
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
    bitDepth: file.readUInt8(24),
    colorType: file.readUInt8(25),
  };
}

for (const spec of specs) {
  const info = pngInfo(spec.path);
  if (info.width !== spec.width || info.height !== spec.height) {
    throw new Error(`${spec.path} must be ${spec.width}x${spec.height}; found ${info.width}x${info.height}.`);
  }
  if (info.bitDepth !== 8 || info.colorType !== spec.colorType) {
    throw new Error(`${spec.path} has unexpected PNG encoding (bit depth ${info.bitDepth}, color type ${info.colorType}).`);
  }
  if (spec.maxBytes && statSync(resolve(root, spec.path)).size > spec.maxBytes) {
    throw new Error(`${spec.path} exceeds the ${spec.maxBytes}-byte store limit.`);
  }
}

const appConfig = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')).expo;
if (appConfig.ios?.icon !== './assets/images/icon.png') throw new Error('iOS must use the final Bolo icon.');
if (appConfig.ios?.supportsTablet !== false) throw new Error('The v1 phone-only scope must keep iPad support disabled.');
if (appConfig.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads !== false) {
  throw new Error('iOS production transport security must reject arbitrary HTTP loads.');
}
if (appConfig.android?.adaptiveIcon?.backgroundImage) throw new Error('Android adaptive icon must use the declared solid background color.');
if (appConfig.plugins?.some((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen' && plugin[1]?.backgroundColor !== '#F5F0E8')) {
  throw new Error('The splash screen must use Bolo cream, not starter artwork colors.');
}

const listings = JSON.parse(readFileSync(resolve(root, 'store/listings.json'), 'utf8'));
const storeAssets = JSON.parse(readFileSync(resolve(root, 'store/assets.json'), 'utf8'));
const metadata = JSON.parse(readFileSync(resolve(root, 'store.config.json'), 'utf8'));
const eas = JSON.parse(readFileSync(resolve(root, 'eas.json'), 'utf8'));

const limitedCopy = [
  ['Apple title', listings.apple.title, 30],
  ['Apple subtitle', listings.apple.subtitle, 30],
  ['Apple keywords', listings.apple.keywords, 100],
  ['Apple description', listings.apple.description, 4_000],
  ['Apple release notes', listings.apple.releaseNotes, 4_000],
  ['Google title', listings.googlePlay.appName, 30],
  ['Google short description', listings.googlePlay.shortDescription, 80],
  ['Google full description', listings.googlePlay.fullDescription, 4_000],
  ['Google release notes', listings.googlePlay.releaseNotes, 500],
];
for (const [label, value, limit] of limitedCopy) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > limit) {
    throw new Error(`${label} must contain 1-${limit} characters.`);
  }
}
for (const screenshot of storeAssets.screenshots.recommendedOrder) {
  if ([...screenshot.altText].length > 140) throw new Error(`Screenshot alt text ${screenshot.id} exceeds 140 characters.`);
}
if (storeAssets.screenshots.apple.ipadSupportAtAudit !== false) throw new Error('Store assets must reflect the phone-only iOS v1 scope.');

const appleInfo = metadata.apple?.info?.['en-US'];
for (const key of ['privacyPolicyUrl', 'supportUrl', 'marketingUrl']) {
  const url = new URL(appleInfo?.[key]);
  if (url.protocol !== 'https:' || url.hostname === 'example.com') throw new Error(`Apple ${key} must be a production HTTPS URL.`);
}
if (metadata.configVersion !== 0 || metadata.apple?.advisory?.kidsAgeBand !== null) throw new Error('Apple metadata must use schema version 0 and must not opt into the Kids category.');
for (const key of ['ageRatingOverride', 'koreaAgeRatingOverride']) {
  if (metadata.apple?.advisory?.[key] !== 'NONE') throw new Error(`Apple ${key} must be declared explicitly.`);
}
if (metadata.apple?.info?.['en-US']?.keywords?.join(',').length > 100) throw new Error('Apple metadata keywords exceed 100 characters.');

if (eas.build?.production?.android?.buildType !== 'app-bundle') throw new Error('The Android production build must produce an app bundle.');
if (eas.submit?.internal?.android?.track !== 'internal') throw new Error('The Android internal submission profile is missing.');
if (eas.submit?.production?.android?.track !== 'production' || eas.submit?.production?.android?.releaseStatus !== 'draft') {
  throw new Error('The Android production submission must create a safe production draft.');
}
if (eas.submit?.production?.ios?.metadataPath !== './store.config.js') throw new Error('The iOS submit profile must load dynamic Apple metadata.');

console.log(`Validated ${specs.length} artwork files plus store copy, metadata, and release profiles.`);
