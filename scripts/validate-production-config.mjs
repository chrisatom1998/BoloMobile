import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_MICROPHONE_USAGE = 'Allow Bolo to use your microphone for Hindi practice and conversations.';
const REAL_OPENAI_KEY = /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/u;

function count(source, needle) {
  return source.split(needle).length - 1;
}

function readConsentVersion(root) {
  const source = readFileSync(resolve(root, 'src/lib/storage.ts'), 'utf8');
  const match = source.match(/\bAI_CONSENT_VERSION\s*=\s*(\d+)\s+as const/u);
  if (!match) throw new Error('Could not read AI_CONSENT_VERSION from src/lib/storage.ts.');
  return Number(match[1]);
}

function resolvedProductionConfig(root, staticConfig) {
  const previous = {
    profile: process.env.EAS_BUILD_PROFILE,
    projectId: process.env.BOLO_EAS_PROJECT_ID,
    owner: process.env.BOLO_EXPO_OWNER,
  };
  process.env.EAS_BUILD_PROFILE = 'production';
  process.env.BOLO_EAS_PROJECT_ID ||= staticConfig.extra?.eas?.projectId;
  process.env.BOLO_EXPO_OWNER ||= staticConfig.owner;
  try {
    return require(resolve(root, 'app.config.js'))({ config: staticConfig });
  } finally {
    if (previous.profile === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = previous.profile;
    if (previous.projectId === undefined) delete process.env.BOLO_EAS_PROJECT_ID;
    else process.env.BOLO_EAS_PROJECT_ID = previous.projectId;
    if (previous.owner === undefined) delete process.env.BOLO_EXPO_OWNER;
    else process.env.BOLO_EXPO_OWNER = previous.owner;
  }
}

export function validateProductionConfig(root = defaultRoot) {
  const staticConfig = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')).expo;
  const resolvedConfig = resolvedProductionConfig(root, staticConfig);
  const apiSource = readFileSync(resolve(root, 'src/services/bolo-api.ts'), 'utf8');
  const fallbackMatch = apiSource.match(/\bFALLBACK_API_URL\s*=\s*(['"])(https:[^'"]+)\1/u);
  const runtimeApiUrl = fallbackMatch?.[2];
  const releaseApiUrl = resolvedConfig.extra?.boloApiUrl;

  if (typeof runtimeApiUrl !== 'string' || runtimeApiUrl !== releaseApiUrl) {
    throw new Error('The runtime API URL must exactly equal the release-validated production API URL.');
  }
  if (apiSource.includes('EXPO_PUBLIC_BOLO_API_URL')) {
    throw new Error('Runtime API selection must not accept EXPO_PUBLIC_BOLO_API_URL overrides.');
  }

  const expectedIdentifier = process.env.BOLO_APP_IDENTIFIER?.trim() || 'com.bolo.hindi';
  if (
    resolvedConfig.ios?.bundleIdentifier !== expectedIdentifier
    || resolvedConfig.android?.package !== expectedIdentifier
  ) {
    throw new Error('Resolved iOS and Android identifiers must equal BOLO_APP_IDENTIFIER.');
  }
  if (resolvedConfig.scheme !== 'bolo') {
    throw new Error('The production URL scheme must remain bolo.');
  }

  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('EXPO_PUBLIC_') && REAL_OPENAI_KEY.test(value || '')) {
      throw new Error(name + ' must not expose a standard OpenAI API key to the client.');
    }
  }
  if (REAL_OPENAI_KEY.test(JSON.stringify(resolvedConfig))) {
    throw new Error('Resolved production config must not contain a standard OpenAI API key.');
  }

  const audioPlugin = resolvedConfig.plugins?.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-audio',
  );
  const audioOptions = audioPlugin?.[1];
  if (audioOptions?.microphonePermission !== EXPECTED_MICROPHONE_USAGE) {
    throw new Error('The production microphone usage string does not match Bolo privacy copy.');
  }
  if (audioOptions?.enableBackgroundRecording !== false || audioOptions?.enableBackgroundPlayback !== false) {
    throw new Error('Production audio configuration must disable background recording and playback.');
  }

  const backgroundModes = resolvedConfig.ios?.infoPlist?.UIBackgroundModes;
  if (Array.isArray(backgroundModes) && backgroundModes.includes('audio')) {
    throw new Error('Production iOS configuration must not declare the audio background mode.');
  }
  if (resolvedConfig.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsArbitraryLoads !== false) {
    throw new Error('Production ATS must keep NSAllowsArbitraryLoads disabled.');
  }

  if (!resolvedConfig.plugins?.includes('./plugins/with-bolo-app-intents')) {
    throw new Error('The Bolo App Intents config plugin must remain enabled.');
  }
  const appIntentsPlugin = require(resolve(root, 'plugins/with-bolo-app-intents.js'));
  if (typeof appIntentsPlugin.applyBoloAppIntents !== 'function') {
    throw new Error('The Bolo App Intents plugin must export its Swift transform.');
  }
  const swiftFixture = 'internal import Expo\n\nclass ReactNativeDelegate: ExpoReactNativeFactoryDelegate {}\n';
  const transformed = appIntentsPlugin.applyBoloAppIntents(swiftFixture);
  if (
    appIntentsPlugin.applyBoloAppIntents(transformed) !== transformed
    || count(transformed, 'import AppIntents') !== 1
    || count(transformed, 'struct PracticeHindiIntent: AppIntent') !== 1
    || count(transformed, 'struct BoloAppShortcuts: AppShortcutsProvider') !== 1
  ) {
    throw new Error('The Bolo App Intents plugin did not generate the required idempotent Swift modifications.');
  }

  const consentVersion = readConsentVersion(root);
  const metadata = JSON.parse(readFileSync(resolve(root, 'store.config.json'), 'utf8'));
  const listings = JSON.parse(readFileSync(resolve(root, 'store/listings.json'), 'utf8'));
  const consentDocuments = {
    'store/privacy-declarations.md': readFileSync(resolve(root, 'store/privacy-declarations.md'), 'utf8'),
    'store.config.json Apple review notes': metadata.apple?.review?.notes || '',
    'store/listings.json Apple review notes': listings.apple?.reviewNotes || '',
  };
  for (const [label, source] of Object.entries(consentDocuments)) {
    const marker = source.match(/AI data-use consent notice version:?\s*(\d+)/iu);
    if (!marker || Number(marker[1]) !== consentVersion) {
      throw new Error(label + ' must match AI_CONSENT_VERSION ' + consentVersion + '.');
    }
  }
  for (const path of ['src/components/ai-consent-gate.tsx', 'src/app/privacy.tsx']) {
    const source = readFileSync(resolve(root, path), 'utf8');
    if (
      !source.includes("import { AI_CONSENT_VERSION } from '@/lib/storage';")
      || !source.includes('AI data-use consent notice version {AI_CONSENT_VERSION}')
    ) {
      throw new Error(path + ' must display the current AI consent notice version from code.');
    }
  }

  return { consentVersion, releaseApiUrl };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = validateProductionConfig();
  console.log(
    'Validated production API, client secrets, microphone/background audio, ATS, App Intents, and AI consent notice version '
      + result.consentVersion
      + '.',
  );
}
