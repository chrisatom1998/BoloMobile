/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require('child_process');
const { readFileSync } = require('fs');
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

function evaluate(audit: Record<string, unknown>, acceptance = signedAcceptance(), now = '2026-08-08T12:00:00.000Z') {
  return runPureExport<AuditGateResult>('evaluateAuditExceptions', { audit, acceptance, now });
}

function signedAcceptance(overrides: Partial<AcceptanceRecord['exceptions'][number]> = {}): AcceptanceRecord {
  return {
    version: 1,
    exceptions: [firstGhsa, secondGhsa].map((ghsa) => ({
      ghsa,
      module: 'image-size',
      expires: '2026-11-06',
      owner: 'Release Security Owner',
      acceptedOn: '2026-08-08',
      ...overrides,
    })),
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

function knownAudit(): Record<string, unknown> {
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
  it('accepts only the two signed, unexpired image-size advisories', () => {
    const result = evaluate(knownAudit());

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.accepted).toEqual([
      expect.objectContaining({ ghsa: firstGhsa, module: 'image-size', owner: 'Release Security Owner' }),
      expect.objectContaining({ ghsa: secondGhsa, module: 'image-size', owner: 'Release Security Owner' }),
    ]);
  });

  it('keeps release blocked while security-owner sign-off is pending', () => {
    const pending = signedAcceptance({ owner: 'PENDING', acceptedOn: 'PENDING' });
    const result = evaluate(knownAudit(), pending);

    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain(firstGhsa);
    expect(result.failures.join(' ')).toContain(secondGhsa);
    expect(result.failures.join(' ')).toContain('pending security-owner sign-off');
  });

  it('rejects an expired exception', () => {
    const result = evaluate(knownAudit(), signedAcceptance(), '2026-11-07T00:00:00.000Z');

    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('expired on 2026-11-06');
  });

  it('rejects acceptance recorded after the exception expiry', () => {
    const result = evaluate(
      knownAudit(),
      signedAcceptance({ acceptedOn: '2026-11-07' }),
      '2026-11-08T00:00:00.000Z',
    );

    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('accepted after its expiry');
  });

  it('rejects a future-dated acceptance even when it is before expiry', () => {
    const result = evaluate(
      knownAudit(),
      signedAcceptance({ acceptedOn: '2026-08-09' }),
      '2026-08-08T12:00:00.000Z',
    );

    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain('cannot be accepted in the future');
  });

  it('ignores a non-blocking package in a mixed via chain without treating it as approval', () => {
    const audit = knownAudit() as {
      vulnerabilities: Record<string, { name?: string; severity: string; via: unknown[] }>;
      metadata: { vulnerabilities: { moderate: number; total: number } };
    };
    audit.vulnerabilities.metro!.via.push('non-blocking-helper');
    audit.vulnerabilities['non-blocking-helper'] = {
      name: 'non-blocking-helper',
      severity: 'moderate',
      via: [],
    };
    audit.metadata.vulnerabilities.moderate += 1;
    audit.metadata.vulnerabilities.total += 1;

    expect(evaluate(audit).ok).toBe(true);
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

  it.each(['image-size', 'new-build-package'])('rejects a new high advisory on %s', (moduleName) => {
    const audit = knownAudit() as {
      vulnerabilities: Record<string, { name?: string; severity: string; via: unknown[] }>;
      metadata: { vulnerabilities: { high: number; total: number } };
    };
    const unknownGhsa = 'GHSA-aaaa-bbbb-cccc';
    if (moduleName === 'image-size') {
      audit.vulnerabilities['image-size']!.via.push(advisory(unknownGhsa, 'New image-size issue'));
    } else {
      audit.vulnerabilities[moduleName] = {
        name: moduleName,
        severity: 'high',
        via: [{ ...advisory(unknownGhsa, 'New dependency issue'), name: moduleName, dependency: moduleName }],
      };
      audit.metadata.vulnerabilities.high += 1;
      audit.metadata.vulnerabilities.total += 1;
    }

    const result = evaluate(audit);

    expect(result.ok).toBe(false);
    expect(result.failures.join(' ')).toContain(unknownGhsa);
  });

  it('parses exactly one fenced acceptance record', () => {
    const acceptance = signedAcceptance();
    const document = `Security review\n<!-- acceptance-record:begin -->\n\`\`\`json\n${JSON.stringify(acceptance)}\n\`\`\`\n<!-- acceptance-record:end -->`;

    expect(runPureExport<AcceptanceRecord>('parseAcceptanceDocument', document)).toEqual(acceptance);
  });

  it('records the named security owner acceptance for each approved exception', () => {
    const document = readFileSync(resolve(process.cwd(), 'docs/security-exceptions.md'), 'utf8');
    const acceptance = runPureExport<AcceptanceRecord>('parseAcceptanceDocument', document);

    expect(acceptance.exceptions).toHaveLength(2);
    for (const exception of acceptance.exceptions) {
      expect(exception.owner).toBe('@chrisatom1998');
      expect(exception.acceptedOn).toBe('2026-08-20');
    }
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
