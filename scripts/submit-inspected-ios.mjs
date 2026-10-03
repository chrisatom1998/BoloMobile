#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const buildId = process.env.EAS_BUILD_ID?.trim();
if (!buildId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(buildId)) {
  console.error('Set EAS_BUILD_ID to the exact inspected iOS production build UUID. --latest is intentionally unsupported.');
  process.exit(2);
}

const runner = resolve(import.meta.dirname, 'run-eas-from-app-root.mjs');
const result = spawnSync(process.execPath, [
  runner,
  'submit',
  '--platform', 'ios',
  '--id', buildId,
  '--profile', 'production',
], { env: process.env, stdio: 'inherit' });

if (result.error) {
  console.error(`Could not start the inspected iOS submission: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
