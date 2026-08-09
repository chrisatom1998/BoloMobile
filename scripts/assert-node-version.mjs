#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultNvmrcPath = resolve(appRoot, '.nvmrc');
const exactNodeVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

export function parsePinnedNodeVersion(source, nvmrcPath = defaultNvmrcPath) {
  const version = typeof source === 'string' ? source.trim() : '';
  if (!exactNodeVersionPattern.test(version)) {
    throw new Error(
      `${nvmrcPath} must contain one exact Node.js version in x.y.z form (for example, 22.23.2). Restore the repository's .nvmrc pin before retrying.`,
    );
  }
  return version;
}

export function evaluateNodeVersion({ requiredVersion, actualVersion }) {
  if (!exactNodeVersionPattern.test(requiredVersion)) {
    return {
      ok: false,
      requiredVersion: null,
      actualVersion,
      message: 'The required Node.js version is not an exact x.y.z value. Release is blocked.',
    };
  }

  if (!exactNodeVersionPattern.test(actualVersion)) {
    return {
      ok: false,
      requiredVersion,
      actualVersion,
      message: `The current Node.js version could not be identified as an exact x.y.z value (received ${JSON.stringify(actualVersion)}). Release is blocked.`,
    };
  }

  if (actualVersion !== requiredVersion) {
    return {
      ok: false,
      requiredVersion,
      actualVersion,
      message: `This project requires Node.js ${requiredVersion} from .nvmrc, but this process is using ${actualVersion}. Run "nvm install ${requiredVersion} && nvm use ${requiredVersion}", then rerun the command.`,
    };
  }

  return {
    ok: true,
    requiredVersion,
    actualVersion,
    message: `Node.js toolchain check passed: ${actualVersion} matches the exact .nvmrc pin.`,
  };
}

export function inspectNodeVersion({
  nvmrcPath = defaultNvmrcPath,
  actualVersion = process.versions.node,
} = {}) {
  let source;
  try {
    source = readFileSync(nvmrcPath, 'utf8');
  } catch (error) {
    const missing = error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
    return {
      ok: false,
      requiredVersion: null,
      actualVersion,
      message: missing
        ? `The required Node.js version file is missing at ${nvmrcPath}. Restore .nvmrc, then rerun the command.`
        : `Could not read the required Node.js version file at ${nvmrcPath}. Fix its permissions, then rerun the command.`,
    };
  }

  let requiredVersion;
  try {
    requiredVersion = parsePinnedNodeVersion(source, nvmrcPath);
  } catch (error) {
    return {
      ok: false,
      requiredVersion: null,
      actualVersion,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return evaluateNodeVersion({ requiredVersion, actualVersion });
}

function main() {
  const result = inspectNodeVersion();
  if (!result.ok) throw new Error(result.message);
  console.log(result.message);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(`Node.js toolchain check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
