const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: 'utf8') => string;
};
const { resolve } = require('path') as {
  resolve: (...paths: string[]) => string;
};
const { spawnSync } = require('child_process') as {
  spawnSync: (
    command: string,
    args: string[],
    options: { cwd: string; encoding: 'utf8' },
  ) => { status: number | null; stderr: string; stdout: string };
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

  test('requires HTTPS for the EAS artifact URL and every redirect', () => {
    const downloadStep = matchingBlock(
      privilegedJob,
      '      - id: eas_build',
      '      - id: inspect',
    );

    expect(downloadStep).toContain("--proto '=https'");
    expect(downloadStep).toContain("--proto-redir '=https'");
  });
});

describe('dependency advisory fallback gate', () => {
  const acceptedAdvisory = {
    schemaVersion: 2,
    reviewBy: '2099-03-31',
    allowedAdvisories: [
      {
        package: 'image-size',
        advisory: 'GHSA-w3rx-r6r6-pgpr',
        severity: 'high',
        usage: 'build-only',
        rationale: 'Reviewed Metro build-only path.',
        pathFingerprint: {
          isDirect: false,
          nodes: ['node_modules/image-size'],
          effects: ['metro'],
        },
      },
    ],
  };
  const acceptedReport = {
    metadata: { vulnerabilities: { high: 1, critical: 0 } },
    vulnerabilities: {
      'image-size': {
        severity: 'high',
        isDirect: false,
        nodes: ['node_modules/image-size'],
        effects: ['metro'],
        via: [
          {
            severity: 'high',
            url: 'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
          },
        ],
      },
    },
  };

  function evaluate(
    productionReport: object,
    fullReport = productionReport,
    today = '2099-01-01',
    rootManifest: object = { dependencies: {} },
    runtimeSources: Array<{ path: string; content: string }> = [],
    baseline: object = acceptedAdvisory,
  ) {
    const invocation = [
      "import { evaluateAuditReports } from './scripts/audit-runtime-dependencies.mjs';",
      `const result = evaluateAuditReports(${JSON.stringify({
        baseline,
        fullReport,
        productionReport,
        rootManifest,
        runtimeSources,
        today,
      })});`,
      'process.stdout.write(JSON.stringify(result));',
    ].join('\n');
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', invocation], {
      cwd: root,
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(result.stderr);
    return JSON.parse(result.stdout) as { errors: string[] };
  }

  test('audits the complete dependency tree when Dependency Review is unavailable', () => {
    const auditScript = read('scripts/audit-runtime-dependencies.mjs');
    const ciWorkflow = read('.github/workflows/ci.yml');

    expect(auditScript).toContain("['audit', '--omit=dev', '--json']");
    expect(auditScript).toContain("['audit', '--json']");
    expect(ciWorkflow).toContain('Audit production and full dependency trees against the accepted baseline');
    expect(ciWorkflow).toContain('fail-on-severity: high');
    expect(auditScript).toContain("'.mjs', '.cjs'");
    expect(auditScript).toContain("'.mts', '.cts'");
  });

  test('accepts only the reviewed production path for a baselined advisory', () => {
    expect(evaluate(acceptedReport).errors).toEqual([]);
  });

  test('rejects a new production path carrying an already-baselined advisory', () => {
    const changedPathReport = JSON.parse(JSON.stringify(acceptedReport)) as typeof acceptedReport;
    changedPathReport.vulnerabilities['image-size'].effects.push('runtime-image-renderer');
    changedPathReport.vulnerabilities['image-size'].nodes.push('node_modules/runtime-image-renderer/node_modules/image-size');

    expect(evaluate(changedPathReport).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/path fingerprint/u)]),
    );
  });

  test('rejects a direct dependency carrying an already-baselined advisory', () => {
    const directReport = JSON.parse(JSON.stringify(acceptedReport)) as typeof acceptedReport;
    directReport.vulnerabilities['image-size'].isDirect = true;

    expect(evaluate(directReport).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/path fingerprint/u)]),
    );
  });

  test('rejects a new high advisory introduced only in the full dependency tree', () => {
    const changedFullReport = JSON.parse(JSON.stringify(acceptedReport)) as typeof acceptedReport & {
      vulnerabilities: Record<string, typeof acceptedReport.vulnerabilities['image-size']>;
    };
    changedFullReport.metadata.vulnerabilities.high = 2;
    changedFullReport.vulnerabilities['new-build-package'] = {
      severity: 'high',
      isDirect: false,
      nodes: ['node_modules/new-build-package'],
      effects: ['metro'],
      via: [
        {
          severity: 'high',
          url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
        },
      ],
    };

    expect(evaluate(acceptedReport, changedFullReport).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/unapproved high advisory GHSA-AAAA-BBBB-CCCC/u)]),
    );
  });

  test('rejects an expired advisory baseline', () => {
    expect(evaluate(acceptedReport, acceptedReport, '2100-01-01').errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/baseline expired/u)]),
    );
  });

  test('rejects a baseline review date more than 90 days away', () => {
    const longLivedBaseline = {
      ...acceptedAdvisory,
      reviewBy: '2099-04-02',
    };

    expect(evaluate(
      acceptedReport,
      acceptedReport,
      '2099-01-01',
      { dependencies: {} },
      [],
      longLivedBaseline,
    ).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/no more than 90 days/u)]),
    );
  });

  test('rejects a blocking dependency chain that does not resolve to a GHSA', () => {
    const changedFullReport = JSON.parse(JSON.stringify(acceptedReport)) as typeof acceptedReport & {
      vulnerabilities: Record<string, {
        severity?: string;
        isDirect: boolean;
        nodes: string[];
        effects: string[];
        via: Array<string | { severity: string; url: string }>;
      }>;
    };
    changedFullReport.metadata.vulnerabilities.high = 2;
    changedFullReport.vulnerabilities['mystery-package'] = {
      severity: 'high',
      isDirect: false,
      nodes: ['node_modules/mystery-package'],
      effects: [],
      via: ['missing-transitive-package'],
    };

    expect(evaluate(acceptedReport, changedFullReport).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/does not resolve to a recognized GHSA/u)]),
    );
  });

  test('rejects an unclassified audit record instead of hiding it behind a known GHSA', () => {
    const changedFullReport = JSON.parse(JSON.stringify(acceptedReport)) as typeof acceptedReport & {
      vulnerabilities: Record<string, {
        severity?: string;
        isDirect: boolean;
        nodes: string[];
        effects: string[];
        via: Array<string | { severity: string; url: string }>;
      }>;
    };
    changedFullReport.metadata.vulnerabilities.high = 2;
    changedFullReport.vulnerabilities['unclassified-package'] = {
      isDirect: false,
      nodes: ['node_modules/unclassified-package'],
      effects: [],
      via: ['missing-transitive-package'],
    };

    expect(evaluate(acceptedReport, changedFullReport).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/has no recognized vulnerability severity/u)]),
    );
  });

  test('rejects a stale baseline entry after an advisory disappears', () => {
    const cleanReport = {
      metadata: { vulnerabilities: { high: 0, critical: 0 } },
      vulnerabilities: {},
    };

    expect(evaluate(cleanReport, cleanReport).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/no longer reported/u)]),
    );
  });

  test('rejects direct runtime declaration or source use of a build-only baseline package', () => {
    const rootManifest = { dependencies: { 'image-size': '^2.0.0' } };
    const runtimeSources = [{
      path: 'src/app/example.mjs',
      content: "import imageSize from 'image-size';",
    }];
    const errors = evaluate(
      acceptedReport,
      acceptedReport,
      '2099-01-01',
      rootManifest,
      runtimeSources,
    ).errors;

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/listed in root dependencies/u),
      expect.stringMatching(/src\/app\/example\.mjs imports build-only/u),
    ]));
  });

  test('rejects an optional runtime declaration of a build-only baseline package', () => {
    const rootManifest = {
      dependencies: {},
      optionalDependencies: { 'image-size': '^2.0.0' },
    };

    expect(evaluate(
      acceptedReport,
      acceptedReport,
      '2099-01-01',
      rootManifest,
    ).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/listed in root optionalDependencies/u)]),
    );
  });
});
