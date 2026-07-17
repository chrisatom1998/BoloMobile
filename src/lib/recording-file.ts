import { File } from 'expo-file-system';

export type RecordingData = {
  audioBase64: string;
  mimeType: string;
};

export async function readRecordingUri(uri: string, fallbackMimeType: string): Promise<RecordingData> {
  const file = new File(uri);
  if (!file.exists) throw new Error('The recording is no longer available.');
  return {
    audioBase64: await file.base64(),
    mimeType: file.type || fallbackMimeType,
  };
}

export function deleteRecordingUri(uri: string) {
  const file = new File(uri);
  if (file.exists) file.delete();
}
