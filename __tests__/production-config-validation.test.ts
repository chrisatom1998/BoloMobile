const { spawnSync } = require('child_process') as {
  spawnSync: (
    command: string,
    args: string[],
    options: {
      cwd: string;
      encoding: 'utf8';
      env: Record<string, string | undefined>;
    },
  ) => {
    status: number | null;
    stdout: string;
    stderr: string;
  };
};

describe('production configuration validator', () => {
  it('accepts the checked-in production configuration', () => {
    const result = spawnSync(process.execPath, ['scripts/validate-production-config.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        BOLO_APP_IDENTIFIER: 'com.bolo.hindi',
        BOLO_EAS_PROJECT_ID: '573b5aad-b676-44aa-8ec4-34b831b6d5ff',
        BOLO_EXPO_OWNER: 'appdevcmjatom',
        EAS_BUILD_PROFILE: 'production',
      },
    });

    expect({
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    }).toEqual({
      status: 0,
      stderr: '',
      stdout: expect.any(String),
    });
  });

  it('rejects a standard OpenAI key exposed through an Expo public variable', () => {
    const result = spawnSync(process.execPath, ['scripts/validate-production-config.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_PUBLIC_OPENAI_KEY: ['s', 'k'].join('') + '-' + 'x'.repeat(32),
        BOLO_APP_IDENTIFIER: 'com.bolo.hindi',
        BOLO_EAS_PROJECT_ID: '573b5aad-b676-44aa-8ec4-34b831b6d5ff',
        BOLO_EXPO_OWNER: 'appdevcmjatom',
        EAS_BUILD_PROFILE: 'production',
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/must not expose a standard OpenAI API key/u);
  });
});
