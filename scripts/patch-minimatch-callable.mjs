#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultAppRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamSha256 = '235c5458355f1449cc100f1cea1a43d45f788a4feb524a83497aa146bea88f32';

// Remove this bridge when test-exclude calls the named minimatch export.
// Verify the entire upstream file so a dependency change requires an explicit review.
const patchSuffix = `
// Bolo: minimatch 11 CJS build exports named functions only.
// test-exclude 6 calls require('minimatch') during Jest coverage.
const boloMinimatch = exports.minimatch;
for (const boloKey of Object.keys(exports)) {
  if (boloMinimatch[boloKey] === undefined) {
    boloMinimatch[boloKey] = exports[boloKey];
  }
}
boloMinimatch.minimatch = boloMinimatch;
module.exports = boloMinimatch;
`;

function findMinimatchPackages(appRoot) {
  const found = [];

  const visit = (modulesDir) => {
    if (!existsSync(modulesDir)) return;
    for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageDir = join(modulesDir, entry.name);
      if (entry.name === 'minimatch') {
        found.push(packageDir);
        continue;
      }
      if (entry.name.startsWith('@')) {
        for (const scoped of readdirSync(packageDir, { withFileTypes: true })) {
          if (!scoped.isDirectory()) continue;
          visit(join(packageDir, scoped.name, 'node_modules'));
        }
        continue;
      }
      const nested = join(packageDir, 'node_modules');
      try {
        if (statSync(nested).isDirectory()) visit(nested);
      } catch {
        // This package has no nested modules.
      }
    }
  };

  visit(join(appRoot, 'node_modules'));
  return found;
}

export function patchMinimatchCallable({ appRoot = defaultAppRoot } = {}) {
  const packages = findMinimatchPackages(appRoot);
  if (packages.length === 0) {
    throw new Error('Expected minimatch 11.0.4. Run npm ci so the coverage bridge can patch it.');
  }

  let patched = false;
  for (const packageDir of packages) {
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
    if (manifest.name !== 'minimatch' || manifest.version !== '11.0.4') {
      throw new Error(`Expected minimatch 11.0.4 at ${packageDir}. Found ${manifest.name}@${manifest.version}.`);
    }

    const entryPath = join(packageDir, 'dist', 'commonjs', 'index.js');
    const source = readFileSync(entryPath, 'utf8');
    const originalSource = source.endsWith(patchSuffix) ? source.slice(0, -patchSuffix.length) : source;
    const hash = createHash('sha256').update(originalSource).digest('hex');
    if (hash !== upstreamSha256) {
      throw new Error('Unrecognized minimatch 11.0.4 source. Review the coverage bridge; no file was changed.');
    }
    if (source !== originalSource) continue;

    writeFileSync(entryPath, originalSource + patchSuffix);
    patched = true;
  }

  return patched ? 'patched' : 'already patched';
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    console.log(`minimatch coverage bridge: ${patchMinimatchCallable()}.`);
  } catch (error) {
    console.error(`minimatch coverage bridge failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
