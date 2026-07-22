type DirectoryEntry = { name: string; isDirectory(): boolean };
const fileSystem = jest.requireActual('fs') as {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { withFileTypes: true }): DirectoryEntry[];
};

function sourceFiles(directory: string): string[] {
  return fileSystem.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/u.test(path) ? [path] : [];
  });
}

describe('shipping source guardrails', () => {
  it('does not ship an on-device text-to-speech dependency', () => {
    const packageJson = JSON.parse(fileSystem.readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).not.toHaveProperty('expo-speech');
    for (const file of sourceFiles('src')) {
      expect(fileSystem.readFileSync(file, 'utf8')).not.toContain('expo-speech');
    }
  });

  it('contains no common UTF-8 mojibake markers', () => {
    for (const file of sourceFiles('src')) {
      expect(fileSystem.readFileSync(file, 'utf8')).not.toMatch(/(?:Ã.|Â.|â€¦|â€™|â€œ|â€|ðŸ)/u);
    }
  });

  it('mounts pronunciation practice only after the scene consent gate is accepted', () => {
    const scene = fileSystem.readFileSync('src/app/scene/[id].tsx', 'utf8');

    expect(scene).toMatch(/\{aiConsent \? <PronunciationRecorder[\s\S]*?\/> : null\}/u);
  });

  it('keeps generated Hindi in Devanagari through voice replay', () => {
    const realtime = fileSystem.readFileSync('src/hooks/use-realtime-conversation.ts', 'utf8');
    const api = fileSystem.readFileSync('src/services/bolo-api.ts', 'utf8');
    const session = fileSystem.readFileSync('src/lib/realtime-session.ts', 'utf8');
    const pronunciationProfile = fileSystem.readFileSync('src/data/hindi-pronunciation-profile.json', 'utf8');

    expect(realtime).not.toContain('romanizeDevanagari');
    expect(api).toMatch(/Respond in natural Hindi written in Devanagari/u);
    expect(api).not.toMatch(/Hindi conversation coach[\s\S]{0,180}Never use Devanagari/u);
    expect(session).toContain('HINDI_LESSON_PRONUNCIATION_INSTRUCTIONS');
    expect(pronunciationProfile).toMatch(/do not apply American English vowels, stress, or letter-name pronunciation/u);
  });
});
