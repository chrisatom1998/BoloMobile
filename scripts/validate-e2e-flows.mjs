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
  'scene completion': 'scene-completion-title',
  'scene resume': 'Turn 2 of [0-9]+',
  consent: 'Enable live practice',
  'microphone denial': 'microphone: deny',
  'background persistence': 'pressKey: Home',
  'saved phrase persistence': 'चीनी कम, कृपया।',
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
  const source = (await readFile(path.join(directory, file), 'utf8')).replace(/\r\n/gu, '\n');
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

const unsupported = await readFile(path.join(flowDirectory, '06-simulator-voice-unsupported.yaml'), 'utf8');
const nightly = await readFile('.eas/workflows/nightly-maestro.yml', 'utf8');
if (unsupported.includes('when:')) throw new Error('Simulator limitation assertions must not be conditional.');
if (!unsupported.includes('visible: "Live voice requires a physical iPhone.*"')) throw new Error('Simulator limitation must have its own required assertion.');
// Flow 05 drives real GPT-Live voice and only runs on a physical iPhone; the
// simulator nightly must still run the unsupported-device check instead.
if (nightly.includes('05-realtime-voice-turns.yaml') || !nightly.includes('06-simulator-voice-unsupported.yaml')) {
  throw new Error('iOS Simulator must run the unsupported-device check. Real iPhone voice runs only on a physical device.');
}
const signoff = await readFile('.github/workflows/record-ios-physical-signoff.yml', 'utf8');
for (const marker of ['voice_checks_completed:', 'voice_evidence:', 'test "$VOICE_CHECKS_COMPLETED" = "true"', 'test -n "${VOICE_EVIDENCE//[[:space:]]/}"']) {
  if (!signoff.includes(marker)) throw new Error(`Physical iPhone voice signoff is missing ${marker}.`);
}
const iosSource = (await Promise.all(files.filter(file => file !== '01-first-launch-offline.yaml').map(file => readFile(path.join(flowDirectory, file), 'utf8')))).join('\n');
if (/Tap to connect|plan 1 of 10|Turn [0-9]+ of [0-9]+/u.test(iosSource)) throw new Error('iOS flows contain obsolete copy or a hardcoded lesson count.');

console.log(`Validated ${files.length} Maestro device-flow definitions and ${subflowFiles.length} subflows. Device execution and physical voice acceptance are separate gates.`);
