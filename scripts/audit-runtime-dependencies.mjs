import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const baselinePath = resolve(root, '.github/security/npm-audit-baseline.json');
const blockingSeverities = new Set(['high', 'critical']);
const auditSeverities = new Set(['info', 'low', 'moderate', 'high', 'critical']);
const runtimeSourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);

function advisoryId(url) {
  return typeof url === 'string' ? url.match(/\bGHSA-[a-z0-9-]+\b/iu)?.[0].toUpperCase() : undefined;
}

function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return undefined;
  return parsed;
}

function sortedStrings(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new Error(`${label} must be an array of non-empty strings.`);
  }
  const normalized = [...new Set(value.map((entry) => entry.trim()))].sort();
  if (normalized.length !== value.length) throw new Error(`${label} must not contain duplicates.`);
  return normalized;
}

function readAllowedAdvisories(baseline) {
  if (
    baseline?.schemaVersion !== 2
    || !parseIsoDate(baseline.reviewBy)
    || !Array.isArray(baseline.allowedAdvisories)
  ) {
    throw new Error('The dependency audit baseline has an invalid schema.');
  }

  const allowed = new Map();
  for (const entry of baseline.allowedAdvisories) {
    if (
      typeof entry?.package !== 'string'
      || typeof entry?.advisory !== 'string'
      || !blockingSeverities.has(entry.severity)
      || entry?.usage !== 'build-only'
      || typeof entry?.rationale !== 'string'
      || !entry.rationale.trim()
      || typeof entry?.pathFingerprint?.isDirect !== 'boolean'
    ) {
      throw new Error(
        'Every dependency audit baseline entry must name a package, advisory, severity, build-only usage, rationale, and path fingerprint.',
      );
    }
    const normalized = {
      ...entry,
      advisory: entry.advisory.toUpperCase(),
      pathFingerprint: {
        isDirect: entry.pathFingerprint.isDirect,
        nodes: sortedStrings(entry.pathFingerprint.nodes, `${entry.package} pathFingerprint.nodes`),
        effects: sortedStrings(entry.pathFingerprint.effects, `${entry.package} pathFingerprint.effects`),
      },
    };
    const key = `${normalized.package}:${normalized.advisory}`;
    if (allowed.has(key)) throw new Error(`Duplicate dependency audit baseline entry: ${key}`);
    allowed.set(key, normalized);
  }
  return allowed;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function evaluateBuildOnlyUsage(allowed, rootManifest, runtimeSources, errors) {
  if (!rootManifest || typeof rootManifest.dependencies !== 'object' || rootManifest.dependencies === null) {
    errors.push('The root package manifest has no valid dependencies object.');
    return;
  }
  if (!Array.isArray(runtimeSources)) {
    errors.push('Runtime source inspection did not provide a valid source list.');
    return;
  }

  const buildOnlyPackages = new Set([...allowed.values()].map((entry) => entry.package));
  const runtimeDeclarationFields = ['dependencies', 'optionalDependencies', 'peerDependencies'];
  for (const packageName of buildOnlyPackages) {
    for (const field of runtimeDeclarationFields) {
      const declarations = rootManifest[field];
      if (declarations !== undefined && (typeof declarations !== 'object' || declarations === null)) {
        errors.push(`The root package manifest has an invalid ${field} object.`);
      } else if (declarations && Object.hasOwn(declarations, packageName)) {
        errors.push(`${packageName} is baselined as build-only but is listed in root ${field}.`);
      }
    }
    const bundled = rootManifest.bundledDependencies ?? rootManifest.bundleDependencies ?? [];
    if (!Array.isArray(bundled) || bundled.some((entry) => typeof entry !== 'string')) {
      errors.push('The root package manifest has an invalid bundledDependencies list.');
    } else if (bundled.includes(packageName)) {
      errors.push(`${packageName} is baselined as build-only but is listed in root bundledDependencies.`);
    }

    const escapedPackage = escapeRegExp(packageName);
    const importPattern = new RegExp(
      `(?:\\bfrom\\s+|\\brequire\\s*\\(\\s*|\\bimport\\s*(?:\\(\\s*)?)["']${escapedPackage}(?:\\/[^"']*)?["']`,
      'u',
    );
    for (const source of runtimeSources) {
      if (
        !source
        || typeof source.path !== 'string'
        || typeof source.content !== 'string'
      ) {
        errors.push('Runtime source inspection returned a malformed source entry.');
        break;
      }
      if (importPattern.test(source.content)) {
        errors.push(`${source.path} imports build-only baselined package ${packageName}.`);
      }
    }
  }
}

function collectObserved(report, scope, errors) {
  if (!report || typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
    errors.push(`${scope}: npm audit returned an unexpected report and cannot be evaluated.`);
    return new Map();
  }

  const observed = new Map();
  const observedBlockingRecords = { high: 0, critical: 0 };
  let unparseableBlockingAdvisory = false;
  for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (!vulnerability || typeof vulnerability !== 'object') {
      errors.push(`${scope}: ${packageName} has an invalid vulnerability record.`);
      continue;
    }
    const recordSeverity = String(vulnerability.severity || '').toLowerCase();
    if (!auditSeverities.has(recordSeverity)) {
      errors.push(`${scope}: ${packageName} has no recognized vulnerability severity.`);
    } else if (blockingSeverities.has(recordSeverity)) {
      observedBlockingRecords[recordSeverity] += 1;
    }
    if (
      !Array.isArray(vulnerability.via)
      || !Array.isArray(vulnerability.nodes)
      || !Array.isArray(vulnerability.effects)
      || typeof vulnerability.isDirect !== 'boolean'
    ) {
      errors.push(`${scope}: ${packageName} has an invalid npm audit path record.`);
      continue;
    }
    const pathFingerprint = {
      isDirect: vulnerability.isDirect === true,
      nodes: Array.isArray(vulnerability.nodes)
        ? [...new Set(vulnerability.nodes.filter((value) => typeof value === 'string'))].sort()
        : [],
      effects: Array.isArray(vulnerability.effects)
        ? [...new Set(vulnerability.effects.filter((value) => typeof value === 'string'))].sort()
        : [],
    };
    for (const via of vulnerability.via) {
      if (!via || typeof via !== 'object') continue;
      const severity = String(via.severity || vulnerability.severity || '').toLowerCase();
      if (!blockingSeverities.has(severity)) continue;
      const advisory = advisoryId(via.url);
      if (!advisory) {
        unparseableBlockingAdvisory = true;
        errors.push(`${scope}: ${packageName} has a ${severity} advisory without a recognized GHSA identifier.`);
        continue;
      }
      observed.set(`${packageName}:${advisory}`, {
        package: packageName,
        advisory,
        severity,
        pathFingerprint,
      });
    }
  }

  const resolvesToBlockingAdvisory = (packageName, visiting = new Set()) => {
    if (visiting.has(packageName)) return false;
    const vulnerability = report.vulnerabilities[packageName];
    if (!vulnerability || typeof vulnerability !== 'object' || !Array.isArray(vulnerability.via)) {
      return false;
    }
    const nextVisiting = new Set(visiting).add(packageName);
    return vulnerability.via.some((via) => {
      if (via && typeof via === 'object') {
        const severity = String(via.severity || vulnerability.severity || '').toLowerCase();
        return blockingSeverities.has(severity) && Boolean(advisoryId(via.url));
      }
      return typeof via === 'string' && resolvesToBlockingAdvisory(via, nextVisiting);
    });
  };

  for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (!vulnerability || typeof vulnerability !== 'object') continue;
    const severity = String(vulnerability.severity || '').toLowerCase();
    if (blockingSeverities.has(severity) && !resolvesToBlockingAdvisory(packageName)) {
      errors.push(
        `${scope}: ${packageName} is marked ${severity}, but its dependency chain does not resolve to a recognized GHSA advisory.`,
      );
    }
  }

  const counts = report.metadata?.vulnerabilities;
  if (
    !counts
    || !Number.isInteger(counts.high)
    || counts.high < 0
    || !Number.isInteger(counts.critical)
    || counts.critical < 0
  ) {
    errors.push(`${scope}: npm audit returned invalid high/critical vulnerability counts.`);
  } else {
    for (const severity of blockingSeverities) {
      if (counts[severity] !== observedBlockingRecords[severity]) {
        errors.push(
          `${scope}: npm reported ${counts[severity]} ${severity} vulnerability records, but `
          + `${observedBlockingRecords[severity]} valid records were evaluated.`,
        );
      }
    }
  }
  const blockingCount = Number(counts?.high || 0) + Number(counts?.critical || 0);
  if (blockingCount > 0 && observed.size === 0 && !unparseableBlockingAdvisory) {
    errors.push(`${scope}: npm reported high/critical vulnerabilities but no advisory identifiers could be evaluated.`);
  }
  return observed;
}

