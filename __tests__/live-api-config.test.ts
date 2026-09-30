const configureApp = jest.requireActual('../app.config.js') as (input: { config: Record<string, unknown> }) => { extra: { boloApiUrl: string; boloLiveApiUrl?: string } };

describe('iOS GPT-Live server configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const name of Object.keys(process.env)) {
      if (name.startsWith('BOLO_') || name === 'EAS_BUILD_PROFILE') delete process.env[name];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('embeds only the dedicated HTTPS base URL and keeps it separate from typed coaching', () => {
    process.env.BOLO_LIVE_API_URL = ' https://live.example.test/bolo/ ';
    const config = configureApp({ config: {} });
    expect(config.extra.boloLiveApiUrl).toBe('https://live.example.test/bolo');
    expect(config.extra.boloApiUrl).not.toBe(config.extra.boloLiveApiUrl);
  });

  it.each([undefined, 'development', 'preview'])('keeps the Live URL optional for profile %s', (profile) => {
    if (profile !== undefined) process.env.EAS_BUILD_PROFILE = profile;
    expect(configureApp({ config: {} }).extra.boloLiveApiUrl).toBeUndefined();

    process.env.BOLO_LIVE_API_URL = '  ';
    expect(configureApp({ config: {} }).extra.boloLiveApiUrl).toBeUndefined();
  });

  it.each([
    'not-a-url',
    'http://live.example.test',
    `https://user${':'}pass@live.example.test`,
    `https://live.example.test?${'client=embedded-config'}`,
    'https://live.example.test#embedded-config',
  ])('rejects unsafe Live URL %s', (url) => {
    process.env.BOLO_LIVE_API_URL = url;
    expect(() => configureApp({ config: {} })).toThrow('BOLO_LIVE_API_URL');
  });
});

describe('production GPT-Live server configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const name of Object.keys(process.env)) {
      if (name.startsWith('BOLO_')) delete process.env[name];
    }
    process.env.EAS_BUILD_PROFILE = 'production';
    process.env.BOLO_EAS_PROJECT_ID = '573b5aad-b676-44aa-8ec4-34b831b6d5ff';
    process.env.BOLO_EXPO_OWNER = 'appdevcmjatom';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each([undefined, '', ' \t\n '])('rejects a missing or blank Live URL (%j)', (url) => {
    if (url !== undefined) process.env.BOLO_LIVE_API_URL = url;
    expect(() => configureApp({ config: {} })).toThrow('Production builds require BOLO_LIVE_API_URL');
  });

  it.each([
    'not-a-url',
    'http://live.example.test',
    `https://user${':'}pass@live.example.test`,
    `https://live.example.test?${'client=embedded-config'}`,
    'https://live.example.test#embedded-config',
  ])('rejects a malformed or unsafe production Live URL %s', (url) => {
    process.env.BOLO_LIVE_API_URL = url;
    expect(() => configureApp({ config: {} })).toThrow('BOLO_LIVE_API_URL');
  });

  it('accepts and embeds an explicitly configured HTTPS Live base URL', () => {
    process.env.BOLO_LIVE_API_URL = ' https://live.example.test/bolo/ ';
    expect(configureApp({ config: {} }).extra.boloLiveApiUrl).toBe('https://live.example.test/bolo');
  });
});
