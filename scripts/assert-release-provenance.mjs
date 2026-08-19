#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function countStatusEntries(statusOutput) {
  const normalized = statusOutput.trimEnd();
  return normalized ? normalized.split(/\r?\n/u).filter(Boolean).length : 0;
}

function parseDivergence(divergenceOutput) {
  const match = divergenceOutput.trim().match(/^(\d+)\s+(\d+)$/u);
  if (!match) return null;

  return {
    behind: Number(match[1]),
    ahead: Number(match[2]),
  };
}

function countLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function evaluateReleaseProvenance({
  statusOutput,
  upstream,
  divergenceOutput,
  branch,
  headSha,
}) {
  const trackedUpstream = upstream.trim();
  if (!trackedUpstream) {
    return {
      ok: false,
      message: 'The current Git branch has no upstream. Configure a tracked remote branch before a production release.',
    };
  }

  const divergence = parseDivergence(divergenceOutput);
  if (!divergence) {
    return {
      ok: false,
      message: `Could not compare this checkout with ${trackedUpstream}. Production release provenance is unknown.`,
    };
  }

  const dirtyPathCount = countStatusEntries(statusOutput);
  const issues = [];
  if (dirtyPathCount > 0) {
    issues.push(`${countLabel(dirtyPathCount, 'uncommitted path')}`);
  }
  if (divergence.behind > 0) {
    issues.push(`${countLabel(divergence.behind, 'commit')} behind ${trackedUpstream}`);
  }
  if (divergence.ahead > 0) {
    issues.push(`${countLabel(divergence.ahead, 'unpushed commit')}`);
  }

  if (issues.length > 0) {
    return {
      ok: false,
      message: `Release source is not ready: ${issues.join('; ')}. Resolve the Git state before a production release. This check never changes Git.`,
    };
  }

  const acceptedBranch = branch.trim();
  const acceptedSha = headSha.trim();
  if (!acceptedBranch || !/^[0-9a-f]{7,64}$/iu.test(acceptedSha)) {
    return {
      ok: false,
      message: 'Could not identify the current Git branch and commit. Production release provenance is unknown.',
    };
  }

  return {
    ok: true,
    message: `Release source provenance accepted: ${acceptedBranch} at ${acceptedSha} matches the locally fetched ${trackedUpstream} ref.`,
  };
}

function parsePathList(output) {
  return output.split(/\0|\r?\n/u).filter(Boolean);
}

export function findIgnoredUploadPaths({ gitIgnoredOutput, easIgnoredOutput }) {
  const easIgnoredPaths = new Set(parsePathList(easIgnoredOutput));
  return parsePathList(gitIgnoredOutput).filter((path) => !easIgnoredPaths.has(path));
}

function readGit(args, failureMessage) {
  try {
    return execFileSync('git', args, {
      cwd: appRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch {
    throw new Error(failureMessage);
  }
}

function main() {
  const repositoryRoot = readGit(
    ['rev-parse', '--show-toplevel'],
    'Could not locate the Git repository. Production releases require this project to be in a valid Git checkout.',
  );
  if (resolve(repositoryRoot) !== appRoot) {
    throw new Error(`The Git repository root must be ${appRoot}, but Git reported ${repositoryRoot}.`);
  }

  const statusOutput = readGit(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    'Could not inspect the Git working tree. Production releases require this project to be in a valid Git checkout.',
  );
  const upstream = readGit(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    'The current Git branch has no upstream. Configure a tracked remote branch before a production release.',
  );

  // This is deliberately read-only and compares with the last locally fetched remote ref.
  // The release operator must fetch separately before treating the result as current remote state.
  const divergenceOutput = readGit(
    ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
    `Could not compare this checkout with ${upstream}. Production release provenance is unknown.`,
  );
  const branch = readGit(
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    'Could not identify the current Git branch. Production release provenance is unknown.',
  );
  const headSha = readGit(
    ['rev-parse', '--verify', 'HEAD'],
    'Could not identify the current Git commit. Production release provenance is unknown.',
  );

  const result = evaluateReleaseProvenance({
    statusOutput,
    upstream,
    divergenceOutput,
    branch,
    headSha,
  });
  if (!result.ok) throw new Error(result.message);

  const gitIgnoredOutput = readGit(
    ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'],
    'Could not inspect paths hidden by Git ignore rules. Production release provenance is unknown.',
  );
  const easIgnoredOutput = readGit(
    ['ls-files', '--others', '--ignored', '--exclude-from=.easignore', '-z'],
    'Could not inspect paths excluded from the EAS upload. Production release provenance is unknown.',
  );
  const ignoredUploadPaths = findIgnoredUploadPaths({ gitIgnoredOutput, easIgnoredOutput });
  if (ignoredUploadPaths.length > 0) {
    const examples = ignoredUploadPaths.slice(0, 5).map((path) => JSON.stringify(path)).join(', ');
    throw new Error(
      `${countLabel(ignoredUploadPaths.length, 'path')} invisible to Git would still be uploaded to EAS: ${examples}. Add the paths to .easignore or remove them before a production release.`,
    );
  }

  console.log(result.message);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(`Release provenance check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
