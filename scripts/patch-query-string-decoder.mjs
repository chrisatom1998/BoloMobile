#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultAppRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const originalImport = "const decodeComponent = require('decode-uri-component');";
const compatibleImport = [
  "const decodeComponentModule = require('decode-uri-component');",
  '// Bolo: decode-uri-component 0.5.1 is ESM; retain query-string 7 synchronous API.',
  "const decodeComponent = typeof decodeComponentModule === 'function'",
  '\t? decodeComponentModule : decodeComponentModule.default;',
].join('\n');
const upstreamSha256 = 'caa3f2c8b45dfe1e91db22ae10743af68de8d96f26515132bb52485ec0f037fa';

// Remove this bridge when Expo Router uses a query-string release compatible with ESM decoders.
// Verify the entire upstream file so a dependency change requires an explicit review.
export function patchQueryStringDecoder({ appRoot = defaultAppRoot } = {}) {
  const appRequire = createRequire(resolve(appRoot, 'package.json'));
  const routerRequire = createRequire(appRequire.resolve('expo-router/package.json'));
  const manifestPath = routerRequire.resolve('query-string/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.name !== 'query-string' || manifest.version !== '7.1.3') {
    throw new Error('Expected query-string 7.1.3. Review the decoder compatibility patch before updating dependencies.');
  }

  const entryPath = resolve(dirname(manifestPath), 'index.js');
  const queryRequire = createRequire(entryPath);
  const decoderManifestPath = resolve(dirname(queryRequire.resolve('decode-uri-component')), 'package.json');
  const decoder = JSON.parse(readFileSync(decoderManifestPath, 'utf8'));
  if (decoder.name !== 'decode-uri-component' || decoder.version !== '0.5.1') {
    throw new Error('Expected decode-uri-component 0.5.1. Restore the security override and lockfile, then run npm ci.');
  }

  const source = readFileSync(entryPath, 'utf8');
  const originalSource = source.replace(compatibleImport, originalImport);
  const hash = createHash('sha256').update(originalSource).digest('hex');
  if (hash !== upstreamSha256) {
    throw new Error('Unrecognized query-string 7.1.3 source. Review the decoder compatibility patch; no file was changed.');
  }
  if (source !== originalSource) return 'already patched';

  writeFileSync(entryPath, source.replace(originalImport, compatibleImport));
  return 'patched';
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  try {
    console.log(`query-string decoder compatibility: ${patchQueryStringDecoder()}.`);
  } catch (error) {
    console.error(`query-string decoder compatibility failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
