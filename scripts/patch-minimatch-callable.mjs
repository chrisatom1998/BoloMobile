#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, renameSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// GHSA-g3hv-75wg-m249 marks every minimatch before 11.0.1, including 3.1.5.
// eslint-plugin-import, eslint-plugin-react, and eslint-plugin-jsx-a11y still
// call require('minimatch') as a function (and, through Babel, as .default()).
// Keeping 3.1.5 for those plugins would leave the advisory in npm audit, so
// this shim adds that call shape on top of the patched 11.0.3 build.
const upstreamSha256 = '235c5458355f1449cc100f1cea1a43d45f788a4feb524a83497aa146bea88f32';
const marker = '\n/* bolo-minimatch-callable-shim */\n';
const shim = `${marker}/* Bolo: minimatch 3 call shape on minimatch 11.0.3. See patch-minimatch-callable.mjs. */
;(function () {
  var fn = exports.minimatch;
  function callable(path, pattern, options) {
    return fn(path, pattern, options);
  }
  var keys = Object.keys(exports);
  for (var i = 0; i < keys.length; i++) callable[keys[i]] = exports[keys[i]];
  callable.minimatch = callable;
  callable.default = callable;
  callable.Minimatch = exports.Minimatch;
  callable.makeRe = function (pattern, options) {
    try {
      var mm = new exports.Minimatch(pattern, options || {});
      return { test: function (input) { return mm.match(String(input)); } };
    } catch (error) {
      return { test: function () { return false; } };
    }
  };
  module.exports = callable;
})();
`;

function walk(dir, found) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === '.bin' || entry === '.cache') continue;
    const path = join(dir, entry);
    let info;
    try {
      info = statSync(path);
    } catch {
      continue;
    }
    if (!info.isDirectory()) continue;
    if (entry === 'minimatch') {
      const manifestPath = join(path, 'package.json');
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        if (manifest.name === 'minimatch' && manifest.version === '11.0.3') found.push(path);
      } catch {
        // Not an installed minimatch package.
      }
    }
    if (entry === 'node_modules' || entry.startsWith('@')) {
      walk(path, found);
      continue;
    }
    const nested = join(path, 'node_modules');
    try {
      if (statSync(nested).isDirectory()) walk(nested, found);
    } catch {
      // This package has no nested installs.
    }
  }
}

function upstreamSource(source) {
  const markerAt = source.indexOf(marker);
  return markerAt === -1 ? source : source.slice(0, markerAt);
}

function writeAtomic(filePath, contents) {
  const temporary = `${filePath}.bolo-tmp`;
  writeFileSync(temporary, contents);
  renameSync(temporary, filePath);
}

export function patchMinimatchCallable(appRoot = process.cwd()) {
  const found = [];
  walk(join(appRoot, 'node_modules'), found);
  if (found.length === 0) return 'skipped';

  const pending = [];
  for (const packageDir of found) {
    const filePath = join(packageDir, 'dist', 'commonjs', 'index.js');
    const source = readFileSync(filePath, 'utf8');
    const original = upstreamSource(source);
    const hash = createHash('sha256').update(original).digest('hex');
    if (hash !== upstreamSha256) {
      throw new Error('Unrecognized minimatch 11.0.3 source. Review the callable shim; no file was changed.');
    }
    if (source === original) pending.push({ filePath, contents: `${original}${shim}` });
  }
  for (const file of pending) writeAtomic(file.filePath, file.contents);
  return pending.length > 0 ? `patched ${pending.length}` : `already patched ${found.length}`;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  try {
    console.log(`minimatch callable shim: ${patchMinimatchCallable()}.`);
  } catch (error) {
    console.error(`minimatch callable shim failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
