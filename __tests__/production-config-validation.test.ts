const { readFileSync } = require('fs') as {
  readFileSync: (path: string, encoding: 'utf8') => string;
};
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

const productionEnvironment = {
  BOLO_APP_IDENTIFIER: 'com.bolo.hindi',
  BOLO_EAS_PROJECT_ID: '573b5aad-b676-44aa-8ec4-34b831b6d5ff',
  BOLO_EXPO_OWNER: 'appdevcmjatom',
  EAS_BUILD_PROFILE: 'production',
} as const;

function runValidator(
  args: string[] = [],
  overrides: Record<string, string | undefined> = {},
) {
  return spawnSync(process.execPath, ['scripts/validate-production-config.mjs', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      BOLO_API_URL: undefined,
      BOLO_PUBLIC_SITE_URL: undefined,
      ...productionEnvironment,
      ...overrides,
    },
  });
}

describe('production configuration validator', () => {
  it('accepts the checked-in production configuration', () => {
    const result = runValidator();

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
    const result = runValidator([], {
      EXPO_PUBLIC_OPENAI_KEY: ['s', 'k'].join('') + '-' + 'x'.repeat(32) + '-',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/must not expose a standard OpenAI API key/u);
  });

  it('rejects moving the build and resolved config to a different app identity', () => {
    const result = runValidator([], {
      BOLO_APP_IDENTIFIER: 'com.example.repackagedbolo',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/must equal the permanent release app identity com\.bolo\.hindi/u);
  });

  it.each([
    [
      'API URL spelling',
      'https://API-V2.APPDEPLOY.AI:443/app/74e39779183cf78fed/',
      'https://staging-site.example.test/',
    ],
    [
      'public-site URL spelling',
      'https://staging-api.example.test/v1/',
      'https://74E39779183CF78FED.V2.APPDEPLOY.AI:443/',
    ],
    [
      'API URL dot segments and unreserved escapes',
      'https://api-v2.appdeploy.ai/app/staging/../%37%34e39779183cf78fed?preview=1#nightly',
      'https://staging-site.example.test/',
    ],
  ])('rejects a production-equivalent %s in the staging guard', (_label, apiUrl, siteUrl) => {
    const result = runValidator(['--validate-staging-endpoints'], {
      BOLO_API_URL: apiUrl,
      BOLO_PUBLIC_SITE_URL: siteUrl,
      EAS_BUILD_PROFILE: 'preview',
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Nightly acceptance refuses to run against a production endpoint/u);
  });

  it('accepts canonically distinct HTTPS staging services', () => {
    const result = runValidator(['--validate-staging-endpoints'], {
      BOLO_API_URL: 'https://STAGING-API.example.test:443/v1/',
      BOLO_PUBLIC_SITE_URL: 'https://staging-site.example.test:443/',
      EAS_BUILD_PROFILE: 'preview',
    });

    expect({
      status: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
    }).toEqual({
      status: 0,
      stderr: '',
      stdout: expect.stringContaining('Staging endpoint isolation validated.'),
    });
  });

  it('routes nightly EAS acceptance through the canonical staging guard', () => {
    const workflow = readFileSync('.eas/workflows/nightly-maestro.yml', 'utf8');

    expect(workflow).toContain(
      'node ./scripts/validate-production-config.mjs --validate-staging-endpoints',
    );
    expect(workflow).not.toContain("const productionApi = 'https://api-v2.appdeploy.ai");
  });
});
