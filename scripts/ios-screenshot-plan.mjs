import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const defaultScreens = ['onboarding', 'today', 'asha', 'phrases', 'review', 'progress'];
const branchScreens = {
  'screenshots/pr-102': ['none'],
  'screenshots/pr-105': ['onboarding', 'reminder'],
  'screenshots/pr-106': ['chat'],
  'screenshots/pr-107': ['asha'],
  'screenshots/pr-108': ['today'],
  'screenshots/pr-109': ['review'],
};

const requiredFiles = {
  onboarding: ['onboarding-1.png', 'onboarding-2.png', 'onboarding-3.png'],
  today: ['today-1.png', 'today-2.png'],
  asha: ['asha.png', 'asha-consent.png'],
  phrases: ['phrases.png'],
  review: ['review-hidden.png', 'review-revealed.png'],
  progress: ['progress.png'],
  reminder: ['reminder.png'],
  chat: ['chat-phrase-card.png'],
};

export function planScreens({ branch = '', input = '' } = {}) {
  const requested = input.trim();
  if (requested) return parseList(requested);
  if (Object.prototype.hasOwnProperty.call(branchScreens, branch)) return branchScreens[branch];
  return defaultScreens;
}

function parseList(input) {
  if (input === 'all') return defaultScreens;
  if (input === 'none') return ['none'];
  const screens = input.split(',').map((screen) => screen.trim()).filter(Boolean);
  const unknown = screens.filter((screen) => !Object.prototype.hasOwnProperty.call(requiredFiles, screen));
  if (screens.length === 0 || unknown.length > 0) {
    throw new Error(`Unknown screenshot screens: ${unknown.join(', ') || input}.`);
  }
  return screens;
}

export function expectedScreenshotFiles(screens, prefix) {
  return screens.flatMap((screen) => {
    if (screen === 'none') return [];
    const files = requiredFiles[screen];
    if (!files) throw new Error(`Unknown screenshot screen "${screen}".`);
    return files.map((file) => `${prefix}-${file}`);
  });
}

async function listPngs(directory) {
  const found = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.name.endsWith('.png')) found.push(absolute);
    }
  }
  try {
    const info = await stat(directory);
    if (!info.isDirectory()) return found;
  } catch {
    return found;
  }
  await walk(directory);
  return found;
}

export async function missingScreenshots(directory, screens, prefix) {
  const expected = expectedScreenshotFiles(screens, prefix);
  const pngs = await listPngs(directory);
  const names = new Set(pngs.map((file) => path.basename(file)));
  return expected.filter((file) => !names.has(file));
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return '';
  return process.argv[index + 1] ?? '';
}

async function main() {
  const branch = readArg('--branch');
  const input = readArg('--input');
  const screens = planScreens({ branch, input });
  if (process.argv.includes('--check')) {
    const directory = readArg('--dir');
    const prefix = readArg('--prefix') || 'main';
    if (!directory) throw new Error('Missing --dir for screenshot check.');
    const missing = await missingScreenshots(directory, screens, prefix);
    if (missing.length > 0) {
      throw new Error(`Missing simulator screenshots: ${missing.join(', ')}.`);
    }
    console.log(`Checked ${expectedScreenshotFiles(screens, prefix).length} screenshots in ${directory}.`);
    return;
  }
  if (process.argv.includes('--flows')) {
    if (screens.length === 1 && screens[0] === 'none') return;
    for (const screen of screens) console.log(`.maestro/screenshots/${screen}.yaml`);
    return;
  }
  console.log(screens.join(','));
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
