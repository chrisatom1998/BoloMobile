import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const baselinePath = resolve(root, '.github/security/npm-audit-baseline.json');
const blockingSeverities = new Set(['high', 'critical']);

function fail(message) {
  console.error(`::error title=Runtime dependency audit::${message}`);
  process.exitCode = 1;
}

function advisoryId(url) {
  return typeof url === 'string' ? url.match(/\bGHSA-[a-z0-9-]+\b/iu)?.[0].toUpperCase() : undefined;
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch (error) {
  throw new Error('Could not read the runtime audit baseline.', { cause: error });
}

if (
  baseline?.schemaVersion !== 1
  || !/^\d{4}-\d{2}-\d{2}$/u.test(baseline.reviewBy)
  || !Array.isArray(baseline.allowedAdvisories)
) {
  throw new Error('The runtime audit baseline has an invalid schema.');
}

const today = new Date().toISOString().slice(0, 10);
if (today > baseline.reviewBy) {
  fail(`The existing build-tool advisory baseline expired on ${baseline.reviewBy}; triage and renew it explicitly.`);
}

const allowed = new Map();
for (const entry of baseline.allowedAdvisories) {
  if (
    typeof entry?.package !== 'string'
    || typeof entry?.advisory !== 'string'
    || !blockingSeverities.has(entry.severity)
    || typeof entry?.rationale !== 'string'
    || !entry.rationale.trim()
  ) {
    throw new Error('Every runtime audit baseline entry must name a package, advisory, severity, and rationale.');
  }
  const key = `${entry.package}:${entry.advisory.toUpperCase()}`;
  if (allowed.has(key)) throw new Error(`Duplicate runtime audit baseline entry: ${key}`);
  allowed.set(key, { ...entry, advisory: entry.advisory.toUpperCase() });
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const audit = spawnSync(npmCommand, ['audit', '--omit=dev', '--json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

if (audit.error) {
  throw new Error('npm audit could not be started.', { cause: audit.error });
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  const detail = audit.stderr.trim() || `npm audit exited with status ${audit.status}`;
  throw new Error(`npm audit did not return valid JSON: ${detail}`, { cause: error });
}

if (!report || typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
  throw new Error('npm audit returned an unexpected report and the runtime gate cannot evaluate it.');
}

const observed = new Map();
let unparseableBlockingAdvisory = false;
for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities)) {
  if (!vulnerability || typeof vulnerability !== 'object' || !Array.isArray(vulnerability.via)) continue;
  for (const via of vulnerability.via) {
    if (!via || typeof via !== 'object') continue;
    const severity = String(via.severity || vulnerability.severity || '').toLowerCase();
    if (!blockingSeverities.has(severity)) continue;
    const advisory = advisoryId(via.url);
    if (!advisory) {
      unparseableBlockingAdvisory = true;
      fail(`${packageName} has a ${severity} advisory without a recognized GHSA identifier.`);
      continue;
    }
    observed.set(`${packageName}:${advisory}`, { package: packageName, advisory, severity });
  }
}

const counts = report.metadata?.vulnerabilities;
const blockingCount = Number(counts?.high || 0) + Number(counts?.critical || 0);
if (blockingCount > 0 && observed.size === 0 && !unparseableBlockingAdvisory) {
  fail('npm reported high/critical vulnerabilities but no direct advisory identifiers could be evaluated.');
}

for (const [key, finding] of observed) {
  const approved = allowed.get(key);
  if (!approved) {
    fail(`Unapproved ${finding.severity} advisory ${finding.advisory} affects ${finding.package}.`);
    continue;
  }
  if (approved.severity !== finding.severity) {
    fail(
      `${finding.advisory} for ${finding.package} changed severity from ${approved.severity} to ${finding.severity}.`,
    );
  }
}

for (const [key, entry] of allowed) {
  if (!observed.has(key)) {
    fail(`Baseline entry ${entry.advisory} for ${entry.package} is no longer reported; remove it before it can mask a reintroduction.`);
  }
}

if (process.exitCode) process.exit();

for (const entry of allowed.values()) {
  console.warn(
    `::warning title=Existing build-tool advisory::${entry.package} ${entry.advisory} remains temporarily accepted; review by ${baseline.reviewBy}.`,
  );
}
console.log(
  `Runtime dependency audit passed: no new high/critical advisories; ${allowed.size} exact build-tool advisories remain on the reviewed baseline.`,
);