function evaluateObserved(scope, observed, allowed, errors) {
  for (const [key, finding] of observed) {
    const approved = allowed.get(key);
    if (!approved) {
      errors.push(`${scope}: unapproved ${finding.severity} advisory ${finding.advisory} affects ${finding.package}.`);
      continue;
    }
    if (approved.severity !== finding.severity) {
      errors.push(
        `${scope}: ${finding.advisory} for ${finding.package} changed severity from ${approved.severity} to ${finding.severity}.`,
      );
    }
    if (JSON.stringify(approved.pathFingerprint) !== JSON.stringify(finding.pathFingerprint)) {
      errors.push(
        `${scope}: path fingerprint for ${finding.package} ${finding.advisory} changed; expected `
        + `${JSON.stringify(approved.pathFingerprint)}, observed ${JSON.stringify(finding.pathFingerprint)}.`,
      );
    }
  }
}

export function evaluateAuditReports({
  baseline,
  productionReport,
  fullReport,
  rootManifest,
  runtimeSources,
  today,
}) {
  const errors = [];
  let allowed;
  try {
    allowed = readAllowedAdvisories(baseline);
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], warnings: [] };
  }

  const evaluationDate = today || new Date().toISOString().slice(0, 10);
  const evaluationDay = parseIsoDate(evaluationDate);
  const reviewDay = parseIsoDate(baseline.reviewBy);
  if (!evaluationDay) {
    errors.push(`Dependency audit evaluation date ${evaluationDate} is invalid.`);
  } else if (evaluationDay > reviewDay) {
    errors.push(`The existing build-tool advisory baseline expired on ${baseline.reviewBy}; triage and renew it explicitly.`);
  } else if ((reviewDay.getTime() - evaluationDay.getTime()) / 86_400_000 > 90) {
    errors.push(`The build-tool advisory baseline review date must be no more than 90 days in the future.`);
  }

  const productionObserved = collectObserved(productionReport, 'production dependency tree', errors);
  const fullObserved = collectObserved(fullReport, 'full dependency tree', errors);
  evaluateObserved('production dependency tree', productionObserved, allowed, errors);
  evaluateObserved('full dependency tree', fullObserved, allowed, errors);
  evaluateBuildOnlyUsage(allowed, rootManifest, runtimeSources, errors);

  for (const [key, entry] of allowed) {
    if (!fullObserved.has(key)) {
      errors.push(
        `Baseline entry ${entry.advisory} for ${entry.package} is no longer reported; remove it before it can mask a reintroduction.`,
      );
    }
  }

  const warnings = [...allowed.values()].map(
    (entry) => `${entry.package} ${entry.advisory} remains temporarily accepted only on its reviewed build path; review by ${baseline.reviewBy}.`,
  );
  return { errors, warnings };
}

