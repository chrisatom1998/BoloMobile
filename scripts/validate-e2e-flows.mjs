import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('.maestro');
const flowDirectory = path.join(root, 'flows');
const files = (await readdir(flowDirectory)).filter((file) => file.endsWith('.yaml')).sort();
if (files.length < 4) throw new Error(`Expected at least 4 Maestro flows; found ${files.length}.`);

const combined = (await Promise.all(files.map((file) => readFile(path.join(flowDirectory, file), 'utf8')))).join('\n');
const requiredCoverage = {
  'first launch': 'clearState: true',
  hydration: 'stopApp',
  'scene completion': 'Scene complete',
  'scene resume': 'Turn 2 of 2',
  consent: 'I agree and want to continue',
  'microphone denial': 'microphone: deny',
  'live background cleanup': 'pressKey: Home',
  'saved phrase persistence': 'Saved phrases',
  'data deletion': 'Delete my Bolo data',
  'offline startup': 'setAirplaneMode: enabled',
};
const missing = Object.entries(requiredCoverage).filter(([, marker]) => !combined.includes(marker)).map(([name]) => name);
if (missing.length) throw new Error(`Maestro coverage is missing: ${missing.join(', ')}.`);

for (const file of files) {
  const source = await readFile(path.join(flowDirectory, file), 'utf8');
  if (!source.startsWith('appId: com.bolo.hindi\n')) throw new Error(`${file} does not target the Bolo bundle identifier.`);
  if (!source.includes('\n---\n')) throw new Error(`${file} is missing a Maestro flow document separator.`);
}

console.log(`Validated ${files.length} Maestro device flows across all critical native journeys.`);

