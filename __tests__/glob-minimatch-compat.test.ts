/* eslint-disable @typescript-eslint/no-require-imports */
const { createRequire } = require('node:module');
const { join } = require('node:path');

const rootRequire = createRequire(join(process.cwd(), 'package.json'));
const jestRuntimeRequire = createRequire(rootRequire.resolve('jest-runtime/package.json'));
const glob = jestRuntimeRequire('glob');

test('Jest glob 7 matches magic patterns through minimatch 11', () => {
  expect(glob.sync('package.json')).toContain('package.json');
  expect(glob.sync('*.cjs')).toContain('jest.config.cjs');
});
