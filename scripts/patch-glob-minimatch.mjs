#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Remove this patch on a Jest 30 upgrade. Jest 29 (via jest-expo) still
// requires glob 7, whose matcher expects minimatch 3 RegExps. minimatch 11
// uses Matcher objects instead. Glob 14 does not export glob.default.sync,
// which jest-runtime and @jest/reporters call, so glob 7 has to stay.

const originalBlock = [
  '  var rawGlob = pn._glob',
  "  var dotOk = this.dot || rawGlob.charAt(0) === '.'",
  '',
  '  var matchedEntries = []',
  '  for (var i = 0; i < entries.length; i++) {',
  '    var e = entries[i]',
  "    if (e.charAt(0) !== '.' || dotOk) {",
  '      var m',
  '      if (negate && !prefix) {',
  '        m = !e.match(pn)',
  '      } else {',
  '        m = e.match(pn)',
  '      }',
].join('\n');

const patchedBlock = [
  '  // minimatch 11 exposes magic portions as Matcher objects, not RegExps.',
  "  var rawGlob = pn && (pn._glob || pn.pattern) || ''",
  "  var dotOk = this.dot || String(rawGlob).charAt(0) === '.'",
  '',
  '  var matchedEntries = []',
  '  for (var i = 0; i < entries.length; i++) {',
  '    var e = entries[i]',
  "    if (e.charAt(0) !== '.' || dotOk) {",
  '      var m',
  "      var matched = pn && typeof pn.test === 'function' && typeof pn.pattern === 'string'",
  '        ? pn.test(e)',
  '        : e.match(pn)',
  '      if (negate && !prefix) {',
  '        m = !matched',
  '      } else {',
  '        m = matched',
  '      }',
].join('\n');

const upstreamSha256 = {
  'sync.js': '0f61227f4b55297f1ad16798c53e6a6dd55d633856f153133716413b7c5f61ad',
  'glob.js': 'b8f35657ca927593d0f9e1aae3a8cfe9c33c697bf3c5733c2f6727f25ae25be1',
};

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
    if (entry === 'glob') {
      const manifestPath = join(path, 'package.json');
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        if (manifest.name === 'glob' && manifest.version === '7.2.3') found.push(path);
      } catch {
        // Not an installed glob package.
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
  return source.includes(patchedBlock) ? source.replace(patchedBlock, originalBlock) : source;
}

function writeAtomic(filePath, contents) {
  const temporary = `${filePath}.bolo-tmp`;
  writeFileSync(temporary, contents);
  renameSync(temporary, filePath);
}

export function patchGlobMinimatch(appRoot = process.cwd()) {
  const found = [];
  walk(join(appRoot, 'node_modules'), found);
  // npm ci --omit=dev does not install Jest, and Jest 30 will drop glob 7.
  if (found.length === 0) return 'skipped';

  const pending = [];
  for (const packageDir of found) {
    for (const fileName of ['sync.js', 'glob.js']) {
      const filePath = join(packageDir, fileName);
      const source = readFileSync(filePath, 'utf8');
      const original = upstreamSource(source);
      const hash = createHash('sha256').update(original).digest('hex');
      if (hash !== upstreamSha256[fileName] || !original.includes(originalBlock)) {
        throw new Error(`Unrecognized glob 7.2.3 ${fileName}. Review the minimatch 11 compatibility patch; no file was changed.`);
      }
      if (source === original) pending.push({ filePath, contents: source.replace(originalBlock, patchedBlock) });
    }
  }
  for (const file of pending) writeAtomic(file.filePath, file.contents);
  return pending.length > 0 ? `patched ${pending.length}` : `already patched ${found.length * 2}`;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  try {
    console.log(`glob 7 minimatch compatibility: ${patchGlobMinimatch()}.`);
  } catch (error) {
    console.error(`glob 7 minimatch compatibility failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
