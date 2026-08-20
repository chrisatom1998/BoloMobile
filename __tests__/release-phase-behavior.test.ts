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
  writeFileSync,
} = jest.requireActual('fs') as {
  copyFileSync(source: string, destination: string): void;
  mkdirSync(path: string, options: { recursive: true }): void;
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, encoding: 'utf8'): string;
  rmSync(path: string, options: { recursive: true; force: true }): void;
  writeFileSync(path: string, contents: string): void;
};
const { tmpdir } = jest.requireActual('os') as { tmpdir(): string };
const { dirname, join } = jest.requireActual('path') as {
  dirname(path: string): string;
  join(...paths: string[]): string;
};
const { Buffer: NodeBuffer } = jest.requireActual('buffer') as {
  Buffer: { byteLength(value: string, encoding: 'utf8'): number };
};

const fixtureFiles = [
  'scripts/validate-release.mjs',
  'scripts/lib/png.mjs',
  'app.json',
  'app.config.js',
  'eas.json',
  'store.config.js',
  'store.config.json',
  'src/lib/public-pages.ts',
  'src/services/bolo-api.ts',
];

const fakePublisherEnvironment: Record<string, string> = {
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  BOLO_APP_IDENTIFIER: 'com.example.fake',
  BOLO_EAS_PROJECT_ID: '00000000-0000-4000-8000-000000000000',
  BOLO_EXPO_OWNER: 'example-owner',
  BOLO_PUBLISHER_NAME: 'Example Company',
  BOLO_SUPPORT_EMAIL: 'support@example.test',
  BOLO_REVIEW_FIRST_NAME: 'Example',
  BOLO_REVIEW_LAST_NAME: 'Reviewer',
  BOLO_REVIEW_EMAIL: 'review@example.test',
  BOLO_REVIEW_PHONE: '+1 555 010 0000',
};

