/* eslint-disable import/first */

const mockIsAvailable = jest.fn();
const mockShare = jest.fn();
const mockGetDocument = jest.fn();
const mockFiles: { uri: string; created: unknown; written: string | null; deleted: boolean; size: number; text: jest.Mock; exists: boolean }[] = [];
let mockNextFile: { size: number; text: jest.Mock; createError?: Error } = { size: 10, text: jest.fn(async () => '{}') };

jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailable(),
  shareAsync: (...args: unknown[]) => mockShare(...args),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocument(...args),
}));

jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class MockFile {
    uri: string;
    created: unknown = null;
    written: string | null = null;
    deleted = false;
    exists = true;
    size: number;
    text: jest.Mock;
    private createError?: Error;

    constructor(...parts: ({ uri: string } | string)[]) {
      this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('');
      this.size = mockNextFile.size;
      this.text = mockNextFile.text;
      this.createError = mockNextFile.createError;
      mockFiles.push(this);
    }

    create(options: unknown) {
      if (this.createError) throw this.createError;
      this.created = options;
    }

    write(contents: string) {
      this.written = contents;
    }

    delete() {
      this.deleted = true;
      this.exists = false;
    }
  },
}));

import { MAX_PROGRESS_BACKUP_BYTES } from '../src/lib/progress-backup';
import { pickProgressBackupText, ProgressBackupFileError, shareProgressBackup } from '../src/lib/progress-backup-file';
import * as webFile from '../src/lib/progress-backup-file.web';

