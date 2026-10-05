import { getDocumentAsync } from 'expo-document-picker';

import { MAX_PROGRESS_BACKUP_BYTES } from '@/lib/progress-backup';

/** An error whose message is safe and friendly enough to show the learner. */
export class ProgressBackupFileError extends Error {}

const UNREADABLE = 'Bolo could not read that file. Choose a backup saved on this device.';
const TOO_LARGE = 'This backup file is larger than 2 MB, so Bolo did not open it. Choose a file created with Export progress.';

/** Browsers have no share sheet for local files, so download the backup instead. */
export async function shareProgressBackup(contents: string, fileName: string): Promise<void> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new ProgressBackupFileError('This browser cannot save a backup file. Try Bolo on your phone instead.');
  }
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Let the learner choose a backup file. Resolves null when they cancel. */
export async function pickProgressBackupText(): Promise<string | null> {
  const result = await getDocumentAsync({ multiple: false, type: ['application/json', '.json'] });
  if (result.canceled) return null;
  const file = result.assets[0]?.file;
  if (!file) throw new ProgressBackupFileError(UNREADABLE);
  if (file.size > MAX_PROGRESS_BACKUP_BYTES) throw new ProgressBackupFileError(TOO_LARGE);
  try {
    return await file.text();
  } catch {
    throw new ProgressBackupFileError(UNREADABLE);
  }
}
