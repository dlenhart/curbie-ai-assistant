import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DATA_DIRECTORY_MARKER } from '../../constants';
import { assertDataDirectoryUsable } from './data-directory.guard';
import { DataDirectoryUnavailableError } from './errors/data-directory-unavailable.error';

describe('assertDataDirectoryUsable', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'curbie-data-'));
  });

  afterEach(() => {
    chmodSync(directory, 0o755);
    rmSync(directory, { recursive: true, force: true });
  });

  it('accepts a writable directory with the marker file', () => {
    writeFileSync(join(directory, DATA_DIRECTORY_MARKER), '');
    expect(() => assertDataDirectoryUsable(directory)).not.toThrow();
  });

  it('rejects a relative path', () => {
    expect(() => assertDataDirectoryUsable('relative/data')).toThrow(/absolute path/);
  });

  it('rejects a missing directory and hints at the USB drive', () => {
    expect(() => assertDataDirectoryUsable(join(directory, 'not-there'))).toThrow(/USB drive mounted/);
  });

  it('rejects a path that is a file', () => {
    const filePath = join(directory, 'a-file');
    writeFileSync(filePath, '');
    expect(() => assertDataDirectoryUsable(filePath)).toThrow(/not a directory/);
  });

  it('rejects a directory without the marker file (e.g. an empty mount point)', () => {
    expect(() => assertDataDirectoryUsable(directory)).toThrow(DataDirectoryUnavailableError);
    expect(() => assertDataDirectoryUsable(directory)).toThrow(new RegExp(DATA_DIRECTORY_MARKER.replace('.', '\\.')));
  });

  it('rejects a directory that is not writable', () => {
    if (process.getuid?.() === 0) return;
    writeFileSync(join(directory, DATA_DIRECTORY_MARKER), '');
    chmodSync(directory, 0o555);
    expect(() => assertDataDirectoryUsable(directory)).toThrow(/not writable/);
  });
});
