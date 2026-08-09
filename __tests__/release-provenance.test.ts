/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require('child_process');
const { readFileSync } = require('fs');
const { resolve } = require('path');
const { pathToFileURL } = require('url');

type ProvenanceResult = {
  ok: boolean;
  message: string;
};

type ProvenanceInput = {
  statusOutput: string;
  upstream: string;
  divergenceOutput: string;
  branch: string;
  headSha: string;
};

const scriptUrl = pathToFileURL(resolve(process.cwd(), 'scripts/assert-release-provenance.mjs')).href;

function runPureExport<T>(exportName: string, input: unknown): T {
  const program = `
    import * as provenance from ${JSON.stringify(scriptUrl)};
    const input = JSON.parse(process.env.BOLO_PROVENANCE_TEST_INPUT);
    process.stdout.write(JSON.stringify(provenance[process.env.BOLO_PROVENANCE_TEST_EXPORT](input)));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', program], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BOLO_PROVENANCE_TEST_EXPORT: exportName,
      BOLO_PROVENANCE_TEST_INPUT: JSON.stringify(input),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return JSON.parse(output) as T;
}

function evaluateReleaseProvenance(input: ProvenanceInput): ProvenanceResult {
  return runPureExport<ProvenanceResult>('evaluateReleaseProvenance', input);
}

function findIgnoredUploadPaths(input: {
  gitIgnoredOutput: string;
  easIgnoredOutput: string;
}): string[] {
  return runPureExport<string[]>('findIgnoredUploadPaths', input);
}

function state(overrides: Partial<ProvenanceInput> = {}): ProvenanceInput {
  return {
    statusOutput: '',
    upstream: 'origin/main',
    divergenceOutput: '0\t0',
    branch: 'main',
    headSha: '0123456789abcdef0123456789abcdef01234567',
    ...overrides,
  };
}

describe('release source provenance', () => {
  it('accepts a clean checkout that matches its locally fetched upstream', () => {
    const result = evaluateReleaseProvenance(state());

    expect(result).toEqual({
      ok: true,
      message: 'Release source provenance accepted: main at 0123456789abcdef0123456789abcdef01234567 matches the locally fetched origin/main ref.',
    });
  });

  it('rejects modified and untracked paths', () => {
    const result = evaluateReleaseProvenance(state({
      statusOutput: ' M src/app/index.tsx\n?? local-note.txt',
    }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('2 uncommitted paths');
  });

  it('rejects commits that have not been pushed', () => {
    const result = evaluateReleaseProvenance(state({ divergenceOutput: '0\t2' }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('2 unpushed commits');
  });

  it('rejects a checkout that is behind its upstream', () => {
    const result = evaluateReleaseProvenance(state({ divergenceOutput: '3\t0' }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('3 commits behind origin/main');
  });

  it('reports both sides when the branch has diverged', () => {
    const result = evaluateReleaseProvenance(state({ divergenceOutput: '3\t2' }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('3 commits behind origin/main');
    expect(result.message).toContain('2 unpushed commits');
  });

  it('rejects a branch without an upstream', () => {
    const result = evaluateReleaseProvenance(state({ upstream: '' }));

    expect(result).toEqual({
      ok: false,
      message: 'The current Git branch has no upstream. Configure a tracked remote branch before a production release.',
    });
  });

  it('rejects a gitignored path that the EAS upload would include', () => {
    const paths = findIgnoredUploadPaths({
      gitIgnoredOutput: 'coverage/index.html\0node_modules/example/index.js\0',
      easIgnoredOutput: 'node_modules/example/index.js\0',
    });

    expect(paths).toEqual(['coverage/index.html']);
  });

  it('accepts gitignored paths that are also excluded from EAS', () => {
    const paths = findIgnoredUploadPaths({
      gitIgnoredOutput: 'coverage/index.html\0expo-env.d.ts\0',
      easIgnoredOutput: 'coverage/index.html\0expo-env.d.ts\0',
    });

    expect(paths).toEqual([]);
  });

  it('accepts empty ignored-path sets', () => {
    expect(findIgnoredUploadPaths({ gitIgnoredOutput: '', easIgnoredOutput: '' })).toEqual([]);
  });

  it('keeps known generated output out of every EAS upload', () => {
    const easIgnoreLines = readFileSync(resolve(process.cwd(), '.easignore'), 'utf8')
      .split(/\r?\n/u);

    expect(easIgnoreLines).toEqual(expect.arrayContaining([
      'coverage/',
      'builds/',
      'expo-env.d.ts',
    ]));
  });

  it('is wired before the existing static and live release validators', () => {
    const packageJson = require('../package.json') as { scripts: Record<string, string> };

    expect(packageJson.scripts['release:provenance']).toBe(
      'node ./scripts/assert-release-provenance.mjs',
    );
    expect(packageJson.scripts['release:preflight']).toBe(
      'npm run release:provenance && npm run audit:gate && npm run release:validate && npm run release:validate:live',
    );
  });

  it('keeps the EAS wrapper on the exact CLI version required by eas.json', () => {
    const easJson = require('../eas.json') as { cli: { version: string } };
    const wrapper = readFileSync(resolve(process.cwd(), 'scripts/run-eas-from-app-root.mjs'), 'utf8');

    expect(easJson.cli.version).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(wrapper).toContain(`const easCli = 'eas-cli@${easJson.cli.version}'`);
  });
});
