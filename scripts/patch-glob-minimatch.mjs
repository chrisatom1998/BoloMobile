#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const original = [
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

const patched = [
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

export function patchGlobMinimatch(appRoot = process.cwd()) {
  const found = [];
  walk(join(appRoot, 'node_modules'), found);
  if (found.length === 0) {
    throw new Error('Expected at least one glob 7.2.3 install for Jest.');
  }
  let patchedCount = 0;
  let already = 0;
  for (const packageDir of found) {
    for (const fileName of ['sync.js', 'glob.js']) {
      const filePath = join(packageDir, fileName);
      const source = readFileSync(filePath, 'utf8');
      if (source.includes(patched)) {
        already += 1;
        continue;
      }
      if (!source.includes(original)) {
        throw new Error(`Unrecognized glob 7.2.3 ${fileName}. Review the minimatch 11 compatibility patch; no file was changed.`);
      }
      writeFileSync(filePath, source.replace(original, patched));
      patchedCount += 1;
    }
  }
  return patchedCount > 0 ? `patched ${patchedCount}` : `already patched ${already}`;
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
