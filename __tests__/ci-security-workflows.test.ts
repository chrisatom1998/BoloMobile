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

function matchingBlock(source: string, start: string, end?: string) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing block start: ${start}`);
  if (!end) return source.slice(startIndex);
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

  test('pins Expo Doctor in the lockfile and never resolves a moving version in CI', () => {
    const manifest = JSON.parse(read('package.json')) as {
      devDependencies: Record<string, string>;
    };
    const lockfile = JSON.parse(read('package-lock.json')) as {
      packages: Record<string, { devDependencies?: Record<string, string> }>;
    };
    const ciWorkflow = read('.github/workflows/ci.yml');
    const releaseWorkflow = read('.github/workflows/release-ios.yml');

    expect(manifest.devDependencies['expo-doctor']).toBe('1.20.2');
    expect(lockfile.packages['']?.devDependencies?.['expo-doctor']).toBe('1.20.2');
    expect(ciWorkflow).toContain('npx --no-install expo-doctor');
    expect(releaseWorkflow).toContain('npx --no-install expo-doctor');
    expect(ciWorkflow).not.toContain('expo-doctor@latest');
  });

  test('fails CI when Expo SDK dependency versions drift', () => {
    const ciWorkflow = read('.github/workflows/ci.yml');
    const expoDoctorJob = matchingBlock(ciWorkflow, '  expo-doctor:', '  ios-prebuild:');

    expect(expoDoctorJob).toContain('CI=1 npx expo install --check');
  });
});

describe('fail-closed merge verification', () => {
  const ciWorkflow = read('.github/workflows/ci.yml');
  const requiredChecks = matchingBlock(ciWorkflow, '  required-checks:');

  test('runs website compatibility checks for the changed website dependency tree', () => {
    const websiteJob = matchingBlock(ciWorkflow, '  website:', '  expo-doctor:');

    expect(websiteJob).toContain('cache-dependency-path: website/package-lock.json');
    expect(websiteJob).toContain('npm ci --prefix website');
    expect(websiteJob).toContain('npm run lint --prefix website');
    expect(websiteJob).toContain('npm test --prefix website');
  });

  test('restores static validation of every committed Maestro flow', () => {
    const manifest = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(manifest.scripts.verify).toContain('npm run e2e:validate');
  });

  test('uses deliberate scrolling for every long iOS smoke section', () => {
    const smoke = read('.maestro/flows/00-ci-smoke.yaml');
    const scrolls = [...smoke.matchAll(/^- scrollUntilVisible:\n((?: {4,}[^\n]+\n?)*)/gmu)]
      .map((match) => match[1]);

    expect(scrolls).toHaveLength(5);
    for (const scroll of scrolls) {
      expect(scroll).toContain('direction: DOWN');
      expect(scroll).toContain('speed: 60');
      expect(scroll).toContain('visibilityPercentage: 80');
      expect(scroll).toContain('centerElement: true');
      expect(scroll).toContain('timeout: 45000');
    }
  });

  test('always aggregates every merge job and rejects non-success results', () => {
    const jobs = [
      'dependency-audit',
      'verify',
      'website',
      'expo-doctor',
      'ios-prebuild',
      'production-config',
      'ios-native-build',
      'maestro-smoke',
      'security',
    ];

    expect(requiredChecks).toContain('if: always()');
    for (const job of jobs) {
      expect(requiredChecks).toContain(job);
      expect(requiredChecks).toContain(`needs['${job}'].result`);
    }
    expect(requiredChecks).toContain('if [[ "$result" != "success" ]]');
  });
});

describe('nightly and release approval gates', () => {
  test('uses a schema-valid manual EAS trigger and a pinned Maestro version', () => {
    const nightly = read('.eas/workflows/nightly-maestro.yml');

    expect(nightly).toContain('workflow_dispatch: {}');
    expect(nightly).toContain('maestro_version: 2.8.0');
  });

  test('records physical-device approval only through a post-TestFlight manual dispatch', () => {
    const releaseWorkflow = read('.github/workflows/release-ios.yml');
    const signoffWorkflow = read('.github/workflows/record-ios-physical-signoff.yml');

    expect(releaseWorkflow).not.toContain('physical_iphone_signoff:');
    expect(releaseWorkflow).toContain('Record iOS physical signoff');
    expect(signoffWorkflow).toContain('workflow_dispatch:');
    expect(signoffWorkflow).toContain('checks_completed:');
    expect(signoffWorkflow).toContain('test "$CHECKS_COMPLETED" = "true"');
    expect(signoffWorkflow).toContain('$GITHUB_ACTOR');
  });
});

describe('release secret scoping', () => {
  const releaseWorkflow = read('.github/workflows/release-ios.yml');
  const privilegedJob = matchingBlock(releaseWorkflow, '  build_inspect_submit:');
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
