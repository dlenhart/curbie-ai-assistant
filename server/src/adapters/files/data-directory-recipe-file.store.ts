import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync } from 'node:fs';
import { basename, extname } from 'node:path';
import {
  DISCARDED_DIRECTORY_NAME,
  INBOX_DIRECTORY_NAME,
  PATH_SEPARATOR_PATTERN,
  RECIPE_DISPLAY_FILE_SUFFIX,
  RECIPE_ORIGINALS_DIRECTORY_NAME,
  RECIPE_PAGE_FILE_PREFIX,
  WORK_DIRECTORY_NAME,
} from '../../constants';
import { InboxPhoto } from '../../core/recipes/interfaces/inbox-photo.interface';
import { RecipeFileStore } from '../../core/recipes/interfaces/recipe-file-store.interface';
import { RecipePage } from '../../core/recipes/interfaces/recipe-page.interface';
import { resolveInsideDataDirectory } from './data-directory-path.guard';
import { PathOutsideDataDirectoryError } from './errors/path-outside-data-directory.error';

export class DataDirectoryRecipeFileStore implements RecipeFileStore {
  constructor(private readonly dataDirectory: string) {}

  listInboxFileNames(): readonly string[] {
    const inboxDirectory = this.resolve(INBOX_DIRECTORY_NAME);
    mkdirSync(inboxDirectory, { recursive: true });
    return readdirSync(inboxDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  }

  async readInboxPhoto(fileName: string): Promise<InboxPhoto> {
    assertSingleSegment(fileName);
    const absolutePath = this.resolve(`${INBOX_DIRECTORY_NAME}/${fileName}`);
    return { fileName, absolutePath, sha256: await hashFile(absolutePath) };
  }

  workDisplayPath(recipeId: string, pageNumber: number): string {
    assertSingleSegment(recipeId);
    const workDirectory = this.resolve(`${WORK_DIRECTORY_NAME}/${recipeId}`);
    mkdirSync(workDirectory, { recursive: true });
    return this.resolve(`${WORK_DIRECTORY_NAME}/${recipeId}/${displayFileName(pageNumber)}`);
  }

  commitPages(recipeId: string, photos: readonly InboxPhoto[]): readonly RecipePage[] {
    assertSingleSegment(recipeId);
    assertNoDuplicateFileNames(photos);
    const pages = photos.map((photo, index): RecipePage => {
      const pageNumber = index + 1;
      const directory = `${RECIPE_ORIGINALS_DIRECTORY_NAME}/${recipeId}`;
      const originalName = `${RECIPE_PAGE_FILE_PREFIX}${pageNumber}${extname(photo.fileName).toLowerCase()}`;
      return {
        pageNumber,
        originalPath: `${directory}/${originalName}`,
        displayPath: `${directory}/${displayFileName(pageNumber)}`,
        sha256: photo.sha256,
      };
    });
    pages.forEach((page, index) => {
      this.assertPresent(`${INBOX_DIRECTORY_NAME}/${photos[index].fileName}`);
      this.assertPresent(`${WORK_DIRECTORY_NAME}/${recipeId}/${displayFileName(page.pageNumber)}`);
      this.assertAbsent(page.originalPath);
      this.assertAbsent(page.displayPath);
    });
    mkdirSync(this.resolve(`${RECIPE_ORIGINALS_DIRECTORY_NAME}/${recipeId}`), { recursive: true });
    pages.forEach((page, index) => {
      this.move(`${INBOX_DIRECTORY_NAME}/${photos[index].fileName}`, page.originalPath);
      this.move(`${WORK_DIRECTORY_NAME}/${recipeId}/${displayFileName(page.pageNumber)}`, page.displayPath);
    });
    this.removeDirectoryIfEmpty(`${WORK_DIRECTORY_NAME}/${recipeId}`);
    return pages;
  }

  abandonWork(recipeId: string): void {
    assertSingleSegment(recipeId);
    const workPath = `${WORK_DIRECTORY_NAME}/${recipeId}`;
    const workDirectory = this.resolve(workPath);
    if (!existsSync(workDirectory)) {
      return;
    }
    readdirSync(workDirectory)
      .filter((name) => name.startsWith(RECIPE_PAGE_FILE_PREFIX) && name.endsWith(RECIPE_DISPLAY_FILE_SUFFIX))
      .forEach((name) => rmSync(this.resolve(`${workPath}/${name}`)));
    this.removeDirectoryIfEmpty(workPath);
  }

  moveRecipeToDiscarded(recipeId: string, pages: readonly RecipePage[]): void {
    assertSingleSegment(recipeId);
    const discardedPath = `${DISCARDED_DIRECTORY_NAME}/${recipeId}`;
    const moves = pages.flatMap((page) => [
      { from: page.originalPath, to: `${discardedPath}/${basename(page.originalPath)}` },
      { from: page.displayPath, to: `${discardedPath}/${basename(page.displayPath)}` },
    ]);
    moves.forEach((entry) => {
      this.assertPresent(entry.from);
      this.assertAbsent(entry.to);
    });
    mkdirSync(this.resolve(discardedPath), { recursive: true });
    moves.forEach((entry) => this.move(entry.from, entry.to));
  }

  absoluteDisplayPath(page: RecipePage): string {
    return this.resolve(page.displayPath);
  }

  private resolve(relativePath: string): string {
    return resolveInsideDataDirectory(this.dataDirectory, relativePath);
  }

  private move(fromRelativePath: string, toRelativePath: string): void {
    renameSync(this.resolve(fromRelativePath), this.resolve(toRelativePath));
  }

  private assertAbsent(relativePath: string): void {
    if (existsSync(this.resolve(relativePath))) {
      throw new Error(`Refusing to overwrite: ${relativePath} already exists.`);
    }
  }

  private assertPresent(relativePath: string): void {
    if (!existsSync(this.resolve(relativePath))) {
      throw new Error(`${relativePath} does not exist.`);
    }
  }

  private removeDirectoryIfEmpty(relativePath: string): void {
    const directory = this.resolve(relativePath);
    if (existsSync(directory) && readdirSync(directory).length === 0) {
      rmdirSync(directory);
    }
  }
}

function assertSingleSegment(name: string): void {
  if (name === '' || name === '.' || name === '..' || PATH_SEPARATOR_PATTERN.test(name)) {
    throw new PathOutsideDataDirectoryError(name);
  }
}

function assertNoDuplicateFileNames(photos: readonly InboxPhoto[]): void {
  const fileNames = photos.map((photo) => photo.fileName);
  if (new Set(fileNames).size !== fileNames.length) {
    throw new Error('Duplicate inbox file names in one recipe.');
  }
}

function displayFileName(pageNumber: number): string {
  return `${RECIPE_PAGE_FILE_PREFIX}${pageNumber}${RECIPE_DISPLAY_FILE_SUFFIX}`;
}

function hashFile(absolutePath: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha256');
    createReadStream(absolutePath)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolvePromise(hash.digest('hex')));
  });
}
