import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('production configuration validator', () => {
  it('accepts the checked-in production configuration', () => {
    const root = resolve(__dirname, '..');
    const result = spawnSync(process.execPath, ['scripts/validate-production-config.mjs'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        BOLO_APP_IDENTIFIER: 'com.bolo.hindi',
        BOLO_EAS_PROJECT_ID: '573b5aad-b676-44aa-8ec4-34b831b6d5ff',
        BOLO_EXPO_OWNER: 'appdevcmjatom',
        EAS_BUILD_PROFILE: 'production',
      },
    });

    expect(result.status).toBe(0);
  });
});
