#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const acceptancePath = resolve(appRoot, 'docs/security-exceptions.md');
const acceptanceBegin = '<!-- acceptance-record:begin -->';
const acceptanceEnd = '<!-- acceptance-record:end -->';
const blockingSeverities = new Set(['high', 'critical']);
const approvedExceptions = new Map([
  ['GHSA-w3rx-r6r6-pgpr', { module: 'image-size', expires: '2026-11-06' }],
  ['GHSA-5p2g-fcmc-qvqq', { module: 'image-size', expires: '2026-11-06' }],
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return parsed;
}

function ghsaFromUrl(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/\/(GHSA-[a-z0-9-]+)(?:[/?#]|$)/iu);
  return match?.[1] ?? null;
}

function addFailure(failures, message) {
  if (!failures.includes(message)) failures.push(message);
}

function evaluateAcceptance(acceptance, now, failures) {
  const valid = new Map();
  const current = new Date(now);
  const today = Number.isNaN(current.getTime())
    ? null
    : isoDate(current.toISOString().slice(0, 10));
  if (!today) {
    addFailure(failures, 'The dependency audit gate received an invalid current date.');
  }

  if (!isObject(acceptance) || acceptance.version !== 1 || !Array.isArray(acceptance.exceptions)) {
    addFailure(failures, 'The security exception acceptance record must use version 1 with an exceptions array.');
    return valid;
  }

  if (acceptance.exceptions.length !== approvedExceptions.size) {
    addFailure(failures, `The security exception record must contain exactly ${approvedExceptions.size} approved entries.`);
  }

  const entriesByGhsa = new Map();
  for (const entry of acceptance.exceptions) {
    if (!isObject(entry) || typeof entry.ghsa !== 'string') {
      addFailure(failures, 'Every security exception entry must name its GHSA.');
      continue;
    }
    const entries = entriesByGhsa.get(entry.ghsa) ?? [];
    entries.push(entry);
    entriesByGhsa.set(entry.ghsa, entries);
    if (!approvedExceptions.has(entry.ghsa)) {
      addFailure(failures, `Security exception ${entry.ghsa} is not approved by the audit gate.`);
    }
  }

  for (const [ghsa, expected] of approvedExceptions) {
    const entries = entriesByGhsa.get(ghsa) ?? [];
    if (entries.length !== 1) {
      addFailure(failures, `Security exception ${ghsa} must appear exactly once.`);
      continue;
    }

    const entry = entries[0];
    let entryValid = true;
    if (entry.module !== expected.module) {
      addFailure(failures, `Security exception ${ghsa} must apply only to ${expected.module}.`);
      entryValid = false;
    }
    if (entry.expires !== expected.expires) {
      addFailure(failures, `Security exception ${ghsa} must keep the reviewed expiry ${expected.expires}.`);
      entryValid = false;
    }

    const owner = typeof entry.owner === 'string' ? entry.owner.trim() : '';
    if (!owner || /^(?:pending|tbd|n\/?a|none|unassigned)$/iu.test(owner)) {
      addFailure(failures, `Security exception ${ghsa} is pending security-owner sign-off.`);
      entryValid = false;
    }

    const acceptedOn = isoDate(entry.acceptedOn);
    const expires = isoDate(entry.expires);
    if (!acceptedOn) {
      addFailure(failures, `Security exception ${ghsa} must record a valid acceptedOn date.`);
      entryValid = false;
    }
    if (!expires) {
      addFailure(failures, `Security exception ${ghsa} has an invalid expiry date.`);
      entryValid = false;
    }
    if (expires && today && expires < today) {
      addFailure(failures, `Security exception ${ghsa} expired on ${entry.expires}.`);
      entryValid = false;
    }
    if (acceptedOn && today && acceptedOn > today) {
      addFailure(failures, `Security exception ${ghsa} cannot be accepted in the future.`);
      entryValid = false;
    }
    if (acceptedOn && expires && acceptedOn > expires) {
      addFailure(failures, `Security exception ${ghsa} was accepted after its expiry.`);
      entryValid = false;
    }

    if (entryValid) valid.set(ghsa, { ...entry, owner });
  }

  return valid;
}

function evaluateAudit(audit, failures) {
  if (!isObject(audit) || audit.auditReportVersion !== 2 || !isObject(audit.vulnerabilities)) {
    addFailure(failures, 'npm audit did not return the required version 2 vulnerabilities object.');
    return [];
  }

  const counts = audit.metadata?.vulnerabilities;
  const high = counts?.high;
  const critical = counts?.critical;
  if (!Number.isInteger(high) || high < 0 || !Number.isInteger(critical) || critical < 0) {
    addFailure(failures, 'npm audit did not return valid high and critical vulnerability counts.');
    return [];
  }

  const vulnerabilities = audit.vulnerabilities;
  const blockingPackages = new Map();
  const advisories = [];
  for (const [moduleName, vulnerability] of Object.entries(vulnerabilities)) {
    if (!isObject(vulnerability)) {
      addFailure(failures, `npm audit returned a malformed vulnerability entry for ${moduleName}.`);
      continue;
    }
    const severity = typeof vulnerability.severity === 'string'
      ? vulnerability.severity.toLowerCase()
      : '';
    if (!blockingSeverities.has(severity)) continue;
    blockingPackages.set(moduleName, vulnerability);
    if (!Array.isArray(vulnerability.via)) {
      addFailure(failures, `npm audit returned a non-array via chain for ${moduleName}.`);
      continue;
    }

    for (const via of vulnerability.via) {
      if (typeof via === 'string') continue;
      if (!isObject(via)) {
        addFailure(failures, `npm audit returned a malformed advisory in the ${moduleName} via chain.`);
        continue;
      }
      const ghsa = ghsaFromUrl(via.url);
      if (!ghsa) {
        addFailure(failures, `npm audit returned an advisory without a GHSA URL for ${moduleName}.`);
        continue;
      }
      const advisorySeverity = typeof via.severity === 'string' ? via.severity.toLowerCase() : '';
      if (blockingSeverities.has(advisorySeverity)) {
        advisories.push({ ghsa, module: moduleName, severity: advisorySeverity });
      }
    }
  }

  const expectedBlockingPackageCount = high + critical;
  if (blockingPackages.size !== expectedBlockingPackageCount) {
    addFailure(
      failures,
      `npm audit reported ${expectedBlockingPackageCount} high/critical packages but supplied ${blockingPackages.size} blocking vulnerability entries.`,
    );
  }

  const unresolvedVia = new Set();
  const resolveAdvisories = (moduleName, visiting = new Set()) => {
    if (visiting.has(moduleName)) return new Set();
    const vulnerability = blockingPackages.get(moduleName);
    if (!vulnerability || !Array.isArray(vulnerability.via)) return new Set();

    const nextVisiting = new Set(visiting);
    nextVisiting.add(moduleName);
    const resolved = new Set();
    for (const via of vulnerability.via) {
      if (typeof via === 'string') {
        if (!Object.hasOwn(vulnerabilities, via)) {
          unresolvedVia.add(`${moduleName} → ${via}`);
          continue;
        }
        if (!blockingPackages.has(via)) continue;
        for (const identity of resolveAdvisories(via, nextVisiting)) resolved.add(identity);
        continue;
      }
      if (!isObject(via)) continue;
      const severity = typeof via.severity === 'string' ? via.severity.toLowerCase() : '';
      const ghsa = ghsaFromUrl(via.url);
      if (ghsa && blockingSeverities.has(severity)) resolved.add(`${moduleName}:${ghsa}`);
    }
    return resolved;
  };

  for (const moduleName of blockingPackages.keys()) {
    if (resolveAdvisories(moduleName).size === 0) {
      addFailure(failures, `High/critical npm audit entry ${moduleName} does not resolve to an identified advisory.`);
    }
  }
  for (const chain of unresolvedVia) {
    addFailure(failures, `npm audit via chain ${chain} does not resolve to a blocking vulnerability entry.`);
  }
  if (expectedBlockingPackageCount > 0 && advisories.length === 0) {
    addFailure(failures, 'npm audit reported high/critical findings but no advisory objects could be resolved.');
  }

  const unique = new Map();
  for (const advisory of advisories) unique.set(`${advisory.module}:${advisory.ghsa}`, advisory);
  return [...unique.values()];
}

export function evaluateAuditExceptions({ audit, acceptance, now }) {
  const failures = [];
  const validAcceptance = evaluateAcceptance(acceptance, now, failures);
  const advisories = evaluateAudit(audit, failures);
  const accepted = [];

  for (const advisory of advisories) {
    const expected = approvedExceptions.get(advisory.ghsa);
    if (!expected) {
      addFailure(failures, `Unapproved ${advisory.severity} advisory ${advisory.ghsa} affects ${advisory.module}.`);
      continue;
    }
    if (advisory.module !== expected.module) {
      addFailure(failures, `Approved advisory ${advisory.ghsa} appeared on unexpected module ${advisory.module}.`);
      continue;
    }
    const record = validAcceptance.get(advisory.ghsa);
    if (record) {
      accepted.push({
        ghsa: advisory.ghsa,
        module: advisory.module,
        owner: record.owner,
        expires: record.expires,
      });
    }
  }

  return { ok: failures.length === 0, failures, accepted };
}

export function parseAcceptanceDocument(source) {
  if (typeof source !== 'string') throw new Error('The security exception record could not be read.');
  if (source.split(acceptanceBegin).length !== 2 || source.split(acceptanceEnd).length !== 2) {
    throw new Error('The security exception document must contain exactly one acceptance marker pair.');
  }
  const begin = source.indexOf(acceptanceBegin) + acceptanceBegin.length;
  const end = source.indexOf(acceptanceEnd);
  if (end <= begin) throw new Error('The security exception acceptance markers are out of order.');
  const fenced = source.slice(begin, end).trim();
  const match = fenced.match(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/u);
  if (!match) throw new Error('The security exception acceptance record must be one fenced JSON block.');
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error('The security exception acceptance record contains invalid JSON.');
  }
}

function readAuditOutput() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    return execFileSync(npmCommand, ['audit', '--json'], {
      cwd: appRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stdout = error && typeof error === 'object' && 'stdout' in error
      ? Buffer.isBuffer(error.stdout)
        ? error.stdout.toString('utf8')
        : String(error.stdout ?? '')
      : '';
    if (stdout.trim()) return stdout;
    throw new Error('npm audit did not return JSON. A registry or audit-service failure blocks release.');
  }
}

export function parseAuditOutput(source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('npm audit did not return JSON. A registry or audit-service failure blocks release.');
  }

  let audit;
  try {
    audit = JSON.parse(source);
  } catch {
    throw new Error('npm audit returned malformed JSON.');
  }
  if (isObject(audit) && Object.hasOwn(audit, 'error')) {
    throw new Error('npm audit returned an audit-service error. Release remains blocked.');
  }
  return audit;
}

function main() {
  const audit = parseAuditOutput(readAuditOutput());
  const acceptance = parseAcceptanceDocument(readFileSync(acceptancePath, 'utf8'));
  const result = evaluateAuditExceptions({ audit, acceptance, now: new Date() });
  if (!result.ok) throw new Error(result.failures.join(' '));

  const accepted = result.accepted
    .map(({ ghsa, module, owner, expires }) => `${ghsa} on ${module}, accepted by ${owner} through ${expires}`)
    .join('; ');
  console.log(accepted
    ? `Dependency audit gate passed with temporary documented exceptions: ${accepted}. npm audit still reports these findings.`
    : 'Dependency audit gate passed with no high or critical advisories.');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(`Dependency audit gate failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