function readRuntimeSources(directory) {
  if (!existsSync(directory)) return [];
  const sources = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...readRuntimeSources(path));
    } else if (entry.isFile() && runtimeSourceExtensions.has(extname(entry.name))) {
      sources.push({ path: relative(root, path), content: readFileSync(path, 'utf8') });
    }
  }
  return sources;
}

function runAudit(args, label) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const audit = spawnSync(npmCommand, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (audit.error) throw new Error(`${label} could not be started.`, { cause: audit.error });
  try {
    return JSON.parse(audit.stdout);
  } catch (error) {
    const detail = audit.stderr.trim() || `npm audit exited with status ${audit.status}`;
    throw new Error(`${label} did not return valid JSON: ${detail}`, { cause: error });
  }
}

function main() {
  let baseline;
  let rootManifest;
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    rootManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  } catch (error) {
    throw new Error('Could not read the dependency audit baseline or root package manifest.', { cause: error });
  }

  const productionReport = runAudit(
    ['audit', '--omit=dev', '--json'],
    'npm audit for the production dependency tree',
  );
  const fullReport = runAudit(['audit', '--json'], 'npm audit for the full dependency tree');
  const result = evaluateAuditReports({
    baseline,
    productionReport,
    fullReport,
    rootManifest,
    runtimeSources: readRuntimeSources(resolve(root, 'src')),
  });

  for (const error of result.errors) console.error(`::error title=Dependency audit::${error}`);
  if (result.errors.length > 0) process.exit(1);
  for (const warning of result.warnings) console.warn(`::warning title=Existing build-tool advisory::${warning}`);
  console.log(
    'Dependency audits passed: production and full trees have no new high/critical advisories; '
    + `${result.warnings.length} exact build-tool advisories remain on reviewed paths.`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