describe('native progress backup files', () => {
  beforeEach(() => {
    mockFiles.length = 0;
    mockNextFile = { size: 10, text: jest.fn(async () => '{"format":"bolo-progress-backup"}') };
    mockIsAvailable.mockResolvedValue(true);
    mockShare.mockResolvedValue(undefined);
  });

  it('writes the backup to the cache directory and opens the share sheet', async () => {
    await shareProgressBackup('{"ok":true}', 'bolo-progress-2026-10-05.json');

    expect(mockFiles[0]).toEqual(expect.objectContaining({
      uri: 'file:///cache/bolo-progress-2026-10-05.json',
      created: { overwrite: true },
      written: '{"ok":true}',
    }));
    expect(mockShare).toHaveBeenCalledWith('file:///cache/bolo-progress-2026-10-05.json', {
      dialogTitle: 'Save Bolo progress backup',
      mimeType: 'application/json',
      UTI: 'public.json',
    });
    expect(mockFiles[0]?.deleted).toBe(true);
  });

  it('deletes the export copy even when the share sheet fails', async () => {
    mockShare.mockRejectedValueOnce(new Error('share failed'));

    await expect(shareProgressBackup('{}', 'backup.json')).rejects.toThrow('share failed');
    expect(mockFiles[0]?.deleted).toBe(true);
  });

  it('explains when sharing is unavailable without writing a file', async () => {
    mockIsAvailable.mockResolvedValue(false);

    await expect(shareProgressBackup('{}', 'backup.json')).rejects.toThrow(ProgressBackupFileError);
    await expect(shareProgressBackup('{}', 'backup.json')).rejects.toThrow('Sharing is not available on this device');
    expect(mockFiles).toHaveLength(0);
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('reports a friendly error and cleans up when the cache file cannot be written', async () => {
    mockNextFile.createError = new Error('ENOSPC');

    await expect(shareProgressBackup('{}', 'backup.json')).rejects.toThrow('could not prepare the backup file');
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('returns null when the learner cancels the picker', async () => {
    mockGetDocument.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickProgressBackupText()).resolves.toBeNull();
    expect(mockGetDocument).toHaveBeenCalledWith(expect.objectContaining({ copyToCacheDirectory: true, multiple: false }));
  });

  it('reads the chosen file and deletes the cached copy', async () => {
    mockGetDocument.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/picked.json', name: 'picked.json', size: 10 }] });

    await expect(pickProgressBackupText()).resolves.toBe('{"format":"bolo-progress-backup"}');
    expect(mockFiles[0]?.deleted).toBe(true);
  });

  it('refuses oversized files before reading them', async () => {
    mockGetDocument.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/big.json', name: 'big.json', size: MAX_PROGRESS_BACKUP_BYTES + 1 }] });
    await expect(pickProgressBackupText()).rejects.toThrow('larger than 2 MB');
    expect(mockFiles.at(-1)?.uri).toBe('file:///cache/big.json');
    expect(mockFiles.at(-1)?.deleted).toBe(true);

    mockNextFile.size = MAX_PROGRESS_BACKUP_BYTES + 1;
    mockGetDocument.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/big.json', name: 'big.json' }] });
    await expect(pickProgressBackupText()).rejects.toThrow('larger than 2 MB');
    expect(mockNextFile.text).not.toHaveBeenCalled();
    expect(mockFiles.at(-1)?.deleted).toBe(true);
  });

  it('turns unreadable files into a friendly error', async () => {
    mockNextFile.text = jest.fn(async () => {
      throw new Error('native read failure');
    });
    mockGetDocument.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/bad.json', name: 'bad.json', size: 10 }] });
    await expect(pickProgressBackupText()).rejects.toThrow('could not read that file');

    mockGetDocument.mockResolvedValue({ canceled: false, assets: [] });
    await expect(pickProgressBackupText()).rejects.toThrow(ProgressBackupFileError);
  });
});

describe('web progress backup files', () => {
  const originalDocument = (globalThis as { document?: unknown }).document;
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDocument;
    (globalThis as { window?: unknown }).window = originalWindow;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    jest.useRealTimers();
  });

  it('downloads the backup through a temporary link', async () => {
    jest.useFakeTimers();
    const link = { click: jest.fn(), remove: jest.fn(), href: '', download: '', rel: '' };
    const appendChild = jest.fn();
    (globalThis as { document?: unknown }).document = { createElement: jest.fn(() => link), body: { appendChild } };
    URL.createObjectURL = jest.fn(() => 'blob:backup');
    URL.revokeObjectURL = jest.fn();

    await webFile.shareProgressBackup('{"ok":true}', 'bolo-progress.json');

    expect(link).toEqual(expect.objectContaining({ href: 'blob:backup', download: 'bolo-progress.json', rel: 'noopener' }));
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(link.remove).toHaveBeenCalledTimes(1);
    jest.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:backup');
  });

  it('explains when the browser cannot save files', async () => {
    (globalThis as { document?: unknown }).document = undefined;

    await expect(webFile.shareProgressBackup('{}', 'backup.json')).rejects.toThrow(webFile.ProgressBackupFileError);
  });

  function fakeBrowserPicker() {
    const listeners: Record<string, (() => void)[]> = {};
    const windowListeners: Record<string, (() => void)[]> = {};
    const input = {
      type: '',
      accept: '',
      style: {} as Record<string, string>,
      files: null as { size: number; text: () => Promise<string> }[] | null,
      addEventListener: (name: string, listener: () => void) => { (listeners[name] ??= []).push(listener); },
      click: jest.fn(),
      remove: jest.fn(),
    };
    (globalThis as { document?: unknown }).document = { createElement: jest.fn(() => input), body: { appendChild: jest.fn() } };
    (globalThis as { window?: unknown }).window = {
      addEventListener: (name: string, listener: () => void) => { (windowListeners[name] ??= []).push(listener); },
      removeEventListener: jest.fn(),
    };
    const fire = (name: string) => listeners[name]?.forEach((listener) => listener());
    const focus = () => windowListeners.focus?.forEach((listener) => listener());
    return { input, fire, focus };
  }

  it('reads a picked browser file and handles size and read failures', async () => {
    const pick = async (file: { size: number; text: () => Promise<string> } | null) => {
      const { input, fire } = fakeBrowserPicker();
      const result = webFile.pickProgressBackupText();
      input.files = file ? [file] : [];
      fire('change');
      return result;
    };
    await expect(pick({ size: 5, text: async () => 'hello' })).resolves.toBe('hello');
    await expect(pick({ size: MAX_PROGRESS_BACKUP_BYTES + 1, text: jest.fn() })).rejects.toThrow('larger than 2 MB');
    await expect(pick({ size: 5, text: async () => { throw new Error('denied'); } })).rejects.toThrow('could not read that file');
    await expect(pick(null)).resolves.toBeNull();
  });

  it('settles when the browser dialog is cancelled, with or without a cancel event', async () => {
    const withEvent = fakeBrowserPicker();
    const cancelled = webFile.pickProgressBackupText();
    withEvent.fire('cancel');
    await expect(cancelled).resolves.toBeNull();
    expect(withEvent.input.remove).toHaveBeenCalled();

    jest.useFakeTimers();
    try {
      const focusOnly = fakeBrowserPicker();
      const result = webFile.pickProgressBackupText();
      focusOnly.focus();
      jest.advanceTimersByTime(1000);
      await expect(result).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
