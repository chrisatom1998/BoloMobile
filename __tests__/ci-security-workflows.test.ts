const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: 'utf8') => string;
};
const { resolve } = require('path') as {
  resolve: (...paths: string[]) => string;
};

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), 'utf8');
}

function matchingBlock(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing block start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`Missing block end: ${end}`);
  return source.slice(startIndex, endIndex);
}

describe('CI supply-chain controls', () => {
  const workflowPaths = [
    '.github/workflows/ci.yml',
    '.github/workflows/release-ios.yml',
    '.github/workflows/codeql.yml',
  ];

  test.each(workflowPaths)('%s pins every GitHub Action to an immutable commit', (path) => {
    const workflow = read(path);
    const uses = [...workflow.matchAll(/^\s+(?:-\s+)?uses:\s+([^\s#]+)(?:\s+#\s+(.+))?$/gmu)];

    expect(uses.length).toBeGreaterThan(0);
    for (const match of uses) {
      const reference = match[1];
      const annotation = match[2];
      expect(reference).toMatch(/^[^@\s]+@[0-9a-f]{40}$/u);
      expect(annotation).toMatch(/^v\d/u);
    }
  });

  test('verifies the published Maestro 2.8.0 SHA-256 before extraction', () => {
    const workflow = read('.github/workflows/ci.yml');

    expect(workflow).toContain('MAESTRO_SHA256: b3e561161904fb391875ca5834d5b22cf0b01c052dd1b408ad83e30d8f8951b3');
    expect(workflow).toContain("--proto '=https'");
    expect(workflow).toContain("--proto-redir '=https'");
    expect(workflow).toMatch(/shasum -a 256 --check/u);
    expect(workflow.indexOf('shasum -a 256 --check')).toBeLessThan(workflow.indexOf('unzip -q'));
  });
});

describe('release secret scoping', () => {
  const releaseWorkflow = read('.github/workflows/release-ios.yml');
  const privilegedJob = matchingBlock(releaseWorkflow, '  build_inspect_submit:', '  physical_iphone_signoff:');
  const jobHeader = matchingBlock(privilegedJob, '  build_inspect_submit:', '    steps:');

  test('does not expose release secrets through the job environment', () => {
    expect(jobHeader).not.toContain('secrets.');
  });

  test('exposes Expo authentication only to the three EAS commands that need it', () => {
    expect(privilegedJob.match(/EXPO_TOKEN:\s+\$\{\{ secrets\.EXPO_TOKEN \}\}/gu)).toHaveLength(3);
  });

  test('exposes release metadata only to validation, build, and submission', () => {
    const metadataSecrets = [
      'BOLO_PUBLISHER_NAME',
      'BOLO_SUPPORT_EMAIL',
      'BOLO_REVIEW_FIRST_NAME',
      'BOLO_REVIEW_LAST_NAME',
      'BOLO_REVIEW_EMAIL',
      'BOLO_REVIEW_PHONE',
    ];

    for (const secret of metadataSecrets) {
      const pattern = new RegExp(`${secret}:\\s+\\$\\{\\{ secrets\\.${secret} \\}\\}`, 'gu');
      expect(privilegedJob.match(pattern)).toHaveLength(3);
    }
  });
});

describe('dependency advisory fallback gate', () => {
  test('audits the complete dependency tree when Dependency Review is unavailable', () => {
    const auditScript = read('scripts/audit-runtime-dependencies.mjs');
    const ciWorkflow = read('.github/workflows/ci.yml');

    expect(auditScript).toContain("['audit', '--json']");
    expect(auditScript).not.toContain("'--omit=dev'");
    expect(ciWorkflow).toContain('Audit the full dependency tree against the accepted baseline');
    expect(ciWorkflow).toContain('fail-on-severity: high');
  });
});