describe('iOS release validation phases', () => {
  let sandboxRoot = '';

  beforeEach(() => {
    sandboxRoot = mkdtempSync(join(tmpdir(), 'bolo-release-phase-'));
    for (const relativePath of fixtureFiles) {
      const destination = join(sandboxRoot, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(process.cwd(), relativePath), destination);
    }
  });

  afterEach(() => {
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  function runValidator(args: string[], environment = fakePublisherEnvironment) {
    return spawnSync(process.execPath, [join(sandboxRoot, 'scripts/validate-release.mjs'), ...args], {
      cwd: sandboxRoot,
      encoding: 'utf8',
      env: environment,
    });
  }

  function readJsonFixture<T>(relativePath: string): T {
    return JSON.parse(readFileSync(join(sandboxRoot, relativePath), 'utf8')) as T;
  }

  function writeJsonFixture(relativePath: string, value: unknown) {
    writeFileSync(join(sandboxRoot, relativePath), `${JSON.stringify(value, null, 2)}\n`);
  }

  it('allows an iOS binary through without shipping screenshots', () => {
    const result = runValidator(['--platform', 'ios', '--phase', 'binary']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Screenshot validation is deferred');
  });

  it('keeps screenshots mandatory in the default final iOS phase', () => {
    const result = runValidator(['--platform', 'ios']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Missing shipping-build screenshot: assets/store/screenshots/ios/01-lesson.png',
    );
  });

  it('keeps publisher and metadata checks active in the binary phase', () => {
    const environment = { ...fakePublisherEnvironment };
    delete environment.BOLO_SUPPORT_EMAIL;

    const missingPublisherValue = runValidator(
      ['--platform', 'ios', '--phase', 'binary'],
      environment,
    );
    expect(missingPublisherValue.status).toBe(1);
    expect(missingPublisherValue.stderr).toContain('BOLO_SUPPORT_EMAIL is required');

    const storeConfigPath = join(sandboxRoot, 'store.config.js');
    const storeConfig = readFileSync(storeConfigPath, 'utf8');
    const mismatchedStoreConfig = storeConfig.replace(
      'privacyPolicyUrl: `${site}/privacy`,',
      "privacyPolicyUrl: 'https://example.test/privacy',",
    );
    expect(mismatchedStoreConfig).not.toBe(storeConfig);
    writeFileSync(storeConfigPath, mismatchedStoreConfig);

    const mismatchedMetadata = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(mismatchedMetadata.status).toBe(1);
    expect(mismatchedMetadata.stderr).toContain(
      'Apple metadata legal URLs must match the production Expo configuration',
    );
  });

  it('requires one unambiguous iOS release version with remote build numbering', () => {
    type AppFixture = {
      expo: {
        version: string;
        ios: {
          buildNumber?: string;
          infoPlist: Record<string, unknown>;
          version?: string;
        };
      };
    };
    const appConfig = readJsonFixture<AppFixture>('app.json');

    appConfig.expo.version = '1.0';
    writeJsonFixture('app.json', appConfig);
    const invalidRootVersion = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(invalidRootVersion.status).toBe(1);
    expect(invalidRootVersion.stderr).toContain('must use Bolo\'s X.Y.Z numeric format');

    appConfig.expo.version = '1.0.0';
    appConfig.expo.ios.version = '1.0';
    writeJsonFixture('app.json', appConfig);
    const invalidIosOverride = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(invalidIosOverride.status).toBe(1);
    expect(invalidIosOverride.stderr).toContain('must use Bolo\'s X.Y.Z numeric format');

    appConfig.expo.ios.version = '1.0.1';
    appConfig.expo.ios.buildNumber = '42';
    writeJsonFixture('app.json', appConfig);
    const localBuildNumber = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(localBuildNumber.status).toBe(1);
    expect(localBuildNumber.stderr).toContain('ios.buildNumber must stay unset');

    delete appConfig.expo.ios.buildNumber;
    appConfig.expo.ios.infoPlist.CFBundleVersion = '42';
    writeJsonFixture('app.json', appConfig);
    const infoPlistBypass = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(infoPlistBypass.status).toBe(1);
    expect(infoPlistBypass.stderr).toContain('CFBundleVersion must be controlled by Expo release fields');
  });

  it('requires EAS remote iOS build-number auto-increment', () => {
    type EasFixture = {
      cli: { appVersionSource: string };
      build: {
        production: {
          autoIncrement?: boolean | string;
          ios?: { autoIncrement?: boolean | string };
        };
      };
    };
    const easConfig = readJsonFixture<EasFixture>('eas.json');

    easConfig.cli.appVersionSource = 'local';
    writeJsonFixture('eas.json', easConfig);
    const localVersionSource = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(localVersionSource.status).toBe(1);
    expect(localVersionSource.stderr).toContain('appVersionSource set to remote');

    easConfig.cli.appVersionSource = 'remote';
    easConfig.build.production.autoIncrement = false;
    writeJsonFixture('eas.json', easConfig);
    const disabledAutoIncrement = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(disabledAutoIncrement.status).toBe(1);
    expect(disabledAutoIncrement.stderr).toContain('must explicitly auto-increment the iOS buildNumber');

    easConfig.build.production.ios = { autoIncrement: 'buildNumber' };
    writeJsonFixture('eas.json', easConfig);
    const explicitIosAutoIncrement = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(explicitIosAutoIncrement.status).toBe(0);
  });

  it('keeps encryption, transport, and privacy declarations in the binary gate', () => {
    type AppFixture = {
      expo: {
        ios: {
          config: { usesNonExemptEncryption: boolean };
          infoPlist: { NSAppTransportSecurity: { NSAllowsArbitraryLoads: boolean } };
          privacyManifests: {
            NSPrivacyTracking: boolean;
            NSPrivacyCollectedDataTypes: unknown[];
          };
        };
      };
    };
    const original = readJsonFixture<AppFixture>('app.json');

    original.expo.ios.config.usesNonExemptEncryption = true;
    writeJsonFixture('app.json', original);
    const encryptionEnabled = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(encryptionEnabled.status).toBe(1);
    expect(encryptionEnabled.stderr).toContain('usesNonExemptEncryption false');

    original.expo.ios.config.usesNonExemptEncryption = false;
    original.expo.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads = true;
    writeJsonFixture('app.json', original);
    const arbitraryLoads = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(arbitraryLoads.status).toBe(1);
    expect(arbitraryLoads.stderr).toContain('NSAllowsArbitraryLoads false');

    original.expo.ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoads = false;
    original.expo.ios.privacyManifests.NSPrivacyTracking = true;
    writeJsonFixture('app.json', original);
    const trackingEnabled = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(trackingEnabled.status).toBe(1);
    expect(trackingEnabled.stderr).toContain('explicitly declare no tracking');

    original.expo.ios.privacyManifests.NSPrivacyTracking = false;
    original.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes.pop();
    writeJsonFixture('app.json', original);
    const missingDataDeclaration = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(missingDataDeclaration.status).toBe(1);
    expect(missingDataDeclaration.stderr).toContain('four reviewed app-owned data declarations');
  });

  it('enforces Apple metadata character and UTF-8 byte limits before a binary build', () => {
    type StoreFixture = {
      apple: {
        info: {
          'en-US': {
            keywords: string[];
            subtitle: string;
          };
        };
      };
    };
    const storeConfig = readJsonFixture<StoreFixture>('store.config.json');

    storeConfig.apple.info['en-US'].subtitle = 'x'.repeat(31);
    writeJsonFixture('store.config.json', storeConfig);
    const longSubtitle = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(longSubtitle.status).toBe(1);
    expect(longSubtitle.stderr).toContain('subtitle exceeds the 30-character limit');

    storeConfig.apple.info['en-US'].subtitle = 'Real-life conversation skills';
    storeConfig.apple.info['en-US'].keywords = [
      'pronunciation',
      'vocabulary',
      'travel',
      'phrase',
      'language',
      'india',
      'dialogue',
      'listening',
      'beginner',
      'ह'.repeat(7),
    ];
    const joinedKeywords = storeConfig.apple.info['en-US'].keywords.join(',');
    expect([...joinedKeywords].length).toBeLessThanOrEqual(100);
    expect(NodeBuffer.byteLength(joinedKeywords, 'utf8')).toBeGreaterThan(100);
    writeJsonFixture('store.config.json', storeConfig);
    const multibyteKeywords = runValidator(['--platform', 'ios', '--phase', 'binary']);
    expect(multibyteKeywords.status).toBe(1);
    expect(multibyteKeywords.stderr).toContain("keywords exceed Apple's 100-byte limit");
  });

  it('rejects invalid binary-phase argument combinations', () => {
    const missingIosScope = runValidator(['--phase', 'binary']);
    expect(missingIosScope.status).toBe(1);
    expect(missingIosScope.stderr).toContain('available only with --platform ios');

    const unknownPhase = runValidator(['--platform', 'ios', '--phase', 'unknown']);
    expect(unknownPhase.status).toBe(1);
    expect(unknownPhase.stderr).toContain('Unsupported release phase');
  });
});
