import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecipePage } from '../../core/recipes/interfaces/recipe-page.interface';
import { PathOutsideDataDirectoryError } from './errors/path-outside-data-directory.error';
import { DataDirectoryRecipeFileStore } from './data-directory-recipe-file.store';

const SHA256_OF_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('DataDirectoryRecipeFileStore', () => {
  let dataDirectory: string;
  let store: DataDirectoryRecipeFileStore;

  beforeEach(() => {
    dataDirectory = mkdtempSync(join(tmpdir(), 'curbie-files-'));
    store = new DataDirectoryRecipeFileStore(dataDirectory);
  });

  afterEach(() => {
    rmSync(dataDirectory, { recursive: true, force: true });
  });

  function putInboxFile(fileName: string, contents: string): void {
    mkdirSync(join(dataDirectory, 'inbox'), { recursive: true });
    writeFileSync(join(dataDirectory, 'inbox', fileName), contents);
  }

  function putWorkDisplay(recipeId: string, pageNumber: number, contents: string): void {
    writeFileSync(store.workDisplayPath(recipeId, pageNumber), contents);
  }

  it('lists inbox files, creating the inbox', () => {
    expect(store.listInboxFileNames()).toEqual([]);
    expect(existsSync(join(dataDirectory, 'inbox'))).toBe(true);
    putInboxFile('b.jpg', 'x');
    putInboxFile('a.heic', 'y');
    expect([...store.listInboxFileNames()].sort()).toEqual(['a.heic', 'b.jpg']);
  });

  it('hashes a photo', async () => {
    putInboxFile('card.JPG', 'abc');
    const photo = await store.readInboxPhoto('card.JPG');
    expect(photo.sha256).toBe(SHA256_OF_ABC);
    expect(photo.fileName).toBe('card.JPG');
    expect(photo.absolutePath).toBe(join(dataDirectory, 'inbox', 'card.JPG'));
  });

  it('rejects an inbox file name with a path separator or ..', async () => {
    await expect(store.readInboxPhoto('../secret.jpg')).rejects.toBeInstanceOf(PathOutsideDataDirectoryError);
    await expect(store.readInboxPhoto('sub/a.jpg')).rejects.toBeInstanceOf(PathOutsideDataDirectoryError);
    await expect(store.readInboxPhoto('..')).rejects.toBeInstanceOf(PathOutsideDataDirectoryError);
  });

  it('creates the work directory for a display path', () => {
    const path = store.workDisplayPath('r1', 2);
    expect(path).toBe(join(dataDirectory, 'work', 'r1', 'page-2.display.jpg'));
    expect(existsSync(join(dataDirectory, 'work', 'r1'))).toBe(true);
  });

  it('commitPages moves photos and display copies into originals and leaves the inbox empty', async () => {
    putInboxFile('one.HEIC', 'photo-one');
    putInboxFile('two.jpg', 'photo-two');
    putWorkDisplay('r1', 1, 'display-one');
    putWorkDisplay('r1', 2, 'display-two');
    const photos = [await store.readInboxPhoto('one.HEIC'), await store.readInboxPhoto('two.jpg')];

    const pages = store.commitPages('r1', photos);

    expect(pages).toEqual([
      {
        pageNumber: 1,
        originalPath: 'originals/recipes/r1/page-1.heic',
        displayPath: 'originals/recipes/r1/page-1.display.jpg',
        sha256: photos[0].sha256,
      },
      {
        pageNumber: 2,
        originalPath: 'originals/recipes/r1/page-2.jpg',
        displayPath: 'originals/recipes/r1/page-2.display.jpg',
        sha256: photos[1].sha256,
      },
    ]);
    expect(readFileSync(join(dataDirectory, pages[0].originalPath), 'utf8')).toBe('photo-one');
    expect(readFileSync(join(dataDirectory, pages[1].displayPath), 'utf8')).toBe('display-two');
    expect(readdirSync(join(dataDirectory, 'inbox'))).toEqual([]);
    expect(existsSync(join(dataDirectory, 'work', 'r1'))).toBe(false);
  });

  it('abandonWork removes only the work display files', () => {
    putWorkDisplay('r1', 1, 'display');
    writeFileSync(join(dataDirectory, 'work', 'r1', 'keep.txt'), 'keep');
    putInboxFile('one.jpg', 'photo');

    store.abandonWork('r1');

    expect(existsSync(join(dataDirectory, 'work', 'r1', 'page-1.display.jpg'))).toBe(false);
    expect(readFileSync(join(dataDirectory, 'work', 'r1', 'keep.txt'), 'utf8')).toBe('keep');
    expect(existsSync(join(dataDirectory, 'inbox', 'one.jpg'))).toBe(true);
  });

  it('abandonWork removes the empty work directory', () => {
    putWorkDisplay('r1', 1, 'display');
    store.abandonWork('r1');
    expect(existsSync(join(dataDirectory, 'work', 'r1'))).toBe(false);
  });

  it('moveRecipeToDiscarded moves both files of each page and deletes nothing', async () => {
    putInboxFile('one.jpg', 'photo-one');
    putWorkDisplay('r1', 1, 'display-one');
    const pages = store.commitPages('r1', [await store.readInboxPhoto('one.jpg')]);

    store.moveRecipeToDiscarded('r1', pages);

    expect(readFileSync(join(dataDirectory, 'discarded', 'r1', 'page-1.jpg'), 'utf8')).toBe('photo-one');
    expect(readFileSync(join(dataDirectory, 'discarded', 'r1', 'page-1.display.jpg'), 'utf8')).toBe('display-one');
    expect(existsSync(join(dataDirectory, pages[0].originalPath))).toBe(false);
  });

  it('refuses to overwrite an existing original', async () => {
    putInboxFile('one.jpg', 'new-photo');
    putWorkDisplay('r1', 1, 'new-display');
    mkdirSync(join(dataDirectory, 'originals', 'recipes', 'r1'), { recursive: true });
    writeFileSync(join(dataDirectory, 'originals', 'recipes', 'r1', 'page-1.jpg'), 'old');
    const photos = [await store.readInboxPhoto('one.jpg')];

    expect(() => store.commitPages('r1', photos)).toThrow(/already exists/);
    expect(readFileSync(join(dataDirectory, 'originals', 'recipes', 'r1', 'page-1.jpg'), 'utf8')).toBe('old');
    expect(existsSync(join(dataDirectory, 'inbox', 'one.jpg'))).toBe(true);
  });

  it('absoluteDisplayPath resolves through the guard', () => {
    const page: RecipePage = { pageNumber: 1, originalPath: 'a', displayPath: '../escape.jpg', sha256: 'x' };
    expect(() => store.absoluteDisplayPath(page)).toThrow(PathOutsideDataDirectoryError);
    const ok: RecipePage = { ...page, displayPath: 'originals/recipes/r1/page-1.display.jpg' };
    expect(store.absoluteDisplayPath(ok)).toBe(join(dataDirectory, ok.displayPath));
  });

  it('moveRecipeToDiscarded moves nothing when a target already exists', async () => {
    putInboxFile('one.jpg', 'photo-one');
    putInboxFile('two.jpg', 'photo-two');
    putWorkDisplay('r1', 1, 'display-one');
    putWorkDisplay('r1', 2, 'display-two');
    const pages = store.commitPages('r1', [await store.readInboxPhoto('one.jpg'), await store.readInboxPhoto('two.jpg')]);
    mkdirSync(join(dataDirectory, 'discarded', 'r1'), { recursive: true });
    writeFileSync(join(dataDirectory, 'discarded', 'r1', 'page-2.jpg'), 'earlier');

    expect(() => store.moveRecipeToDiscarded('r1', pages)).toThrow(/already exists/);

    expect(readFileSync(join(dataDirectory, 'discarded', 'r1', 'page-2.jpg'), 'utf8')).toBe('earlier');
    expect(existsSync(join(dataDirectory, pages[0].originalPath))).toBe(true);
    expect(existsSync(join(dataDirectory, pages[1].displayPath))).toBe(true);
    expect(existsSync(join(dataDirectory, 'discarded', 'r1', 'page-1.jpg'))).toBe(false);
  });

  it('moveRecipeToDiscarded moves nothing when a source is missing', async () => {
    putInboxFile('one.jpg', 'photo-one');
    putWorkDisplay('r1', 1, 'display-one');
    const pages = store.commitPages('r1', [await store.readInboxPhoto('one.jpg')]);
    rmSync(join(dataDirectory, pages[0].displayPath));

    expect(() => store.moveRecipeToDiscarded('r1', pages)).toThrow(/does not exist/);

    expect(existsSync(join(dataDirectory, pages[0].originalPath))).toBe(true);
  });

  it.each(['', '..', '.', 'a/b', 'a\\b', '../x'])('rejects the recipe id %j', async (recipeId) => {
    const page: RecipePage = { pageNumber: 1, originalPath: 'a', displayPath: 'b', sha256: 'x' };
    expect(() => store.workDisplayPath(recipeId, 1)).toThrow(PathOutsideDataDirectoryError);
    expect(() => store.commitPages(recipeId, [])).toThrow(PathOutsideDataDirectoryError);
    expect(() => store.abandonWork(recipeId)).toThrow(PathOutsideDataDirectoryError);
    expect(() => store.moveRecipeToDiscarded(recipeId, [page])).toThrow(PathOutsideDataDirectoryError);
  });

  it('commitPages moves nothing when a work display copy is missing', async () => {
    putInboxFile('one.jpg', 'photo-one');
    putInboxFile('two.jpg', 'photo-two');
    putWorkDisplay('r1', 1, 'display-one');
    const photos = [await store.readInboxPhoto('one.jpg'), await store.readInboxPhoto('two.jpg')];

    expect(() => store.commitPages('r1', photos)).toThrow(/does not exist/);

    expect(readdirSync(join(dataDirectory, 'inbox')).sort()).toEqual(['one.jpg', 'two.jpg']);
    expect(existsSync(join(dataDirectory, 'originals', 'recipes', 'r1'))).toBe(false);
  });

  it('commitPages moves nothing when an inbox photo is missing', async () => {
    putInboxFile('one.jpg', 'photo-one');
    putWorkDisplay('r1', 1, 'display-one');
    const photo = await store.readInboxPhoto('one.jpg');
    rmSync(photo.absolutePath);

    expect(() => store.commitPages('r1', [photo])).toThrow(/does not exist/);
    expect(existsSync(join(dataDirectory, 'work', 'r1', 'page-1.display.jpg'))).toBe(true);
  });

  it('commitPages rejects duplicate file names', async () => {
    putInboxFile('one.jpg', 'photo-one');
    putWorkDisplay('r1', 1, 'display-one');
    putWorkDisplay('r1', 2, 'display-two');
    const photo = await store.readInboxPhoto('one.jpg');

    expect(() => store.commitPages('r1', [photo, photo])).toThrow(/duplicate/i);
    expect(existsSync(join(dataDirectory, 'inbox', 'one.jpg'))).toBe(true);
  });
});
