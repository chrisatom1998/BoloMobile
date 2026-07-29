/**
 * Android keeps the generated MP3 unchanged. The iOS implementation is loaded
 * from the platform-specific sibling file.
 */
export async function normalizeAiVoiceAudioFile(_sourceUri: string): Promise<string | null> {
  return null;
}
