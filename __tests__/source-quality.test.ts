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

  // The consent gate around pronunciation practice is asserted by rendering the
  // scene in __tests__/scene-consent-gating.test.tsx, and the Devanagari reply
  // instruction by buildMobileChatPayload in __tests__/language-and-api.test.ts.
  it('preserves Hindi pronunciation instructions and leaves Live speech on its audio track', () => {
    const realtime = fileSystem.readFileSync('src/hooks/use-realtime-conversation.ts', 'utf8');
    const liveBackend = fileSystem.readFileSync('backend/live.ts', 'utf8');
    const pronunciationProfile = fileSystem.readFileSync('src/data/hindi-pronunciation-profile.json', 'utf8');

    expect(realtime).not.toContain('romanizeDevanagari');
    expect(realtime).not.toContain('speakText');
    expect(liveBackend).toContain('authentic contemporary Standard Hindi sounds');
    expect(pronunciationProfile).toMatch(/do not apply American English vowels, stress, or letter-name pronunciation/u);
  });
});
