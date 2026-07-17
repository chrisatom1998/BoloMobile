import type { RecordingData } from '@/lib/recording-file';

export async function readRecordingUri(uri: string, fallbackMimeType: string): Promise<RecordingData> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('The recording is no longer available.');
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return {
    audioBase64: btoa(binary),
    mimeType: blob.type || fallbackMimeType,
  };
}

export function deleteRecordingUri(uri: string) {
  if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
}
