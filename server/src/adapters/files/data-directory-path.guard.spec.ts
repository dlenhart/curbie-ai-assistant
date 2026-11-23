import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveInsideDataDirectory } from './data-directory-path.guard';
import { PathOutsideDataDirectoryError } from './errors/path-outside-data-directory.error';

describe('resolveInsideDataDirectory', () => {
  let dataDirectory: string;
  let outsideDirectory: string;

  beforeEach(() => {
    dataDirectory = mkdtempSync(join(tmpdir(), 'curbie-guard-data-'));
    outsideDirectory = mkdtempSync(join(tmpdir(), 'curbie-guard-outside-'));
  });

  afterEach(() => {
    rmSync(dataDirectory, { recursive: true, force: true });
    rmSync(outsideDirectory, { recursive: true, force: true });
  });

  it('allows a nested path', () => {
    expect(resolveInsideDataDirectory(dataDirectory, 'originals/recipes/abc/page-1.jpg')).toBe(
      resolve(dataDirectory, 'originals/recipes/abc/page-1.jpg'),
    );
  });

  it('rejects ../ escapes', () => {
    expect(() => resolveInsideDataDirectory(dataDirectory, '../elsewhere/file.jpg')).toThrow(PathOutsideDataDirectoryError);
    expect(() => resolveInsideDataDirectory(dataDirectory, 'inbox/../../elsewhere')).toThrow(PathOutsideDataDirectoryError);
  });

  it('rejects an absolute path outside', () => {
    expect(() => resolveInsideDataDirectory(dataDirectory, join(outsideDirectory, 'file.jpg'))).toThrow(
      PathOutsideDataDirectoryError,
    );
  });

  it('rejects a path through a symlink that points outside the data dir', () => {
    symlinkSync(outsideDirectory, join(dataDirectory, 'sneaky'));
    expect(() => resolveInsideDataDirectory(dataDirectory, 'sneaky/new-dir/file.jpg')).toThrow(PathOutsideDataDirectoryError);
  });

  it('allows a path when the data dir itself is reached through a symlink', () => {
    const linkedDirectory = join(outsideDirectory, 'link');
    mkdirSync(join(dataDirectory, 'inbox'));
    symlinkSync(dataDirectory, linkedDirectory);
    expect(() => resolveInsideDataDirectory(linkedDirectory, 'inbox/a.jpg')).not.toThrow();
  });

  it('rejects a dangling symlink that points outside the data dir', () => {
    symlinkSync(join(outsideDirectory, 'not-yet-created'), join(dataDirectory, 'dangling'));
    expect(() => resolveInsideDataDirectory(dataDirectory, 'dangling/x.jpg')).toThrow(PathOutsideDataDirectoryError);
    expect(() => resolveInsideDataDirectory(dataDirectory, 'dangling')).toThrow(PathOutsideDataDirectoryError);
  });

  it('allows a child whose name starts with two dots', () => {
    expect(() => resolveInsideDataDirectory(dataDirectory, '..foo/file.jpg')).not.toThrow();
  });
});
