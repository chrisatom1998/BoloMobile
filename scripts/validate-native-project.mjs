import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const requireWorkspace = process.argv.includes('--require-workspace');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--require-workspace');

if (unknownArguments.length) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(', ')}`);
}

async function mustRead(relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    return await readFile(absolutePath, 'utf8');
  } catch (error) {
    throw new Error(`Missing or unreadable native project file: ${relativePath}`, { cause: error });
  }
}

async function mustExist(relativePath) {
  try {
    await access(path.join(root, relativePath));
  } catch (error) {
    throw new Error(`Missing generated native project path: ${relativePath}`, { cause: error });
  }
}

function mustInclude(source, marker, relativePath) {
  if (!source.includes(marker)) {
    throw new Error(`${relativePath} is missing required native marker: ${marker}`);
  }
}

function mustOccurExactlyOnce(source, marker, relativePath) {
  const occurrences = source.split(marker).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${relativePath} must contain exactly one native marker ${marker}; found ${occurrences}.`);
  }
}

const appJson = JSON.parse(await mustRead('app.json'));
const appName = appJson.expo?.name;
const bundleIdentifier = process.env.BOLO_APP_IDENTIFIER?.trim() || appJson.expo?.ios?.bundleIdentifier;
const urlScheme = appJson.expo?.scheme;

if (appName !== 'Bolo' || bundleIdentifier !== 'com.bolo.hindi' || urlScheme !== 'bolo') {
  throw new Error('Native CI expects the Bolo scheme, com.bolo.hindi bundle identifier, and bolo URL scheme.');
}

const projectPath = 'ios/Bolo.xcodeproj/project.pbxproj';
const schemePath = 'ios/Bolo.xcodeproj/xcshareddata/xcschemes/Bolo.xcscheme';
const appDelegatePath = 'ios/Bolo/AppDelegate.swift';
const infoPlistPath = 'ios/Bolo/Info.plist';
const moduleConfigPath = 'modules/bolo-audio-normalizer/expo-module.config.json';
const modulePodspecPath = 'modules/bolo-audio-normalizer/ios/BoloAudioNormalizer.podspec';
const moduleSourcePath = 'modules/bolo-audio-normalizer/ios/BoloAudioNormalizerModule.swift';

const [project, scheme, appDelegate, infoPlist, moduleConfigSource, modulePodspec, moduleSource] = await Promise.all([
  mustRead(projectPath),
  mustRead(schemePath),
  mustRead(appDelegatePath),
  mustRead(infoPlistPath),
  mustRead(moduleConfigPath),
  mustRead(modulePodspecPath),
  mustRead(moduleSourcePath),
]);

mustInclude(project, bundleIdentifier, projectPath);
mustInclude(project, `${bundleIdentifier}.widgets`, projectPath);
mustInclude(scheme, 'BlueprintName = "Bolo"', schemePath);
mustOccurExactlyOnce(appDelegate, 'import AppIntents', appDelegatePath);
mustOccurExactlyOnce(appDelegate, 'struct PracticeHindiIntent: AppIntent', appDelegatePath);
mustOccurExactlyOnce(appDelegate, 'struct BoloAppShortcuts: AppShortcutsProvider', appDelegatePath);
mustInclude(infoPlist, `<string>${urlScheme}</string>`, infoPlistPath);

const microphoneUsageDescription = 'Allow Bolo to use your microphone for Hindi practice and conversations.';
mustOccurExactlyOnce(infoPlist, '<key>NSMicrophoneUsageDescription</key>', infoPlistPath);
mustOccurExactlyOnce(infoPlist, `<string>${microphoneUsageDescription}</string>`, infoPlistPath);
mustOccurExactlyOnce(infoPlist, '<key>NSAllowsArbitraryLoads</key>', infoPlistPath);

if (!/<key>NSAppTransportSecurity<\/key>\s*<dict>[\s\S]*?<key>NSAllowsArbitraryLoads<\/key>\s*<false\s*\/>[\s\S]*?<\/dict>/.test(infoPlist)) {
  throw new Error(`${infoPlistPath} must set NSAppTransportSecurity.NSAllowsArbitraryLoads to false.`);
}

const backgroundModes = infoPlist.match(/<key>UIBackgroundModes<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? '';
if (/<string>\s*audio\s*<\/string>/.test(backgroundModes)) {
  throw new Error(`${infoPlistPath} must not declare the audio UIBackgroundModes capability.`);
}

const moduleConfig = JSON.parse(moduleConfigSource);
if (!moduleConfig.platforms?.includes('apple') || !moduleConfig.apple?.modules?.includes('BoloAudioNormalizerModule')) {
  throw new Error(`${moduleConfigPath} does not register BoloAudioNormalizerModule for Apple platforms.`);
}

mustInclude(modulePodspec, "s.name           = 'BoloAudioNormalizer'", modulePodspecPath);
mustInclude(modulePodspec, "s.platforms      = { :ios => '16.4' }", modulePodspecPath);
mustInclude(modulePodspec, "s.dependency 'ExpoModulesCore'", modulePodspecPath);
mustInclude(moduleSource, 'public final class BoloAudioNormalizerModule: Module', moduleSourcePath);
mustInclude(moduleSource, 'Name("BoloAudioNormalizer")', moduleSourcePath);

if (requireWorkspace) {
  const workspacePath = 'ios/Bolo.xcworkspace/contents.xcworkspacedata';
  const podLockPath = 'ios/Podfile.lock';
  await mustExist(workspacePath);
  const [workspace, podLock] = await Promise.all([mustRead(workspacePath), mustRead(podLockPath)]);
  mustInclude(workspace, 'Bolo.xcodeproj', workspacePath);
  mustInclude(podLock, 'BoloAudioNormalizer', podLockPath);
  mustInclude(podLock, 'ExpoModulesCore', podLockPath);
}

console.log(`Validated generated iOS project Bolo (${bundleIdentifier})${requireWorkspace ? ', workspace, and Pods' : ''}.`);
