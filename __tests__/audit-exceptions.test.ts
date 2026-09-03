/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require('child_process');
const { resolve } = require('path');
const { pathToFileURL } = require('url');

type AuditGateResult = {
  ok: boolean;
  failures: string[];
  accepted: { ghsa: string; module: string; owner: string; expires: string }[];
};

type AcceptanceRecord = {
  version: number;
  exceptions: {
    ghsa: string;
    module: string;
    expires: string;
    owner: string;
    acceptedOn: string;
  }[];
};

const firstGhsa = 'GHSA-w3rx-r6r6-pgpr';
const secondGhsa = 'GHSA-5p2g-fcmc-qvqq';
const scriptUrl = pathToFileURL(resolve(process.cwd(), 'scripts/assert-audit-exceptions.mjs')).href;

function runPureExport<T>(exportName: string, input: unknown): T {
  const program = `
    import * as auditGate from ${JSON.stringify(scriptUrl)};
    const input = JSON.parse(process.env.BOLO_AUDIT_TEST_INPUT);
    process.stdout.write(JSON.stringify(auditGate[process.env.BOLO_AUDIT_TEST_EXPORT](input)));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', program], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BOLO_AUDIT_TEST_EXPORT: exportName,
      BOLO_AUDIT_TEST_INPUT: JSON.stringify(input),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return JSON.parse(output) as T;
}

function evaluate(audit: Record<string, unknown>, acceptance = emptyAcceptance(), now = '2026-08-08T12:00:00.000Z') {
  return runPureExport<AuditGateResult>('evaluateAuditExceptions', { audit, acceptance, now });
}

function emptyAcceptance(): AcceptanceRecord {
  return {
    version: 1,
    exceptions: [],
  };
}

function advisory(ghsa: string, title: string) {
  return {
    source: ghsa,
    name: 'image-size',
    dependency: 'image-size',
    title,
    url: `https://github.com/advisories/${ghsa}`,
    severity: 'high',
    range: '<=2.0.2',
  };
}

function cleanAudit(): Record<string, unknown> {
  return {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } },
  };
}

function retiredImageSizeAudit(): Record<string, unknown> {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      'image-size': {
        name: 'image-size',
        severity: 'high',
        via: [
          advisory(firstGhsa, 'ICNS parser denial of service'),
          advisory(secondGhsa, 'JXL and HEIF parser denial of service'),
        ],
      },
      metro: { name: 'metro', severity: 'high', via: ['image-size'] },
      expo: { name: 'expo', severity: 'high', via: ['metro'] },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 3, critical: 0, total: 3 } },
  };
}

describe('dependency audit exceptions', () => {
  it('accepts a clean audit when no security exceptions are active', () => {
    const result = evaluate(cleanAudit(), emptyAcceptance());

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.accepted).toEqual([]);
  });

  it('rejects the two retired image-size advisories if they reappear', () => {
    const result = evaluate(retiredImageSizeAudit(), emptyAcceptance());

    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain(firstGhsa);
    expect(result.failures.join(' ')).toContain(secondGhsa);
    expect(result.failures.join(' ')).toContain('Unapproved high advisory');
  });

  it('allows a non-blocking advisory without treating it as an exception', () => {
    const audit = {
      auditReportVersion: 2,
      vulnerabilities: {
        'non-blocking-helper': {
          name: 'non-blocking-helper',
          severity: 'moderate',
          via: [],
        },
      },
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 },
      },
    };

    expect(evaluate(audit, emptyAcceptance()).ok).toBe(true);
  });

  it('fails closed on a pure high-severity via cycle', () => {
    const audit = {
      auditReportVersion: 2,
      vulnerabilities: {
        alpha: { name: 'alpha', severity: 'high', via: ['beta'] },
        beta: { name: 'beta', severity: 'high', via: ['alpha'] },
      },
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 } },
    };

    const result = evaluate(audit);

    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('does not resolve to an identified advisory');
  });

  it.each([
    ['missing version 2 payload', {}],
    ['missing vulnerabilities', { auditReportVersion: 2, metadata: { vulnerabilities: { high: 1, critical: 0 } } }],
    ['non-array via chain', {
      auditReportVersion: 2,
      vulnerabilities: { broken: { severity: 'high', via: 'image-size' } },
      metadata: { vulnerabilities: { high: 1, critical: 0 } },
    }],
    ['advisory without a GHSA URL', {
      auditReportVersion: 2,
      vulnerabilities: { broken: { severity: 'high', via: [{ severity: 'high', url: 'https://example.test/advisory' }] } },
      metadata: { vulnerabilities: { high: 1, critical: 0 } },
    }],
    ['high count without a resolvable advisory', {
      auditReportVersion: 2,
      vulnerabilities: { broken: { severity: 'high', via: [] } },
      metadata: { vulnerabilities: { high: 1, critical: 0 } },
    }],
  ])('fails closed for %s', (_label, audit) => {
    const result = evaluate(audit as Record<string, unknown>);

    expect(result.ok).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it('rejects any other unknown high advisory', () => {
    const moduleName = 'new-build-package';
    const unknownGhsa = 'GHSA-aaaa-bbbb-cccc';
    const audit = {
      auditReportVersion: 2,
      vulnerabilities: {
        [moduleName]: {
          name: moduleName,
          severity: 'high',
          via: [{ ...advisory(unknownGhsa, 'New dependency issue'), name: moduleName, dependency: moduleName }],
        },
      },
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 } },
    };

    const result = evaluate(audit, emptyAcceptance());

    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain(unknownGhsa);
  });

  it('parses exactly one fenced acceptance record', () => {
    const acceptance = emptyAcceptance();
    const document = `Security review\n<!-- acceptance-record:begin -->\n\`\`\`json\n${JSON.stringify(acceptance)}\n\`\`\`\n<!-- acceptance-record:end -->`;

    expect(runPureExport<AcceptanceRecord>('parseAcceptanceDocument', document)).toEqual(acceptance);
  });

  it('rejects duplicate acceptance markers', () => {
    const document = '<!-- acceptance-record:begin --><!-- acceptance-record:begin --><!-- acceptance-record:end -->';

    expect(() => runPureExport('parseAcceptanceDocument', document)).toThrow();
  });

  it('reports an audit-service JSON error without echoing its payload', () => {
    const payload = JSON.stringify({ error: { code: 'EAUDITENDPOINT', secret: 'do-not-print' } });

    expect(() => runPureExport('parseAuditOutput', payload)).toThrow(/audit-service error/u);
    try {
      runPureExport('parseAuditOutput', payload);
    } catch (error) {
      expect(String(error)).not.toContain('do-not-print');
    }
  });
});
