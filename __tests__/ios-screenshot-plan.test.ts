const { mkdtempSync, writeFileSync } = require('fs') as {
  mkdtempSync: (prefix: string) => string;
  writeFileSync: (path: string, data: string) => void;
};
const { tmpdir } = require('os') as { tmpdir: () => string };
const { join } = require('path') as { join: (...paths: string[]) => string };
const { spawnSync } = require('child_process') as {
  spawnSync: (
    command: string,
    args: string[],
    options: { encoding: 'utf8' },
  ) => { status: number | null; stderr: string; stdout: string };
};

const script = join(process.cwd(), 'scripts/ios-screenshot-plan.mjs');

function run(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

describe('iOS screenshot plan', () => {
  it('maps each temporary PR branch to the screens that branch changes', () => {
    expect(run(['--branch', 'screenshots/pr-102']).stdout.trim()).toBe('none');
    expect(run(['--branch', 'screenshots/pr-105']).stdout.trim()).toBe('onboarding,reminder');
    expect(run(['--branch', 'screenshots/pr-106']).stdout.trim()).toBe('chat');
    expect(run(['--branch', 'screenshots/pr-107']).stdout.trim()).toBe('asha');
    expect(run(['--branch', 'screenshots/pr-108']).stdout.trim()).toBe('today');
    expect(run(['--branch', 'screenshots/pr-109']).stdout.trim()).toBe('review');
  });

  it('captures the main set for the screenshot workflow branch', () => {
    const result = run(['--branch', 'cursor/ios-simulator-screenshots-9e6e']);
    expect(result.stdout.trim()).toBe('onboarding,today,asha,phrases,review,progress');
  });

  it('lets a manual input override the branch map', () => {
    const result = run(['--branch', 'screenshots/pr-108', '--input', 'phrases,review']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('phrases,review');
  });

  it('prints one Maestro flow per requested screen', () => {
    const result = run(['--flows', '--input', 'today,asha']);
    expect(result.stdout.trim().split('\n')).toEqual([
      '.maestro/screenshots/today.yaml',
      '.maestro/screenshots/asha.yaml',
    ]);
  });

  it('fails the check until every required PNG is present', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bolo-shots-'));
    const missing = run(['--check', '--dir', directory, '--input', 'review', '--prefix', 'pr109']);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('pr109-review-hidden.png');
    writeFileSync(join(directory, 'pr109-review-hidden.png'), '');
    writeFileSync(join(directory, 'pr109-review-revealed.png'), '');
    const ready = run(['--check', '--dir', directory, '--input', 'review', '--prefix', 'pr109']);
    expect(ready.status).toBe(0);
  });
});
