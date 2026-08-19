/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require('child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join, resolve } = require('path');
const { pathToFileURL } = require('url');

type NodeVersionResult = {
  ok: boolean;
  requiredVersion: string | null;
  actualVersion: string;
  message: string;
};

const scriptUrl = pathToFileURL(resolve(process.cwd(), 'scripts/assert-node-version.mjs')).href;

function inspectNodeVersion(input: { nvmrcPath: string; actualVersion: string }): NodeVersionResult {
  const program = `
    import * as nodeVersion from ${JSON.stringify(scriptUrl)};
    const input = JSON.parse(process.env.BOLO_NODE_VERSION_TEST_INPUT);
    process.stdout.write(JSON.stringify(nodeVersion.inspectNodeVersion(input)));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', program], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BOLO_NODE_VERSION_TEST_INPUT: JSON.stringify(input),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return JSON.parse(output) as NodeVersionResult;
}

describe('exact Node.js release toolchain gate', () => {
  let sandboxRoot: string;

  beforeEach(() => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'bolo-node-version-'));
  });

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  it('accepts an exact match with the version pinned in .nvmrc', () => {
    const nvmrcPath = join(sandboxRoot, '.nvmrc');
    writeFileSync(nvmrcPath, '22.23.2\n');

    expect(inspectNodeVersion({ nvmrcPath, actualVersion: '22.23.2' })).toEqual({
      ok: true,
      requiredVersion: '22.23.2',
      actualVersion: '22.23.2',
      message: 'Node.js toolchain check passed: 22.23.2 matches the exact .nvmrc pin.',
    });
  });

  it('rejects a different installed Node.js version with recovery instructions', () => {
    const nvmrcPath = join(sandboxRoot, '.nvmrc');
    writeFileSync(nvmrcPath, '22.23.2\n');

    const result = inspectNodeVersion({ nvmrcPath, actualVersion: '24.18.0' });

    expect(result.ok).toBe(false);
    expect(result.requiredVersion).toBe('22.23.2');
    expect(result.message).toContain('requires Node.js 22.23.2');
    expect(result.message).toContain('this process is using 24.18.0');
    expect(result.message).toContain('nvm install 22.23.2 && nvm use 22.23.2');
  });

  it.each(['22', 'v22.23.2', '>=22'])('rejects malformed .nvmrc content %p', (contents) => {
    const nvmrcPath = join(sandboxRoot, '.nvmrc');
    writeFileSync(nvmrcPath, `${contents}\n`);

    const result = inspectNodeVersion({ nvmrcPath, actualVersion: '22.23.2' });

    expect(result.ok).toBe(false);
    expect(result.requiredVersion).toBeNull();
    expect(result.message).toContain('must contain one exact Node.js version in x.y.z form');
  });

  it('fails closed when .nvmrc is missing', () => {
    const nvmrcPath = join(sandboxRoot, '.nvmrc');

    const result = inspectNodeVersion({ nvmrcPath, actualVersion: '22.23.2' });

    expect(result).toMatchObject({
      ok: false,
      requiredVersion: null,
      actualVersion: '22.23.2',
    });
    expect(result.message).toContain('required Node.js version file is missing');
    expect(result.message).toContain('Restore .nvmrc');
  });
});

describe('production release command wiring', () => {
  const packageJson = require('../package.json') as { scripts: Record<string, string> };

  it('requires the exact Node pin and a fresh verification in every iOS production preflight', () => {
    expect(packageJson.scripts['toolchain:check']).toBe(
      'node ./scripts/assert-node-version.mjs',
    );
    expect(packageJson.scripts['release:preflight:ios']).toBe(
      'npm run toolchain:check && npm run release:provenance && npm run verify && npm run audit:gate && npm run release:validate:ios && npm run store:validate:ios',
    );
    expect(packageJson.scripts['release:preflight:ios:binary']).toBe(
      'npm run toolchain:check && npm run release:provenance && npm run verify && npm run audit:gate && npm run release:validate:ios:binary && npm run store:validate:ios',
    );
  });

  it('keeps production iOS build and submit behind the binary preflight', () => {
    expect(packageJson.scripts['build:ios:production']).toBe(
      'npm run release:preflight:ios:binary && node ./scripts/run-eas-from-app-root.mjs build --platform ios --profile production',
    );
    expect(packageJson.scripts['submit:ios:production']).toBe(
      'npm run release:preflight:ios:binary && node ./scripts/run-eas-from-app-root.mjs submit --platform ios --latest --profile production',
    );
  });

  it('leaves preview builds outside production release gates', () => {
    expect(packageJson.scripts['build:android:preview']).toBe(
      'node ./scripts/run-eas-from-app-root.mjs build --platform android --profile preview',
    );
    expect(packageJson.scripts['build:ios:preview']).toBe(
      'node ./scripts/run-eas-from-app-root.mjs build --platform ios --profile preview',
    );
  });
});
