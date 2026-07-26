const mockNormalizeFile = jest.fn();

jest.mock('expo', () => ({
  requireOptionalNativeModule: jest.fn(() => ({ normalizeFile: mockNormalizeFile })),
}));

const { normalizeAiVoiceAudioFile } = jest.requireActual(
  '../src/lib/ai-audio-normalizer.ios.ts',
) as {
  normalizeAiVoiceAudioFile(sourceUri: string): Promise<string | null>;
};

describe('iOS AI audio normalization bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the native normalized file URL', async () => {
    mockNormalizeFile.mockResolvedValue('file:///cache/reply.normalized.caf');

    await expect(normalizeAiVoiceAudioFile('file:///cache/reply.mp3')).resolves.toBe(
      'file:///cache/reply.normalized.caf',
    );
    expect(mockNormalizeFile).toHaveBeenCalledWith('file:///cache/reply.mp3');
  });

  it('falls back when native decoding or normalization fails', async () => {
    mockNormalizeFile.mockRejectedValue(new Error('unsupported audio'));

    await expect(normalizeAiVoiceAudioFile('file:///cache/reply.mp3')).resolves.toBeNull();
  });
});
