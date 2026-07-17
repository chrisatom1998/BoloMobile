#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const easArgs = process.argv.slice(2);
const easCli = 'eas-cli@21.0.0';

if (easArgs.length === 0) {
  console.error('Pass an EAS CLI command, for example: build --platform ios --profile preview');
  process.exit(2);
}

const bundledNpx = resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
const command = process.platform === 'win32' && existsSync(bundledNpx) ? process.execPath : 'npx';
const commandArgs = command === process.execPath
  ? [bundledNpx, easCli, ...easArgs]
  : [easCli, ...easArgs];
const result = spawnSync(command, commandArgs, {
  cwd: appRoot,
  env: {
    ...process.env,
    EAS_NO_VCS: '1',
    EAS_PROJECT_ROOT: appRoot,
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Could not start EAS CLI: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
