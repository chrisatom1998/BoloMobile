const { mkdirSync, mkdtempSync, rmSync, symlinkSync } = require('fs') as {
  mkdirSync: (path: string) => void;
  mkdtempSync: (prefix: string) => string;
  rmSync: (path: string, options: { force: boolean; recursive: boolean }) => void;
  symlinkSync: (target: string, path: string, type: 'junction') => void;
};
const { tmpdir } = require('os') as { tmpdir: () => string };
const { join, resolve } = require('path') as {
  join: (...paths: string[]) => string;
  resolve: (...paths: string[]) => string;
};
const { spawnSync } = require('child_process') as {
  spawnSync: (
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      encoding?: 'utf8';
      env?: Record<string, string | undefined>;
    },
  ) => {
    status: number | null;
    stderr: string;
  };
};

const root = process.cwd();
const inspector = resolve(root, 'scripts/inspect-ios-artifact.sh');
const generator = String.raw`
import plistlib
import stat
import sys
import zipfile

path, mode = sys.argv[1:]
info = {
    'CFBundleExecutable': 'Bolo',
    'CFBundleIdentifier': 'com.bolo.hindi',
    'CFBundlePackageType': 'APPL',
    'CFBundleShortVersionString': '1.0',
    'CFBundleVersion': '1',
    'ITSAppUsesNonExemptEncryption': False,
    'NSAppTransportSecurity': {'NSAllowsArbitraryLoads': False},
    'NSMicrophoneUsageDescription': 'Allow Bolo to use your microphone for Hindi practice and conversations.',
    'UIDeviceFamily': [1],
}
with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    if mode == 'traversal':
        archive.writestr('../escaped.txt', b'outside extraction root')
    if mode == 'bomb':
        archive.writestr('unbounded-outside-payload.bin', b'0' * (8 * 1024 * 1024))
    if mode == 'symlink':
        link = zipfile.ZipInfo('Payload/linked-app')
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(link, 'Bolo.app')
    archive.writestr('Payload/Bolo.app/Info.plist', plistlib.dumps(info))
    archive.writestr('Payload/Bolo.app/Bolo', b'not-a-mach-o')
`;

function inspect(ipa: string, temporaryDirectory?: string) {
  return spawnSync('bash', [inspector, ipa], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(temporaryDirectory ? { TMPDIR: temporaryDirectory, TEMP: temporaryDirectory, TMP: temporaryDirectory } : {}),
      BASELINE_IPA_BYTES: '500000',
      EXPECTED_API_URL: 'https://api.example.test',
      EXPECTED_APP_IDENTIFIER: 'com.bolo.hindi',
      EXPECTED_PUBLIC_SITE_URL: 'https://site.example.test',
      FORBIDDEN_RELEASE_URLS: 'https://staging.example.test',
      MAX_EXPANDED_APP_BYTES: '16777216',
      MAX_IPA_BYTES: '1000000',
      MAX_IPA_GROWTH_PERCENT: '100',
    },
  });
}

describe('signed IPA inspection archive bounds', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bolo-ipa-test-'));

  afterAll(() => rmSync(directory, { force: true, recursive: true }));

  it('rejects archive members outside the extraction root', () => {
    const ipa = join(directory, 'traversal.ipa');
    expect(spawnSync('python3', ['-c', generator, ipa, 'traversal']).status).toBe(0);

    const result = inspect(ipa);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('unsafe path: ../escaped.txt');
    expect(result.stderr).not.toContain('signature verification');
  });

  it('allows a bounded archive when the temporary directory resolves through a link', () => {
    const target = join(directory, 'real-temp');
    const linked = join(directory, 'linked-temp');
    mkdirSync(target);
    symlinkSync(target, linked, 'junction');
    const ipa = join(directory, 'linked-temp-bounded.ipa');
    expect(spawnSync('python3', ['-c', generator, ipa, 'bounded']).status).toBe(0);

    const result = inspect(ipa, linked);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('signature verification');
    expect(result.stderr).not.toContain('unsafe path');
  });

  it('rejects a high-ratio member before extracting or invoking codesign', () => {
    const ipa = join(directory, 'expansion-bomb.ipa');
    expect(spawnSync('python3', ['-c', generator, ipa, 'bomb']).status).toBe(0);

    const result = inspect(ipa);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('exceeds safe compression ratio');
    expect(result.stderr).not.toContain('signature verification');
  });

  it('allows an ordinary bounded archive to reach signature verification', () => {
    const ipa = join(directory, 'bounded.ipa');
    expect(spawnSync('python3', ['-c', generator, ipa, 'bounded']).status).toBe(0);

    const result = inspect(ipa);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('signature verification');
    expect(result.stderr).not.toContain('archive expanded size');
    expect(result.stderr).not.toContain('safe compression ratio');
  });

  it('rejects symbolic-link members before extraction', () => {
    const ipa = join(directory, 'symlink.ipa');
    expect(spawnSync('python3', ['-c', generator, ipa, 'symlink']).status).toBe(0);

    const result = inspect(ipa);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('archive contains a symbolic link');
    expect(result.stderr).not.toContain('signature verification');
  });
});
