import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.maestro');
const flowDirectory = path.join(root, 'flows');
const subflowDirectory = path.join(root, 'subflows');
const expectedAppId = process.env.BOLO_APP_IDENTIFIER?.trim() || 'com.bolo.hindi';
const files = (await readdir(flowDirectory)).filter((file) => file.endsWith('.yaml')).sort();
if (files.length < 4) throw new Error(`Expected at least 4 Maestro flows; found ${files.length}.`);

const combined = (await Promise.all(files.map((file) => readFile(path.join(flowDirectory, file), 'utf8')))).join('\n');
const requiredCoverage = {
  'first launch': 'clearState: true',
  hydration: 'stopApp',
  'scene completion': 'Scene complete',
  'scene resume': 'Turn 2 of 2',
  consent: 'Enable live practice',
  'microphone denial': 'microphone: deny',
  'live background cleanup': 'pressKey: Home',
  'saved phrase persistence': 'Hear चीनी कम, कृपया।',
  'data deletion': 'Delete my Bolo data',
  'offline startup': 'setAirplaneMode: enabled',
};
const missing = Object.entries(requiredCoverage).filter(([, marker]) => !combined.includes(marker)).map(([name]) => name);
if (missing.length) throw new Error(`Maestro coverage is missing: ${missing.join(', ')}.`);

const subflowFiles = (await readdir(subflowDirectory)).filter((file) => file.endsWith('.yaml')).sort();
const structuralTargets = [
  ...files.map((file) => ({ file, directory: flowDirectory, label: `flows/${file}` })),
  ...subflowFiles.map((file) => ({ file, directory: subflowDirectory, label: `subflows/${file}` })),
];

for (const { file, directory, label } of structuralTargets) {
  const source = await readFile(path.join(directory, file), 'utf8');
  // Maestro subflows may omit their own launch stanza, but when a file declares an appId it
  // must be the identifier this build ships with.
  if (source.startsWith('appId:')) {
    if (!source.startsWith(`appId: ${expectedAppId}\n`)) {
      throw new Error(`${label} does not target the Bolo bundle identifier (${expectedAppId}).`);
    }
  } else if (directory === flowDirectory) {
    throw new Error(`${label} does not target the Bolo bundle identifier (${expectedAppId}).`);
  }
  if (!source.includes('\n---\n')) throw new Error(`${label} is missing a Maestro flow document separator.`);
}

console.log(`Validated ${files.length} Maestro device flows and ${subflowFiles.length} subflows across all critical native journeys.`);
