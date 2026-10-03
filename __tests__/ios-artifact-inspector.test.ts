const { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } = require('fs') as {
  chmodSync: (path: string, mode: number) => void;
  mkdirSync: (path: string) => void;
  mkdtempSync: (prefix: string) => string;
  rmSync: (path: string, options: { force: boolean; recursive: boolean }) => void;
  symlinkSync: (target: string, path: string, type: 'junction') => void;
  writeFileSync: (path: string, data: string) => void;
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
    widget_info = {
        'CFBundleExecutable': 'ExpoWidgetsTarget',
        'CFBundleIdentifier': 'com.bolo.hindi.widgets',
        'CFBundlePackageType': 'XPC!',
    }
    archive.writestr('Payload/Bolo.app/PlugIns/ExpoWidgetsTarget.appex/Info.plist', plistlib.dumps(widget_info))
    archive.writestr('Payload/Bolo.app/PlugIns/ExpoWidgetsTarget.appex/ExpoWidgetsTarget', b'not-a-mach-o')
    archive.writestr('Payload/Bolo.app/embedded.mobileprovision', b'mocked by the inspector test')
    archive.writestr(
        'Payload/Bolo.app/PrivacyInfo.xcprivacy',
        plistlib.dumps({'NSPrivacyTracking': False}),
    )
    bundle = (
        b'https://api.example.test '
        b'https://live.example.test '
        b'https://site.example.test '
    )
    if mode == 'credential-boundary':
        bundle += b'mask-' + (b'A' * 80)
    elif mode == 'credential-openai-key':
        bundle += b'sk-' + (b'A' * 48)
    elif mode == 'credential-openai-project-key':
        bundle += b'sk-proj-' + (b'A' * 48)
    archive.writestr('Payload/Bolo.app/main.jsbundle', bundle)
`;

function inspect(ipa: string, temporaryDirectory?: string, toolDirectory?: string) {
  return spawnSync('bash', [inspector, ipa], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(temporaryDirectory ? { TMPDIR: temporaryDirectory, TEMP: temporaryDirectory, TMP: temporaryDirectory } : {}),
      BASELINE_IPA_BYTES: '500000',
      EXPECTED_API_URL: 'https://api.example.test',
      EXPECTED_LIVE_API_URL: 'https://live.example.test',
      EXPECTED_APP_IDENTIFIER: 'com.bolo.hindi',
      EXPECTED_PUBLIC_SITE_URL: 'https://site.example.test',
      FORBIDDEN_RELEASE_URLS: 'https://staging.example.test',
      MAX_EXPANDED_APP_BYTES: '16777216',
      MAX_IPA_BYTES: '1000000',
      MAX_IPA_GROWTH_PERCENT: '100',
      ...(toolDirectory ? {
        CODESIGN_BIN: join(toolDirectory, 'mock-codesign'),
        SECURITY_BIN: join(toolDirectory, 'mock-security'),
        IOS_INSPECTION_REPORT: join(toolDirectory, 'inspection-report.json'),
      } : {}),
    },
  });
}

function createMockSigningTools(directory: string) {
  const codesign = join(directory, 'mock-codesign');
  const security = join(directory, 'mock-security');
  const mainEntitlements = '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>application-identifier</key><string>TEAM.com.bolo.hindi</string><key>com.apple.security.application-groups</key><array><string>group.com.bolo.hindi</string></array><key>get-task-allow</key><false/></dict></plist>';
  const widgetEntitlements = '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>application-identifier</key><string>TEAM.com.bolo.hindi.widgets</string><key>com.apple.security.application-groups</key><array><string>group.com.bolo.hindi</string></array><key>get-task-allow</key><false/></dict></plist>';
  const profile = '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>Entitlements</key><dict><key>application-identifier</key><string>TEAM.com.bolo.hindi</string><key>get-task-allow</key><false/></dict></dict></plist>';

  writeFileSync(codesign, `#!/bin/sh\ncase "$*" in\n  *--entitlements*)\n    case "$*" in\n      *ExpoWidgetsTarget.appex*) printf '%s' '${widgetEntitlements}' ;;\n      *) printf '%s' '${mainEntitlements}' ;;\n    esac\n    ;;\nesac\nexit 0\n`);
  writeFileSync(security, `#!/bin/sh\nprintf '%s' '${profile}'\n`);
  chmodSync(codesign, 0o755);
  chmodSync(security, 0o755);
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

  it('does not mistake a Hermes string-table mask entry for an OpenAI key', () => {
    createMockSigningTools(directory);
    const ipa = join(directory, 'credential-boundary.ipa');
    expect(spawnSync('python3', ['-c', generator, ipa, 'credential-boundary']).status).toBe(0);

    const result = inspect(ipa, undefined, directory);

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('credential-like byte pattern');
  });

  it.each([
    ['legacy', 'credential-openai-key'],
    ['project', 'credential-openai-project-key'],
  ])('still rejects a standalone %s OpenAI key-shaped token', (_label, mode) => {
    createMockSigningTools(directory);
    const ipa = join(directory, `${mode}.ipa`);
    expect(spawnSync('python3', ['-c', generator, ipa, mode]).status).toBe(0);

    const result = inspect(ipa, undefined, directory);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('credential-like byte pattern');
  });
});
