/* eslint-disable @typescript-eslint/no-require-imports */
const { createRequire } = require('node:module');
const { join, resolve } = require('node:path');

const root = resolve(process.cwd());
const appRequire = createRequire(join(root, 'package.json'));
const minimatchPath = appRequire.resolve('minimatch');

describe('minimatch coverage bridge', () => {
  test('keeps minimatch 11 callable for test-exclude during Jest coverage', () => {
    const minimatch = require(minimatchPath);
    const { minimatch: named, Minimatch } = require(minimatchPath);
    const TestExclude = require('test-exclude');

    expect(typeof minimatch).toBe('function');
    expect(named).toBe(minimatch);
    expect(typeof Minimatch).toBe('function');
    expect(minimatch('src/app/(tabs)/live.tsx', '**/*.tsx', { dot: true })).toBe(true);

    const exclude = new TestExclude({ cwd: root });
    expect(exclude.shouldInstrument(join(root, 'src/app/(tabs)/live.tsx'))).toBe(true);
    expect(exclude.shouldInstrument(join(root, 'node_modules/test-exclude/index.js'))).toBe(false);
  });
});
