const configureApp = jest.requireActual('../app.config.js') as (input: { config: Record<string, unknown> }) => { extra: { boloApiUrl: string; boloLiveApiUrl?: string } };

describe('iOS GPT-Live server configuration', () => {
  const previous = process.env.BOLO_LIVE_API_URL;
  afterEach(() => {
    if (previous === undefined) delete process.env.BOLO_LIVE_API_URL;
    else process.env.BOLO_LIVE_API_URL = previous;
  });

  it('embeds only the dedicated HTTPS base URL and keeps it separate from typed coaching', () => {
    process.env.BOLO_LIVE_API_URL = ' https://live.example.test/bolo/ ';
    const config = configureApp({ config: {} });
    expect(config.extra.boloLiveApiUrl).toBe('https://live.example.test/bolo');
    expect(config.extra.boloApiUrl).not.toBe(config.extra.boloLiveApiUrl);
  });

  it('leaves live voice unconfigured when no trusted server is supplied', () => {
    delete process.env.BOLO_LIVE_API_URL;
    expect(configureApp({ config: {} }).extra.boloLiveApiUrl).toBeUndefined();
  });

  it.each([
    'http://live.example.test',
    'https://key:secret@live.example.test',
    'https://live.example.test?token=secret',
    'https://live.example.test#secret',
  ])('rejects unsafe Live URL %s', (url) => {
    process.env.BOLO_LIVE_API_URL = url;
    expect(() => configureApp({ config: {} })).toThrow('BOLO_LIVE_API_URL');
  });
});
