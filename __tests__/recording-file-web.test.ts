import { deleteRecordingUri, readRecordingUri } from '../src/lib/recording-file.web';

describe('web recording files', () => {
  const originalFetch = globalThis.fetch;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  it('reads a blob recording as base64 without Expo FileSystem', async () => {
    const bytes = Uint8Array.from([0, 1, 2, 253, 254, 255]);
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      blob: async () => ({
        arrayBuffer: async () => bytes.buffer,
        type: 'audio/webm;codecs=opus',
      }),
    })) as unknown as typeof fetch;

    await expect(readRecordingUri('blob:https://bolo.test/recording', 'audio/mp4')).resolves.toEqual({
      audioBase64: 'AAEC/f7/',
      mimeType: 'audio/webm;codecs=opus',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('blob:https://bolo.test/recording');
  });

  it('uses the fallback type and reports an unavailable blob', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => ({ arrayBuffer: async () => Uint8Array.from([1]).buffer, type: '' }),
      })
      .mockResolvedValueOnce({ ok: false });

    await expect(readRecordingUri('blob:first', 'audio/mp4')).resolves.toEqual({
      audioBase64: 'AQ==',
      mimeType: 'audio/mp4',
    });
    await expect(readRecordingUri('blob:missing', 'audio/mp4')).rejects.toThrow('recording is no longer available');
  });

  it('releases browser blob URLs after processing', () => {
    deleteRecordingUri('blob:https://bolo.test/recording');
    deleteRecordingUri('https://bolo.test/not-a-blob');

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://bolo.test/recording');
  });
});
