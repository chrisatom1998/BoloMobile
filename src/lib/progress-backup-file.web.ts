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

// Browsers that never fire `cancel` still refocus the window when the dialog closes.
const CANCEL_FOCUS_GRACE_MS = 1000;

/**
 * Open the browser file dialog directly. expo-document-picker's web picker never
 * settles when the learner cancels, which would leave the backup buttons busy.
 */
function chooseBrowserFile(): Promise<File | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      reject(new ProgressBackupFileError(UNREADABLE));
      return;
    }
    const input = document.createElement('input');
    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(focusTimer);
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(file);
    };
    const onFocus = () => {
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => finish(input.files?.[0] ?? null), CANCEL_FOCUS_GRACE_MS);
    };
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

/** Let the learner choose a backup file. Resolves null when they cancel. */
export async function pickProgressBackupText(): Promise<string | null> {
  const file = await chooseBrowserFile();
  if (!file) return null;
  if (file.size > MAX_PROGRESS_BACKUP_BYTES) throw new ProgressBackupFileError(TOO_LARGE);
  try {
    return await file.text();
  } catch {
    throw new ProgressBackupFileError(UNREADABLE);
  }
}
