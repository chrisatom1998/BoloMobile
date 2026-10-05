import { getDocumentAsync } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { MAX_PROGRESS_BACKUP_BYTES } from '@/lib/progress-backup';

/** An error whose message is safe and friendly enough to show the learner. */
export class ProgressBackupFileError extends Error {}

const BACKUP_TYPES = ['application/json', 'text/json', 'text/plain', 'application/octet-stream'];
const UNREADABLE = 'Bolo could not read that file. Choose a backup saved on this device or in your files app.';
const TOO_LARGE = 'This backup file is larger than 2 MB, so Bolo did not open it. Choose a file created with Export progress.';

function deleteQuietly(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // The cache copy is disposable; cleanup must not hide the real result.
  }
}

/** Write the backup to the cache directory and hand it to the system share sheet. */
export async function shareProgressBackup(contents: string, fileName: string): Promise<void> {
  if (!(await isAvailableAsync())) {
    throw new ProgressBackupFileError('Sharing is not available on this device, so Bolo cannot save a backup file here.');
  }
  const file = new File(Paths.cache, fileName);
  try {
    file.create({ overwrite: true });
    file.write(contents);
  } catch {
    deleteQuietly(file);
    throw new ProgressBackupFileError('Bolo could not prepare the backup file. Check available storage and try again.');
  }
  await shareAsync(file.uri, { dialogTitle: 'Save Bolo progress backup', mimeType: 'application/json', UTI: 'public.json' });
}

/** Let the learner choose a backup file. Resolves null when they cancel. */
export async function pickProgressBackupText(): Promise<string | null> {
  const result = await getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: BACKUP_TYPES });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new ProgressBackupFileError(UNREADABLE);
  const file = new File(asset.uri);
  try {
    // The picker already copied the file into the cache, so even an oversized pick is cleaned up below.
    if ((asset.size ?? 0) > MAX_PROGRESS_BACKUP_BYTES || file.size > MAX_PROGRESS_BACKUP_BYTES) throw new ProgressBackupFileError(TOO_LARGE);
    return await file.text();
  } catch (error) {
    if (error instanceof ProgressBackupFileError) throw error;
    throw new ProgressBackupFileError(UNREADABLE);
  } finally {
    deleteQuietly(file);
  }
}
