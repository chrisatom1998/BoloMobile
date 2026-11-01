/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { createRequire } = require('node:module');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

const root = process.cwd();
const rootRequire = createRequire(join(root, 'package.json'));
const jestRuntimeRequire = createRequire(rootRequire.resolve('jest-runtime/package.json'));
const glob = jestRuntimeRequire('glob');

test('Jest glob 7 matches magic patterns through minimatch 11', () => {
  expect(glob.sync('package.json')).toContain('package.json');
  expect(glob.sync('*.cjs')).toContain('jest.config.cjs');
});

test('glob 7 patch skips when Jest is not installed', () => {
  const empty = mkdtempSync(join(tmpdir(), 'bolo-glob-'));
  const script = pathToFileURL(join(root, 'scripts/patch-glob-minimatch.mjs')).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { patchGlobMinimatch } from ${JSON.stringify(script)};
    const result = patchGlobMinimatch(${JSON.stringify(empty)});
    if (result !== 'skipped') throw new Error(String(result));
  `], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
});
