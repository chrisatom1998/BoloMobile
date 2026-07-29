import { requireOptionalNativeModule } from 'expo';

type BoloAudioNormalizerModule = {
  normalizeFile(sourceUri: string): Promise<string>;
};

const normalizer = requireOptionalNativeModule<BoloAudioNormalizerModule>('BoloAudioNormalizer');

/**
 * Returns a local peak-normalized CAF on iOS. Older builds without the native
 * module deliberately fall back to the downloaded MP3.
 */
export async function normalizeAiVoiceAudioFile(sourceUri: string): Promise<string | null> {
  if (!normalizer) return null;
  try {
    return await normalizer.normalizeFile(sourceUri);
  } catch {
    return null;
  }
}
