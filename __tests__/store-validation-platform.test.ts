const { spawnSync } = jest.requireActual('child_process') as {
  spawnSync(
    executable: string,
    args: string[],
    options: { cwd: string; encoding: 'utf8'; env: Record<string, string> },
  ): { status: number | null; stderr: string; stdout: string };
};
const {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} = jest.requireActual('fs') as {
  copyFileSync(source: string, destination: string): void;
  mkdirSync(path: string, options: { recursive: true }): void;
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, encoding: 'utf8'): string;
  rmSync(path: string, options: { recursive: true; force: true }): void;
  unlinkSync(path: string): void;
  writeFileSync(path: string, contents: string): void;
};
const { tmpdir } = jest.requireActual('os') as { tmpdir(): string };
const { dirname, join } = jest.requireActual('path') as {
  dirname(path: string): string;
  join(...paths: string[]): string;
};

const fixtureFiles = [
  'scripts/validate-store-assets.mjs',
  'scripts/lib/png.mjs',
  'app.json',
  'app.config.js',
  'eas.json',
  'store/listings.json',
  'store/assets.json',
  'store.config.json',
  'assets/images/icon.png',
  'assets/images/android-icon-foreground.png',
  'assets/images/android-icon-monochrome.png',
  'assets/images/splash-icon.png',
  'assets/images/favicon.png',
  'assets/store/app-store-icon.png',
  'assets/store/play-store-icon.png',
  'assets/store/play-store-feature.png',
];

describe('store validation platform scope', () => {
  let sandboxRoot = '';

  beforeEach(() => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'bolo-store-platform-'));
    for (const relativePath of fixtureFiles) {
      const destination = join(sandboxRoot, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(process.cwd(), relativePath), destination);
    }
  });

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  function runValidator(args: string[]) {
    return spawnSync(process.execPath, [join(sandboxRoot, 'scripts/validate-store-assets.mjs'), ...args], {
      cwd: sandboxRoot,
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    });
  }

  function readJsonFixture<T>(relativePath: string): T {
    return JSON.parse(readFileSync(join(sandboxRoot, relativePath), 'utf8')) as T;
  }

  function writeJsonFixture(relativePath: string, value: unknown) {
    writeFileSync(join(sandboxRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`);
  }

  it('accepts the current store inputs in full and iOS-only modes', () => {
    expect(runValidator([]).status).toBe(0);

    const iosResult = runValidator(['--platform', 'ios']);
    expect(iosResult.status).toBe(0);
    expect(iosResult.stdout).toContain('Validated 3 iOS artwork files plus Apple store copy');
  });

  it('rejects stale Apple curriculum wording even when the current counts are also present', () => {
    type ListingsFixture = {
      apple: { description: string };
    };
    const listings = readJsonFixture<ListingsFixture>('store/listings.json');
    listings.apple.description += ' Includes 30 guided scenes.';
    writeJsonFixture('store/listings.json', listings);

    const result = runValidator(['--platform', 'ios']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('stale “30 guided scenes” curriculum claim');
  });

  it('locks the Apple storyboard to the four shipping screenshot filenames', () => {
    type AssetsFixture = {
      screenshots: { apple: { storyboard: { file: string }[] } };
    };
    const assets = readJsonFixture<AssetsFixture>('store/assets.json');
    assets.screenshots.apple.storyboard[1]!.file = 'assets/store/screenshots/ios/02-catalog.png';
    writeJsonFixture('store/assets.json', assets);

    const result = runValidator(['--platform', 'ios']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Apple screenshot 2 must be path at assets/store/screenshots/ios/02-path.png');
  });

  it('keeps the iOS release gate independent of Android assets, copy, and profiles', () => {
    type AppFixture = {
      expo: { android: { adaptiveIcon: { backgroundImage?: string } } };
    };
    type ListingsFixture = {
      googlePlay: { appName: string };
    };
    type EasFixture = {
      build: { production: { android: { buildType: string } } };
      submit: {
        internal: { android: { track: string } };
        production: { android: { releaseStatus: string; track: string } };
      };
    };

    const appConfig = readJsonFixture<AppFixture>('app.json');
    appConfig.expo.android.adaptiveIcon.backgroundImage = './assets/images/not-for-ios.png';
    writeJsonFixture('app.json', appConfig);

    const listings = readJsonFixture<ListingsFixture>('store/listings.json');
    listings.googlePlay.appName = '';
    writeJsonFixture('store/listings.json', listings);

    const eas = readJsonFixture<EasFixture>('eas.json');
    eas.build.production.android.buildType = 'apk';
    eas.submit.internal.android.track = 'closed';
    eas.submit.production.android.track = 'internal';
    eas.submit.production.android.releaseStatus = 'completed';
    writeJsonFixture('eas.json', eas);

    for (const relativePath of [
      'assets/images/android-icon-foreground.png',
      'assets/images/android-icon-monochrome.png',
      'assets/store/play-store-icon.png',
      'assets/store/play-store-feature.png',
    ]) {
      unlinkSync(join(sandboxRoot, relativePath));
    }

    expect(runValidator(['--platform', 'ios']).status).toBe(0);
    expect(runValidator([]).status).toBe(1);
  });

  it('rejects unsupported platform arguments', () => {
    const result = runValidator(['--platform', 'android']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: node scripts/validate-store-assets.mjs [--platform ios]');
  });
});
